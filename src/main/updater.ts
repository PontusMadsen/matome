import { app } from 'electron'
import { spawn, execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { bundlePath, isNewer, parseRelease, parseSums, swapScript, teamIdOf, type Release } from './update-logic'
import type { UpdateStatus } from '@shared/types'

const run = promisify(execFile)
// Public releases: no credentials involved. Update this if the repository moves.
const REPO = 'PontusMadsen/flax'
const API = `https://api.github.com/repos/${REPO}`
const HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'Flax', 'X-GitHub-Api-Version': '2022-11-28' }

export class Updater {
  private status: UpdateStatus
  private newBundle: string | null = null
  private timer: NodeJS.Timeout | null = null

  constructor() {
    const enabled = app.isPackaged && process.platform === 'darwin'
    this.status = { current: app.getVersion(), state: enabled ? 'idle' : 'disabled' }
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  start(): void {
    if (this.status.state === 'disabled') return
    setTimeout(() => void this.check(), 5000)
    this.timer = setInterval(() => void this.check(), 30 * 60_000)
  }

  private set(p: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...p }
  }

  async check(): Promise<UpdateStatus> {
    if (this.status.state === 'disabled' || this.status.state === 'checking' || this.status.state === 'downloading' || this.status.state === 'ready') return this.status
    this.set({ state: 'checking', error: undefined })
    try {
      const res = await fetch(`${API}/releases/latest`, { headers: HEADERS, signal: AbortSignal.timeout(15000) })
      if (res.status === 404) throw new Error('No release published yet')
      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`)
      const info = parseRelease((await res.json()) as Release, process.arch)
      if (!info) throw new Error('The newest release is still being built. Try again in a few minutes.')
      if (!isNewer(this.status.current, info.version)) {
        this.set({ state: 'idle', latest: info.version, checkedAt: Date.now() })
        return this.status
      }
      this.set({ state: 'downloading', latest: info.version, progress: 0 })
      let sha = info.sha256
      if (!sha && info.sumsUrl) {
        const r = await fetch(info.sumsUrl, { headers: { 'User-Agent': 'Flax' }, signal: AbortSignal.timeout(15000) })
        if (r.ok) sha = parseSums(await r.text())[info.name] ?? null
      }
      if (!sha) throw new Error('Release has no checksum; refusing to install')
      await this.download(info.url, info.name, sha)
      this.set({ state: 'ready', checkedAt: Date.now() })
    } catch (e) {
      this.set({ state: 'error', error: e instanceof Error ? e.message : String(e), progress: undefined, checkedAt: Date.now() })
    }
    return this.status
  }

  /**
   * Download, verify the SHA-256, unzip with ditto (fetch itself never sets the quarantine flag), then check the code signature.
   * Reports progress, and aborts if no bytes arrive for 45s so a stalled connection can't wedge the updater.
   */
  private async download(url: string, name: string, sha256: string): Promise<void> {
    const dir = join(app.getPath('userData'), 'update')
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const ctrl = new AbortController()
    const res = await fetch(url, { headers: { 'User-Agent': 'Flax' }, signal: ctrl.signal })
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length')) || 0
    let got = 0
    let last = Date.now()
    const hash = createHash('sha256')
    const watchdog = setInterval(() => { if (Date.now() - last > 45_000) ctrl.abort() }, 5000)
    const body = Readable.fromWeb(res.body as never)
    body.on('data', (c: Buffer) => {
      hash.update(c)
      got += c.length
      last = Date.now()
      if (total) this.set({ progress: Math.min(1, got / total) })
    })
    const zip = join(dir, name)
    try {
      await pipeline(body, createWriteStream(zip))
    } catch (e) {
      throw new Error(ctrl.signal.aborted ? 'download stalled (no data for 45s); will retry' : e instanceof Error ? e.message : String(e), { cause: e })
    } finally {
      clearInterval(watchdog)
    }
    this.set({ progress: undefined })
    if (hash.digest('hex') !== sha256) throw new Error('checksum mismatch; update discarded')
    const out = join(dir, 'x')
    mkdirSync(out)
    await run('/usr/bin/ditto', ['-x', '-k', zip, out])
    const appName = readdirSync(out).find((f) => f.endsWith('.app'))
    if (!appName) throw new Error('update archive contained no .app')
    const bundle = join(out, appName)
    await this.verifySignature(bundle)
    this.newBundle = bundle
    rmSync(zip, { force: true })
  }

  /** Signed builds must carry the same Team ID as the running app; unsigned (ad-hoc) builds skip this. */
  private async verifySignature(bundle: string): Promise<void> {
    const cur = bundlePath(process.execPath)
    if (!cur) return
    const info = async (p: string) => {
      try {
        const r = await run('/usr/bin/codesign', ['-dv', p])
        return teamIdOf(`${r.stdout}\n${r.stderr}`)
      } catch (e) {
        const x = e as { stdout?: string; stderr?: string }
        return teamIdOf(`${x.stdout ?? ''}\n${x.stderr ?? ''}`)
      }
    }
    const mine = await info(cur)
    if (!mine) return
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]).catch(() => { throw new Error('update signature is invalid') })
    if ((await info(bundle)) !== mine) throw new Error('update is signed by a different developer; discarded')
  }

  /** Quit, swap the bundle in place, relaunch. */
  apply(): void {
    const bundle = bundlePath(process.execPath)
    if (this.status.state !== 'ready' || !this.newBundle || !bundle || !existsSync(this.newBundle)) return
    const dir = join(app.getPath('userData'), 'update')
    const script = join(dir, 'swap.sh')
    writeFileSync(script, swapScript({ pid: process.pid, bundle, newBundle: this.newBundle, log: join(app.getPath('home'), 'Library/Logs/Flax-update.log') }))
    chmodSync(script, 0o755)
    spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref()
    if (this.timer) clearInterval(this.timer)
    app.quit()
  }
}

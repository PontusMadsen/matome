import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { DownloadInfo, DownloadMeta } from '@shared/types'

/** A file name that is safe on macOS/Windows: no path separators or reserved characters, no trailing dots/spaces. */
export function safeFileName(name: string): string {
  const printable = [...name].map((c) => (c.charCodeAt(0) < 32 ? ' ' : c)).join('')
  const cleaned = printable.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '')
  return (cleaned || 'download').slice(0, 150)
}

export function downloadFileName(title: string, year: number | undefined, container: string | undefined): string {
  const ext = container?.replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${safeFileName(year ? `${title} (${year})` : title)}.${ext || 'mkv'}`
}

/** `dir/name`, or `dir/name (2).ext`, `(3)`... so an existing file is never overwritten. Creates `dir`. */
export function uniquePath(dir: string, fileName: string): string {
  mkdirSync(dir, { recursive: true })
  const ext = extname(fileName)
  const stem = fileName.slice(0, fileName.length - ext.length)
  for (let n = 1; n < 1000; n++) {
    const p = join(dir, n === 1 ? fileName : `${stem} (${n})${ext}`)
    if (!existsSync(p) && !existsSync(`${p}.part`)) return p
  }
  return join(dir, `${stem} ${Date.now()}${ext}`)
}

const VIDEO_TYPES: Record<string, string> = { mkv: 'video/x-matroska', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', avi: 'video/x-msvideo', ts: 'video/mp2t' }
export const videoType = (path: string): string => VIDEO_TYPES[extname(path).slice(1).toLowerCase()] ?? 'application/octet-stream'

/** HTTP Range header -> byte span (inclusive), or null when absent/unusable (serve the whole file), or 'invalid' (416). */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') { // suffix: the last N bytes
    const n = Number(m[2])
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  return start >= size || start > end ? 'invalid' : { start, end }
}

/** Image type from its first bytes (posters are saved without a name that says). */
export function sniffImageType(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46) return 'image/webp'
  return 'image/jpeg'
}

const explain = (status: number): string =>
  status === 401 || status === 403 ? "This server doesn't allow downloads for your account." : status === 404 ? 'The server has no file for this item.' : `The server answered HTTP ${status}.`

interface Item { info: DownloadInfo; ctrl: AbortController }

/**
 * Streams files from a media server to disk. Finished downloads are remembered in `indexFile` (the files themselves
 * live in the app's own folder) so they can be played offline and deleted from the Downloaded section.
 */
export class Downloads {
  private items = new Map<string, Item>()

  constructor(private indexFile?: string) {
    if (!indexFile || !existsSync(indexFile)) return
    try {
      const saved = JSON.parse(readFileSync(indexFile, 'utf8')) as DownloadInfo[]
      for (const info of saved) {
        if (info.state !== 'done' || !existsSync(info.path)) continue // moved or deleted behind our back
        this.items.set(info.id, { info: { ...info, fresh: false, hasPoster: existsSync(`${info.path}.poster`), received: statSync(info.path).size }, ctrl: new AbortController() })
      }
    } catch { /* a corrupt index just starts empty */ }
  }

  private save(): void {
    if (!this.indexFile) return
    const done = [...this.items.values()].map((i) => i.info).filter((i) => i.state === 'done').map((i) => ({ ...i, fresh: undefined }))
    try { writeFileSync(this.indexFile, JSON.stringify(done)) } catch { /* the files are still there; only the list is lost */ }
  }

  list(): DownloadInfo[] {
    return [...this.items.values()].map((i) => ({ ...i.info })).sort((a, b) => b.createdAt - a.createdAt)
  }

  start(o: { title: string; meta: DownloadMeta; url: string; headers: Record<string, string>; dest: string }): string {
    const id = randomUUID()
    const item: Item = { info: { id, title: o.title, meta: o.meta, state: 'active', received: 0, total: 0, path: o.dest, createdAt: Date.now() }, ctrl: new AbortController() }
    this.items.set(id, item)
    void this.run(item, o)
    return id
  }

  private async run(item: Item, o: { url: string; headers: Record<string, string>; dest: string }): Promise<void> {
    const part = `${o.dest}.part`
    let last = Date.now()
    const watchdog = setInterval(() => { if (Date.now() - last > 60_000) item.ctrl.abort(new Error('stalled')) }, 5000)
    try {
      const res = await fetch(o.url, { headers: o.headers, signal: item.ctrl.signal })
      if (!res.ok || !res.body) throw new Error(explain(res.status))
      item.info.total = Number(res.headers.get('content-length')) || 0
      const body = Readable.fromWeb(res.body as never)
      body.on('data', (c: Buffer) => { item.info.received += c.length; last = Date.now() })
      await pipeline(body, createWriteStream(part))
      renameSync(part, o.dest)
      item.info.state = 'done'
      item.info.fresh = true
      this.save()
    } catch (e) {
      rmSync(part, { force: true })
      if (item.info.state === 'canceled') return
      item.info.state = 'error'
      item.info.error = item.ctrl.signal.aborted ? 'The server stopped sending data.' : e instanceof Error ? e.message : String(e)
    } finally {
      clearInterval(watchdog)
    }
  }

  cancel(id: string): void {
    const i = this.items.get(id)
    if (i?.info.state === 'active') {
      i.info.state = 'canceled'
      i.ctrl.abort()
    }
  }

  /** Dismiss failed/canceled entries and the "saved" notes; finished downloads stay in the Downloaded section. */
  clear(): void {
    for (const [id, i] of this.items) {
      if (i.info.state === 'error' || i.info.state === 'canceled') this.items.delete(id)
      else if (i.info.state === 'done') i.info.fresh = false
    }
  }

  /** Delete the file (and poster) and forget it. Active downloads are cancelled first. */
  remove(id: string): void {
    const i = this.items.get(id)
    if (!i) return
    if (i.info.state === 'active') { i.info.state = 'canceled'; i.ctrl.abort() }
    rmSync(i.info.path, { force: true })
    rmSync(`${i.info.path}.part`, { force: true })
    rmSync(`${i.info.path}.poster`, { force: true })
    this.items.delete(id)
    this.save()
  }

  setPosition(id: string, ms: number): void {
    const i = this.items.get(id)
    if (!i || i.info.state !== 'done') return
    i.info.positionMs = Math.max(0, Math.floor(ms))
    this.save()
  }

  markPoster(id: string): void {
    const i = this.items.get(id)
    if (i) { i.info.hasPoster = true; this.save() }
  }

  pathOf(id: string): string | undefined {
    return this.items.get(id)?.info.path
  }
}

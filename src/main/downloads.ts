import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { DownloadInfo } from '@shared/types'

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

const explain = (status: number): string =>
  status === 401 || status === 403 ? "This server doesn't allow downloads for your account." : status === 404 ? 'The server has no file for this item.' : `The server answered HTTP ${status}.`

interface Item { info: DownloadInfo; ctrl: AbortController }

/** Streams files from a media server to disk, one record per download; progress is polled by the UI. */
export class Downloads {
  private items = new Map<string, Item>()

  list(): DownloadInfo[] {
    return [...this.items.values()].map((i) => ({ ...i.info })).reverse()
  }

  start(o: { title: string; url: string; headers: Record<string, string>; dest: string }): string {
    const id = randomUUID()
    const item: Item = { info: { id, title: o.title, state: 'active', received: 0, total: 0, path: o.dest }, ctrl: new AbortController() }
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

  /** Remove finished, failed and canceled entries from the list. */
  clear(): void {
    for (const [id, i] of this.items) if (i.info.state !== 'active') this.items.delete(id)
  }

  pathOf(id: string): string | undefined {
    return this.items.get(id)?.info.path
  }
}

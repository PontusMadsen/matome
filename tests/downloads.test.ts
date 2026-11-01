import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { Downloads, downloadFileName, parseRange, safeFileName, sniffImageType, uniquePath, videoType } from '../src/main/downloads'

const M = { kind: 'movie', name: 'T' } as const
let server: Server
let base = ''
const payload = Buffer.alloc(300_000, 7)

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith('/forbidden')) { res.statusCode = 403; res.end(); return }
    if (req.url?.startsWith('/slow')) { res.writeHead(200, { 'content-length': String(payload.length) }); res.write(payload.subarray(0, 1000)); return } // never finishes
    res.writeHead(200, { 'content-length': String(payload.length) })
    res.end(payload)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(() => { server.closeAllConnections(); server.close() })

const rmSyncQuiet = (p: string) => rmSync(p, { force: true })
const waitFor = async (d: Downloads, id: string, state: string) => {
  for (let i = 0; i < 100; i++) { if (d.list().find((x) => x.id === id)?.state === state) return; await new Promise((r) => setTimeout(r, 30)) }
  throw new Error(`never reached ${state}: ${JSON.stringify(d.list())}`)
}

test('file names are safe and carry the container', () => {
  expect(safeFileName('A/B: C?*"<>|')).toBe('A B C')
  expect(safeFileName('...hidden. ')).toBe('hidden')
  expect(safeFileName('')).toBe('download')
  expect(downloadFileName('Dune', 2021, 'mkv')).toBe('Dune (2021).mkv')
  expect(downloadFileName('Ep: One', undefined, '.MP4')).toBe('Ep One.mp4')
  expect(downloadFileName('X', 2000, undefined)).toBe('X (2000).mkv')
})

test('downloads a file to disk with progress, no .part left behind', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flax-dl-'))
  const d = new Downloads()
  const id = d.start({ title: 'T', meta: M, url: `${base}/file`, headers: {}, dest: join(dir, 'T.mkv') })
  await waitFor(d, id, 'done')
  expect(d.list()[0]).toMatchObject({ state: 'done', received: payload.length, total: payload.length })
  expect(readFileSync(join(dir, 'T.mkv')).equals(payload)).toBe(true)
  expect(existsSync(join(dir, 'T.mkv.part'))).toBe(false)
})

test('a server that refuses says so in plain words', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flax-dl-'))
  const d = new Downloads()
  const id = d.start({ title: 'T', meta: M, url: `${base}/forbidden`, headers: {}, dest: join(dir, 'T.mkv') })
  await waitFor(d, id, 'error')
  expect(d.list()[0]!.error).toMatch(/doesn't allow downloads/)
  expect(existsSync(join(dir, 'T.mkv'))).toBe(false)
})

test('cancelling stops an unfinished download and removes the partial file; clear drops finished entries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flax-dl-'))
  const d = new Downloads()
  const id = d.start({ title: 'T', meta: M, url: `${base}/slow`, headers: {}, dest: join(dir, 'T.mkv') })
  await new Promise((r) => setTimeout(r, 200))
  d.cancel(id)
  await waitFor(d, id, 'canceled')
  await new Promise((r) => setTimeout(r, 100))
  expect(existsSync(join(dir, 'T.mkv.part'))).toBe(false)
  d.clear()
  expect(d.list()).toEqual([])
})

test('never overwrites: an existing name gets (2), (3)...; the folder is created on demand', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'flax-dl-')), 'Fläx')
  const first = uniquePath(dir, 'Dune (2021).mkv')
  expect(first).toBe(join(dir, 'Dune (2021).mkv'))
  writeFileSync(first, 'x')
  const second = uniquePath(dir, 'Dune (2021).mkv')
  expect(second).toBe(join(dir, 'Dune (2021) (2).mkv'))
  writeFileSync(second, 'x')
  expect(uniquePath(dir, 'Dune (2021).mkv')).toBe(join(dir, 'Dune (2021) (3).mkv'))
})

test('finished downloads are remembered across restarts; a file that vanished is forgotten; remove deletes the file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flax-dl-'))
  const index = join(dir, 'downloads.json')
  const d = new Downloads(index)
  const a = d.start({ title: 'A', meta: M, url: `${base}/file`, headers: {}, dest: join(dir, 'A.mkv') })
  const b = d.start({ title: 'B', meta: M, url: `${base}/file`, headers: {}, dest: join(dir, 'B.mkv') })
  await waitFor(d, a, 'done'); await waitFor(d, b, 'done')
  d.setPosition(a, 123_456)
  const again = new Downloads(index) // "restart"
  expect(again.list().map((x) => x.title).sort()).toEqual(['A', 'B'])
  expect(again.list().find((x) => x.id === a)).toMatchObject({ state: 'done', positionMs: 123_456, fresh: false, received: payload.length })
  again.remove(a)
  expect(existsSync(join(dir, 'A.mkv'))).toBe(false)
  expect(new Downloads(index).list().map((x) => x.title)).toEqual(['B'])
  rmSyncQuiet(join(dir, 'B.mkv')) // deleted in Finder
  expect(new Downloads(index).list()).toEqual([])
})

test('clear dismisses failures but keeps finished downloads in the library', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flax-dl-'))
  const d = new Downloads(join(dir, 'downloads.json'))
  const ok = d.start({ title: 'ok', meta: M, url: `${base}/file`, headers: {}, dest: join(dir, 'ok.mkv') })
  const bad = d.start({ title: 'bad', meta: M, url: `${base}/forbidden`, headers: {}, dest: join(dir, 'bad.mkv') })
  await waitFor(d, ok, 'done'); await waitFor(d, bad, 'error')
  d.clear()
  expect(d.list().map((x) => [x.title, x.fresh ?? false])).toEqual([['ok', false]])
})

test('byte ranges for seeking in a local file', () => {
  expect(parseRange(null, 1000)).toBeNull()
  expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
  expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
  expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
  expect(parseRange('bytes=500-5000', 1000)).toEqual({ start: 500, end: 999 })
  expect(parseRange('bytes=1000-', 1000)).toBe('invalid')
  expect(parseRange('bytes=9-3', 1000)).toBe('invalid')
  expect(parseRange('garbage', 1000)).toBeNull()
})

test('content types', () => {
  expect(videoType('/x/Dune.MKV')).toBe('video/x-matroska')
  expect(videoType('/x/a.mp4')).toBe('video/mp4')
  expect(videoType('/x/a.xyz')).toBe('application/octet-stream')
  expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png')
  expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe('image/jpeg')
})

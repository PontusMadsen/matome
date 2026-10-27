import { afterEach, expect, test, vi } from 'vitest'
import { fetchWatchlist } from '../src/main/plex/discover'

const id = { clientId: 'c', version: '1', platform: 'macOS' }
const meta = (n: number) => ({ ratingKey: `k${n}`, title: `T${n}`, type: n % 2 ? 'movie' : 'show' })
const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

afterEach(() => vi.unstubAllGlobals())

test('walks every page until totalSize, de-duplicating', async () => {
  const all = Array.from({ length: 120 }, (_, i) => meta(i))
  const calls: string[] = []
  vi.stubGlobal('fetch', (u: URL) => {
    const start = Number(u.searchParams.get('X-Plex-Container-Start') ?? 0)
    const size = Number(u.searchParams.get('X-Plex-Container-Size') ?? 20)
    calls.push(`${start}+${size}`)
    return reply({ MediaContainer: { totalSize: 120, Metadata: all.slice(start, start + size) } })
  })
  const items = await fetchWatchlist(id, 't')
  expect(items).toHaveLength(120)
  expect(new Set(items.map((i) => i.ratingKey)).size).toBe(120)
  expect(calls).toEqual(['0+50', '50+50', '100+50'])
})

test('falls back to the first page when paging is refused', async () => {
  vi.stubGlobal('fetch', (u: URL) =>
    u.searchParams.has('X-Plex-Container-Size') ? reply({}, 400) : reply({ MediaContainer: { totalSize: 201, Metadata: Array.from({ length: 20 }, (_, i) => meta(i)) } }),
  )
  const notes: string[] = []
  const items = await fetchWatchlist(id, 't', (m) => notes.push(m))
  expect(items).toHaveLength(20)
  expect(notes.join('\n')).toContain('first page only')
})

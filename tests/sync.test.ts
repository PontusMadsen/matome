import { afterAll, beforeAll, expect, test } from 'vitest'
import { startMockPlex } from '../tools/mock-plex/server'
import { hosts } from '../src/main/plex/endpoints'
import { listServers, pickConnection } from '../src/main/plex/resources'
import { syncAll } from '../src/main/sync'
import { loadItems, openDb } from '../src/main/db'
import { mergeItems } from '../src/main/merge'

const id = { clientId: 'c', version: '0', platform: 't' }
const meta = (rk: string, title: string, year: number, guid: string, updatedAt = 10) => ({
  ratingKey: rk, title, year, addedAt: 5, updatedAt, thumb: `/library/metadata/${rk}/thumb`, Guid: [{ id: guid }],
  Media: [{ videoResolution: '1080', bitrate: 8000 }],
})
const movies = (items: unknown[]) => [{ key: '1', title: 'Movies', type: 'movie' as const, items }]
let mock: Awaited<ReturnType<typeof startMockPlex>>
const data = {
  a: { name: 'A', sections: movies([meta('1', 'The Matrix', 1999, 'tmdb://603'), meta('2', 'Heat', 1995, 'tmdb://949')]) },
  b: { name: 'B', sections: movies([meta('9', 'The Matrix', 1999, 'tmdb://603')]) },
  slow: { name: 'Slow', sections: movies([meta('5', 'Zed', 2000, 'tmdb://1')]), slowMs: 400 },
}

beforeAll(async () => {
  mock = await startMockPlex({ servers: data })
  hosts.plexTv = mock.url
})
afterAll(() => mock.server.close())

test('sync merges across servers; slow server reported offline without blocking others', async () => {
  const creds = await listServers(id, 'u')
  const infos = await Promise.all(creds.map((c) => pickConnection(id, c, 200)))
  // pickConnection with a 200ms timeout marks the slow server offline
  expect(infos.find((i) => i.id === 'slow')!.online).toBe(false)
  const db = openDb(':memory:')
  const st = await syncAll(db, id, infos.map((info) => ({ info, token: 'x' })))
  expect(st.find((s) => s.serverId === 'slow')!.ok).toBe(false)
  expect(st.filter((s) => s.ok)).toHaveLength(2)
  const merged = mergeItems(loadItems(db, 'movie'))
  expect(merged).toHaveLength(2)
  const matrix = merged.find((m) => m.title === 'The Matrix')!
  expect(matrix.sources).toHaveLength(2)
  expect(matrix.poster).toMatch(/^flax-img:\/\//)
  expect(JSON.stringify(merged)).not.toContain('X-Plex-Token')
})

test('incremental refresh only returns changed items and prunes removals', async () => {
  const creds = await listServers(id, 'u')
  const a = await pickConnection(id, creds.find((c) => c.id === 'a')!, 1000)
  const db = openDb(':memory:')
  await syncAll(db, id, [{ info: a, token: 'x' }])
  expect(loadItems(db)).toHaveLength(2)
  const again = await syncAll(db, id, [{ info: a, token: 'x' }])
  expect(again[0]!.added).toBe(0)
  data.a.sections[0]!.items.pop()
  await syncAll(db, id, [{ info: a, token: 'x' }])
  expect(loadItems(db).map((i) => i.title)).toEqual(['The Matrix'])
})

test('watch-state change without updatedAt bump is picked up', async () => {
  const creds = await listServers(id, 'u')
  const b = await pickConnection(id, creds.find((c) => c.id === 'b')!, 1000)
  const db = openDb(':memory:')
  await syncAll(db, id, [{ info: b, token: 'x' }])
  expect(loadItems(db)[0]!.watched).toBe(false)
  ;(data.b.sections[0]!.items[0] as { viewCount?: number }).viewCount = 1
  const r = await syncAll(db, id, [{ info: b, token: 'x' }])
  expect(r[0]!.added).toBe(1)
  expect(loadItems(db)[0]!.watched).toBe(true)
})

import { patchWatchState } from '../src/main/plex/library'
test('patchWatchState marks watched and updates episode counts', () => {
  const base = { serverId: 'a', serverName: 'a', ratingKey: '1', library: 'TV', type: 'show' as const, title: 'X', guids: {}, addedAt: 1, leafCount: 5, viewedLeafCount: 2, watched: false }
  expect(patchWatchState(base, { viewedLeafCount: 5, leafCount: 5 }).watched).toBe(true)
  expect(patchWatchState(base, { viewedLeafCount: 3, leafCount: 5 })).toMatchObject({ watched: false, viewedLeafCount: 3 })
  expect(patchWatchState({ ...base, type: 'movie' }, { viewCount: 1 }).watched).toBe(true)
})

import { afterAll, beforeAll, expect, test } from 'vitest'
import { startMockPlex } from '../tools/mock-plex/server'
import { hosts } from '../src/main/plex/endpoints'
import { pollPin, startPin } from '../src/main/plex/auth'
import { listServers, pickConnection } from '../src/main/plex/resources'
import { plexFetch, plexHeaders } from '../src/main/plex/client'

const id = { clientId: 'cid-1', version: '0.1.0', platform: 'test' }
let mock: Awaited<ReturnType<typeof startMockPlex>>

beforeAll(async () => {
  mock = await startMockPlex({ servers: { s1: { name: 'Home', sections: [] }, s2: { name: 'Friend', owned: false, sections: [] } } })
  hosts.plexTv = mock.url
})
afterAll(() => mock.server.close())

test('headers carry required Plex identity fields', () => {
  const h = plexHeaders(id, 'T')
  expect(h).toMatchObject({
    'X-Plex-Token': 'T',
    'X-Plex-Client-Identifier': 'cid-1',
    'X-Plex-Product': 'Flax',
    'X-Plex-Version': '0.1.0',
    'X-Plex-Platform': 'test',
    Accept: 'application/json',
  })
})

test('PIN flow returns token after approval', async () => {
  const pin = await startPin(id)
  expect(pin.authUrl).toContain('code=ABCD')
  expect(await pollPin(id, pin.id, { intervalMs: 10, timeoutMs: 2000 })).toBe('tok-user')
})

test('lists servers and picks the reachable local connection over dead relay', async () => {
  const servers = await listServers(id, 'tok-user')
  expect(servers.map((s) => s.name).sort()).toEqual(['Friend', 'Home'])
  const info = await pickConnection(id, servers[0]!, 1000)
  expect(info.online).toBe(true)
  expect(info.connectionPref).toBe(0)
  expect(JSON.stringify(info)).not.toContain('tok-')
})

test('request timeout surfaces as PlexError', async () => {
  const slow = await startMockPlex({ servers: { z: { name: 'Slow', sections: [], slowMs: 500 } } })
  await expect(plexFetch(id, `${slow.url}/pms/z/identity`, { timeoutMs: 50 })).rejects.toThrow(/timeout/)
  slow.server.close()
})

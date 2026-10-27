import { expect, test } from 'vitest'
import { applyLive } from '../src/main/live'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/main/settings'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RawItem, ServerInfo } from '../src/shared/types'

const it = (serverId: string): RawItem => ({ serverId, serverName: serverId, ratingKey: '1', library: 'M', type: 'movie', title: 'A', guids: {}, addedAt: 1, online: true })
const info = (id: string, online: boolean): ServerInfo => ({ id, name: id, owned: true, baseUrl: null, connectionPref: 2, online, latencyMs: null })

test('applyLive overlays state, drops excluded, marks unknown servers offline (cache-only mode)', () => {
  const r = applyLive([it('a'), it('b'), it('c')], [info('a', false), info('b', true)], ['b'])
  expect(r.map((x) => [x.serverId, x.online])).toEqual([['a', false], ['c', false]])
  expect(applyLive([it('a')], [], [])[0]!.online).toBe(false)
})

test('settings round-trip and fall back to defaults', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'flax-')), 's.json')
  expect(loadSettings(f)).toEqual(DEFAULT_SETTINGS)
  const custom = { ...DEFAULT_SETTINGS, excludedServers: ['x'], maxBitrateKbps: 4000 }
  saveSettings(f, custom)
  expect(loadSettings(f)).toEqual(custom)
})

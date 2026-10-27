import { afterAll, beforeAll, expect, test } from 'vitest'
import { startMockPlex } from '../tools/mock-plex/server'
import { fetchDetail, fetchEpisodes, fetchSeasons, toDetailPart } from '../src/main/plex/detail'
import type { ServerInfo } from '../src/shared/types'

const id = { clientId: 'c', version: '0', platform: 't' }
let mock: Awaited<ReturnType<typeof startMockPlex>>
let info: ServerInfo

beforeAll(async () => {
  mock = await startMockPlex({
    servers: {
      s: {
        name: 'S',
        sections: [],
        metadata: {
          '1': {
            ratingKey: '1', duration: 6000, viewOffset: 1000, contentRating: 'R',
            Role: [{ tag: 'Keanu', role: 'Neo' }], Director: [{ tag: 'Lana' }],
            Media: [{ Part: [{ Stream: [
              { id: 10, streamType: 1 },
              { id: 11, streamType: 2, languageTag: 'en', displayTitle: 'English (AC3 5.1)', default: true },
              { id: 12, streamType: 3, languageTag: 'ja', displayTitle: 'Japanese (SRT)' },
            ] }] }],
          },
        },
        children: {
          '5': [{ ratingKey: '50', index: 1, title: 'Season 1', leafCount: 6 }],
          '50': [{ ratingKey: '501', index: 1, parentIndex: 1, title: 'Pilot', viewCount: 1, thumb: '/t/501' }],
        },
      },
    },
  })
  info = { id: 's', name: 'S', owned: true, baseUrl: `${mock.url}/pms/s`, connectionPref: 0, online: true, latencyMs: 1 }
})
afterAll(() => mock.server.close())

test('detail exposes cast, audio and subtitle tracks, resume offset', async () => {
  const p = toDetailPart(info, await fetchDetail(id, info, 't', '1'))
  expect(p.cast).toEqual([{ name: 'Keanu', role: 'Neo' }])
  expect(p.playable.audio.map((a) => a.id)).toEqual([11])
  expect(p.playable.subtitles[0]!.title).toBe('Japanese (SRT)')
  expect(p.playable.viewOffsetMs).toBe(1000)
})

test('seasons and episodes', async () => {
  const seasons = await fetchSeasons(id, info, 't', '5')
  expect(seasons).toEqual([{ ratingKey: '50', index: 1, title: 'Season 1', episodeCount: 6 }])
  const eps = await fetchEpisodes(id, info, 't', '50')
  expect(eps[0]).toMatchObject({ season: 1, episode: 1, title: 'Pilot', watched: true, thumb: 'flax-img://s/t/501' })
})

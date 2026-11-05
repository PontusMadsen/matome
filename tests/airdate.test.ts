import { expect, test } from 'vitest'
import { airLabel } from '../src/renderer/src/airdate'
import { mergeEpisodes } from '../src/main/merge/episodes'

const now = new Date(2026, 10, 5, 15, 30) // 5 Nov 2026, afternoon

test('shows the date, tagging the last two weeks as New and the future as Upcoming', () => {
  expect(airLabel('2026-03-14', now, 'en-GB')).toEqual({ text: '14 Mar 2026', tag: undefined })
  expect(airLabel('2026-11-05', now, 'en-GB')).toEqual({ text: '5 Nov 2026', tag: 'New' }) // today
  expect(airLabel('2026-10-22', now, 'en-GB')).toEqual({ text: '22 Oct 2026', tag: 'New' }) // 14 days ago: still new
  expect(airLabel('2026-10-21', now, 'en-GB')).toEqual({ text: '21 Oct 2026', tag: undefined })
  expect(airLabel('2026-11-12', now, 'en-GB')).toEqual({ text: '12 Nov 2026', tag: 'Upcoming' })
})
test('no or broken date means no label', () => {
  expect(airLabel(undefined, now)).toBeNull()
  expect(airLabel('', now)).toBeNull()
  expect(airLabel('soon', now)).toBeNull()
})

test('merged episodes keep the first air date any server knows', () => {
  const src = (id: string) => ({ serverId: id, serverName: id, ratingKey: id, online: true, connectionPref: 1 })
  const m = mergeEpisodes([
    { source: src('a'), season: 1, episode: 1, title: 'One', watched: false, viewOffsetMs: 0 },
    { source: src('b'), season: 1, episode: 1, title: 'One', watched: false, viewOffsetMs: 0, airDate: '2024-03-14' },
  ])
  expect(m[0]!.airDate).toBe('2024-03-14')
})

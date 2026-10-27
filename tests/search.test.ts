import { expect, test } from 'vitest'
import { annotateAvailability, searchTitles } from '../src/main/merge/search'
import { mergeContinue } from '../src/main/merge/continue'
import type { MergedTitle } from '../src/shared/types'

const t = (id: string, title: string, year: number, addedAt = 1): MergedTitle => ({ id, type: 'movie', title, year, guids: {}, posters: [], genres: [], watched: false, unwatchedCount: 0, addedAt, sources: [] })

test('search ranks exact > prefix > word > substring and ignores diacritics', () => {
  const r = searchTitles([t('1', 'Dune: Part Two', 2024), t('2', 'Dune', 2021), t('3', 'Sand Dune Racers', 2000), t('4', 'Amélie', 2001)], 'dune')
  expect(r.map((x) => x.id)).toEqual(['2', '1', '3'])
  expect(searchTitles([t('4', 'Amélie', 2001)], 'amelie')).toHaveLength(1)
  expect(searchTitles([t('1', 'x', 1)], '  ')).toEqual([])
})

test('discover results marked available only on title+year match', () => {
  const out = annotateAvailability(
    [{ ratingKey: 'a', title: 'Dune Messiah', year: 2021, type: 'movie' }, { ratingKey: 'b', title: 'Dune', year: 1984, type: 'movie' }],
    [t('m1', 'Dune', 2021)],
  )
  expect(out.map((o) => o.availableAs)).toEqual([undefined, undefined])
  expect(annotateAvailability([{ ratingKey: 'c', title: 'Dune', year: 2021, type: 'movie' }], [t('m1', 'Dune', 2021)])[0]!.availableAs).toBe('m1')
})

test('continue watching keeps one entry per title, most recent wins', () => {
  const base = { poster: undefined, viewOffsetMs: 1, durationMs: 2 }
  const r = mergeContinue([
    { ...base, key: 'a', title: 'Slow Horses', serverId: 'a', ratingKey: '1', lastViewedAt: 5, group: 'Slow Horses', year: 2022 },
    { ...base, key: 'b', title: 'Slow Horses', serverId: 'b', ratingKey: '9', lastViewedAt: 9, group: 'Slow Horses', year: 2022 },
    { ...base, key: 'c', title: 'Heat', serverId: 'a', ratingKey: '2', lastViewedAt: 7, group: 'Heat', year: 1995 },
  ])
  expect(r.map((x) => x.key)).toEqual(['b', 'c'])
})

import { describe, expect, test } from 'vitest'
import { mergeItems, normTitle, parseGuids } from '../src/main/merge'
import type { RawItem } from '@shared/types'

let n = 0
const item = (o: Partial<RawItem> & Pick<RawItem, 'serverId' | 'title'>): RawItem => ({
  serverName: o.serverId,
  ratingKey: String(++n),
  library: 'Movies',
  type: 'movie',
  guids: {},
  addedAt: 1,
  ...o,
})

describe('mergeItems', () => {
  test('same movie on 3 servers -> 1 title, 3 sources', () => {
    const r = mergeItems([
      item({ serverId: 'a', title: 'The Matrix', year: 1999, guids: { tmdb: '603' } }),
      item({ serverId: 'b', title: 'The Matrix', year: 1999, guids: { tmdb: '603', imdb: 'tt0133093' } }),
      item({ serverId: 'c', title: 'Matrix', year: 1999, guids: { imdb: 'tt0133093' } }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]!.sources).toHaveLength(3)
    expect(r[0]!.guids).toEqual({ tmdb: '603', imdb: 'tt0133093' })
  })

  test('Slow Horses on 3 servers -> 1 show with 3 sources', () => {
    const r = mergeItems(
      ['a', 'b', 'c'].map((s) => item({ serverId: s, type: 'show', title: 'Slow Horses', year: 2022, guids: { tvdb: '388629' } })),
    )
    expect(r).toHaveLength(1)
    expect(r[0]!.sources.map((s) => s.serverId).sort()).toEqual(['a', 'b', 'c'])
  })

  test('imdb-only and tmdb-only join through a third item (union-find)', () => {
    const r = mergeItems([
      item({ serverId: 'a', title: 'X', year: 2000, guids: { imdb: 'tt1' } }),
      item({ serverId: 'b', title: 'X', year: 2000, guids: { tmdb: '9' } }),
      item({ serverId: 'c', title: 'X', year: 2000, guids: { imdb: 'tt1', tmdb: '9' } }),
    ])
    expect(r).toHaveLength(1)
  })

  test('GUID-less fallback uses normalized title + year', () => {
    const r = mergeItems([
      item({ serverId: 'a', title: 'Amélie', year: 2001 }),
      item({ serverId: 'b', title: 'amelie', year: 2001 }),
    ])
    expect(r).toHaveLength(1)
  })

  test('GUID-less item attaches to GUID item with same title+year', () => {
    const r = mergeItems([
      item({ serverId: 'a', title: 'Heat', year: 1995, guids: { tmdb: '949' } }),
      item({ serverId: 'b', title: 'Heat', year: 1995 }),
    ])
    expect(r).toHaveLength(1)
  })

  test('same title, different year stays separate (no GUIDs)', () => {
    const r = mergeItems([
      item({ serverId: 'a', title: 'Dune', year: 1984 }),
      item({ serverId: 'b', title: 'Dune', year: 2021 }),
    ])
    expect(r).toHaveLength(2)
  })

  test('remakes with distinct GUIDs are not merged', () => {
    const r = mergeItems([
      item({ serverId: 'a', title: 'Dune', year: 2021, guids: { tmdb: '438631' } }),
      item({ serverId: 'a', title: 'Dune', year: 2021, guids: { tmdb: '841' } }),
    ])
    expect(r).toHaveLength(2)
  })

  test('movie and show with same title do not merge', () => {
    const r = mergeItems([
      item({ serverId: 'a', title: 'Fargo', year: 1996 }),
      item({ serverId: 'a', type: 'show', title: 'Fargo', year: 1996 }),
    ])
    expect(r).toHaveLength(2)
  })

  test('addedAt is max across sources; default source: online > local > res > bitrate', () => {
    const r = mergeItems([
      item({ serverId: 'relay', title: 'Y', year: 2020, guids: { tmdb: '1' }, addedAt: 5, connectionPref: 2, quality: { res: '4k' } }),
      item({ serverId: 'local', title: 'Y', year: 2020, guids: { tmdb: '1' }, addedAt: 9, connectionPref: 0, quality: { res: '1080' } }),
      item({ serverId: 'off', title: 'Y', year: 2020, guids: { tmdb: '1' }, addedAt: 3, connectionPref: 0, online: false, quality: { res: '4k' } }),
    ])
    expect(r[0]!.addedAt).toBe(9)
    expect(r[0]!.sources.map((s) => s.serverId)).toEqual(['local', 'relay', 'off'])
  })
})

test('genres unioned, watched on any source', () => {
  const r = mergeItems([
    item({ serverId: 'a', title: 'Z', year: 2001, guids: { tmdb: '5' }, genres: ['Drama'], watched: false }),
    item({ serverId: 'b', title: 'Z', year: 2001, guids: { tmdb: '5' }, genres: ['Drama', 'Crime'], watched: true, rating: 8.1 }),
  ])
  expect(r[0]!.genres.sort()).toEqual(['Crime', 'Drama'])
  expect(r[0]!.watched).toBe(true)
  expect(r[0]!.rating).toBe(8.1)
})

test('unwatchedCount: shows use largest library minus most-watched server; movies are 0', () => {
  const r = mergeItems([
    item({ serverId: 'a', type: 'show', title: 'S', year: 2020, guids: { tvdb: '1' }, leafCount: 10, viewedLeafCount: 4 }),
    item({ serverId: 'b', type: 'show', title: 'S', year: 2020, guids: { tvdb: '1' }, leafCount: 12, viewedLeafCount: 9 }),
    item({ serverId: 'c', title: 'M', year: 2020, guids: { tmdb: '5' }, leafCount: 3 }),
  ])
  expect(r.find((x) => x.type === 'show')!.unwatchedCount).toBe(3)
  expect(r.find((x) => x.type === 'movie')!.unwatchedCount).toBe(0)
})

test('normTitle', () => {
  expect(normTitle('The Office (US)')).toBe('office us')
  expect(normTitle('Tom & Jerry')).toBe('tom and jerry')
})

test('parseGuids', () => {
  expect(parseGuids(['imdb://tt1', 'tmdb://2', 'plex://movie/abc'])).toEqual({ imdb: 'tt1', tmdb: '2' })
})

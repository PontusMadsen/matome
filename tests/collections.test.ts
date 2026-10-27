import { expect, test } from 'vitest'
import { mergeCollections } from '../src/main/merge/collections'
import { addToPlaylistPath, createPlaylistPath, itemUri } from '../src/main/plex/collections'

test('same-named collections merge across servers, contents unioned, empty dropped', () => {
  const r = mergeCollections([
    { serverId: 'a', title: 'The Marvel Collection', titleIds: ['m1', 'm2'] },
    { serverId: 'b', title: 'Marvel Collection', titleIds: ['m2', 'm3'], poster: 'p' },
    { serverId: 'a', title: 'Empty', titleIds: [] },
  ])
  expect(r).toHaveLength(1)
  expect(r[0]!.titleIds).toEqual(['m1', 'm2', 'm3'])
  expect(r[0]!.servers).toEqual(['a', 'b'])
  expect(r[0]!.poster).toBe('p')
})

test('playlist write paths use server:// item URIs', () => {
  const uri = itemUri('mach1', '42')
  expect(uri).toBe('server://mach1/com.plexapp.plugins.library/library/metadata/42')
  expect(new URLSearchParams(createPlaylistPath('Fav', uri).split('?')[1]).get('uri')).toBe(uri)
  expect(addToPlaylistPath('7', uri)).toContain('/playlists/7/items?uri=')
})

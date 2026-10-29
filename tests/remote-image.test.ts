import { expect, test } from 'vitest'
import { isAllowedImageUrl, posterUrl } from '../src/main/remote-image'

test('only public https hosts are fetched for posters', () => {
  expect(isAllowedImageUrl(new URL('https://image.tmdb.org/t/p/w500/a.jpg'))).toBe(true)
  expect(isAllowedImageUrl(new URL('https://metadata-static.plex.tv/a/b.jpg'))).toBe(true)
  expect(isAllowedImageUrl(new URL('http://image.tmdb.org/a.jpg'))).toBe(false)
  expect(isAllowedImageUrl(new URL('https://localhost/a.jpg'))).toBe(false)
  expect(isAllowedImageUrl(new URL('https://192.168.1.5/a.jpg'))).toBe(false)
  expect(isAllowedImageUrl(new URL('https://printer.local/a.jpg'))).toBe(false)
  expect(isAllowedImageUrl(new URL('https://[::1]/a.jpg'))).toBe(false)
})
test('poster urls: absolute ones go through the remote proxy, Discover-relative through the account', () => {
  expect(posterUrl('https://image.tmdb.org/a.jpg')).toBe('flax-img://remote/https%3A%2F%2Fimage.tmdb.org%2Fa.jpg')
  expect(posterUrl('/library/metadata/5d/thumb/1?x=1')).toBe('flax-img://discover/library/metadata/5d/thumb/1?x=1')
  expect(posterUrl(undefined)).toBeUndefined()
  expect(posterUrl('nonsense')).toBeUndefined()
})

import { expect, test } from 'vitest'
import { parseRatings } from '../src/main/plex/detail'

test('reads IMDb and Rotten Tomatoes scores from Plex metadata', () => {
  expect(
    parseRatings({
      Rating: [
        { image: 'imdb://image.rating', value: 6.1, type: 'audience' },
        { image: 'rottentomatoes://image.rating.ripe', value: 7.4, type: 'critic' },
        { image: 'rottentomatoes://image.rating.upright', value: 8.8, type: 'audience' },
        { image: 'themoviedb://image.rating', value: 6.5, type: 'audience' },
      ],
    }),
  ).toEqual({ imdb: 6.1, rtCritic: 74, rtAudience: 88 })
})
test('rotten and spilled variants map the same way; nothing useful gives undefined', () => {
  expect(parseRatings({ Rating: [{ image: 'rottentomatoes://image.rating.rotten', value: 3, type: 'critic' }, { image: 'rottentomatoes://image.rating.spilled', value: 2.5 }] })).toEqual({ rtCritic: 30, rtAudience: 25 })
  expect(parseRatings({})).toBeUndefined()
  expect(parseRatings({ Rating: [{ image: 'themoviedb://image.rating', value: 5 }, { value: 4 }] })).toBeUndefined()
})

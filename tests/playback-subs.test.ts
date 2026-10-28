import { expect, test } from 'vitest'
import { subtitleChoice } from '../src/main/plex/playback'

test('no subtitle chosen means off, a choice is kept, and nothing is written without a part', () => {
  expect(subtitleChoice(undefined, 42)).toBe(0)
  expect(subtitleChoice(7, 42)).toBe(7)
  expect(subtitleChoice(0, 42)).toBe(0)
  expect(subtitleChoice(undefined, undefined)).toBeUndefined()
})

import { expect, test } from 'vitest'
import { detectBase, safeStartMs } from '../src/renderer/src/components/playbackBase'

test('zero-based restarted stream: base is the offset', () => {
  expect(detectBase(120_000, 0.4)).toBe(120_000)
})
test('continuous timeline (currentTime already includes the offset): base is 0, no double counting', () => {
  expect(detectBase(2_002_000, 2002.3)).toBe(0)
})
test('no offset: base 0 either way; tiny offsets are left alone', () => {
  expect(detectBase(0, 0.2)).toBe(0)
  expect(detectBase(5_000, 5.1)).toBe(5_000)
})
test('resume points at the end of the file restart from 0', () => {
  expect(safeStartMs(4_004_000, 3_299_000)).toBe(0)
  expect(safeStartMs(3_290_000, 3_299_000)).toBe(0)
  expect(safeStartMs(1_200_000, 3_299_000)).toBe(1_200_000)
  expect(safeStartMs(900_000, 0)).toBe(900_000)
  expect(safeStartMs(NaN, 100)).toBe(0)
})

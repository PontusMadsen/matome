import { expect, test } from 'vitest'
import { createSwipeDetector } from '../src/renderer/src/components/swipeBack'

const run = (events: [dx: number, dy: number, canLeft: boolean, t: number][]) => {
  const feed = createSwipeDetector()
  return events.map(([dx, dy, c, t]) => feed(dx, dy, c, t)).filter(Boolean).length
}

test('a swipe to the right fires once per gesture', () => {
  expect(run([[-30, 2, false, 0], [-40, 1, false, 16], [-40, 0, false, 32], [-50, 0, false, 48], [-60, 0, false, 64]])).toBe(1)
})
test('swiping the other way or mostly vertically does nothing', () => {
  expect(run([[40, 0, false, 0], [50, 0, false, 16], [60, 0, false, 32]])).toBe(0)
  expect(run([[-30, 80, false, 0], [-30, 80, false, 16], [-30, 80, false, 32], [-30, 80, false, 48]])).toBe(0)
})
test('a gesture that starts over something still scrollable to the left never navigates, even with momentum at its start', () => {
  expect(run([[-30, 0, true, 0], [-40, 0, false, 16], [-40, 0, false, 32], [-60, 0, false, 48]])).toBe(0)
})
test('a new gesture after a pause can fire again', () => {
  expect(run([[-60, 0, false, 0], [-60, 0, false, 16], [-60, 0, false, 600], [-60, 0, false, 616]])).toBe(2)
})

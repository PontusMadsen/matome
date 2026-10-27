/**
 * Two-finger trackpad swipe -> "back", like a browser's overscroll navigation.
 * Pure state machine so it can be unit-tested: feed it wheel deltas, it says when to go back.
 *
 * A gesture is a burst of wheel events (incl. momentum) with gaps shorter than GAP_MS. It counts only if it began
 * with the pointer over something that could not scroll further left (otherwise a flick through a shelf would
 * navigate when the shelf hits its start), is mostly horizontal, and moves right (negative deltaX) far enough.
 * One gesture triggers at most once.
 */
export const GAP_MS = 220
export const THRESHOLD_PX = 90

export function createSwipeDetector() {
  let last = -Infinity
  let armed = false
  let acc = 0
  let fired = false
  return function feed(dx: number, dy: number, canScrollLeft: boolean, now: number): boolean {
    if (now - last > GAP_MS) {
      armed = !canScrollLeft // decided once, at the start of the gesture
      acc = 0
      fired = false
    }
    last = now
    if (!armed || fired) return false
    if (Math.abs(dx) < Math.abs(dy) * 1.5) { acc = 0; return false } // mostly vertical: a normal scroll
    acc += dx
    if (acc < -THRESHOLD_PX) { fired = true; return true }
    if (acc > 0) acc = 0 // swiping the other way cancels
    return false
  }
}

/** Nearest ancestor that scrolls horizontally and currently has room to scroll left. */
export function canScrollLeftFrom(el: Element | null): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowX
    if ((o === 'auto' || o === 'scroll') && n.scrollWidth > n.clientWidth && n.scrollLeft > 1) return true
  }
  return false
}

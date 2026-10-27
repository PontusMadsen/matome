import { useEffect, useRef } from 'react'
import { canScrollLeftFrom, createSwipeDetector } from './swipeBack'

/** Calls `onBack` on a two-finger swipe to the right (trackpad), once per gesture. */
export function useSwipeBack(onBack: () => void): void {
  const cb = useRef(onBack)
  cb.current = onBack
  useEffect(() => {
    const feed = createSwipeDetector()
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // pinch zoom
      if (feed(e.deltaX, e.deltaY, canScrollLeftFrom(e.target as Element | null), performance.now())) cb.current()
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])
}

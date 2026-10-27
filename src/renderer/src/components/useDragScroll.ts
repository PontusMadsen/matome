import { useEffect, type RefObject } from 'react'

const INTERACTIVE = 'input, select, textarea, button, a, video, [data-nodrag]'

/**
 * Touch-style press-and-drag scrolling for mouse/pen users (no wheel, no trackpad).
 * - Activates after 6px of movement, so plain clicks still open cards.
 * - Picks the dominant axis at activation, so a vertical drag on a horizontal shelf scrolls the page instead.
 * - Coasts to a stop after release.
 */
export function useDragScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { x: number; y: number; sl: number; st: number; id: number } | null = null
    let active: 'x' | 'y' | null = null
    let samples: { t: number; x: number; y: number }[] = []
    let raf = 0

    const swallowClick = () => {
      const kill = (e: Event) => { e.stopPropagation(); e.preventDefault() }
      window.addEventListener('click', kill, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', kill, { capture: true }), 80)
    }

    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (!active) {
        if (Math.hypot(dx, dy) < 6) return
        const axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        const can = axis === 'x' ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1
        if (!can) { cleanup(); return }
        active = axis
        document.body.style.cursor = 'grabbing'
      }
      if (active === 'x') el.scrollLeft = start.sl - dx
      else el.scrollTop = start.st - dy
      samples.push({ t: performance.now(), x: e.clientX, y: e.clientY })
      if (samples.length > 6) samples.shift()
    }

    const up = () => {
      const was = active
      const s = samples
      cleanup()
      if (!was) return
      swallowClick()
      // momentum from the last few samples
      const a = s[0]
      const b = s[s.length - 1]
      if (!a || !b || performance.now() - b.t > 80 || b.t === a.t) return
      let v = (was === 'x' ? a.x - b.x : a.y - b.y) / (b.t - a.t) // px per ms, in scroll direction
      const tick = () => {
        v *= 0.94
        if (Math.abs(v) < 0.02) return
        const before = was === 'x' ? el.scrollLeft : el.scrollTop
        if (was === 'x') el.scrollLeft += v * 16
        else el.scrollTop += v * 16
        if ((was === 'x' ? el.scrollLeft : el.scrollTop) === before) return // hit an edge: stop coasting
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    const cleanup = () => {
      start = null
      active = null
      samples = []
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return // touch scrolls natively
      if ((e.target as HTMLElement).closest(INTERACTIVE)) return
      cancelAnimationFrame(raf)
      start = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, id: e.pointerId }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    }

    // Any key press or new touch of the page stops a coast immediately.
    const stop = () => cancelAnimationFrame(raf)
    window.addEventListener('keydown', stop, true)
    el.addEventListener('pointerdown', down)
    return () => {
      window.removeEventListener('keydown', stop, true)
      el.removeEventListener('pointerdown', down)
      cancelAnimationFrame(raf)
      cleanup()
    }
  }, [ref])
}

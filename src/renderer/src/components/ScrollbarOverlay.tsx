import { useEffect, useRef, useState, type RefObject } from 'react'
import s from './ScrollbarOverlay.module.css'

/** Slim overlay scrollbar: always faintly visible, grows on hover, draggable, click-to-page. For pen/mouse-only setups. */
export function ScrollbarOverlay({ target }: { target: RefObject<HTMLElement | null> }) {
  const [m, setM] = useState({ top: 0, h: 0, visible: false })
  const [awake, setAwake] = useState(false)
  const [drag, setDrag] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = target.current
    if (!el) return
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight <= clientHeight + 1) return setM((p) => (p.visible ? { top: 0, h: 0, visible: false } : p))
      const trackH = track.current?.clientHeight ?? clientHeight
      const h = Math.max(40, (clientHeight / scrollHeight) * trackH)
      const top = (scrollTop / (scrollHeight - clientHeight)) * (trackH - h)
      setM({ top, h, visible: true })
    }
    const wake = () => { setAwake(true); clearTimeout(timer.current); timer.current = setTimeout(() => setAwake(false), 1100) }
    const onScroll = () => { update(); wake() }
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); clearTimeout(timer.current) }
  }, [target])

  const ratio = () => {
    const el = target.current
    const trackH = track.current?.clientHeight ?? 1
    return el ? (el.scrollHeight - el.clientHeight) / Math.max(1, trackH - m.h) : 0
  }

  const startDrag = (e: React.PointerEvent) => {
    e.stopPropagation()
    const el = target.current
    if (!el) return
    const y0 = e.clientY
    const st0 = el.scrollTop
    const r = ratio()
    setDrag(true)
    const move = (ev: PointerEvent) => { el.scrollTop = st0 + (ev.clientY - y0) * r }
    const up = () => { setDrag(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const page = (e: React.PointerEvent) => {
    const el = target.current
    const rect = track.current?.getBoundingClientRect()
    if (!el || !rect) return
    el.scrollBy({ top: (e.clientY < rect.top + m.top ? -1 : 1) * el.clientHeight * 0.9, behavior: 'smooth' })
  }

  if (!m.visible) return null
  return (
    <div ref={track} className={`${s.track} ${awake || drag ? s.awake : ''} ${drag ? s.drag : ''}`} onPointerDown={page} data-nodrag>
      <div className={s.thumb} style={{ height: m.h, transform: `translateY(${m.top}px)` }} onPointerDown={startDrag} />
    </div>
  )
}

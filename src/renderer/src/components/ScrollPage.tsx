import { useRef, type ReactNode, type CSSProperties } from 'react'
import { ScrollbarOverlay } from './ScrollbarOverlay'
import { useDragScroll } from './useDragScroll'

/** Scrolling page body with pen-friendly scrolling (drag-to-scroll, overlay scrollbar, keyboard). */
/** `bleed`: extend into the 32px page gutters (default). Full-bleed overlays like the detail page turn it off. */
export function ScrollPage({ className, children, style, bleed = true }: { className?: string; children: ReactNode; style?: CSSProperties; bleed?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useDragScroll(ref)
  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, margin: bleed ? '0 -32px' : 0, display: 'flex', flexDirection: 'column' }}>
      <div ref={ref} data-scroll-main className={className} style={{ margin: 0, flex: 1, minHeight: 0, height: 'auto', ...style }}>
        {children}
      </div>
      <ScrollbarOverlay target={ref} />
    </div>
  )
}

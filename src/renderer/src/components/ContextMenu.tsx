import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import s from './ContextMenu.module.css'

export interface MenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

/** Right-click menu: `onContextMenu` goes on the target, `menu` renders the popup. */
export function useContextMenu(items: () => MenuItem[]): { onContextMenu: (e: React.MouseEvent) => void; menu: ReactNode } {
  const [pos, setPos] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', esc)
    window.addEventListener('wheel', close, { passive: true })
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('wheel', close)
    }
  }, [pos])
  return {
    onContextMenu: (e) => {
      e.preventDefault()
      e.stopPropagation()
      setPos({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 120), items: items() })
    },
    menu: pos
      ? createPortal(
          <div className={s.menu} style={{ left: pos.x, top: pos.y }} role="menu" onContextMenu={(e) => e.preventDefault()}>
            {pos.items.map((it) => (
              <button key={it.label} role="menuitem" className={`${s.item} ${it.danger ? s.danger : ''}`} onClick={() => { setPos(null); it.onSelect() }}>
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null,
  }
}

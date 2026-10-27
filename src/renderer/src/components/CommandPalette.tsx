import { useEffect, useRef, useState } from 'react'
import type { MergedTitle } from '@shared/types'
import { useSearch } from '../api'
import { Icon } from './Icon'
import s from './CommandPalette.module.css'

/** ⌘K / "/" quick search from anywhere: instant local results, plus a few Plex Discover hits. */
export function CommandPalette({ open, onClose, onOpenTitle, onSeeAll }: { open: boolean; onClose: () => void; onOpenTitle: (t: MergedTitle) => void; onSeeAll: () => void }) {
  const [q, setQ] = useState('')
  const [d, setD] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { const t = setTimeout(() => setD(q), 120); return () => clearTimeout(t) }, [q])
  useEffect(() => { if (open) { setQ(''); setD(''); setSel(0); setTimeout(() => input.current?.focus(), 0) } }, [open])
  const { data } = useSearch(d)
  if (!open) return null
  const local = (data?.local ?? []).slice(0, 8)
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, local.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      const t = local[sel]
      if (e.metaKey || e.ctrlKey || !t) { if (q.trim()) { onClose(); onSeeAll() } } else { onClose(); onOpenTitle(t) }
    }
  }
  return (
    <div className={s.scrim} onMouseDown={onClose}>
      <div className={`${s.box} enter`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className={s.field}>
          <Icon name="search" size={18} />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }} onKeyDown={key} placeholder="Search movies and shows on every server…" spellCheck={false} />
          <kbd>esc</kbd>
        </div>
        {d.trim() && (
          <div className={s.results}>
            {local.length === 0 && <div className={s.none}>No matches on your servers</div>}
            {local.map((t, i) => (
              <button key={t.id} className={`${s.item} ${i === sel ? s.sel : ''}`} onMouseEnter={() => setSel(i)} onClick={() => { onClose(); onOpenTitle(t) }}>
                {t.posters[0] ? <img src={t.posters[0]} alt="" /> : <span className={s.ph} />}
                <span className={s.name}>{t.title}</span>
                <span className={s.sub}>{t.type === 'show' ? 'Show' : 'Movie'}{t.year ? ` · ${t.year}` : ''}</span>
              </button>
            ))}
            <button className={`${s.item} ${s.all}`} onClick={() => { onClose(); onSeeAll() }}>
              <Icon name="search" size={16} />
              <span className={s.name}>See all results{(data?.discover.length ?? 0) > 0 ? ` and ${data!.discover.length} more on Plex` : ''}</span>
              <kbd>↵</kbd>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

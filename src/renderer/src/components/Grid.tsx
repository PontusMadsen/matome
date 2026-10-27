import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useContextMenu, type MenuItem } from './ContextMenu'
import { useWatchlist } from '../api'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ContinueItem, MergedTitle } from '@shared/types'
import { Icon } from './Icon'
import { ScrollbarOverlay } from './ScrollbarOverlay'
import { useDragScroll } from './useDragScroll'
import s from './Grid.module.css'

const MIN_W = 156
const GAP_X = 16
const GAP_Y = 20
const TEXT_H = 48

/** Poster with fallback to the next server's copy when one fails to load. */
function Poster({ urls, title }: { urls: string[]; title: string }) {
  const [i, setI] = useState(0)
  const url = urls[i]
  const [loaded, setLoaded] = useState(false)
  return url ? <img className={`${s.img} ${loaded ? s.loaded : ''}`} src={url} alt="" loading="lazy" onLoad={() => setLoaded(true)} onError={() => setI((n) => n + 1)} /> : <div className={s.fallback}>{title}</div>
}

export function Card({ t, onOpen, progress, index }: { t: MergedTitle; onOpen?: (t: MergedTitle, el?: HTMLElement | null) => void; progress?: number; index?: number }) {
  const offline = t.sources.every((x) => !x.online)
  const qc = useQueryClient()
  // Movies: watched = watched anywhere. Shows: "unwatched" if any episode is left.
  const isWatched = t.type === 'movie' ? t.watched : t.unwatchedCount === 0
  const wl = useWatchlist().data
  const { onContextMenu, menu } = useContextMenu(() => {
    const onList = wl?.find((d) => d.availableAs === t.id)
    const items: MenuItem[] = [
    { label: 'Open', onSelect: () => onOpen?.(t) },
    {
      label: isWatched ? 'Mark as unwatched' : 'Mark as watched',
      onSelect: () => void window.flax.invoke('title:setWatched', { id: t.id, watched: !isWatched }).then(() => qc.invalidateQueries({ queryKey: ['library'] })),
    },
    ]
    if (onList)
      items.push({
        label: 'Remove from Watchlist',
        onSelect: () => void window.flax.invoke('watchlist:set', { ratingKey: onList.ratingKey, on: false }).then(() => Promise.all([qc.invalidateQueries({ queryKey: ['watchlist'] }), qc.invalidateQueries({ queryKey: ['search'] })])),
      })
    return items
  })
  return (
    <div className={`${s.card} ${offline ? s.offline : ''} ${index !== undefined ? s.stag : ''}`} title={t.title} tabIndex={0} role="button" onClick={(e) => onOpen?.(t, e.currentTarget)} onContextMenu={onContextMenu} onKeyDown={(e) => e.key === 'Enter' && onOpen?.(t, e.currentTarget)} data-tid={t.id} style={index !== undefined ? ({ '--i': index } as React.CSSProperties) : undefined}>
      {menu}
      <div className={s.poster} data-poster>
        <Poster urls={t.posters} title={t.title} />
        <div className={s.hover}>
          <span className={s.play}><Icon name="play" size={20} fill /></span>
        </div>
        {t.unwatchedCount > 0 && <span className={s.pill} title={`${t.unwatchedCount} unwatched episode${t.unwatchedCount > 1 ? 's' : ''}`}>{t.unwatchedCount}</span>}
        {t.type === 'movie' && t.watched && <span className={s.seen} title="Watched"><Icon name="check" size={13} /></span>}
        {progress !== undefined && progress > 0 && <div className={s.bar}><i style={{ width: `${Math.min(100, progress * 100)}%` }} /></div>}
      </div>
      <div className={s.name}>{t.title}</div>
      <div className={s.sub}>{t.year ?? ''}</div>
    </div>
  )
}

/** Continue Watching entry whose merged title isn't in the cache (yet): still shown, straight from what the server reported. */
export function ContinueTile({ c, onOpen }: { c: ContinueItem; onOpen: (el: HTMLElement) => void }) {
  const pct = c.durationMs ? c.viewOffsetMs / c.durationMs : 0
  return (
    <div className={s.card} title={c.title} tabIndex={0} role="button" onClick={(e) => onOpen(e.currentTarget)} onKeyDown={(e) => e.key === 'Enter' && onOpen(e.currentTarget)} data-testid="continue-tile">
      <div className={s.poster} data-poster>
        <Poster urls={c.poster ? [c.poster] : []} title={c.title} />
        <div className={s.hover}>
          <span className={s.play}><Icon name="play" size={20} fill /></span>
        </div>
        {pct > 0 && <div className={s.bar}><i style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>}
      </div>
      <div className={s.name}>{c.title}</div>
      <div className={s.sub}>{c.subtitle ?? ''}</div>
    </div>
  )
}

export function PosterGrid({ items, onOpen, jumpTo }: { items: MergedTitle[]; onOpen?: (t: MergedTitle, el?: HTMLElement | null) => void; /** scroll so this item index is at the top; `n` makes repeated jumps to the same index fire again */ jumpTo?: { index: number; n: number } }) {
  const parent = useRef<HTMLDivElement>(null)
  useDragScroll(parent)
  const [width, setWidth] = useState(1000)
  // Stagger the first screenful in once; never re-animate rows that scroll back into view.
  const [intro, setIntro] = useState(true)
  useEffect(() => { const t = setTimeout(() => setIntro(false), 900); return () => clearTimeout(t) }, [])
  useEffect(() => {
    const el = parent.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 64))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Columns fill the width: pick the column count for the minimum card size, then stretch cards to fit.
  const cols = Math.max(1, Math.floor((width + GAP_X) / (MIN_W + GAP_X)))
  const cardW = (width - (cols - 1) * GAP_X) / cols
  const rowH = Math.round(cardW * 1.5) + TEXT_H + GAP_Y
  const rows = useMemo(() => {
    const r: MergedTitle[][] = []
    for (let i = 0; i < items.length; i += cols) r.push(items.slice(i, i + cols))
    return r
  }, [items, cols])
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => rowH, overscan: 4 })
  useEffect(() => v.measure(), [rowH, v])
  useEffect(() => {
    if (jumpTo) v.scrollToIndex(Math.floor(jumpTo.index / cols), { align: 'start' })
  }, [jumpTo?.n])
  return (
    <div className={s.scrollbox}>
    <div ref={parent} className={s.scroll} data-scroll-main>
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map((vr) => (
          <div key={vr.key} className={s.row} style={{ transform: `translateY(${vr.start}px)`, gridTemplateColumns: `repeat(${cols}, ${cardW}px)` }}>
            {rows[vr.index]!.map((t, c) => (
              <Card key={t.id} t={t} onOpen={onOpen} index={intro && vr.index < 5 ? vr.index * cols + c : undefined} />
            ))}
          </div>
        ))}
      </div>
    </div>
    <ScrollbarOverlay target={parent} />
    </div>
  )
}

export function Shelf({ title, hint, busy, children }: { title: string; hint?: string; busy?: boolean; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null)
  useDragScroll(row)
  const [edge, setEdge] = useState({ start: true, end: false })
  const update = () => {
    const el = row.current
    if (el) setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }
  useEffect(() => {
    update()
    const el = row.current
    if (!el) return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  })
  const go = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: 'smooth' })
  return (
    <section className={s.shelf}>
      <div className={s.shelfhead}>
        <h2 className="t-section">{title}</h2>
        {hint && <span className="t-meta">{hint}</span>}
        {busy && <span className={s.updating} role="status"><i />Updating…</span>}
      </div>
      <div className={s.shelfwrap}>
        {!edge.start && <button className={`${s.arrow} ${s.l}`} aria-label="Scroll left" onClick={() => go(-1)}><Icon name="back" size={18} /></button>}
        {!edge.end && <button className={`${s.arrow} ${s.r}`} aria-label="Scroll right" onClick={() => go(1)} style={{ transform: 'scaleX(-1)' }}><Icon name="back" size={18} /></button>}
        <div ref={row} onScroll={update} className={`${s.shelfrow} ${!edge.start ? s.fadeL : ''} ${!edge.end ? s.fadeR : ''}`}>{children}</div>
      </div>
    </section>
  )
}

export function RecentRow({ items, onOpen }: { items: MergedTitle[]; onOpen?: (t: MergedTitle, el?: HTMLElement | null) => void }) {
  return (
    <>
      {items.map((t, i) => (
        <Card key={t.id} t={t} onOpen={onOpen} index={i < 10 ? i : undefined} />
      ))}
    </>
  )
}

export function SkeletonShelf({ n = 8 }: { n?: number }) {
  return (
    <div className={s.skelrow}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ width: 156 }}>
          <div className="skeleton" style={{ aspectRatio: '2 / 3' }} />
          <div className="skeleton" style={{ height: 12, marginTop: 10, width: '70%' }} />
        </div>
      ))}
    </div>
  )
}

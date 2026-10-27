import { useQueryClient } from '@tanstack/react-query'
import type { DiscoverItem } from '@shared/types'
import { useContextMenu } from './ContextMenu'
import { Icon } from './Icon'
import s from './Grid.module.css'

/** Title that may not be on any server: shows availability and a watchlist toggle. */
export function DiscoverCard({ d, onOpenLocal }: { d: DiscoverItem; onOpenLocal: (titleId: string) => void }) {
  const qc = useQueryClient()
  const toggle = async () => {
    await window.flax.invoke('watchlist:set', { ratingKey: d.ratingKey, on: !d.onWatchlist })
    await Promise.all([qc.invalidateQueries({ queryKey: ['watchlist'] }), qc.invalidateQueries({ queryKey: ['search'] })])
  }
  const { onContextMenu, menu } = useContextMenu(() => [
    ...(d.availableAs ? [{ label: 'Open', onSelect: () => onOpenLocal(d.availableAs!) }] : []),
    { label: d.onWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist', onSelect: () => void toggle() },
  ])
  return (
    <div className={s.card} onContextMenu={onContextMenu}>
      {menu}
      <div className={s.poster} style={{ cursor: d.availableAs ? 'pointer' : 'default' }} onClick={() => d.availableAs && onOpenLocal(d.availableAs)}>
        {d.poster ? <img src={d.poster} alt="" loading="lazy" /> : <div className={s.fallback}>{d.title}</div>}
        {!d.availableAs && <span className={s.pill} style={{ background: 'var(--s4)', color: 'var(--text-dim)' }}>Not on servers</span>}
      </div>
      <div className={s.name}>{d.title}</div>
      <div className={s.sub} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{d.year ?? ''}</span>
        <button className="btn btn-ghost btn-icon" style={{ height: 22, width: 22, marginLeft: 'auto' }} title={d.onWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'} onClick={() => void toggle()}>
          <Icon name={d.onWatchlist ? 'check' : 'plus'} size={14} />
        </button>
      </div>
    </div>
  )
}

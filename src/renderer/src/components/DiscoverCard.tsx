import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DiscoverItem } from '@shared/types'
import { useContextMenu } from './ContextMenu'
import { Icon } from './Icon'
import { removedFromWatchlist } from '../api'
import s from './Grid.module.css'

/** Title that may not be on any server: shows availability and a watchlist toggle. */
export function DiscoverCard({ d, onOpenLocal }: { d: DiscoverItem; onOpenLocal: (titleId: string) => void }) {
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  const toggle = async () => {
    setErr('')
    // Removing: take the card off the list right away (the Discover service lags a few seconds), put it back if the server refuses.
    const before = qc.getQueryData<DiscoverItem[]>(['watchlist'])
    if (d.onWatchlist) { removedFromWatchlist.add(d.ratingKey); qc.setQueryData<DiscoverItem[]>(['watchlist'], (old) => old?.filter((x) => x.ratingKey !== d.ratingKey)) }
    else removedFromWatchlist.delete(d.ratingKey)
    try {
      await window.flax.invoke('watchlist:set', { ratingKey: d.ratingKey, on: !d.onWatchlist })
    } catch (e) {
      if (d.onWatchlist) removedFromWatchlist.delete(d.ratingKey)
      if (before) qc.setQueryData(['watchlist'], before)
      setErr(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not update the Watchlist')
      return
    }
    await qc.invalidateQueries({ queryKey: ['search'] })
    // Re-read the list once Plex has caught up.
    setTimeout(() => void qc.invalidateQueries({ queryKey: ['watchlist'] }), 2500)
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
      {err && <div role="alert" style={{ color: 'var(--err, #e5736b)', fontSize: 12 }}>{err}</div>}
      <div className={s.sub} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{d.year ?? ''}</span>
        <button className="btn btn-ghost btn-icon" style={{ height: 22, width: 22, marginLeft: 'auto' }} title={d.onWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'} onClick={() => void toggle()}>
          <Icon name={d.onWatchlist ? 'check' : 'plus'} size={14} />
        </button>
      </div>
    </div>
  )
}

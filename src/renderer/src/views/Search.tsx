import { useEffect, useState } from 'react'
import type { MergedTitle } from '@shared/types'
import { useLibrary, useSearch } from '../api'
import { Card } from '../components/Grid'
import { DiscoverCard } from '../components/DiscoverCard'
import { Icon } from '../components/Icon'
import s from './Page.module.css'
import { ScrollPage } from '../components/ScrollPage'

export function Search({ onOpen }: { onOpen: (t: MergedTitle, el?: HTMLElement | null) => void }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 150); return () => clearTimeout(t) }, [q])
  const { data } = useSearch(debounced)
  const movies = useLibrary('movie')
  const shows = useLibrary('show')
  const openById = (id: string) => {
    const t = [...(movies.data ?? []), ...(shows.data ?? [])].find((x) => x.id === id)
    if (t) onOpen(t)
  }
  return (
    <ScrollPage className={s.page}>
      <div className={s.searchbox}>
        <Icon name="search" size={18} />
        <input autoFocus className={`input ${s['input-lg']}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every server, and all of Plex…" />
      </div>
      {!debounced.trim() && <div className={s.empty}><h3>Search everything</h3><p>Results from all your servers appear instantly. Titles you don't have show up below with a Watchlist button.</p></div>}
      {data && debounced.trim() && (
        <>
          <h2 className={`t-section ${s.sec}`}>On your servers <span className="t-faint">· {data.local.length}</span></h2>
          {data.local.length === 0 ? <p className="t-meta">No matches on your servers.</p> : <div className={s.wrap}>{data.local.map((t) => <Card key={t.id} t={t} onOpen={onOpen} />)}</div>}
          {data.discover.length > 0 && (
            <>
              <h2 className={`t-section ${s.sec}`}>Not on your servers</h2>
              <div className={s.wrap}>{data.discover.map((d) => <DiscoverCard key={d.ratingKey} d={d} onOpenLocal={openById} />)}</div>
            </>
          )}
        </>
      )}
    </ScrollPage>
  )
}

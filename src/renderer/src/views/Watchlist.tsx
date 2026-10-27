import { useLibrary, useWatchlist } from '../api'
import type { MergedTitle } from '@shared/types'
import { DiscoverCard } from '../components/DiscoverCard'
import { SkeletonShelf } from '../components/Grid'
import s from './Page.module.css'
import { ScrollPage } from '../components/ScrollPage'

export function Watchlist({ onOpen }: { onOpen: (t: MergedTitle, el?: HTMLElement | null) => void }) {
  const { data = [], isLoading, error } = useWatchlist()
  const movies = useLibrary('movie')
  const shows = useLibrary('show')
  const openById = (id: string) => {
    const t = [...(movies.data ?? []), ...(shows.data ?? [])].find((x) => x.id === id)
    if (t) onOpen(t)
  }
  if (isLoading) return <SkeletonShelf />
  if (error) return <div className={s.empty}><h3>Couldn't load your Watchlist</h3><p>{error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Check your connection and try again.'}</p></div>
  const avail = data.filter((d) => d.availableAs)
  return (
    <ScrollPage className={s.page}>
      {avail.length > 0 && (
        <>
          <h2 className={`t-section ${s.sec}`} style={{ marginTop: 0 }}>Now available on your servers <span className="t-faint">· {avail.length}</span></h2>
          <div className={s.wrap}>{avail.map((d) => <DiscoverCard key={d.ratingKey} d={d} onOpenLocal={openById} />)}</div>
        </>
      )}
      <h2 className={`t-section ${s.sec}`}>Watchlist <span className="t-faint">· {data.length}</span></h2>
      {data.length === 0 ? <div className={s.empty}><h3>Your Watchlist is empty</h3><p>Search for a title you don't have and add it here.</p></div> : <div className={s.wrap}>{data.map((d) => <DiscoverCard key={d.ratingKey} d={d} onOpenLocal={openById} />)}</div>}
    </ScrollPage>
  )
}

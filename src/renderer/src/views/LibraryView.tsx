import { useMemo, useState } from 'react'
import type { MediaType, MergedTitle } from '@shared/types'
import { useLibrary } from '../api'
import { PosterGrid } from '../components/Grid'
import g from '../components/Grid.module.css'
import { Icon } from '../components/Icon'
import s from './LibraryView.module.css'

type Sort = 'added' | 'title' | 'year' | 'rating'

export function sortTitles(items: MergedTitle[], sort: Sort): MergedTitle[] {
  const c = [...items]
  if (sort === 'title') c.sort((a, b) => a.title.localeCompare(b.title))
  else if (sort === 'year') c.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  else if (sort === 'rating') c.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  else c.sort((a, b) => b.addedAt - a.addedAt)
  return c
}

export function LibraryView({ type, onOpen }: { type: MediaType; onOpen: (t: MergedTitle, el?: HTMLElement | null) => void }) {
  const { data = [], isLoading } = useLibrary(type)
  const [sort, setSort] = useState<Sort>('added')
  const [server, setServer] = useState('')
  const [genre, setGenre] = useState('')
  const [unwatched, setUnwatched] = useState(false)
  const [jump, setJump] = useState<{ index: number; n: number }>()
  const genres = useMemo(() => [...new Set(data.flatMap((t) => t.genres))].sort(), [data])
  const serverList = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of data) for (const x of t.sources) m.set(x.serverId, x.serverName)
    return [...m]
  }, [data])
  const filtered = useMemo(
    () =>
      sortTitles(
        data.filter(
          (t) =>
            (!server || t.sources.some((x) => x.serverId === server)) &&
            (!genre || t.genres.includes(genre)) &&
            (!unwatched || !t.watched),
        ),
        sort,
      ),
    [data, sort, server, genre, unwatched],
  )
  // First index of each letter when sorted by title (non-letters go under '#').
  const letters = useMemo(() => {
    if (sort !== 'title') return []
    const m = new Map<string, number>()
    filtered.forEach((t, i) => {
      const c = t.title.normalize('NFD').charAt(0).toUpperCase()
      const k = /[A-Z]/.test(c) ? c : '#'
      if (!m.has(k)) m.set(k, i)
    })
    return [...m]
  }, [filtered, sort])
  return (
    <div className={s.view}>
      <div className={s.bar}>
        <span className={s.count}>{isLoading ? ' ' : `${filtered.length.toLocaleString()} ${type === 'movie' ? 'movies' : 'shows'}`}</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="added">Recently added</option>
          <option value="title">Title</option>
          <option value="year">Year</option>
          <option value="rating">Rating</option>
        </select>
        <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genre">
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select value={server} onChange={(e) => setServer(e.target.value)} aria-label="Server">
          <option value="">All servers</option>
          {serverList.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <button className={s.toggle} aria-pressed={unwatched} onClick={() => setUnwatched((v) => !v)}>
          <Icon name="eye" size={15} /> Unwatched
        </button>
      </div>
      {isLoading ? (
        <div className={s.skel}>
          {Array.from({ length: 18 }, (_, i) => (
            <div key={i}>
              <div className="skeleton" style={{ aspectRatio: '2 / 3' }} />
              <div className="skeleton" style={{ height: 12, marginTop: 10, width: '70%' }} />
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className={s.empty}>
          <h3>Nothing here yet</h3>
          <p>Sign in and let your servers sync (Settings).</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <h3>No matches</h3>
          <p>Try removing a filter.</p>
        </div>
      ) : (
        <div className={g.railwrap}>
          <PosterGrid items={filtered} onOpen={onOpen} jumpTo={jump} />
          {letters.length > 1 && (
            <div className={g.rail} aria-label="Jump to letter">
              {letters.map(([l, i]) => (
                <button key={l} onClick={() => setJump({ index: i, n: (jump?.n ?? 0) + 1 })}>{l}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

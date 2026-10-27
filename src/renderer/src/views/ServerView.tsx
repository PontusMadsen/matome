import { useMemo, useState } from 'react'
import type { MergedTitle } from '@shared/types'
import { useLibrary, useServers } from '../api'
import { LibraryView } from './LibraryView'
import s from './ServerView.module.css'

/** One server on its own: each of its libraries as a tab, browsed like the merged views but limited to that server. */
export function ServerView({ id, onOpen }: { id: string; onOpen: (t: MergedTitle, el?: HTMLElement | null) => void }) {
  const server = useServers().data?.find((x) => x.id === id)
  const movies = useLibrary('movie').data
  const shows = useLibrary('show').data
  const tabs = useMemo(() => {
    const out: { key: string; type: 'movie' | 'show'; library: string; count: number }[] = []
    for (const [type, list] of [['movie', movies], ['show', shows]] as const) {
      const count = new Map<string, number>()
      for (const t of list ?? []) for (const x of t.sources) if (x.serverId === id) count.set(x.library, (count.get(x.library) ?? 0) + 1)
      for (const [library, n] of [...count].sort((a, b) => a[0].localeCompare(b[0]))) out.push({ key: `${type}:${library}`, type, library, count: n })
    }
    return out
  }, [movies, shows, id])
  const [pick, setPick] = useState('')
  const cur = tabs.find((t) => t.key === pick) ?? tabs[0]
  return (
    <div className={s.view}>
      <div className={s.head}>
        <span className={`dot ${server?.online ? 'on' : ''}`} />
        <span className="t-meta">{server ? `${server.online ? 'Online' : 'Offline'}${server.latencyMs ? ` · ${server.latencyMs} ms` : ''}${server.owned ? ' · yours' : ' · shared with you'}` : ''}</span>
      </div>
      {tabs.length > 0 ? (
        <>
          <div className={s.tabs} role="tablist" aria-label="Libraries">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={t.key === cur?.key} className={t.key === cur?.key ? s.on : ''} onClick={() => setPick(t.key)}>
                {tabs.some((o) => o.library === t.library && o.type !== t.type) ? `${t.library} (${t.type === 'movie' ? 'movies' : 'shows'})` : t.library} <span>{t.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
          {cur && <LibraryView key={cur.key} type={cur.type} onOpen={onOpen} fixedServer={id} fixedLibrary={cur.library} />}
        </>
      ) : (
        <div className={s.empty}>
          <h3>Nothing synced from this server</h3>
          <p>{server?.online === false ? 'It is offline right now.' : 'Its libraries will appear after the next sync.'}</p>
        </div>
      )}
    </div>
  )
}

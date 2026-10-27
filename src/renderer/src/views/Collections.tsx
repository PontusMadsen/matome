import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { MergedTitle } from '@shared/types'
import { useLibrary } from '../api'
import { PosterGrid } from '../components/Grid'
import { Icon } from '../components/Icon'
import s from './Page.module.css'
import { ScrollPage } from '../components/ScrollPage'

export function Collections({ onOpen }: { onOpen: (t: MergedTitle, el?: HTMLElement | null) => void }) {
  const cols = useQuery({ queryKey: ['collections'], queryFn: () => window.flax.invoke('collections:list', undefined), staleTime: 300_000 })
  const pls = useQuery({ queryKey: ['playlists'], queryFn: () => window.flax.invoke('playlists:list', undefined) })
  const movies = useLibrary('movie')
  const shows = useLibrary('show')
  const byId = useMemo(() => new Map([...(movies.data ?? []), ...(shows.data ?? [])].map((t) => [t.id, t])), [movies.data, shows.data])
  const [sel, setSel] = useState<{ title: string; ids: string[] } | null>(null)
  if (sel)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-icon" onClick={() => setSel(null)} aria-label="Back"><Icon name="back" /></button>
          <h2 className="t-title">{sel.title}</h2>
        </div>
        <PosterGrid items={sel.ids.flatMap((id) => byId.get(id) ?? [])} onOpen={onOpen} />
      </div>
    )
  return (
    <ScrollPage className={s.page}>
      <h2 className={`t-section ${s.sec}`} style={{ marginTop: 0 }}>Collections <span className="t-faint">· merged across servers</span></h2>
      {cols.isLoading ? <p className="t-meta">Loading…</p> : (cols.data ?? []).length === 0 ? <p className="t-meta">No collections found.</p> : (
        <div className={s.list}>
          {(cols.data ?? []).map((c) => (
            <div key={c.id} className={s.listitem} onClick={() => setSel({ title: c.title, ids: c.titleIds })}>
              {c.poster ? <img className={s.thumbsm} src={c.poster} alt="" /> : <div className={s.thumbsm} />}
              <div style={{ flex: 1 }}><div style={{ fontWeight: 550 }}>{c.title}</div><div className="t-meta">{c.titleIds.length} titles · {c.servers.length} server{c.servers.length > 1 ? 's' : ''}</div></div>
            </div>
          ))}
        </div>
      )}
      <h2 className={`t-section ${s.sec}`}>Playlists</h2>
      <div className={s.list}>
        {(pls.data ?? []).map((p) => (
          <div key={`${p.serverId}:${p.ratingKey}`} className={s.listitem} onClick={() => setSel({ title: p.title, ids: p.titleIds })}>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 550 }}>{p.title}</div><div className="t-meta">{p.serverName} · {p.titleIds.length} playable here</div></div>
          </div>
        ))}
        {(pls.data ?? []).length === 0 && <p className="t-meta">No playlists.</p>}
      </div>
    </ScrollPage>
  )
}

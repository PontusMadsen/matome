import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DownloadInfo } from '@shared/types'
import { useDownloads } from '../api'
import { useContextMenu } from '../components/ContextMenu'
import { Icon } from '../components/Icon'
import { Player, type PlayTarget } from '../components/Player'
import { ScrollPage } from '../components/ScrollPage'
import page from './Page.module.css'
import s from './DownloadedView.module.css'

const size = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`)
const ep = (m: DownloadInfo['meta']) => `S${String(m.season ?? 0).padStart(2, '0')}E${String(m.episode ?? 0).padStart(2, '0')}`

function Tile({ d, onPlay, onDelete }: { d: DownloadInfo; onPlay: () => void; onDelete: () => void }) {
  const active = d.state === 'active'
  const { onContextMenu, openMenu, menu } = useContextMenu(() => [
    ...(active ? [] : [{ label: 'Play', onSelect: onPlay }]),
    { label: 'Show in Finder', onSelect: () => void window.matome.invoke('download:reveal', { id: d.id }) },
    ...(active ? [] : [{ label: 'Open in default app', onSelect: () => void window.matome.invoke('download:open', { id: d.id }) }]),
    { label: active ? 'Cancel and delete' : 'Delete from this Mac…', danger: true, onSelect: onDelete },
  ])
  const sub = d.meta.kind === 'episode' ? `${ep(d.meta)} · ${d.meta.name}` : (d.meta.year ?? '')
  return (
    <div className={s.tile} onContextMenu={onContextMenu}>
      {menu}
      <div className={s.poster} data-poster role="button" tabIndex={0} aria-label={active ? d.title : `Play ${d.title}`} onClick={() => !active && onPlay()} onKeyDown={(e) => e.key === 'Enter' && !active && onPlay()}>
        {d.hasPoster ? <img src={`matome-local://poster/${d.id}`} alt="" loading="lazy" /> : <div className={s.fallback}>{d.meta.show ?? d.meta.name}</div>}
        {!active && <div className={s.hover}><span className={s.play}><Icon name="play" size={20} fill /></span></div>}
        {active && d.total > 0 && <div className={s.bar}><i style={{ width: `${Math.min(100, (d.received / d.total) * 100)}%` }} /></div>}
        <button className={s.more} aria-label={`More for ${d.title}`} onClick={openMenu}><Icon name="more" size={16} fill /></button>
      </div>
      <div className={s.name}>{d.meta.kind === 'episode' ? d.meta.show : d.meta.name}</div>
      <div className={s.sub}>{active ? `Downloading… ${d.total ? Math.round((d.received / d.total) * 100) : 0}%` : `${sub}${sub ? ' · ' : ''}${size(d.received)}`}</div>
    </div>
  )
}

/** Everything saved on this Mac: plays without any server, and files can be deleted here. */
export function DownloadedView() {
  const qc = useQueryClient()
  const { data = [] } = useDownloads()
  const [play, setPlay] = useState<PlayTarget | null>(null)
  const items = data.filter((d) => d.state === 'active' || d.state === 'done')
  const done = items.filter((d) => d.state === 'done')
  const movies = items.filter((d) => d.meta.kind === 'movie')
  const shows = useMemo(() => {
    const m = new Map<string, DownloadInfo[]>()
    for (const d of items.filter((x) => x.meta.kind === 'episode')) m.set(d.meta.show ?? 'Other', [...(m.get(d.meta.show ?? 'Other') ?? []), d])
    for (const list of m.values()) list.sort((a, b) => (a.meta.season ?? 0) - (b.meta.season ?? 0) || (a.meta.episode ?? 0) - (b.meta.episode ?? 0))
    return [...m]
  }, [items])
  const refresh = () => qc.invalidateQueries({ queryKey: ['downloads'] })

  const start = (d: DownloadInfo) => {
    // The next downloaded episode of the same show plays after this one.
    const later = d.meta.kind === 'episode' ? done.filter((x) => x.meta.show === d.meta.show && x.meta.kind === 'episode').sort((a, b) => (a.meta.season ?? 0) - (b.meta.season ?? 0) || (a.meta.episode ?? 0) - (b.meta.episode ?? 0)) : []
    const next = later[later.findIndex((x) => x.id === d.id) + 1]
    setPlay({ title: d.title, sources: [], startMs: 0, audio: [], subtitles: [], local: { id: d.id, positionMs: d.positionMs }, onNext: next ? () => start(next) : undefined })
  }
  const remove = (d: DownloadInfo) => {
    if (window.confirm(`Delete "${d.title}" from this Mac?\n\nThe downloaded file is removed. Nothing changes on your servers.`)) void window.matome.invoke('download:remove', { id: d.id }).then(refresh)
  }

  return (
    <ScrollPage className={`${page.page} ${s.page}`}>
      {items.length === 0 ? (
        <div className={s.empty}>
          <h3>Nothing downloaded yet</h3>
          <p>Choose ⋮ → Download… on a movie or an episode. Downloads play without any server, even offline.</p>
        </div>
      ) : (
        <>
          <p className={s.summary}>{done.length} {done.length === 1 ? 'item' : 'items'} · {size(done.reduce((n, d) => n + d.received, 0))} on this Mac · plays without a connection</p>
          {movies.length > 0 && (
            <section>
              <h2 className="t-section">Movies</h2>
              <div className={s.grid}>{movies.map((d) => <Tile key={d.id} d={d} onPlay={() => start(d)} onDelete={() => remove(d)} />)}</div>
            </section>
          )}
          {shows.map(([name, list]) => (
            <section key={name}>
              <h2 className="t-section">{name}</h2>
              <div className={s.grid}>{list.map((d) => <Tile key={d.id} d={d} onPlay={() => start(d)} onDelete={() => remove(d)} />)}</div>
            </section>
          ))}
        </>
      )}
      {play && <Player key={play.local?.id} target={play} onClose={() => { setPlay(null); void refresh() }} />}
    </ScrollPage>
  )
}

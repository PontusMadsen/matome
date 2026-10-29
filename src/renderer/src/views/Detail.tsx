import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MergedEpisode, MergedTitle, Source } from '@shared/types'
import { Icon } from '../components/Icon'
import { useContextMenu } from '../components/ContextMenu'
import { Player, type PlayTarget } from '../components/Player'
import { ScrollPage } from '../components/ScrollPage'
import { refreshContinue } from '../api'
import s from './Detail.module.css'

const qLabel = (x: Source) =>
  [x.quality.res ? (/^\d+$/.test(x.quality.res) ? `${x.quality.res}p` : x.quality.res.toUpperCase()) : '', x.quality.codec?.toUpperCase(), x.quality.hdr ? 'HDR' : '', x.quality.bitrate ? `${(x.quality.bitrate / 1000).toFixed(1)} Mbps` : '']
    .filter(Boolean)
    .join(' · ')
/** Saved position of a movie: the furthest on any server (progress is only written to the server we streamed from). */
const furthest = (ps: { viewOffsetMs: number }[]) => Math.max(0, ...ps.map((p) => p.viewOffsetMs))
const connLabel = (n: number) => ['Local', 'Remote', 'Relay'][n] ?? ''
const fmtDur = (ms?: number) => (ms ? (ms >= 3_600_000 ? `${Math.floor(ms / 3_600_000)}h ${Math.round((ms % 3_600_000) / 60_000)}m` : `${Math.round(ms / 60_000)}m`) : '')

function Episode({ e, t, onPlay, onChanged }: { e: MergedEpisode; t: MergedTitle; onPlay: () => void; onChanged: () => void }) {
  const { onContextMenu, openMenu, menu } = useContextMenu(() => [
    { label: 'Play', onSelect: onPlay },
    {
      label: e.watched ? 'Mark as unwatched' : 'Mark as watched',
      onSelect: () => void window.flax.invoke('episode:setWatched', { titleId: t.id, sources: e.sources.map((x) => ({ serverId: x.serverId, ratingKey: x.ratingKey })), watched: !e.watched }).then(onChanged),
    },
  ])
  const pct = e.durationMs && e.viewOffsetMs ? Math.min(100, (e.viewOffsetMs / e.durationMs) * 100) : 0
  return (
    <div className={`${s.ep} ${e.watched ? s.watched : ''}`} onClick={onPlay} onContextMenu={onContextMenu}>
      {menu}
      <span className={s.epnum}>{e.episode}</span>
      <div className={s.epthumb}>
        {e.thumb && <img src={e.thumb} alt="" loading="lazy" onError={(ev) => (ev.currentTarget.style.display = 'none')} />}
        <div className={s.epplay}><Icon name="play" size={22} fill /></div>
        {pct > 0 && !e.watched && <div className={s.eprog}><i style={{ width: `${pct}%` }} /></div>}
      </div>
      <div>
        <div className={s.eptitle}>{e.title}</div>
        {e.summary && <div className={s.epsum}>{e.summary}</div>}
      </div>
      <div className={s.epmeta}>
        {fmtDur(e.durationMs)}
        {e.watched && <span className={s.seen} title="Watched"><Icon name="check" size={16} /></span>}
        <button className={s.epmore} aria-label={`More for episode ${e.episode}`} title="More" onClick={openMenu}><Icon name="more" size={18} fill /></button>
      </div>
    </div>
  )
}

/** Open the page and start playing straight away (used by Continue Watching). */
export interface AutoPlay { season?: number; episode?: number }

export function Detail({ t, onClose, auto }: { t: MergedTitle; onClose: () => void; auto?: AutoPlay }) {
  const { data, error } = useQuery({ queryKey: ['detail', t.id], queryFn: () => window.flax.invoke('title:detail', { id: t.id }) })
  const [season, setSeason] = useState<number | null>(null)
  const [play, setPlay] = useState<PlayTarget | null>(null)
  const [pick, setPick] = useState(0)
  const qc = useQueryClient()
  const refreshAll = () => window.flax.invoke('title:refresh', { id: t.id }).then(() => Promise.all([qc.invalidateQueries({ queryKey: ['library'] }), qc.invalidateQueries({ queryKey: ['episodes'] }), refreshContinue(qc)]))
  const act = (p: Promise<unknown>) => p.then(() => Promise.all([qc.invalidateQueries({ queryKey: ['library'] }), refreshContinue(qc)]))
  // Newest season first; Specials (season 0) last. Opens on the newest season.
  const seasons = [...(data?.seasons ?? [])].sort((a, b) => (a.index === 0 ? 1 : b.index === 0 ? -1 : b.index - a.index))
  useEffect(() => { if (seasons[0] && season === null) setSeason(seasons[0].index) }, [data, season])
  const eps = useQuery({
    queryKey: ['episodes', t.id, season],
    queryFn: () => window.flax.invoke('title:episodes', { id: t.id, season: season! }),
    enabled: t.type === 'show' && season !== null,
  })

  // "Play from…": user-picked source first, remaining sources as failover.
  const online = t.sources.filter((x) => x.online)
  const ordered = [...online]
  if (pick > 0 && ordered[pick]) ordered.unshift(...ordered.splice(pick, 1))

  const mpvOk = useQuery({ queryKey: ['mpv'], queryFn: () => window.flax.invoke('mpv:available', undefined) })
  const prefs = useQuery({ queryKey: ['settings'], queryFn: () => window.flax.invoke('settings:get', undefined) })
  const [mpvErr, setMpvErr] = useState('')
  const lists = useQuery({ queryKey: ['playlists'], queryFn: () => window.flax.invoke('playlists:list', undefined) })
  const addToList = (v: string) => {
    if (!v) return
    const src = ordered[0]
    if (!src) return
    const [mode, a, b] = v.split('|')
    if (mode === 'new') {
      const name = window.prompt('New playlist name')
      if (name) void window.flax.invoke('playlists:write', { serverId: src.serverId, titleId: t.id, newTitle: name }).then(() => qc.invalidateQueries({ queryKey: ['playlists'] }))
    } else if (a && b) void window.flax.invoke('playlists:write', { serverId: a, titleId: t.id, playlistRatingKey: b }).then(() => qc.invalidateQueries({ queryKey: ['playlists'] }))
  }

  const playMovie = () => {
    if (!data) return
    const pl = data.playables.find((p) => p.serverId === ordered[0]?.serverId) ?? data.playables[0]
    if (!pl) return
    if (prefs.data?.useMpv && mpvOk.data && pl.partKey) {
      setMpvErr('')
      window.flax.invoke('mpv:play', { serverId: pl.serverId, ratingKey: pl.ratingKey, partKey: pl.partKey, title: t.title, startMs: furthest(data.playables), markers: pl.markers }).catch((e: Error) => setMpvErr(e.message))
      return
    }
    setPlay({
      title: t.title,
      sources: ordered.map((x) => ({ serverId: x.serverId, serverName: x.serverName, ratingKey: x.ratingKey })),
      startMs: furthest(data.playables),
      durationMs: pl.durationMs,
      audio: pl.audio,
      subtitles: pl.subtitles,
      onWatched: () => void refreshAll(),
    })
  }

  const playEpisode = (list: MergedEpisode[], i: number) => {
    const e = list[i]!
    setPlay({
      title: `${t.title} — S${e.season}E${e.episode} ${e.title}`,
      sources: e.sources.filter((x) => x.online).map((x) => ({ serverId: x.serverId, serverName: x.serverName, ratingKey: x.ratingKey })),
      startMs: e.viewOffsetMs,
      durationMs: e.durationMs,
      audio: [],
      subtitles: [],
      onWatched: () => void refreshAll(),
      onNext: list[i + 1] ? () => playEpisode(list, i + 1) : undefined, // auto-play next
    })
  }

  // Continue Watching -> straight into playback, via this page so every server's copy is used and next-episode works.
  const autoDone = useRef(false)
  useEffect(() => {
    if (!auto || autoDone.current) return
    if (t.type === 'movie') {
      if (data && prefs.isFetched && mpvOk.isFetched) { autoDone.current = true; playMovie() }
    } else if (auto.season !== undefined) {
      if (season !== auto.season) { setSeason(auto.season); return }
      const list = eps.data
      const i = list?.findIndex((e) => e.episode === auto.episode) ?? -1
      if (list && i >= 0) { autoDone.current = true; playEpisode(list, i) }
    }
  }, [auto, data, eps.data, season, prefs.isFetched, mpvOk.isFetched])

  const resume = t.type === 'movie' && data ? furthest(data.playables) : 0
  const isWatched = t.type === 'movie' ? t.watched : t.unwatchedCount === 0
  const nextUp = eps.data?.findIndex((e) => !e.watched) ?? -1

  return (
    <ScrollPage className={s.page} bleed={false}>
      <div className={s.backdrop}>{t.art && <img src={t.art} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}</div>
      <button className={`btn ${s.back}`} onClick={onClose}><Icon name="back" size={16} /> Back</button>
      <div className={s.inner}>
        <div className={s.head}>
          <div className={s.poster}>{t.posters[0] && <img src={t.posters[0]} alt="" />}</div>
          <div className={s.meta}>
            <h1 className="t-display">{t.title}</h1>
            <div className={s.facts}>
              {t.year && <span>{t.year}</span>}
              {data?.contentRating && (<><span className={s.sep} /><span>{data.contentRating}</span></>)}
              {data?.durationMs && t.type === 'movie' && (<><span className={s.sep} /><span>{fmtDur(data.durationMs)}</span></>)}
              {t.type === 'show' && data && (<><span className={s.sep} /><span>{data.seasons.length} season{data.seasons.length === 1 ? '' : 's'}</span></>)}
              {/* Plex's unlabeled score (its source depends on the library's metadata agent): only shown when there is no IMDb / Rotten Tomatoes score to show instead. */}
              {t.rating && data && !data.ratings ? (<><span className={s.sep} /><span className={s.rating} title="Rating stored by Plex (source depends on your library's metadata agent)">★ {t.rating.toFixed(1)}</span></>) : null}
              {data?.ratings?.imdb !== undefined && (<><span className={s.sep} /><span className={s.score} title="IMDb rating (via Plex)"><span className={s.imdb}>IMDb</span> {data.ratings.imdb.toFixed(1)}</span></>)}
              {data?.ratings?.rtCritic !== undefined && (<><span className={s.sep} /><span className={s.score} title="Rotten Tomatoes critics (via Plex)">🍅 {data.ratings.rtCritic}%</span></>)}
              {data?.ratings?.rtAudience !== undefined && (<><span className={s.sep} /><span className={s.score} title="Rotten Tomatoes audience (via Plex)">🍿 {data.ratings.rtAudience}%</span></>)}
            </div>
            {t.genres.length > 0 && <div className={s.genres}>{t.genres.slice(0, 5).map((g) => <span key={g} className="chip">{g}</span>)}</div>}
            <p className={s.summary}>{data?.summary ?? t.summary}</p>
            {data?.directors.length ? <p className="t-meta">Directed by {data.directors.join(', ')}</p> : null}
            <div className={s.actions}>
              {t.type === 'movie' && (
                <button className="btn btn-primary btn-lg" onClick={playMovie} disabled={!data || online.length === 0}>
                  <Icon name="play" size={16} fill /> {resume ? `Resume · ${fmtDur(resume)}` : 'Play'}
                </button>
              )}
              {t.type === 'show' && eps.data && nextUp >= 0 && (
                <button className="btn btn-primary btn-lg" onClick={() => playEpisode(eps.data!, nextUp)}>
                  <Icon name="play" size={16} fill /> Play S{eps.data[nextUp]!.season}E{eps.data[nextUp]!.episode}
                </button>
              )}
              <button
                className="btn btn-lg"
                aria-pressed={isWatched}
                title={isWatched ? 'Watched on every server. Click to mark as unwatched' : 'Mark as watched on every server'}
                style={isWatched ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                onClick={() => void act(window.flax.invoke('title:setWatched', { id: t.id, watched: !isWatched }).then(() => qc.invalidateQueries({ queryKey: ['episodes'] })))}
              >
                <Icon name="check" size={16} /> Watched
              </button>
              <select aria-label="Your rating" defaultValue="" onChange={(e) => void act(window.flax.invoke('title:rate', { id: t.id, rating: e.target.value === '' ? null : Number(e.target.value) }))}>
                <option value="">Rate…</option>
                {[2, 4, 6, 8, 10].map((r) => <option key={r} value={r}>{'★'.repeat(r / 2)}</option>)}
              </select>
              <select aria-label="Add to playlist" value="" onChange={(e) => addToList(e.target.value)}>
                <option value="">Add to playlist…</option>
                {(lists.data ?? []).filter((p) => t.sources.some((x) => x.serverId === p.serverId)).map((p) => <option key={`${p.serverId}${p.ratingKey}`} value={`add|${p.serverId}|${p.ratingKey}`}>{p.title} ({p.serverName})</option>)}
                <option value="new">New playlist…</option>
              </select>
            </div>
            {mpvErr && <p className={s.err}>{mpvErr}</p>}
            {error && <p className={s.err}>Couldn't load details: {String(error)}</p>}
          </div>
        </div>

        {online.length > 0 && (
          <section className={`${s.section} ${s.sect}`} style={{ animationDelay: "120ms" }}>
            <h3>Play from</h3>
            <div className={s.sources} role="radiogroup">
              {online.map((x, i) => (
                <button key={x.serverId} className={s.src} role="radio" aria-checked={i === pick} onClick={() => setPick(i)}>
                  <span className={s.radio} />
                  <span className={s.srcname}>{x.serverName}</span>
                  <span className={s.srcq}>{qLabel(x) || '—'}</span>
                  <span className={`${s.tag} ${x.connectionPref === 0 ? s.ok : ''}`}>{connLabel(x.connectionPref)}</span>
                </button>
              ))}
            </div>
            {t.sources.some((x) => !x.online) && <p className="t-meta" style={{ marginTop: 8 }}>Offline: {t.sources.filter((x) => !x.online).map((x) => x.serverName).join(', ')}</p>}
          </section>
        )}
        {online.length === 0 && <p className={s.err} style={{ marginTop: 24 }}>None of the servers with this title are reachable right now.</p>}

        {data?.cast.length ? (
          <section className={`${s.section} ${s.sect}`} style={{ animationDelay: "120ms" }}>
            <h3>Cast</h3>
            <div className={s.cast}>{data.cast.slice(0, 14).map((c) => <span key={c.name} className="chip" title={c.role}>{c.name}</span>)}</div>
          </section>
        ) : null}

        {t.type === 'show' && data && (
          <section className={`${s.section} ${s.sect}`} style={{ animationDelay: "120ms" }}>
            <div className={s.tabs} role="tablist">
              {seasons.map((se) => (
                <button key={se.index} role="tab" aria-selected={se.index === season} className={s.tab} onClick={() => setSeason(se.index)}>{se.title}</button>
              ))}
            </div>
            <div className={s.eps}>
              {eps.isLoading && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 72, marginBottom: 8 }} />)}
              {(eps.data ?? []).map((e, i, list) => (
                <Episode key={e.episode} e={e} t={t} onPlay={() => playEpisode(list, i)} onChanged={() => void refreshAll()} />
              ))}
            </div>
          </section>
        )}
      </div>
      {play && <Player key={`${play.title}|${play.sources[0]?.serverId}`} target={play} onClose={() => setPlay(null)} />}
    </ScrollPage>
  )
}

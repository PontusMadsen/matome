import { useEffect, useMemo, useRef, useState } from 'react'
import type { ContinueItem, MergedTitle } from '@shared/types'
import { useContinue, useLibrary } from '../api'
import { Card, ContinueTile, RecentRow, Shelf, SkeletonShelf } from '../components/Grid'
import { Icon } from '../components/Icon'
import { Player, type PlayTarget } from '../components/Player'
import s from './Page.module.css'
import { ScrollPage } from '../components/ScrollPage'

export function Home({ onOpen }: { onOpen: (t: MergedTitle, el?: HTMLElement | null, auto?: { season?: number; episode?: number }) => void }) {
  const cont = useContinue()
  const movies = useLibrary('movie')
  const shows = useLibrary('show')
  const [play, setPlay] = useState<PlayTarget | null>(null)
  const byId = useMemo(() => new Map([...(movies.data ?? []), ...(shows.data ?? [])].map((t) => [t.id, t])), [movies.data, shows.data])
  const recent = (xs: MergedTitle[] = []) => [...xs].sort((a, b) => b.addedAt - a.addedAt).slice(0, 24)

  /** Resume through the detail page: resolves every server's copy of the item, enables auto-next and mark-watched-everywhere. */
  const start = (c: ContinueItem, el?: HTMLElement | null) => {
    const t = c.titleId ? byId.get(c.titleId) : undefined
    if (t) { onOpen(t, el, { season: c.season, episode: c.episode }); return }
    // Title not in the merged cache (e.g. cache not synced yet): fall back to the single server it came from.
    setPlay({
      title: c.subtitle ? `${c.title} — ${c.subtitle}` : c.title,
      durationMs: c.durationMs,
      startMs: c.viewOffsetMs,
      sources: [{ serverId: c.serverId, serverName: '', ratingKey: c.ratingKey }],
      audio: [],
      subtitles: [],
    })
  }
  const details = (c: ContinueItem) => {
    const t = c.titleId ? byId.get(c.titleId) : undefined
    if (t) onOpen(t)
  }

  // How many big cards fit: one per ~470px of content width (1, 2 or 3), measured so it follows window resizes.
  const wrap = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(1)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setCols(Math.max(1, Math.min(3, Math.floor((el.clientWidth + 16) / (470 + 16))))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const heroes = (cont.data ?? []).slice(0, cols)
  const rest = (cont.data ?? []).slice(cols)
  // Skeleton while nothing is known yet, and also while an empty remembered list is being re-checked.
  const contLoading = (cont.isLoading && !cont.data) || (cont.refreshing && (cont.data?.length ?? 0) === 0)
  const loading = movies.isLoading || shows.isLoading
  const heroH = cols === 1 ? 320 : cols === 2 ? 290 : 260

  // A plain render function (not a nested component) so cards keep their DOM and animations across refreshes.
  const renderHero = (c: ContinueItem, first: boolean) => (
    <div key={c.key} className={s.hero} data-testid="continue-hero" style={{ height: heroH, marginBottom: 0 }}>
      {c.art && <img className={s.heroimg} src={c.art} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      <div className={s.heroshade} />
      <div className={s.herobody} style={{ maxWidth: 'calc(100% - 56px)' }}>
        {first && <span className={s.kicker}>Continue watching{cont.refreshing ? ' · updating…' : ''}</span>}
        <h2 className={cols === 1 ? 't-display' : 't-title'} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: cols === 1 ? undefined : cols === 2 ? 28 : 24 }}>{c.title}</h2>
        {c.subtitle && <span className="t-meta">{c.subtitle}</span>}
        {c.durationMs > 0 && <div className={s.herobar}><i style={{ width: `${Math.min(100, (c.viewOffsetMs / c.durationMs) * 100)}%` }} /></div>}
        <div className={s.actions}>
          <button className="btn btn-primary btn-lg" onClick={(e) => start(c, e.currentTarget.closest('[data-testid=continue-hero]') as HTMLElement | null)}>
            <Icon name="play" size={16} fill /> {c.viewOffsetMs > 0 ? 'Resume' : 'Play'}
          </button>
          {c.titleId && byId.has(c.titleId) && <button className="btn btn-lg" onClick={() => details(c)}>Details</button>}
        </div>
      </div>
    </div>
  )

  return (
    <ScrollPage className={s.page}>
      <div ref={wrap} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16, marginBottom: heroes.length || contLoading ? 32 : 0 }} data-testid={contLoading ? 'continue-skeleton' : undefined} aria-busy={contLoading || undefined}>
        {contLoading
          ? Array.from({ length: cols }, (_, i) => (
              <div key={i} className={`${s.hero} skeleton`} style={{ height: heroH, marginBottom: 0 }}>
                <div className={s.herobody}>
                  <span className={s.kicker} style={{ color: 'var(--text-faint)' }}>{i === 0 ? 'Checking your servers…' : ' '}</span>
                  <div className="skeleton" style={{ height: 30, width: 240, background: 'var(--s3)' }} />
                  <div className="skeleton" style={{ height: 14, width: 160, background: 'var(--s3)' }} />
                  <div className="skeleton" style={{ height: 44, width: 130, background: 'var(--s3)', marginTop: 8 }} />
                </div>
              </div>
            ))
          : heroes.map((c, i) => renderHero(c, i === 0))}
      </div>
      {rest.length > 0 && (
        <Shelf title="Continue Watching" hint={cont.refreshing ? undefined : 'across all servers'} busy={cont.refreshing}>
          {rest.map((c) => {
            const t = c.titleId ? byId.get(c.titleId) : undefined
            return (
              <div key={c.key}>
                {t ? <Card t={t} onOpen={(tt, el) => start(c, el)} progress={c.durationMs ? c.viewOffsetMs / c.durationMs : undefined} /> : <ContinueTile c={c} onOpen={(el) => start(c, el)} />}
              </div>
            )
          })}
        </Shelf>
      )}
      {loading ? (
        <>
          <div className="skeleton" style={{ height: 20, width: 220, marginBottom: 12 }} />
          <SkeletonShelf />
        </>
      ) : (
        <>
          <Shelf title="Recently added movies" hint="across all servers">
            <RecentRow items={recent(movies.data)} onOpen={onOpen} />
          </Shelf>
          <Shelf title="Recently added shows" hint="across all servers">
            <RecentRow items={recent(shows.data)} onOpen={onOpen} />
          </Shelf>
        </>
      )}
      {play && <Player key={play.title} target={play} onClose={() => setPlay(null)} />}
    </ScrollPage>
  )
}

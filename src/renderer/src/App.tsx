import { useCallback, useEffect, useRef, useState } from 'react'
import { useSwipeBack } from './components/useSwipeBack'
import { flushSync } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import type { MergedTitle } from '@shared/types'
import s from './App.module.css'
import { Icon, type IconName } from './components/Icon'
import logo from './assets/flax-horizontal-dark.svg'
import logoInk from './assets/flax-horizontal-ink.svg'
import { applySkin } from './skins'
import { useServers } from './api'
import { Detail, type AutoPlay } from './views/Detail'
import { Home } from './views/Home'
import { LibraryView } from './views/LibraryView'
import { Search } from './views/Search'
import { Settings } from './views/Settings'
import { Watchlist } from './views/Watchlist'
import { Collections } from './views/Collections'
import { ServerView } from './views/ServerView'
import { CommandPalette } from './components/CommandPalette'

const NAV = [
  { v: 'Home', icon: 'home' },
  { v: 'Movies', icon: 'film' },
  { v: 'TV Shows', icon: 'tv' },
  { v: 'Collections', icon: 'stack' },
  { v: 'Watchlist', icon: 'bookmark' },
  { v: 'Search', icon: 'search' },
  { v: 'Settings', icon: 'settings' },
] as const satisfies readonly { v: string; icon: IconName }[]
type View = (typeof NAV)[number]['v'] | 'Server'

type VT = { finished: Promise<void> }
const startVT = (fn: () => void): VT | null => {
  const d = document as Document & { startViewTransition?: (cb: () => void) => VT }
  if (!d.startViewTransition) { fn(); return null }
  return d.startViewTransition(() => flushSync(fn))
}
const nameEl = (el: Element | null | undefined, on: boolean) => {
  const h = el as HTMLElement | null | undefined
  if (h) h.style.viewTransitionName = on ? 'poster' : ''
}

export function App() {
  const [view, setView] = useState<View>('Home')
  const [open, setOpen] = useState<MergedTitle | null>(null)
  const [srv, setSrv] = useState<string | null>(null)
  const [auto, setAuto] = useState<AutoPlay | undefined>()
  const upd = useQuery({ queryKey: ['update'], queryFn: () => window.flax.invoke('update:status', undefined), refetchInterval: 5000 })
  const servers = useServers()
  const [palette, setPalette] = useState(false)
  const prefs = useQuery({ queryKey: ['settings'], queryFn: () => window.flax.invoke('settings:get', undefined) })
  useEffect(() => { if (prefs.data) applySkin(prefs.data.skin) }, [prefs.data])
  const openRef = useRef(open)
  openRef.current = open

  /** Card -> detail: the clicked poster morphs into the detail poster (shared-element transition). */
  const openTitle = useCallback((t: MergedTitle, el?: HTMLElement | null, autoPlay?: AutoPlay) => {
    const poster = el?.querySelector('[data-poster]') ?? null
    nameEl(poster, true)
    // The old snapshot is taken before this callback runs; un-name the card in the new state so only the detail poster owns the name.
    const vt = startVT(() => { setAuto(autoPlay); setOpen(t); nameEl(poster, false) })
    void vt?.finished.finally(() => nameEl(poster, false))
  }, [])

  /** Detail -> back: the detail poster flies back to its card, if that card is on screen. */
  const closeTitle = useCallback(() => {
    const cur = openRef.current
    const vt = startVT(() => {
      setOpen(null)
      flushSync(() => undefined)
      if (cur) nameEl(document.querySelector(`[data-tid="${CSS.escape(cur.id)}"] [data-poster]`), true)
    })
    void vt?.finished.finally(() => {
      if (cur) nameEl(document.querySelector(`[data-tid="${CSS.escape(cur.id)}"] [data-poster]`), false)
    })
  }, [])

  /** Views visited before the current one, so a swipe back returns to where you came from. */
  const trail = useRef<string[]>([])
  const go = (v: View) => {
    if (v === view && !open) return
    if (v !== view) trail.current.push(view === 'Server' && srv ? `Server:${srv}` : view)
    startVT(() => { setOpen(null); setView(v) })
  }
  const goServer = (id: string) => {
    if (view === 'Server' && srv === id && !open) return
    if (view !== 'Server' || srv !== id) trail.current.push(view === 'Server' && srv ? `Server:${srv}` : view)
    startVT(() => { setOpen(null); setView('Server'); setSrv(id) })
  }
  useSwipeBack(() => {
    const player = document.querySelector<HTMLElement>('[data-player]')
    if (player) { Array.from(player.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Back')?.click(); return }
    if (palette) { setPalette(false); return }
    if (openRef.current) { closeTitle(); return }
    const prev = trail.current.pop()
    if (!prev) return
    if (prev.startsWith('Server:')) startVT(() => { setSrv(prev.slice(7)); setView('Server') })
    else startVT(() => setView(prev as View))
  })

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = el?.closest('input, textarea, select')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((v) => !v); return }
      if (typing || document.querySelector('[data-player]')) return
      if (e.key === '/') { e.preventDefault(); setPalette(true); return }
      if (e.key === 'Escape' && openRef.current && !palette) { closeTitle(); return }
      // Keyboard scrolling for setups without a wheel (pen tablets): applies to the front-most page.
      const all = document.querySelectorAll<HTMLElement>('[data-scroll-main]')
      const sc = all[all.length - 1]
      if (!sc) return
      const page = sc.clientHeight * 0.9
      const map: Record<string, () => void> = {
        PageDown: () => sc.scrollBy({ top: page, behavior: 'smooth' }),
        PageUp: () => sc.scrollBy({ top: -page, behavior: 'smooth' }),
        ' ': () => sc.scrollBy({ top: e.shiftKey ? -page : page, behavior: 'smooth' }),
        ArrowDown: () => sc.scrollBy({ top: 80, behavior: 'smooth' }),
        ArrowUp: () => sc.scrollBy({ top: -80, behavior: 'smooth' }),
        Home: () => sc.scrollTo({ top: 0, behavior: 'smooth' }),
        End: () => sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }),
      }
      const fn = map[e.key]
      // Space must keep activating a focused button; the paging keys always scroll.
      if (fn && !(e.key === ' ' && el?.closest('button, [role=menuitem]'))) { e.preventDefault(); fn() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [closeTitle, palette])

  const idx = NAV.findIndex((n) => n.v === view)
  return (
    <div className={s.shell}>
      <div className={s.drag} />
      <nav className={s.sidebar} data-ui="sidebar">
        {/* Horizontal lockup, 124px wide: above the 110px minimum in the brand guidelines. */}
        <img className={s.logo} data-logo="light-on-dark" src={logo} alt="Fläx" draggable={false} />
        <img className={s.logo} data-logo="dark-on-light" src={logoInk} alt="" aria-hidden draggable={false} />
        <div className={s.navlist}>
          <div data-ui="ind" className={`${s.ind} ${open || view === 'Server' ? s.indoff : ''}`} style={{ '--i': idx } as React.CSSProperties} />
          {NAV.map(({ v, icon }) => (
            <button key={v} data-ui="nav" data-active={v === view && !open} className={`${s.nav} ${v === view && !open ? s.active : ''}`} onClick={() => go(v)}>
              <Icon name={icon} />
              {v}
              {v === 'Search' && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>⌘K</span>}
            </button>
          ))}
        </div>
        <div className={s.spacer} />
        <div className={s.servers} data-ui="servers">
          <div className={s.srvh}>Servers</div>
          {(servers.data ?? []).map((sv) => (
            <button key={sv.id} className={`${s.srv} ${s.srvbtn} ${view === 'Server' && srv === sv.id && !open ? s.srvon : ''}`} title={sv.online ? `${sv.latencyMs} ms · browse this server` : 'offline'} onClick={() => goServer(sv.id)}>
              <span className={`dot ${sv.online ? 'on' : ''}`} />
              {sv.name}
            </button>
          ))}
          {servers.data?.length === 0 && <div className={s.srv}>None yet</div>}
        </div>
      </nav>
      <main className={s.main}>
        {upd.data && (upd.data.state === 'ready' || upd.data.state === 'downloading') && (
          <div className={s.update} style={{ marginTop: 44 }}>
            {upd.data.state === 'ready' ? (
              <>
                <span>A new version of Fläx is ready.</span>
                <button className="btn btn-primary" onClick={() => void window.flax.invoke('update:apply', undefined)}>Restart to update</button>
              </>
            ) : (
              <span>Downloading update…</span>
            )}
          </div>
        )}
        <div key={view} className={`${s.views} enter`}>
          <header className={s.top} data-ui="top">
            <h1 className="t-title">{view === 'Server' ? (servers.data?.find((x) => x.id === srv)?.name ?? 'Server') : view}</h1>
          </header>
          <div className={s.content}>
            {view === 'Home' && <Home onOpen={openTitle} />}
            {view === 'Movies' && <LibraryView type="movie" onOpen={openTitle} />}
            {view === 'TV Shows' && <LibraryView type="show" onOpen={openTitle} />}
            {view === 'Collections' && <Collections onOpen={openTitle} />}
            {view === 'Watchlist' && <Watchlist onOpen={openTitle} />}
            {view === 'Search' && <Search onOpen={openTitle} />}
            {view === 'Server' && srv && <ServerView id={srv} onOpen={openTitle} />}
            {view === 'Settings' && <Settings />}
          </div>
        </div>
        {open && (
          <div className={s.overlay}>
            <Detail key={open.id} t={open} auto={auto} onClose={closeTitle} />
          </div>
        )}
      </main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} onOpenTitle={(t) => openTitle(t)} onSeeAll={() => go('Search')} />
    </div>
  )
}

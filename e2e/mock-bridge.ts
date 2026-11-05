/**
 * Installs a fake `window.matome` (the preload bridge) with fixture data.
 * Passed to page.addInitScript, so it must be fully self-contained (no imports / closures).
 */
export function installMock(): void {
  const hues = [12, 38, 200, 280, 150, 330, 60, 220]
  const svg = (w: number, h: number, i: number, label: string) =>
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${hues[i % 8]},50%,30%)"/><text x="20" y="${h - 30}" font-family="Helvetica" font-size="30" fill="white">${label}</text></svg>`,
    )
  const names = ['Slow Horses', 'Ted Lasso', 'The Lowdown', 'Lupin', 'Winter', 'Phony', 'Severance', 'Andor', 'Shogun', 'Dune', 'Heat', 'Arrival', 'Parasite', 'Drive', 'Sicario', 'Prisoners', 'Tenet', 'Oppenheimer', 'Barbie', 'Zodiac']
  const src = (id: string, name: string, pref: number, online = true) => ({ serverId: id, serverName: name, ratingKey: id + '1', library: 'L', quality: { res: '1080', codec: 'h264', bitrate: 8000 }, connectionPref: pref, online, addedAt: 1 })
  const mk = (type: 'movie' | 'show') =>
    names.map((n, i) => ({
      id: `${type}:${i}`, type, title: n, year: 2010 + (i % 15), guids: {}, genres: ['Drama'], watched: i % 4 === 0,
      unwatchedCount: type === 'show' ? (i % 5) * 3 : 0, rating: 7.5, addedAt: 1000 - i, posters: [svg(300, 450, i, n)], poster: svg(300, 450, i, n), art: svg(1600, 700, i, ''),
      sources: i === 19 ? [src('b', 'Friend A', 2)] : [src('a', 'Home server', 1), src('b', 'Friend A', 2), src('c', 'Offline', 1, false)], // the last title lives only on the server that refuses downloads
    }))
  let cont: any[] = [{ key: 'k1', title: 'Slow Horses', subtitle: 'S3E2 · Episode 2', serverId: 'a', ratingKey: '9', season: 3, episode: 2, viewOffsetMs: 1_200_000, durationMs: 3_000_000, lastViewedAt: 9, titleId: 'show:0', art: svg(1600, 700, 0, '') },
      { key: 'k2', title: 'Ted Lasso', subtitle: 'S3E1 · Episode 1', serverId: 'a', ratingKey: '8', season: 3, episode: 1, viewOffsetMs: 600_000, durationMs: 3_000_000, lastViewedAt: 8, titleId: 'show:1', art: svg(1600, 700, 1, '') },
      { key: 'k3', title: 'Dune', serverId: 'a', ratingKey: '7', viewOffsetMs: 1_000_000, durationMs: 9_000_000, lastViewedAt: 7, titleId: 'movie:9', art: svg(1600, 700, 2, '') },
      { key: 'k4', title: 'Lupin', subtitle: 'S3E4 · Episode 4', serverId: 'a', ratingKey: '6', season: 3, episode: 4, viewOffsetMs: 300_000, durationMs: 3_000_000, lastViewedAt: 6, art: svg(1600, 700, 3, '') },
      ...Array.from({ length: 10 }, (_, i) => ({ key: `x${i}`, title: `Extra ${i}`, serverId: 'a', ratingKey: `x${i}`, viewOffsetMs: 100_000, durationMs: 3_000_000, lastViewedAt: 5 - i }))]
  type Dl = { id: string; title: string; meta: unknown; state: string; received: number; total: number; path: string; createdAt: number; fresh?: boolean; hasPoster?: boolean; error?: string }
  let dls: Dl[] = [
    { id: 'o1', title: 'Dune (2021)', meta: { kind: 'movie', name: 'Dune', year: 2021 }, state: 'done', received: 2_400_000_000, total: 2_400_000_000, path: '/x/Dune.mkv', createdAt: 5 },
    { id: 'o2', title: 'Slow Horses - S03E02 - Episode 2', meta: { kind: 'episode', name: 'Episode 2', show: 'Slow Horses', season: 3, episode: 2 }, state: 'done', received: 900_000_000, total: 900_000_000, path: '/x/e2.mkv', createdAt: 4 },
    { id: 'o3', title: 'Slow Horses - S03E03 - Episode 3', meta: { kind: 'episode', name: 'Episode 3', show: 'Slow Horses', season: 3, episode: 3 }, state: 'done', received: 880_000_000, total: 880_000_000, path: '/x/e3.mkv', createdAt: 3 },
  ]
  let prefs = { excludedServers: [] as string[], maxBitrateKbps: 2000, useMpv: false, autoSkipIntro: false, playbackSpeed: 1, audioBoostPct: 0, subScale: 1, hideWatchedOnHome: false, skin: 'default' as string }
  const movies = mk('movie')
  const shows = mk('show')
  const eps = [1, 2, 3, 4].map((n) => ({ season: 3, episode: n, title: `Episode ${n}`, summary: 'A summary.', durationMs: 3_000_000, airDate: n === 1 ? '2024-03-14' : n === 2 ? new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10) : n === 3 ? new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) : undefined, watched: n < 2, viewOffsetMs: 0, sources: [{ serverId: 'a', serverName: 'Home server', ratingKey: '9', online: true, connectionPref: 1 }] }))
  const calls: { c: string; r: unknown }[] = []
  const handlers: Record<string, (r: any) => unknown> = {
    'auth:state': () => ({ signedIn: !(window as any).__signedOut, pending: !!(window as any).__pending, error: (window as any).__authError }),
    'auth:start': () => { (window as any).__pending = true; return { authUrl: 'https://app.plex.tv/auth' } },
    'servers:list': () => ((window as any).__noServers ? [] : [
      { id: 'a', name: 'Home server', owned: false, online: true, latencyMs: 142, connectionPref: 1 },
      { id: 'b', name: 'Friend A', owned: false, online: true, latencyMs: 380, connectionPref: 2 },
      { id: 'c', name: 'Offline', owned: false, online: false, latencyMs: null, connectionPref: 1 },
    ]),
    'library:list': (r) => (r.type === 'movie' ? movies : shows),
    'home:continue': async () => { if ((window as any).__slow) await new Promise((r) => setTimeout(r, 900)); return cont },
    'home:continue:refresh': async () => { if ((window as any).__slow) await new Promise((r) => setTimeout(r, 900)); return handlers['home:continue']!(undefined) },
    'title:detail': (r) => ({ id: r.id, summary: 'Failed spies are exiled to Slough House.', cast: [{ name: 'Gary Oldman' }], directors: ['Someone'], durationMs: 7_200_000, contentRating: 'TV-MA', ratings: { imdb: 8.1, rtCritic: 96, rtAudience: 88 }, playables: [{ serverId: 'a', ratingKey: '1', viewOffsetMs: 0, durationMs: 7_200_000, audio: [], subtitles: [], markers: [] }], seasons: [{ index: 1, title: 'Season 1', episodeCount: 6 }, { index: 3, title: 'Season 3', episodeCount: 6 }, { index: 2, title: 'Season 2', episodeCount: 6 }, { index: 0, title: 'Specials', episodeCount: 1 }] }),
    'title:episodes': () => eps,
    'search:query': (r) => ({ local: [...shows, ...movies].filter((t) => t.title.toLowerCase().includes(String(r.query).toLowerCase())), discover: [] }),
    'settings:get': () => prefs,
    'settings:set': (v: unknown) => { prefs = v as typeof prefs },
    'update:status': () => ({ current: 'dev', state: 'disabled' }),
    'mpv:available': () => false,
    'playlists:list': () => [],
    // Like the live service, the list keeps returning an item for a while after it was removed.
    'title:setWatched': (r: { id: string; watched: boolean }) => { if (r.watched) cont = cont.filter((c) => c.titleId !== r.id) },
    'download:start': (r: { title: string }) => { dls = [{ id: 'd1', title: r.title, meta: { kind: 'movie', name: r.title }, state: 'active', received: 450_000_000, total: 1_800_000_000, path: '/x', createdAt: 9 }, ...dls]; return { id: 'd1' } },
    // Home server: yours, allowed. Friend A refuses downloads. The offline one is unknown.
    'download:servers': () => ({ a: true, b: false, c: null }),
    'download:list': () => ((window as any).__dlEmpty ? [] : dls),
    'download:cancel': () => { dls = dls.map((d) => (d.state === 'active' ? { ...d, state: 'canceled' } : d)) },
    'download:clear': () => { dls = dls.filter((d) => d.state === 'active' || d.state === 'done').map((d) => ({ ...d, fresh: false })) },
    'download:remove': (r: { id: string }) => { dls = dls.filter((d) => d.id !== r.id) },
    'download:open': () => undefined,
    'download:position': () => undefined,
    'play:resumePoint': () => (window as any).__resume ?? 0,
    'title:addToWatchlist': () => undefined,
    'watchlist:list': () => [
      { ratingKey: 'w1', title: 'Wanted One', year: 2026, type: 'movie', onWatchlist: true },
      { ratingKey: 'w2', title: 'Wanted Two', year: 2025, type: 'show', onWatchlist: true },
    ],
    'watchlist:set': (r: { ratingKey: string }) => { if (r.ratingKey === 'w2' && (window as any).__failRemove) throw new Error('Plex said no') },
    'collections:list': () => [],
    'play:start': () => ({ url: '', session: 's' }),
    'play:streams': () => ({ audio: [], subtitles: [], markers: [] }),
  }
  ;(window as any).__calls = calls
  ;(window as any).matome = {
    invoke: async (c: string, r: unknown) => {
      calls.push({ c, r })
      const h = handlers[c]
      return h ? h(r) : undefined
    },
  }
}

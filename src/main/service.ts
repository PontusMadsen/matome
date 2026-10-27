import { shell } from 'electron'
import { clearToken, loadToken, saveToken } from './session'
import { startPin, pollPin } from './plex/auth'
import { listServers, pickConnection, type ServerCreds } from './plex/resources'
import type { ClientIdentity } from './plex/client'
import { syncAll, type ServerSyncStatus } from './sync'
import { getItem, loadItems, upsertItems, type Db } from './db'
import { applyLive } from './live'
import { loadSettings, saveSettings } from './settings'
import { mergeItems } from './merge'
import { createHash, randomUUID } from 'node:crypto'
import { log, scrub } from './log'
import { looksLikeSubtitles, subtitleCandidates } from '@shared/subtitles'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fetchDetail, fetchEpisodes, fetchSeasons, toDetailPart } from './plex/detail'
import { transcodeStartPath, timelinePath, scrobblePath, unscrobblePath, ratePath, selectStreamsPath, stopSessionPath } from './plex/playback'
import { findMpv, MpvSession } from './mpv/session'
import { addToPlaylistPath, createPlaylistPath, collectionChildrenPath, fetchCollections, fetchItemKeys, fetchPlaylists, itemUri, playlistItemsPath } from './plex/collections'
import { listSections, patchWatchState } from './plex/library'
import { mergeCollections, type CollectionPart } from './merge/collections'
import { fetchOnDeck } from './plex/ondeck'
import { fetchWatchlist, searchDiscover, setWatchlist } from './plex/discover'
import { annotateAvailability, searchTitles } from './merge/search'
import { mergeContinue } from './merge/continue'
import { mergeEpisodes, type RawEpisode } from './merge/episodes'
import type { PlayableStreams, CollectionInfo, PlaylistInfo, MpvRequest, Settings, ContinueItem, DiscoverItem, MediaType, MergedEpisode, MergedTitle, PlayRequest, ServerInfo, TitleDetail } from '@shared/types'

/** Main-process owner of the token, server list and cache. Renderer only sees ServerInfo / MergedTitle. */
export class Service {
  private token: string | null
  private creds = new Map<string, ServerCreds>()
  private infos: ServerInfo[] = []
  private syncing: Promise<ServerSyncStatus[]> | null = null
  lastSync: ServerSyncStatus[] = []
  private settings: Settings

  constructor(
    private db: Db,
    private id: ClientIdentity,
    private settingsFile: string,
    private cacheDir: string,
  ) {
    mkdirSync(cacheDir, { recursive: true })
    this.settings = loadSettings(settingsFile)
    this.token = loadToken()
    if (this.token) this.refresh().catch(() => { this.resolved = true; this.bump(); this.infosReadyDone() }) // offline: browse from cache
    else this.infosReadyDone()
  }

  /** Resolves once we know which servers are reachable (or that we can't find out). Queries that need servers wait on this. */
  private infosReadyDone: () => void = () => undefined
  private infosReady: Promise<void> = new Promise<void>((r) => { this.infosReadyDone = r })

  get signedIn(): boolean {
    return this.token !== null
  }

  /** Why the last sign-in attempt failed, or null; shown in Settings. */
  loginError: string | null = null
  loginPending = false

  async startLogin(): Promise<{ authUrl: string }> {
    this.loginError = null
    const pin = await startPin(this.id).catch((e: unknown) => {
      this.loginError = `Could not start sign-in: ${e instanceof Error ? e.message : String(e)}`
      log(this.loginError)
      throw e
    })
    void shell.openExternal(pin.authUrl)
    this.loginPending = true
    void pollPin(this.id, pin.id)
      .then((t) => {
        this.token = t
        try {
          saveToken(t)
        } catch (e) {
          // Stay signed in for this session, but say why it won't survive a restart.
          this.loginError = `Signed in, but the token could not be saved to the keychain: ${e instanceof Error ? e.message : String(e)}`
          log(this.loginError)
        }
        log('sign-in: token received')
        return this.refresh()
      })
      .catch((e: unknown) => {
        this.loginError = e instanceof Error ? e.message : String(e)
        log(`sign-in failed: ${this.loginError}`)
      })
      .finally(() => { this.loginPending = false })
    return { authUrl: pin.authUrl }
  }

  signOut(): void {
    this.token = null
    this.creds.clear()
    this.infos = []
    clearToken()
    this.db.exec('DELETE FROM items; DELETE FROM sync_log;')
    this.resolved = false
    this.continueCache = null
    try { rmSync(this.continueFile(), { force: true }) } catch { /* ignore */ }
    this.bump()
  }

  servers(): ServerInfo[] {
    return this.infos
  }

  /** Re-resolve servers/connections, then incrementally sync. Coalesces concurrent calls. */
  refresh(): Promise<ServerSyncStatus[]> {
    if (!this.token) return Promise.resolve([])
    this.syncing ??= this.doRefresh(this.token).finally(() => (this.syncing = null))
    return this.syncing
  }

  private async doRefresh(token: string): Promise<ServerSyncStatus[]> {
    const list = await listServers(this.id, token)
    this.creds = new Map(list.map((c) => [c.id, c]))
    this.infos = await Promise.all(list.map((c) => pickConnection(this.id, c)))
    this.resolved = true
    this.infosReadyDone()
    this.bump()
    this.lastSync = await syncAll(
      this.db,
      this.id,
      this.infos.map((info) => ({ info, token: this.creds.get(info.id)!.accessToken })),
    )
    this.bump()
    return this.lastSync
  }

  /** Bumped whenever cache rows, connection state or settings change; invalidates the merge memo. */
  private version = 0
  private memo = new Map<MediaType, { v: number; data: MergedTitle[] }>()
  private resolved = false

  private bump(): void {
    this.version++
  }

  library(type: MediaType): MergedTitle[] {
    const hit = this.memo.get(type)
    if (hit && hit.v === this.version) return hit.data
    // Before the first connection probe finishes, trust cached online flags (avoids a flash of "offline").
    const raw = loadItems(this.db, type)
    const live = this.resolved ? applyLive(raw, this.infos, this.settings.excludedServers) : raw.filter((i) => !this.settings.excludedServers.includes(i.serverId))
    const data = mergeItems(live)
    this.memo.set(type, { v: this.version, data })
    return data
  }

  /** Renderer list payload: drop heavy fields (summary is loaded with the detail). */
  libraryForList(type: MediaType): MergedTitle[] {
    return this.library(type).map((t) => ({ ...t, summary: undefined }))
  }

  getSettings(): Settings {
    return this.settings
  }

  setSettings(s: Settings): Settings {
    this.settings = s
    this.bump()
    saveSettings(this.settingsFile, s)
    return s
  }

  private all(): MergedTitle[] {
    return [...this.library('movie'), ...this.library('show')]
  }

  /** Continue Watching merged across servers: one entry per title. */
  private continueCache: ContinueItem[] | null = null
  private continueInflight: Promise<ContinueItem[]> | null = null

  private continueFile(): string {
    return join(dirname(this.settingsFile), 'continue.json')
  }

  /** Last known Continue Watching, instantly (kept across launches). Null only on the very first run. */
  cachedContinue(): ContinueItem[] | null {
    if (this.continueCache) return this.continueCache
    try {
      if (existsSync(this.continueFile())) this.continueCache = JSON.parse(readFileSync(this.continueFile(), 'utf8')) as ContinueItem[]
    } catch {
      /* ignore a corrupt cache */
    }
    return this.continueCache
  }

  /** Ask every server (in parallel, 5s each); concurrent callers share one run. */
  refreshContinue(): Promise<ContinueItem[]> {
    this.continueInflight ??= this.computeContinue()
      .then((items) => {
        // No server answered (all offline / none known): keep what we remembered instead of showing an empty list.
        if (items.length === 0 && this.liveServers().length === 0 && this.continueCache?.length) return this.continueCache
        this.continueCache = items
        try { writeFileSync(this.continueFile(), JSON.stringify(items)) } catch { /* cache only */ }
        return items
      })
      .finally(() => { this.continueInflight = null })
    return this.continueInflight
  }

  private async computeContinue(): Promise<ContinueItem[]> {
    // At launch the server list isn't known yet; asking now would return "nothing in progress". Wait (bounded).
    await Promise.race([this.infosReady, new Promise((r) => setTimeout(r, 15_000))])
    const titles = this.all()
    const idx = new Map<string, string>()
    for (const t of titles) for (const x of t.sources) idx.set(`${x.serverId}|${x.ratingKey}`, t.id)
    const per = await Promise.allSettled(
      this.infos.filter((i) => i.online && i.baseUrl && !this.settings.excludedServers.includes(i.id)).map((i) => fetchOnDeck(this.id, i, this.creds.get(i.id)!.accessToken)),
    )
    const items = per.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    const withIds = items.map(({ showKey, ...c }) => ({ ...c, titleId: showKey ? idx.get(`${c.serverId}|${showKey}`) : undefined }))
    // group by resolved merged title when known so the same show on 2 servers collapses even if names differ
    return mergeContinue(withIds.map((c) => (c.titleId ? { ...c, group: c.titleId, year: undefined } : c)))
  }

  async search(query: string): Promise<{ local: MergedTitle[]; discover: DiscoverItem[] }> {
    const local = searchTitles(this.all(), query)
    if (!this.token || !query.trim()) return { local, discover: [] }
    const found = await searchDiscover(this.id, this.token, query).catch(() => [])
    const localIds = new Set(local.map((t) => t.id))
    const wl = await this.watchlistKeys()
    const discover = annotateAvailability(found, this.all())
      .filter((d) => !d.availableAs || !localIds.has(d.availableAs))
      .map((d) => ({ ...d, onWatchlist: wl.has(d.ratingKey) }))
    return { local, discover }
  }

  private async watchlistKeys(): Promise<Set<string>> {
    if (!this.token) return new Set()
    return new Set((await fetchWatchlist(this.id, this.token).catch(() => [])).map((i) => i.ratingKey))
  }

  async watchlist(): Promise<DiscoverItem[]> {
    if (!this.token) return []
    const items = await fetchWatchlist(this.id, this.token, log).catch((e: unknown) => {
      log(`watchlist failed: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    })
    return annotateAvailability(items, this.all())
  }

  async setWatchlist(ratingKey: string, on: boolean): Promise<void> {
    if (this.token) await setWatchlist(this.id, this.token, ratingKey, on)
  }

  /** Re-read watch state of every source of a title from its servers into the cache (after watching/marking). */
  async refreshTitle(id: string): Promise<void> {
    const t = this.find(id)
    await Promise.allSettled(
      this.usable(t).map(async (u) => {
        const cur = getItem(this.db, u.info.id, u.ratingKey)
        if (!cur) return
        const d = await fetchDetail(this.id, u.info, u.token, u.ratingKey)
        upsertItems(this.db, [patchWatchState(cur, d)], 0)
        this.bump()
      }),
    )
  }

  /** Mark watched/unwatched on every reachable source so merged state stays consistent. */
  async setWatched(id: string, watched: boolean): Promise<void> {
    const t = this.find(id)
    await Promise.all(this.usable(t).map((u) => this.ping(u.info.id, (watched ? scrobblePath : unscrobblePath)(u.ratingKey))))
    await this.refreshTitle(id)
  }

  /** Mark one episode watched/unwatched on every server that has it, then refresh the show's counts. */
  async setEpisodeWatched(titleId: string, sources: { serverId: string; ratingKey: string }[], watched: boolean): Promise<void> {
    await Promise.all(sources.map((x) => this.ping(x.serverId, (watched ? scrobblePath : unscrobblePath)(x.ratingKey))))
    await this.refreshTitle(titleId)
  }

  async rate(id: string, rating: number | null): Promise<void> {
    const t = this.find(id)
    await Promise.all(this.usable(t).map((u) => this.ping(u.info.id, ratePath(u.ratingKey, rating))))
  }

  private idIndex(): Map<string, string> {
    const idx = new Map<string, string>()
    for (const t of this.all()) for (const x of t.sources) idx.set(`${x.serverId}|${x.ratingKey}`, t.id)
    return idx
  }

  private liveServers() {
    return this.infos.filter((i) => i.online && i.baseUrl && !this.settings.excludedServers.includes(i.id))
  }

  async collections(): Promise<CollectionInfo[]> {
    const idx = this.idIndex()
    const perServer = await Promise.allSettled(
      this.liveServers().map(async (info): Promise<CollectionPart[]> => {
        const token = this.creds.get(info.id)!.accessToken
        const secs = await listSections(this.id, info, token)
        const cols = (await Promise.all(secs.map((sec) => fetchCollections(this.id, info, token, sec.key)))).flat()
        return Promise.all(
          cols.map(async (c) => ({
            serverId: info.id,
            title: c.title,
            poster: c.poster,
            titleIds: (await fetchItemKeys(this.id, info, token, collectionChildrenPath(c.ratingKey)).catch(() => []))
              .flatMap((rk) => idx.get(`${info.id}|${rk}`) ?? []),
          })),
        )
      }),
    )
    return mergeCollections(perServer.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])))
  }

  async playlists(): Promise<PlaylistInfo[]> {
    const idx = this.idIndex()
    const per = await Promise.allSettled(
      this.liveServers().map(async (info) => {
        const token = this.creds.get(info.id)!.accessToken
        const lists = await fetchPlaylists(this.id, info, token)
        return Promise.all(
          lists.map(async (p): Promise<PlaylistInfo> => ({
            ...p,
            titleIds: (await fetchItemKeys(this.id, info, token, playlistItemsPath(p.ratingKey)).catch(() => [])).flatMap((rk) => idx.get(`${info.id}|${rk}`) ?? []),
          })),
        )
      }),
    )
    return per.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  }

  /** Playlists live on one server; add the title as that server's copy. */
  async playlistWrite(r: { serverId: string; titleId: string; playlistRatingKey?: string; newTitle?: string }): Promise<void> {
    const t = this.find(r.titleId)
    const src = t.sources.find((x) => x.serverId === r.serverId)
    if (!src) throw new Error('title is not on that server')
    const uri = itemUri(r.serverId, src.ratingKey)
    if (r.playlistRatingKey) await this.write(r.serverId, 'PUT', addToPlaylistPath(r.playlistRatingKey, uri))
    else if (r.newTitle) await this.write(r.serverId, 'POST', createPlaylistPath(r.newTitle, uri))
  }

  private async write(serverId: string, method: 'PUT' | 'POST', path: string): Promise<void> {
    const info = this.infos.find((i) => i.id === serverId)
    const cred = this.creds.get(serverId)
    if (!info?.baseUrl || !cred) throw new Error('server unavailable')
    const res = await fetch(`${info.baseUrl}${path}`, { method, headers: { 'X-Plex-Token': cred.accessToken, 'X-Plex-Client-Identifier': this.id.clientId, 'X-Plex-Product': 'Flax', Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  }

  private mpv: MpvSession | null = null

  mpvAvailable(): boolean {
    return findMpv(this.settings.mpvPath) !== null
  }

  /** Direct-play through external mpv; token is passed over IPC headers, never argv or the renderer. */
  async playMpv(r: MpvRequest): Promise<void> {
    const bin = findMpv(this.settings.mpvPath)
    const info = this.infos.find((i) => i.id === r.serverId)
    const cred = this.creds.get(r.serverId)
    if (!bin) throw new Error('mpv not found; install it (brew install mpv) or set its path in Settings')
    if (!info?.baseUrl || !cred) throw new Error('server unavailable')
    this.mpv?.stop()
    const session = new MpvSession()
    this.mpv = session
    await session.start(bin, this.settings, {
      url: `${info.baseUrl}${r.partKey}`,
      headers: [`X-Plex-Token: ${cred.accessToken}`, `X-Plex-Client-Identifier: ${this.id.clientId}`, 'X-Plex-Product: Flax'],
      startMs: r.startMs,
      title: r.title,
      markers: r.markers,
      onTimeline: (state, timeMs) => void this.timeline({ serverId: r.serverId, ratingKey: r.ratingKey, state, timeMs, durationMs: 0 }),
      onEnded: () => void this.scrobble({ serverId: r.serverId, ratingKey: r.ratingKey }),
    })
  }

  mpvCommand(args: unknown[]): Promise<unknown> {
    return this.mpv ? this.mpv.command(...args) : Promise.reject(new Error('mpv not running'))
  }

  private find(id: string): MergedTitle {
    const t = this.library(id.startsWith('show:') ? 'show' : 'movie').find((m) => m.id === id)
    if (!t) throw new Error('title not found')
    return t
  }

  /** Servers that currently have a usable connection for this title, best source first. */
  private usable(t: MergedTitle): { info: ServerInfo; token: string; ratingKey: string }[] {
    return t.sources.flatMap((src) => {
      const info = this.infos.find((i) => i.id === src.serverId)
      const cred = this.creds.get(src.serverId)
      return info?.baseUrl && info.online && cred ? [{ info, token: cred.accessToken, ratingKey: src.ratingKey }] : []
    })
  }

  async detail(id: string): Promise<TitleDetail> {
    const t = this.find(id)
    const us = this.usable(t)
    const settled = await Promise.allSettled(
      us.map(async (u) => ({ u, d: await fetchDetail(this.id, u.info, u.token, u.ratingKey) })),
    )
    const ok = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    if (ok.length === 0) throw new Error('no reachable server for this title')
    const parts = ok.map(({ u, d }) => toDetailPart(u.info, d))
    const first = parts[0]!
    let seasons: TitleDetail['seasons'] = []
    if (t.type === 'show') {
      const lists = await Promise.allSettled(us.map((u) => fetchSeasons(this.id, u.info, u.token, u.ratingKey)))
      const by = new Map<number, TitleDetail['seasons'][number]>()
      for (const l of lists) if (l.status === 'fulfilled') for (const se of l.value) {
        const cur = by.get(se.index)
        if (!cur || se.episodeCount > cur.episodeCount) by.set(se.index, { index: se.index, title: se.title, episodeCount: se.episodeCount })
      }
      seasons = [...by.values()].sort((a, b) => a.index - b.index)
    }
    return {
      id,
      cast: first.cast,
      directors: first.directors,
      durationMs: first.durationMs,
      contentRating: first.contentRating,
      summary: first.summary,
      playables: parts.map((p) => p.playable),
      seasons,
    }
  }

  async episodes(id: string, season: number): Promise<MergedEpisode[]> {
    const t = this.find(id)
    const per = await Promise.allSettled(
      this.usable(t).map(async (u): Promise<RawEpisode[]> => {
        const se = (await fetchSeasons(this.id, u.info, u.token, u.ratingKey)).find((x) => x.index === season)
        return se ? fetchEpisodes(this.id, u.info, u.token, se.ratingKey) : []
      }),
    )
    return mergeEpisodes(per.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])))
  }

  /** Audio/subtitle tracks + markers for one specific item (movie or episode) on one server. */
  async streams(serverId: string, ratingKey: string): Promise<PlayableStreams> {
    const info = this.infos.find((i) => i.id === serverId)
    const cred = this.creds.get(serverId)
    if (!info?.baseUrl || !cred) throw new Error('server unavailable')
    const p = toDetailPart(info, await fetchDetail(this.id, info, cred.accessToken, ratingKey)).playable
    return { audio: p.audio, subtitles: p.subtitles, partKey: p.partKey, partId: p.partId, markers: p.markers, durationMs: p.durationMs }
  }

  async playStart(r: PlayRequest): Promise<{ url: string; session: string }> {
    const session = r.session ?? randomUUID()
    // Stream choice is stored on the server's media part; the transcoder reads it from there.
    if (r.partId !== undefined && (r.audioStreamId !== undefined || r.subtitleStreamId !== undefined)) {
      await this.write(r.serverId, 'PUT', selectStreamsPath(r.partId, r.audioStreamId, r.subtitleStreamId)).catch((e: unknown) =>
        log(`select streams failed on ${r.serverId}: ${e instanceof Error ? e.message : String(e)}`),
      )
    }
    // Off is already stored on the server (subtitleStreamID=0), so 'auto' is enough and avoids an unverified value.
    const subtitles = r.subtitleMode ?? (r.subtitleStreamId ? 'burn' : 'auto')
    const path = transcodeStartPath(r.ratingKey, { offsetMs: r.offsetMs, session, subtitles, compat: r.compat, maxBitrateKbps: (r.maxBitrateKbps ?? this.settings.maxBitrateKbps) || undefined })
    return { url: `flax-stream://${r.serverId}${path}`, session }
  }


  /**
   * Download a text subtitle track so the player can draw it itself (no transcoder restart). Which address serves
   * a given track varies (external file key vs. extracted embedded track), so try the known forms and log each.
   */
  async fetchSubtitle(serverId: string, streamId: number, key?: string): Promise<{ text: string; via: string }> {
    const info = this.infos.find((i) => i.id === serverId)
    const cred = this.creds.get(serverId)
    if (!info?.baseUrl || !cred) throw new Error('server unavailable')
    for (const path of subtitleCandidates(streamId, key)) {
      try {
        const res = await fetch(`${info.baseUrl}${path}`, {
          headers: { 'X-Plex-Token': cred.accessToken, 'X-Plex-Client-Identifier': this.id.clientId, 'X-Plex-Product': 'Flax' },
          signal: AbortSignal.timeout(10_000),
        })
        const text = res.ok ? await res.text() : ''
        const ok = res.ok && looksLikeSubtitles(text)
        log(`subtitle ${info.name} stream ${streamId} ${path}: HTTP ${res.status}, ${text.length} bytes, ${ok ? 'usable' : 'not subtitles'}`)
        if (ok) return { text, via: path }
      } catch (e) {
        log(`subtitle ${info.name} stream ${streamId} ${path}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    throw new Error('the server did not hand out this subtitle track')
  }

  async stopSession(serverId: string, session: string): Promise<void> {
    const info = this.infos.find((i) => i.id === serverId)
    const cred = this.creds.get(serverId)
    if (!info?.baseUrl || !cred) return
    const res = await fetch(`${info.baseUrl}${stopSessionPath(session)}`, {
      headers: { 'X-Plex-Token': cred.accessToken, 'X-Plex-Client-Identifier': this.id.clientId, 'X-Plex-Product': 'Flax', 'X-Plex-Session-Identifier': session },
      signal: AbortSignal.timeout(8000),
    }).catch((e: unknown) => { log(`stop ${info.name}: ${e instanceof Error ? e.message : String(e)}`); return null })
    if (res && !res.ok) log(`stop ${info.name}: HTTP ${res.status}`)
  }

  /** Fire-and-forget request to a server (timeline/scrobble); playback state goes only to the playing server. */
  private async ping(serverId: string, path: string): Promise<void> {
    const info = this.infos.find((i) => i.id === serverId)
    const cred = this.creds.get(serverId)
    if (!info?.baseUrl || !cred) return
    await fetch(`${info.baseUrl}${path}`, { headers: { 'X-Plex-Token': cred.accessToken, 'X-Plex-Client-Identifier': this.id.clientId, 'X-Plex-Product': 'Flax' }, signal: AbortSignal.timeout(8000) }).catch(() => undefined)
  }

  timeline(r: { serverId: string; ratingKey: string; state: 'playing' | 'paused' | 'stopped'; timeMs: number; durationMs: number }): Promise<void> {
    return this.ping(r.serverId, timelinePath(r.ratingKey, r.state, r.timeMs, r.durationMs))
  }

  /** Mark watched on the playing server and, for a movie, on every other server holding the same title. */
  async scrobble(r: { serverId: string; ratingKey: string }): Promise<void> {
    const owner = this.library('movie').find((t) => t.sources.some((x) => x.serverId === r.serverId && x.ratingKey === r.ratingKey))
    const targets = owner ? owner.sources.map((x) => ({ serverId: x.serverId, ratingKey: x.ratingKey })) : [r]
    await Promise.all(targets.map((x) => this.ping(x.serverId, scrobblePath(x.ratingKey))))
    if (owner) await this.refreshTitle(owner.id)
  }

  /** Authenticated pass-through for flax-stream:// (HLS playlists/segments). Forwards Range. */
  async stream(serverId: string, pathAndQuery: string, range: string | null): Promise<Response> {
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' }
    const info = this.infos.find((i) => i.id === serverId)
    const cred = this.creds.get(serverId)
    if (!info?.baseUrl || !cred) {
      log(`stream 404: no connection for server ${serverId}`)
      return new Response(null, { status: 404, headers: cors })
    }
    const headers: Record<string, string> = {
      'X-Plex-Token': cred.accessToken,
      'X-Plex-Client-Identifier': this.id.clientId,
      'X-Plex-Product': 'Flax',
      'X-Plex-Version': this.id.version,
      'X-Plex-Platform': 'Chrome',
      'X-Plex-Device': 'macOS',
    }
    if (range) headers['Range'] = range
    try {
      const res = await fetch(`${info.baseUrl}${pathAndQuery}`, { headers })
      if (!res.ok) {
        // Plex explains 4xx errors in the body; keep a short excerpt for diagnosis.
        const why = (await res.clone().text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)
        log(`stream HTTP ${res.status} ${info.name}: ${scrub(pathAndQuery.slice(0, 300))} :: ${why}`)
      }
      const out: Record<string, string> = { ...cors, 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' }
      for (const h of ['content-length', 'content-range', 'accept-ranges']) {
        const v = res.headers.get(h)
        if (v) out[h] = v
      }
      return new Response(res.body, { status: res.status, headers: out })
    } catch (e) {
      log(`stream failed ${info.name}: ${e instanceof Error ? e.message : String(e)}`)
      return new Response(null, { status: 502, headers: cors })
    }
  }

  private imgActive = new Map<string, number>()
  private imgWaiters = new Map<string, (() => void)[]>()

  /** At most 4 concurrent image fetches per server so slow shared servers don't time everything out. */
  private async withSlot<T>(serverId: string, fn: () => Promise<T>): Promise<T> {
    while ((this.imgActive.get(serverId) ?? 0) >= 4) await new Promise<void>((r) => this.imgWaiters.set(serverId, [...(this.imgWaiters.get(serverId) ?? []), r]))
    this.imgActive.set(serverId, (this.imgActive.get(serverId) ?? 0) + 1)
    try {
      return await fn()
    } finally {
      this.imgActive.set(serverId, (this.imgActive.get(serverId) ?? 1) - 1)
      this.imgWaiters.get(serverId)?.shift()?.()
    }
  }

  /** Proxy a server-relative image with a disk cache; the renderer never needs the token. */
  async image(serverId: string, path: string): Promise<{ data: Buffer; type: string } | null> {
    const file = join(this.cacheDir, createHash('sha1').update(`${serverId}${path}`).digest('hex'))
    if (existsSync(file)) return { data: readFileSync(file), type: 'image/jpeg' }
    const info = this.infos.find((i) => i.id === serverId)
    const cred = this.creds.get(serverId)
    if (!info?.baseUrl || !cred) return null
    return this.withSlot(serverId, async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(`${info.baseUrl}${path}`, { headers: { 'X-Plex-Token': cred.accessToken }, signal: AbortSignal.timeout(20000) }).catch(() => null)
        if (res?.ok) {
          // Body read can time out after headers arrive; treat as a failed attempt.
          const data = await res.arrayBuffer().then((b) => Buffer.from(b)).catch(() => null)
          if (data) {
            writeFileSync(file, data)
            return { data, type: res.headers.get('content-type') ?? 'image/jpeg' }
          }
          continue
        }
        if (res && res.status < 500) return null
      }
      return null
    })
  }
}

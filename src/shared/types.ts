export type MediaType = 'movie' | 'show'

export interface Guids {
  tmdb?: string
  imdb?: string
  tvdb?: string
}

export interface Quality {
  res?: string
  bitrate?: number
  codec?: string
  hdr?: boolean
}

/** One title as reported by a single server library. */
export interface RawItem {
  serverId: string
  serverName: string
  ratingKey: string
  library: string
  type: MediaType
  title: string
  year?: number
  guids: Guids
  poster?: string
  /** backdrop image */
  art?: string
  summary?: string
  addedAt: number
  genres?: string[]
  rating?: number
  watched?: boolean
  /** shows: total / watched episode counts as reported by this server */
  leafCount?: number
  viewedLeafCount?: number
  quality?: Quality
  /** 0 = local, 1 = remote, 2 = relay */
  connectionPref?: number
  online?: boolean
}

export interface Source {
  serverId: string
  serverName: string
  ratingKey: string
  library: string
  quality: Quality
  connectionPref: number
  online: boolean
  addedAt: number
}

export interface MergedTitle {
  id: string
  type: MediaType
  title: string
  year?: number
  guids: Guids
  poster?: string
  /** every source's poster, best source first; UI falls back down the list */
  posters: string[]
  /** backdrop (best source that has one) */
  art?: string
  summary?: string
  /** max across sources */
  addedAt: number
  genres: string[]
  rating?: number
  /** watched on any source */
  watched: boolean
  /** shows: episodes not yet watched on any server (0 for movies) */
  unwatchedCount: number
  sources: Source[]
}

/** Renderer-safe server description (no tokens). */
export interface ServerInfo {
  id: string
  name: string
  owned: boolean
  baseUrl: string | null
  connectionPref: number
  online: boolean
  latencyMs: number | null
}

export interface Stream {
  id: number
  kind: 'audio' | 'subtitle'
  language?: string
  title: string
  codec?: string
  default?: boolean
  /** external subtitle files: server path to download from */
  key?: string
  format?: string
}

export interface EpisodeSource {
  serverId: string
  serverName: string
  ratingKey: string
  online: boolean
  connectionPref: number
}

export interface MergedEpisode {
  season: number
  episode: number
  title: string
  summary?: string
  thumb?: string
  durationMs?: number
  watched: boolean
  viewOffsetMs: number
  sources: EpisodeSource[]
}

export interface Season {
  index: number
  title: string
  episodeCount: number
}

export interface TitleDetail {
  id: string
  summary?: string
  cast: { name: string; role?: string }[]
  directors: string[]
  durationMs?: number
  contentRating?: string
  /** per-source playable info (movies) */
  playables: { serverId: string; ratingKey: string; partKey?: string; partId?: number; markers: Marker[]; durationMs?: number; viewOffsetMs: number; audio: Stream[]; subtitles: Stream[] }[]
  seasons: Season[]
}

export interface PlayRequest {
  serverId: string
  ratingKey: string
  offsetMs: number
  /** media part to select streams on (from play:streams) */
  partId?: number
  audioStreamId?: number
  /** 0 = subtitles off, undefined = leave the server's default */
  subtitleStreamId?: number
  /** how to deliver a chosen subtitle: burned into the video, or whatever the server decides */
  subtitleMode?: 'burn' | 'auto'
  /** minimal request parameters (fallback when the full request gets a bare 400) */
  compat?: boolean
  /** one id per playback: restarts (seek, quality, tracks) reuse it so the server replaces the stream instead of seeing a second one */
  session?: string
  maxBitrateKbps?: number
}

export interface DiscoverItem {
  ratingKey: string
  title: string
  year?: number
  type: MediaType
  poster?: string
  summary?: string
  /** local merged title if any server has it */
  availableAs?: string
  onWatchlist?: boolean
}

export interface ContinueItem {
  key: string
  title: string
  subtitle?: string
  poster?: string
  art?: string
  serverId: string
  ratingKey: string
  viewOffsetMs: number
  durationMs: number
  lastViewedAt: number
  /** episodes: which one, so playback can resolve every server's copy */
  season?: number
  episode?: number
  /** merged title id for opening the detail page */
  titleId?: string
}

export interface Settings {
  excludedServers: string[]
  /** 0 = original / no cap */
  maxBitrateKbps: number
  /** use mpv (when installed) instead of the built-in HLS player */
  useMpv: boolean
  mpvPath?: string
  autoSkipIntro: boolean
  playbackSpeed: number
  /** extra volume above 100, 0-30 */
  audioBoostPct: number
  subScale: number
}

export interface MpvRequest {
  serverId: string
  ratingKey: string
  partKey: string
  title: string
  startMs: number
  markers: Marker[]
}

export interface Marker {
  type: 'intro' | 'credits'
  startMs: number
  endMs: number
}

export interface CollectionInfo {
  id: string
  title: string
  poster?: string
  /** merged-title ids contained, across all servers' copies of the collection */
  titleIds: string[]
  servers: string[]
}

export interface PlaylistInfo {
  serverId: string
  serverName: string
  ratingKey: string
  title: string
  count: number
  titleIds: string[]
}

export interface UpdateStatus {
  /** app version (semver) */
  current: string
  state: 'disabled' | 'idle' | 'checking' | 'downloading' | 'ready' | 'error'
  latest?: string
  error?: string
  /** download progress 0..1 while state === 'downloading' */
  progress?: number
  /** ms epoch of the last completed check */
  checkedAt?: number
}

export interface PlayableStreams {
  partId?: number
  audio: Stream[]
  subtitles: Stream[]
  partKey?: string
  markers: Marker[]
  durationMs?: number
}

/** Selectable transcode caps in kbps (0 = original). Shared by Settings and the player. */
export const QUALITY_OPTIONS: { kbps: number; label: string }[] = [
  { kbps: 0, label: 'Original' },
  { kbps: 20000, label: '20 Mbps' },
  { kbps: 12000, label: '12 Mbps' },
  { kbps: 8000, label: '8 Mbps' },
  { kbps: 4000, label: '4 Mbps' },
  { kbps: 3000, label: '3 Mbps' },
  { kbps: 2000, label: '2 Mbps' },
  { kbps: 1500, label: '1.5 Mbps' },
  { kbps: 1000, label: '1 Mbps' },
]

import { plexFetch, type ClientIdentity } from './client'
import { childrenPath } from './endpoints'
import type { RawEpisode } from '../merge/episodes'
import type { Ratings, ServerInfo, Season, Stream, TitleDetail } from '@shared/types'

interface RawStream { id: number; streamType: number; key?: string; format?: string; selected?: boolean | number; languageTag?: string; displayTitle?: string; title?: string; codec?: string; default?: boolean }
export interface RawDetail {
  ratingKey: string
  duration?: number
  viewOffset?: number
  contentRating?: string
  summary?: string
  viewCount?: number
  leafCount?: number
  viewedLeafCount?: number
  /** Plex's own metadata: one entry per source, e.g. image `imdb://image.rating` (value 0-10) or `rottentomatoes://image.rating.ripe` */
  Rating?: { image?: string; value?: number; type?: string }[]
  Marker?: { type: string; startTimeOffset: number; endTimeOffset: number }[]
  Role?: { tag: string; role?: string }[]
  Director?: { tag: string }[]
  Media?: { Part?: { id?: number; key?: string; Stream?: RawStream[] }[] }[]
}
interface RawChild {
  ratingKey: string
  index?: number
  parentIndex?: number
  title: string
  summary?: string
  thumb?: string
  duration?: number
  leafCount?: number
  viewCount?: number
  viewOffset?: number
}
interface Meta<T> { MediaContainer: { Metadata?: T[] } }

export function parseStreams(d: RawDetail): { audio: Stream[]; subtitles: Stream[] } {
  const streams = d.Media?.[0]?.Part?.[0]?.Stream ?? []
  const map = (s: RawStream, kind: Stream['kind']): Stream => ({
    id: s.id, kind, language: s.languageTag, title: s.displayTitle ?? s.title ?? s.languageTag ?? 'Unknown', codec: s.codec, default: s.default, key: s.key, format: s.format,
  })
  return {
    audio: streams.filter((s) => s.streamType === 2).map((s) => map(s, 'audio')),
    subtitles: streams.filter((s) => s.streamType === 3).map((s) => map(s, 'subtitle')),
  }
}

/** IMDb and Rotten Tomatoes scores from the `Rating` list Plex attaches to matched titles. */
export function parseRatings(d: Pick<RawDetail, 'Rating'>): Ratings | undefined {
  const out: Ratings = {}
  for (const r of d.Rating ?? []) {
    if (typeof r.value !== 'number' || !r.image) continue
    if (r.image.startsWith('imdb://')) out.imdb = r.value
    else if (r.image.startsWith('rottentomatoes://')) {
      const pct = Math.round(r.value * 10) // Plex stores 0-10
      if (r.type === 'audience' || r.image.includes('upright') || r.image.includes('spilled')) out.rtAudience = pct
      else out.rtCritic = pct
    }
  }
  return out.imdb !== undefined || out.rtCritic !== undefined || out.rtAudience !== undefined ? out : undefined
}

export async function fetchDetail(id: ClientIdentity, s: ServerInfo, token: string, ratingKey: string) {
  const r = await plexFetch<Meta<RawDetail>>(id, `${s.baseUrl}/library/metadata/${ratingKey}`, { token, query: { includeMarkers: '1' } })
  const d = r.MediaContainer.Metadata?.[0]
  if (!d) throw new Error('not found')
  return d
}

export function toDetailPart(s: ServerInfo, d: RawDetail): Pick<TitleDetail, 'cast' | 'directors' | 'durationMs' | 'contentRating' | 'summary' | 'ratings'> & { playable: TitleDetail['playables'][number] } {
  const { audio, subtitles } = parseStreams(d)
  return {
    cast: (d.Role ?? []).slice(0, 20).map((r) => ({ name: r.tag, role: r.role })),
    directors: (d.Director ?? []).map((x) => x.tag),
    durationMs: d.duration,
    contentRating: d.contentRating,
    summary: d.summary,
    ratings: parseRatings(d),
    playable: { serverId: s.id, ratingKey: d.ratingKey, partKey: d.Media?.[0]?.Part?.[0]?.key, partId: d.Media?.[0]?.Part?.[0]?.id, durationMs: d.duration, viewOffsetMs: d.viewOffset ?? 0, audio, subtitles,
      markers: (d.Marker ?? []).filter((m) => m.type === 'intro' || m.type === 'credits').map((m) => ({ type: m.type as 'intro' | 'credits', startMs: m.startTimeOffset, endMs: m.endTimeOffset })) },
  }
}

export async function fetchSeasons(id: ClientIdentity, s: ServerInfo, token: string, showKey: string): Promise<(Season & { ratingKey: string })[]> {
  const r = await plexFetch<Meta<RawChild>>(id, s.baseUrl + childrenPath(showKey), { token })
  return (r.MediaContainer.Metadata ?? []).map((c) => ({ ratingKey: c.ratingKey, index: c.index ?? 0, title: c.title, episodeCount: c.leafCount ?? 0 }))
}

export async function fetchEpisodes(id: ClientIdentity, s: ServerInfo, token: string, seasonKey: string): Promise<RawEpisode[]> {
  const r = await plexFetch<Meta<RawChild>>(id, s.baseUrl + childrenPath(seasonKey), { token })
  return (r.MediaContainer.Metadata ?? []).map((c) => ({
    source: { serverId: s.id, serverName: s.name, ratingKey: c.ratingKey, online: s.online, connectionPref: s.connectionPref },
    season: c.parentIndex ?? 0,
    episode: c.index ?? 0,
    title: c.title,
    summary: c.summary,
    thumb: c.thumb ? `flax-img://${s.id}${c.thumb}` : undefined,
    durationMs: c.duration,
    watched: (c.viewCount ?? 0) > 0,
    viewOffsetMs: c.viewOffset ?? 0,
  }))
}

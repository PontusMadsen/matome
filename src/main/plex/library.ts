import { plexFetch, type ClientIdentity } from './client'
import { sectionAllPath, sectionsPath } from './endpoints'
import { parseGuids } from '../merge'
import type { MediaType, RawItem, ServerInfo } from '@shared/types'

interface Container<T> {
  MediaContainer: { totalSize?: number; size?: number; offset?: number; Directory?: T[]; Metadata?: T[] }
}
interface Section {
  key: string
  title: string
  type: string
}
export interface PlexMeta {
  ratingKey: string
  title: string
  year?: number
  thumb?: string
  art?: string
  summary?: string
  addedAt?: number
  updatedAt?: number
  Guid?: { id: string }[]
  Genre?: { tag: string }[]
  rating?: number
  audienceRating?: number
  viewCount?: number
  leafCount?: number
  viewedLeafCount?: number
  Media?: { videoResolution?: string; bitrate?: number; videoCodec?: string; videoProfile?: string }[]
}

export const PAGE = 500

export async function listSections(id: ClientIdentity, s: ServerInfo, token: string): Promise<Section[]> {
  if (!s.baseUrl) return []
  const r = await plexFetch<Container<Section>>(id, s.baseUrl + sectionsPath(), { token })
  return (r.MediaContainer.Directory ?? []).filter((d) => d.type === 'movie' || d.type === 'show')
}

export function toRawItem(s: ServerInfo, sec: Section, m: PlexMeta): RawItem {
  const media = m.Media?.[0]
  return {
    serverId: s.id,
    serverName: s.name,
    ratingKey: m.ratingKey,
    library: sec.title,
    type: sec.type as MediaType,
    title: m.title,
    year: m.year,
    guids: parseGuids((m.Guid ?? []).map((g) => g.id)),
    // Renderer never sees tokens: posters load via the flax-img:// protocol handled in main.
    poster: m.thumb ? `flax-img://${s.id}${m.thumb}` : undefined,
    art: m.art ? `flax-img://${s.id}${m.art}` : undefined,
    summary: m.summary,
    addedAt: m.addedAt ?? 0,
    genres: (m.Genre ?? []).map((g) => g.tag),
    rating: m.audienceRating ?? m.rating,
    leafCount: m.leafCount,
    viewedLeafCount: m.viewedLeafCount,
    watched: (m.viewCount ?? 0) > 0 || (!!m.leafCount && m.viewedLeafCount === m.leafCount),
    quality: media
      ? { res: media.videoResolution, bitrate: media.bitrate, codec: media.videoCodec, hdr: /hdr|dolby/i.test(media.videoProfile ?? '') || undefined }
      : undefined,
    connectionPref: s.connectionPref,
    online: s.online,
  }
}

export interface CrawlResult {
  items: RawItem[]
  updatedAt: number[]
  /** every ratingKey seen for pruning */
  allKeys: Set<string>
}

/**
 * Page through one section (all items; caller diffs against cache).
 * in `items` (incremental refresh), but `allKeys` still covers the whole section so removals can be pruned.
 */
export async function crawlSection(
  id: ClientIdentity,
  s: ServerInfo,
  token: string,
  sec: Section,
): Promise<CrawlResult> {
  const out: CrawlResult = { items: [], updatedAt: [], allKeys: new Set() }
  if (!s.baseUrl) return out
  const type = sec.type === 'movie' ? 1 : 2
  const page = (start: number) =>
    plexFetch<Container<PlexMeta>>(id, s.baseUrl + sectionAllPath(sec.key, type), {
      token,
      query: { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': String(PAGE) },
    })
  const first = await page(0)
  const total = first.MediaContainer.totalSize ?? first.MediaContainer.Metadata?.length ?? 0
  const pages = [first]
  // Remaining pages in parallel batches (4 at a time) instead of one after another.
  const starts: number[] = []
  for (let st = PAGE; st < total; st += PAGE) starts.push(st)
  for (let i = 0; i < starts.length; i += 4) pages.push(...(await Promise.all(starts.slice(i, i + 4).map(page))))
  for (const r of pages) {
    for (const m of r.MediaContainer.Metadata ?? []) {
      out.allKeys.add(m.ratingKey)
      out.items.push(toRawItem(s, sec, m))
      out.updatedAt.push(m.updatedAt ?? m.addedAt ?? 0)
    }
  }
  return out
}

/** Apply fresh watch-state fields from a metadata response onto a cached item. */
export function patchWatchState(item: RawItem, m: Pick<PlexMeta, 'viewCount' | 'leafCount' | 'viewedLeafCount'>): RawItem {
  return {
    ...item,
    leafCount: m.leafCount ?? item.leafCount,
    viewedLeafCount: m.viewedLeafCount ?? item.viewedLeafCount,
    watched: (m.viewCount ?? 0) > 0 || (!!m.leafCount && m.viewedLeafCount === m.leafCount),
  }
}

// Plex Discover / Watchlist. Endpoints per docs in PLAN.md (discover.provider.plex.tv).
import { hosts } from './endpoints'
import { plexFetch, type ClientIdentity } from './client'
import type { DiscoverItem, MediaType } from '@shared/types'

interface DMeta { ratingKey: string; title: string; year?: number; type: string; thumb?: string; summary?: string }
interface DContainer { MediaContainer: { size?: number; totalSize?: number; Metadata?: DMeta[]; SearchResults?: { SearchResult?: { Metadata: DMeta }[] }[] } }

const toItem = (m: DMeta): DiscoverItem | null =>
  m.type === 'movie' || m.type === 'show'
    ? { ratingKey: m.ratingKey, title: m.title, year: m.year, type: m.type as MediaType, poster: m.thumb, summary: m.summary }
    : null

const nonNull = <T>(x: T | null): x is T => x !== null

export async function searchDiscover(id: ClientIdentity, token: string, query: string): Promise<DiscoverItem[]> {
  const r = await plexFetch<DContainer>(id, `${hosts.discover}/library/search`, {
    token,
    query: { query, searchTypes: 'movies,tv', limit: '30', includeMetadata: '1' },
  })
  const mc = r.MediaContainer
  const metas = mc.Metadata ?? (mc.SearchResults ?? []).flatMap((g) => (g.SearchResult ?? []).map((x) => x.Metadata))
  return metas.map(toItem).filter(nonNull)
}

/**
 * The watchlist lives on the Discover provider (same call python-plexapi's MyPlexAccount.watchlist() makes):
 * includeCollections / includeExternalMedia are part of it, and without them the list can come back empty.
 */
export async function fetchWatchlist(id: ClientIdentity, token: string, note?: (msg: string) => void): Promise<DiscoverItem[]> {
  const url = `${hosts.discover}/library/sections/watchlist/all`
  // Container paging goes in headers like python-plexapi does (as query params some deployments answer 400). The last
  // variant is the bare request, so one picky parameter can't take the whole list down.
  const variants: { name: string; query: Record<string, string>; headers?: Record<string, string> }[] = [
    { name: 'plexapi', query: { includeCollections: '1', includeExternalMedia: '1' }, headers: { 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '300' } },
    { name: 'bare', query: {} },
  ]
  let lastErr: unknown
  for (const v of variants) {
    try {
      const r = await plexFetch<DContainer>(id, url, { token, query: v.query, headers: v.headers, timeoutMs: 20_000 })
      const metas = r.MediaContainer.Metadata ?? []
      const items = metas.map(toItem).filter(nonNull).map((i) => ({ ...i, onWatchlist: true }))
      note?.(`watchlist[${v.name}]: size=${r.MediaContainer.size ?? '?'} total=${r.MediaContainer.totalSize ?? '?'}, ${metas.length} entries, ${items.length} movies/shows (types: ${[...new Set(metas.map((m) => m.type))].join(',') || 'none'})`)
      if (items.length > 0 || v === variants[variants.length - 1]) return items
    } catch (e) {
      lastErr = e
      note?.(`watchlist[${v.name}] failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('watchlist failed')
}

export async function setWatchlist(id: ClientIdentity, token: string, ratingKey: string, on: boolean): Promise<void> {
  const action = on ? 'addToWatchlist' : 'removeFromWatchlist'
  await plexFetch(id, `${hosts.discover}/actions/${action}`, { token, method: 'PUT', query: { ratingKey } }).catch((e: unknown) => {
    // These endpoints return an empty body; only HTTP-level errors matter.
    if (!(e instanceof Error) || /HTTP/.test(e.message)) throw e
  })
}

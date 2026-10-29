// Plex Discover / Watchlist. Endpoints per docs in PLAN.md (discover.provider.plex.tv).
import { hosts } from './endpoints'
import { posterUrl } from '../remote-image'
import { plexFetch, type ClientIdentity } from './client'
import type { DiscoverItem, MediaType } from '@shared/types'

interface DMeta { ratingKey: string; title: string; year?: number; type: string; thumb?: string; summary?: string }
interface DContainer { MediaContainer: { size?: number; totalSize?: number; Metadata?: DMeta[]; SearchResults?: { SearchResult?: { Metadata: DMeta }[] }[] } }

const toItem = (m: DMeta): DiscoverItem | null =>
  m.type === 'movie' || m.type === 'show'
    ? { ratingKey: m.ratingKey, title: m.title, year: m.year, type: m.type as MediaType, poster: posterUrl(m.thumb), summary: m.summary }
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
 * The watchlist lives on the Discover provider (same endpoint python-plexapi's MyPlexAccount.watchlist() uses).
 * The server pages it (20 per page by default, 201 total in the field), so we walk the pages with container start/size.
 * Observed against the live service: includeCollections/includeExternalMedia and a size of 300 are answered with HTTP 400,
 * so the request stays minimal and pages are small. If paging itself is refused we settle for the first page.
 */
export async function fetchWatchlist(id: ClientIdentity, token: string, note?: (msg: string) => void): Promise<DiscoverItem[]> {
  const url = `${hosts.discover}/library/sections/watchlist/all`
  const PAGE = 50
  const page = (start: number, paged: boolean) =>
    plexFetch<DContainer>(id, url, { token, query: paged ? { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': String(PAGE) } : {}, timeoutMs: 20_000 })
  const out: DMeta[] = []
  let first: DContainer
  let paged = true
  try {
    first = await page(0, true)
  } catch (e) {
    note?.(`watchlist: paging refused (${e instanceof Error ? e.message : String(e)}); using the first page only`)
    paged = false
    first = await page(0, false)
  }
  out.push(...(first.MediaContainer.Metadata ?? []))
  const total = first.MediaContainer.totalSize ?? out.length
  for (let start = out.length; paged && start < total && start < 2000; start = out.length) {
    const r = await page(start, true).catch((e: unknown) => {
      note?.(`watchlist: page at ${start} failed: ${e instanceof Error ? e.message : String(e)}`)
      return null
    })
    const metas = r?.MediaContainer.Metadata ?? []
    if (metas.length === 0) break
    out.push(...metas)
  }
  const seen = new Set<string>()
  const items = out
    .map(toItem)
    .filter(nonNull)
    .filter((i) => !seen.has(i.ratingKey) && !!seen.add(i.ratingKey))
    .map((i) => ({ ...i, onWatchlist: true }))
  note?.(`watchlist: ${items.length} movies/shows of ${total} total (${paged ? 'paged' : 'first page only'})`)
  return items
}

export async function setWatchlist(id: ClientIdentity, token: string, ratingKey: string, on: boolean): Promise<void> {
  const action = on ? 'addToWatchlist' : 'removeFromWatchlist'
  await plexFetch(id, `${hosts.discover}/actions/${action}`, { token, method: 'PUT', query: { ratingKey } }).catch((e: unknown) => {
    // These endpoints return an empty body; only HTTP-level errors matter.
    if (!(e instanceof Error) || /HTTP/.test(e.message)) throw e
  })
}

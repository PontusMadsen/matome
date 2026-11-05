import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DownloadMeta, MediaType } from '@shared/types'

export const useAuth = () => useQuery({ queryKey: ['auth'], queryFn: () => window.matome.invoke('auth:state', undefined), refetchInterval: 2000 })
export const useServers = () => useQuery({ queryKey: ['servers'], queryFn: () => window.matome.invoke('servers:list', undefined), refetchInterval: 5000 })
export const useLibrary = (type: MediaType) =>
  useQuery({ queryKey: ['library', type], queryFn: () => window.matome.invoke('library:list', { type }), refetchInterval: 60000, staleTime: 30000, structuralSharing: false })

export function useRefresh() {
  const qc = useQueryClient()
  return async () => {
    await window.matome.invoke('servers:refresh', undefined)
    await qc.invalidateQueries()
  }
}

/** Continue Watching: the remembered list appears instantly, then a fresh one replaces it when the servers have answered. */
export function useContinue() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['continue'], queryFn: () => window.matome.invoke('home:continue', undefined), staleTime: Infinity })
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    let alive = true
    const run = async () => {
      setRefreshing(true)
      try {
        const fresh = await window.matome.invoke('home:continue:refresh', undefined)
        if (alive) qc.setQueryData(['continue'], fresh)
      } catch {
        /* keep showing what we have */
      } finally {
        if (alive) setRefreshing(false)
      }
    }
    void run()
    const t = setInterval(() => void run(), 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [qc])
  return { ...q, refreshing }
}
/** Titles removed this session: Plex's Discover service can keep listing them for a while, so they stay hidden until it stops. */
export const removedFromWatchlist = new Set<string>()
/** After marking something watched/unwatched: fetch Continue Watching again so finished titles leave it (and unfinished ones return). */
export function refreshContinue(qc: ReturnType<typeof useQueryClient>): Promise<void> {
  return window.matome.invoke('home:continue', undefined).then((list) => { qc.setQueryData(['continue'], list) }).then(() => window.matome.invoke('home:continue:refresh', undefined)).then((list) => { qc.setQueryData(['continue'], list) }).catch(() => undefined)
}

export const useWatchlist = () =>
  useQuery({ queryKey: ['watchlist'], queryFn: () => window.matome.invoke('watchlist:list', undefined), staleTime: 60_000, select: (xs) => xs.filter((x) => !removedFromWatchlist.has(x.ratingKey)) })
export const useSearch = (query: string) =>
  useQuery({ queryKey: ['search', query], queryFn: () => window.matome.invoke('search:query', { query }), enabled: query.trim().length > 0, placeholderData: (p) => p })

/** Start a download of the original file into the app's own Downloads folder. Errors are shown as a message. */
export function startDownload(o: { title: string; year?: number; meta: DownloadMeta; poster?: string; sources: { serverId: string; ratingKey: string; online?: boolean }[] }): void {
  void window.matome
    .invoke('download:start', { title: o.title, year: o.year, meta: o.meta, poster: o.poster, sources: o.sources.filter((x) => x.online !== false).map((x) => ({ serverId: x.serverId, ratingKey: x.ratingKey })) })
    .then(() => undefined)
    .catch((e: Error) => window.alert(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
}
export const useDownloads = () => useQuery({ queryKey: ['downloads'], queryFn: () => window.matome.invoke('download:list', undefined), refetchInterval: 1000 })

/** What a card may start when its play button is pressed; `next` = the next unwatched episode of a show. */
export interface AutoPlay { season?: number; episode?: number; next?: boolean }

/** Which servers refuse downloads (false), allow them (true) or are unknown (null). */
export const useDownloadServers = () => useQuery({ queryKey: ['download-servers'], queryFn: () => window.matome.invoke('download:servers', undefined), staleTime: 10 * 60_000 })
/** A download is offered unless every online copy sits on a server that is known to refuse. */
export const downloadable = <T extends { serverId: string; online?: boolean }>(sources: T[], perms: Record<string, boolean | null> | undefined): T[] =>
  sources.filter((x) => x.online !== false && perms?.[x.serverId] !== false)

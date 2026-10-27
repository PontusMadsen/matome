import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaType } from '@shared/types'

export const useAuth = () => useQuery({ queryKey: ['auth'], queryFn: () => window.flax.invoke('auth:state', undefined), refetchInterval: 2000 })
export const useServers = () => useQuery({ queryKey: ['servers'], queryFn: () => window.flax.invoke('servers:list', undefined), refetchInterval: 5000 })
export const useLibrary = (type: MediaType) =>
  useQuery({ queryKey: ['library', type], queryFn: () => window.flax.invoke('library:list', { type }), refetchInterval: 60000, staleTime: 30000, structuralSharing: false })

export function useRefresh() {
  const qc = useQueryClient()
  return async () => {
    await window.flax.invoke('servers:refresh', undefined)
    await qc.invalidateQueries()
  }
}

/** Continue Watching: the remembered list appears instantly, then a fresh one replaces it when the servers have answered. */
export function useContinue() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['continue'], queryFn: () => window.flax.invoke('home:continue', undefined), staleTime: Infinity })
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    let alive = true
    const run = async () => {
      setRefreshing(true)
      try {
        const fresh = await window.flax.invoke('home:continue:refresh', undefined)
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
export const useWatchlist = () =>
  useQuery({ queryKey: ['watchlist'], queryFn: () => window.flax.invoke('watchlist:list', undefined), staleTime: 60_000, select: (xs) => xs.filter((x) => !removedFromWatchlist.has(x.ratingKey)) })
export const useSearch = (query: string) =>
  useQuery({ queryKey: ['search', query], queryFn: () => window.flax.invoke('search:query', { query }), enabled: query.trim().length > 0, placeholderData: (p) => p })

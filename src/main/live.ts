import type { RawItem, ServerInfo } from '@shared/types'

/**
 * Cached items carry the connection state from sync time. Overlay the current state so offline
 * servers show as offline (and from-cache browsing works when nothing is reachable),
 * and drop servers the user excluded.
 */
export function applyLive(items: RawItem[], infos: ServerInfo[], excluded: string[]): RawItem[] {
  const live = new Map(infos.map((i) => [i.id, i]))
  const ex = new Set(excluded)
  return items
    .filter((i) => !ex.has(i.serverId))
    .map((i) => {
      const l = live.get(i.serverId)
      return l ? { ...i, online: l.online, connectionPref: l.connectionPref } : { ...i, online: false }
    })
}

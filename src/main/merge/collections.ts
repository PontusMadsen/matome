import { normTitle } from './index'
import type { CollectionInfo } from '@shared/types'

export interface CollectionPart {
  serverId: string
  title: string
  poster?: string
  /** merged-title ids */
  titleIds: string[]
}

/** Same-named collections on different servers become one; contents are unioned. */
export function mergeCollections(parts: CollectionPart[]): CollectionInfo[] {
  const by = new Map<string, CollectionInfo>()
  for (const p of parts) {
    const k = normTitle(p.title)
    const cur = by.get(k)
    if (!cur) by.set(k, { id: k, title: p.title, poster: p.poster, titleIds: [...new Set(p.titleIds)], servers: [p.serverId] })
    else {
      cur.poster ??= p.poster
      cur.titleIds = [...new Set([...cur.titleIds, ...p.titleIds])]
      if (!cur.servers.includes(p.serverId)) cur.servers.push(p.serverId)
    }
  }
  return [...by.values()].filter((c) => c.titleIds.length > 0).sort((a, b) => a.title.localeCompare(b.title))
}

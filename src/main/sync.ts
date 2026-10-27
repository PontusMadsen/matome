import { crawlSection, listSections } from './plex/library'
import type { ClientIdentity } from './plex/client'
import { getSync, libraryJson, pruneLibrary, setSync, upsertItems, type Db } from './db'
import type { ServerInfo } from '@shared/types'

export interface SyncServer {
  info: ServerInfo
  token: string
}

export interface ServerSyncStatus {
  serverId: string
  ok: boolean
  added: number
  error?: string
}

async function syncServer(db: Db, id: ClientIdentity, s: SyncServer): Promise<ServerSyncStatus> {
  if (!s.info.online) return { serverId: s.info.id, ok: false, added: 0, error: 'offline' }
  try {
    const sections = await listSections(id, s.info, s.token)
    const results = await Promise.all(
      sections.map(async (sec) => {
        const r = await crawlSection(id, s.info, s.token, sec)
        // Only write rows that actually changed (title, watch state, quality, ...).
        const cached = libraryJson(db, s.info.id, sec.title)
        const idx = r.items.map((_, i) => i).filter((i) => cached.get(r.items[i]!.ratingKey) !== JSON.stringify(r.items[i]))
        upsertItems(db, idx.map((i) => r.items[i]!), idx.map((i) => r.updatedAt[i]!))
        r.items = idx.map((i) => r.items[i]!)
        pruneLibrary(db, s.info.id, sec.title, r.allKeys)
        setSync(db, s.info.id, sec.title, Math.max(getSync(db, s.info.id, sec.title), ...r.updatedAt, 0))
        return r.items.length
      }),
    )
    return { serverId: s.info.id, ok: true, added: results.reduce((a, b) => a + b, 0) }
  } catch (e) {
    // One dead/slow server must not fail the rest (CONTRIBUTING.md, rule 4).
    return { serverId: s.info.id, ok: false, added: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Crawl every server in parallel into the cache; returns per-server status. */
export function syncAll(db: Db, id: ClientIdentity, servers: SyncServer[]): Promise<ServerSyncStatus[]> {
  return Promise.all(servers.map((s) => syncServer(db, id, s)))
}

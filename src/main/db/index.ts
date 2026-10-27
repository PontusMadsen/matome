import Database from 'better-sqlite3'
import type { RawItem } from '@shared/types'

export type Db = Database.Database

export function openDb(file: string): Db {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      server_id TEXT NOT NULL, rating_key TEXT NOT NULL, library TEXT NOT NULL,
      type TEXT NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (server_id, rating_key)
    );
    CREATE TABLE IF NOT EXISTS sync_log (
      server_id TEXT NOT NULL, library TEXT NOT NULL, synced_at INTEGER NOT NULL, max_updated_at INTEGER NOT NULL,
      PRIMARY KEY (server_id, library)
    );
  `)
  return db
}

export function upsertItems(db: Db, items: RawItem[], updatedAt: number[] | number = 0): void {
  const stmt = db.prepare(
    'INSERT INTO items (server_id, rating_key, library, type, json, updated_at) VALUES (?,?,?,?,?,?) ' +
      'ON CONFLICT(server_id, rating_key) DO UPDATE SET library=excluded.library, type=excluded.type, json=excluded.json, updated_at=excluded.updated_at',
  )
  db.transaction(() => {
    items.forEach((it, i) => {
      const u = Array.isArray(updatedAt) ? (updatedAt[i] ?? 0) : updatedAt
      stmt.run(it.serverId, it.ratingKey, it.library, it.type, JSON.stringify(it), u)
    })
  })()
}

/** Drop items of a library that are not in `keep` (removed on server). */
export function pruneLibrary(db: Db, serverId: string, library: string, keep: Set<string>): void {
  const rows = db.prepare('SELECT rating_key FROM items WHERE server_id=? AND library=?').all(serverId, library) as { rating_key: string }[]
  const del = db.prepare('DELETE FROM items WHERE server_id=? AND rating_key=?')
  db.transaction(() => {
    for (const r of rows) if (!keep.has(r.rating_key)) del.run(serverId, r.rating_key)
  })()
}

export function loadItems(db: Db, type?: 'movie' | 'show', excludeServers: string[] = []): RawItem[] {
  const rows = (type
    ? db.prepare('SELECT json FROM items WHERE type=?').all(type)
    : db.prepare('SELECT json FROM items').all()) as { json: string }[]
  const ex = new Set(excludeServers)
  return rows.map((r) => JSON.parse(r.json) as RawItem).filter((i) => !ex.has(i.serverId))
}

export function getSync(db: Db, serverId: string, library: string): number {
  const r = db.prepare('SELECT max_updated_at m FROM sync_log WHERE server_id=? AND library=?').get(serverId, library) as { m: number } | undefined
  return r?.m ?? 0
}

export function setSync(db: Db, serverId: string, library: string, maxUpdated: number): void {
  db.prepare(
    'INSERT INTO sync_log (server_id, library, synced_at, max_updated_at) VALUES (?,?,?,?) ' +
      'ON CONFLICT(server_id, library) DO UPDATE SET synced_at=excluded.synced_at, max_updated_at=excluded.max_updated_at',
  ).run(serverId, library, Date.now(), maxUpdated)
}

/** Items of one library keyed by ratingKey, as stored JSON strings (for change detection). */
export function libraryJson(db: Db, serverId: string, library: string): Map<string, string> {
  const rows = db.prepare('SELECT rating_key k, json j FROM items WHERE server_id=? AND library=?').all(serverId, library) as { k: string; j: string }[]
  return new Map(rows.map((r) => [r.k, r.j]))
}

export function getItem(db: Db, serverId: string, ratingKey: string): RawItem | null {
  const r = db.prepare('SELECT json FROM items WHERE server_id=? AND rating_key=?').get(serverId, ratingKey) as { json: string } | undefined
  return r ? (JSON.parse(r.json) as RawItem) : null
}

import { app } from 'electron'
import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Append-only diagnostics log (never contains tokens): ~/Library/Application Support/Fläx/flax.log */
export function log(msg: string): void {
  try {
    const f = join(app.getPath('userData'), 'flax.log')
    if (existsSync(f) && statSync(f).size > 1_000_000) renameSync(f, f + '.old')
    appendFileSync(f, `${new Date().toISOString()} ${msg}\n`)
  } catch {
    /* logging must never throw */
  }
}

/** Remove any token that slipped into a URL before logging. */
export const scrub = (s: string): string => s.replace(/X-Plex-Token=[^&\s]+/g, 'X-Plex-Token=***')

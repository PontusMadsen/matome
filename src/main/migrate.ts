import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** What carries over when the app was renamed from Flax to Matome (its data folder is named after the app). */
const CARRIED = ['client.json', 'settings.json', 'downloads.json', 'window.json', 'Downloads']

/** Downloaded files moved folders: point the saved index at the new location. */
export function rewriteIndexPaths(json: string, oldDir: string, newDir: string): string {
  try {
    const items = JSON.parse(json) as { path?: string }[]
    return JSON.stringify(items.map((i) => (typeof i.path === 'string' && i.path.startsWith(`${oldDir}/`) ? { ...i, path: `${newDir}${i.path.slice(oldDir.length)}` } : i)))
  } catch {
    return json
  }
}

/**
 * One time, at the first launch of Matome: bring over settings, window position, the client id and the downloaded files
 * from the old Flax data folder. Not carried over, on purpose: the saved Plex sign-in (it is encrypted with a Keychain key
 * that belongs to the old app name, so it cannot be read) and the cache (it holds image addresses in the old format).
 * The old folder is left in place. Returns the names that were moved.
 */
export function migrateFromFlax(appData: string): string[] {
  const oldDir = join(appData, 'Flax')
  const newDir = join(appData, 'Matome')
  // Chromium may already have created the new folder by now, so "first launch" means: none of our own files are there yet.
  if (!existsSync(oldDir) || existsSync(join(newDir, 'client.json'))) return []
  mkdirSync(newDir, { recursive: true })
  const moved: string[] = []
  for (const name of CARRIED) {
    const from = join(oldDir, name)
    const to = join(newDir, name)
    if (!existsSync(from) || existsSync(to)) continue
    try {
      renameSync(from, to)
    } catch {
      cpSync(from, to, { recursive: true }) // different volume
      rmSync(from, { recursive: true, force: true })
    }
    moved.push(name)
  }
  const index = join(newDir, 'downloads.json')
  if (moved.includes('downloads.json')) writeFileSync(index, rewriteIndexPaths(readFileSync(index, 'utf8'), oldDir, newDir))
  return moved
}

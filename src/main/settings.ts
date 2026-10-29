import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Settings } from '@shared/types'

export const DEFAULT_SETTINGS: Settings = { excludedServers: [], maxBitrateKbps: 0, useMpv: false, autoSkipIntro: false, playbackSpeed: 1, audioBoostPct: 0, subScale: 1, hideWatchedOnHome: false, skin: 'default' }

export function loadSettings(file: string): Settings {
  if (!existsSync(file)) return { ...DEFAULT_SETTINGS }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Settings> & { hideWatchedMovies?: boolean }
    const { hideWatchedMovies, ...rest } = raw
    if ((rest.skin as string) === 'macos') rest.skin = 'classicmac' // renamed together with the skin's redesign // renamed in 0.9.13 when the setting started covering shows too
    if (rest.skin !== undefined && rest.skin !== 'default' && rest.skin !== 'classicmac') rest.skin = 'default' // skins that were removed (Windows XP, Winamp)
    return { ...DEFAULT_SETTINGS, ...rest, hideWatchedOnHome: rest.hideWatchedOnHome ?? hideWatchedMovies ?? false }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(file: string, s: Settings): void {
  writeFileSync(file, JSON.stringify(s, null, 2))
}

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { Settings } from '@shared/types'

export const DEFAULT_SETTINGS: Settings = { excludedServers: [], maxBitrateKbps: 0, useMpv: false, autoSkipIntro: false, playbackSpeed: 1, audioBoostPct: 0, subScale: 1 }

export function loadSettings(file: string): Settings {
  if (!existsSync(file)) return { ...DEFAULT_SETTINGS }
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<Settings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(file: string, s: Settings): void {
  writeFileSync(file, JSON.stringify(s, null, 2))
}

import type { EpisodeSource, MergedEpisode } from '@shared/types'

export interface RawEpisode {
  source: EpisodeSource
  season: number
  episode: number
  title: string
  summary?: string
  thumb?: string
  durationMs?: number
  watched: boolean
  viewOffsetMs: number
}

/** Merge per-server episode lists by (season, episode); watched on any source wins; sources best-first. */
export function mergeEpisodes(all: RawEpisode[]): MergedEpisode[] {
  const by = new Map<string, MergedEpisode>()
  for (const e of all) {
    const k = `${e.season}x${e.episode}`
    const cur = by.get(k)
    if (!cur) {
      by.set(k, { season: e.season, episode: e.episode, title: e.title, summary: e.summary, thumb: e.thumb, durationMs: e.durationMs, watched: e.watched, viewOffsetMs: e.viewOffsetMs, sources: [e.source] })
    } else {
      cur.sources.push(e.source)
      cur.watched ||= e.watched
      cur.viewOffsetMs = Math.max(cur.viewOffsetMs, e.viewOffsetMs)
      cur.summary ??= e.summary
      cur.thumb ??= e.thumb
    }
  }
  for (const m of by.values()) m.sources.sort((a, b) => Number(b.online) - Number(a.online) || a.connectionPref - b.connectionPref)
  return [...by.values()].sort((a, b) => a.season - b.season || a.episode - b.episode)
}

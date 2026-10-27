import { normTitle } from './index'
import type { ContinueItem } from '@shared/types'

/** One entry per title: for shows, group episodes by show; keep the most recently viewed. */
export function mergeContinue(all: (ContinueItem & { group: string; year?: number })[]): ContinueItem[] {
  const best = new Map<string, ContinueItem>()
  for (const c of all) {
    const k = `${normTitle(c.group)}|${c.year ?? ''}`
    const cur = best.get(k)
    if (!cur || c.lastViewedAt > cur.lastViewedAt) {
      const { group: _g, year: _y, ...item } = c
      void _g
      void _y
      best.set(k, item)
    }
  }
  return [...best.values()].sort((a, b) => b.lastViewedAt - a.lastViewedAt)
}

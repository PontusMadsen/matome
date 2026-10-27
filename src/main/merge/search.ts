import { normTitle } from './index'
import type { DiscoverItem, MergedTitle } from '@shared/types'

/** Instant local search: prefix > word-prefix > substring on the normalized title. */
export function searchTitles(titles: MergedTitle[], query: string, limit = 60): MergedTitle[] {
  const q = normTitle(query)
  if (!q) return []
  const scored: { t: MergedTitle; score: number }[] = []
  for (const t of titles) {
    const n = normTitle(t.title)
    const score = n === q ? 0 : n.startsWith(q) ? 1 : n.split(' ').some((w) => w.startsWith(q)) ? 2 : n.includes(q) ? 3 : -1
    if (score >= 0) scored.push({ t, score })
  }
  return scored.sort((a, b) => a.score - b.score || b.t.addedAt - a.t.addedAt).slice(0, limit).map((s) => s.t)
}

/** Mark discover results as available when a local title matches (normTitle+year+type). */
export function annotateAvailability(items: DiscoverItem[], local: MergedTitle[]): DiscoverItem[] {
  const idx = new Map<string, string>()
  for (const t of local) idx.set(`${t.type}|${normTitle(t.title)}|${t.year ?? ''}`, t.id)
  return items.map((i) => ({ ...i, availableAs: idx.get(`${i.type}|${normTitle(i.title)}|${i.year ?? ''}`) }))
}

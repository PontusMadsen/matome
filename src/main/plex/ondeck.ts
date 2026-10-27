import { plexFetch, type ClientIdentity } from './client'
import type { ContinueItem, ServerInfo } from '@shared/types'

interface OD {
  ratingKey: string
  type: string
  title: string
  year?: number
  grandparentTitle?: string
  grandparentRatingKey?: string
  grandparentThumb?: string
  art?: string
  grandparentArt?: string
  parentIndex?: number
  index?: number
  thumb?: string
  viewOffset?: number
  duration?: number
  lastViewedAt?: number
  addedAt?: number
}

/** `/library/onDeck` — Continue Watching + next-up episodes (plexopedia: Get On Deck). */
export async function fetchOnDeck(id: ClientIdentity, s: ServerInfo, token: string): Promise<(ContinueItem & { group: string; year?: number; showKey?: string })[]> {
  const r = await plexFetch<{ MediaContainer: { Metadata?: OD[] } }>(id, `${s.baseUrl}/library/onDeck`, { token, timeoutMs: 5000 })
  return (r.MediaContainer.Metadata ?? []).map((m) => {
    const ep = m.type === 'episode'
    const thumb = ep ? (m.grandparentThumb ?? m.thumb) : m.thumb
    return {
      key: `${s.id}:${m.ratingKey}`,
      title: ep ? (m.grandparentTitle ?? m.title) : m.title,
      season: ep ? m.parentIndex : undefined,
      episode: ep ? m.index : undefined,
      subtitle: ep ? `S${m.parentIndex ?? 0}E${m.index ?? 0} · ${m.title}` : undefined,
      poster: thumb ? `flax-img://${s.id}${thumb}` : undefined,
      art: (ep ? (m.grandparentArt ?? m.art) : m.art) ? `flax-img://${s.id}${ep ? (m.grandparentArt ?? m.art) : m.art}` : undefined,
      serverId: s.id,
      ratingKey: m.ratingKey,
      viewOffsetMs: m.viewOffset ?? 0,
      durationMs: m.duration ?? 0,
      lastViewedAt: m.lastViewedAt ?? m.addedAt ?? 0,
      group: ep ? (m.grandparentTitle ?? m.title) : m.title,
      year: ep ? undefined : m.year,
      showKey: ep ? m.grandparentRatingKey : m.ratingKey,
    }
  })
}

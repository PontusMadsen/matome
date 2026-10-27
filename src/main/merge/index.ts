import type { Guids, MergedTitle, RawItem, Source } from '@shared/types'

const GUID_KEYS = ['tmdb', 'imdb', 'tvdb'] as const

/** Lowercase, strip diacritics/punctuation/leading article so "The Office (US)" ~ "office us". */
export function normTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
}

/** Parse Plex `Metadata.Guid[].id` values like "tmdb://603" into Guids. */
export function parseGuids(ids: string[]): Guids {
  const out: Guids = {}
  for (const id of ids) {
    const m = /^(tmdb|imdb|tvdb):\/\/(.+)$/.exec(id)
    if (m) out[m[1] as (typeof GUID_KEYS)[number]] = m[2]
  }
  return out
}

class UnionFind {
  private parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(i: number): number {
    let r = i
    while (this.parent[r] !== r) r = this.parent[r]!
    while (this.parent[i] !== r) {
      const next = this.parent[i]!
      this.parent[i] = r
      i = next
    }
    return r
  }
  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[rb] = ra
  }
}

function toSource(i: RawItem): Source {
  return {
    serverId: i.serverId,
    serverName: i.serverName,
    ratingKey: i.ratingKey,
    library: i.library,
    quality: i.quality ?? {},
    connectionPref: i.connectionPref ?? 1,
    online: i.online ?? true,
    addedAt: i.addedAt,
  }
}

const RES_RANK: Record<string, number> = { '4k': 4, '1080': 3, '720': 2, '480': 1, sd: 1 }
const resRank = (r?: string) => (r ? (RES_RANK[r.toLowerCase()] ?? 0) : 0)

/** Default-source order: online > local > resolution > bitrate. */
export function compareSources(a: Source, b: Source): number {
  return (
    Number(b.online) - Number(a.online) ||
    a.connectionPref - b.connectionPref ||
    resRank(b.quality.res) - resRank(a.quality.res) ||
    (b.quality.bitrate ?? 0) - (a.quality.bitrate ?? 0)
  )
}

/**
 * Group items by shared external GUID (union-find, so imdb-only + tmdb-only
 * entries still join through a third item), falling back to normTitle+year+type.
 * Never merges on title alone when years differ; items missing a year only
 * title-match other year-less items.
 */
export function mergeItems(items: RawItem[]): MergedTitle[] {
  const uf = new UnionFind(items.length)
  const seen = new Map<string, number>()
  const link = (key: string, idx: number) => {
    const prev = seen.get(key)
    if (prev === undefined) seen.set(key, idx)
    else uf.union(prev, idx)
  }

  items.forEach((it, idx) => {
    let hasGuid = false
    for (const k of GUID_KEYS) {
      const v = it.guids[k]
      if (v) {
        hasGuid = true
        link(`${it.type}|${k}|${v}`, idx)
      }
    }
    // Title+year fallback only for GUID-less items; GUID'd items never join by title.
    if (!hasGuid) link(`${it.type}|t|${normTitle(it.title)}|${it.year ?? ''}`, idx)
  })

  // Let GUID-less items attach to a GUID'd group with the same title+year.
  const titleKeyToGroup = new Map<string, number>()
  items.forEach((it, idx) => {
    if (Object.values(it.guids).some(Boolean)) {
      const k = `${it.type}|t|${normTitle(it.title)}|${it.year ?? ''}`
      if (!titleKeyToGroup.has(k)) titleKeyToGroup.set(k, idx)
    }
  })
  items.forEach((it, idx) => {
    if (!Object.values(it.guids).some(Boolean)) {
      const target = titleKeyToGroup.get(`${it.type}|t|${normTitle(it.title)}|${it.year ?? ''}`)
      if (target !== undefined) uf.union(target, idx)
    }
  })

  const groups = new Map<number, RawItem[]>()
  items.forEach((it, idx) => {
    const r = uf.find(idx)
    const g = groups.get(r)
    if (g) g.push(it)
    else groups.set(r, [it])
  })

  return [...groups.values()].map((g) => {
    const sources = g.map(toSource).sort(compareSources)
    const guids: Guids = {}
    for (const it of g) for (const k of GUID_KEYS) guids[k] ??= it.guids[k]
    const first = g[0]!
    const rank = new Map(sources.map((x, i) => [x.serverId, i]))
    const posters = [...g].sort((a, b) => (rank.get(a.serverId) ?? 99) - (rank.get(b.serverId) ?? 99)).flatMap((i) => (i.poster ? [i.poster] : []))
    const best = g.find((i) => i.poster && i.serverId === sources[0]!.serverId) ?? g.find((i) => i.poster)
    return {
      id: mergedId(first, guids),
      type: first.type,
      title: first.title,
      year: g.find((i) => i.year)?.year,
      guids,
      poster: best?.poster ?? posters[0],
      posters,
      art: [...g].sort((a, b) => (rank.get(a.serverId) ?? 99) - (rank.get(b.serverId) ?? 99)).find((i) => i.art)?.art,
      summary: g.find((i) => i.summary)?.summary,
      addedAt: Math.max(...g.map((i) => i.addedAt)),
      genres: [...new Set(g.flatMap((i) => i.genres ?? []))],
      rating: g.find((i) => i.rating !== undefined)?.rating,
      watched: g.some((i) => i.watched),
      // watched anywhere counts as watched: total = largest library, watched = most-watched server
      unwatchedCount:
        first.type === 'show'
          ? Math.max(0, Math.max(0, ...g.map((i) => i.leafCount ?? 0)) - Math.max(0, ...g.map((i) => i.viewedLeafCount ?? 0)))
          : 0,
      sources,
    }
  })
}

function mergedId(first: RawItem, guids: Guids): string {
  for (const k of GUID_KEYS) if (guids[k]) return `${first.type}:${k}:${guids[k]}`
  return `${first.type}:t:${normTitle(first.title)}:${first.year ?? ''}`
}

/** Remote poster URLs (Plex Discover points at several image hosts) are fetched by the main process, never by the page. */
export function isAllowedImageUrl(u: URL): boolean {
  if (u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  if (!h.includes('.') || h.endsWith('.local') || h.endsWith('.internal') || h === 'localhost') return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return false // IP literals
  return true
}

/** `flax-img://remote/<encoded https url>` for absolute poster URLs, `flax-img://discover/<path>` for Discover-relative ones. */
export function posterUrl(thumb: string | undefined): string | undefined {
  if (!thumb) return undefined
  if (/^https?:\/\//i.test(thumb)) return `flax-img://remote/${encodeURIComponent(thumb)}`
  if (thumb.startsWith('/')) return `flax-img://discover${thumb}`
  return undefined
}

export async function fetchRemoteImage(url: string, headers: Record<string, string> = {}): Promise<{ data: ArrayBuffer; type: string } | null> {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (!isAllowedImageUrl(u)) return null
  const res = await fetch(u, { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (!res?.ok) return null
  const type = res.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return null
  const data = await res.arrayBuffer()
  return data.byteLength > 8_000_000 ? null : { data, type }
}

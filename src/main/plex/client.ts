import { randomUUID } from 'node:crypto'

export const SERVER_TIMEOUT_MS = 8000

export interface ClientIdentity {
  clientId: string
  version: string
  platform: string
}

export function plexHeaders(id: ClientIdentity, token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'X-Plex-Client-Identifier': id.clientId,
    'X-Plex-Product': 'Flax',
    'X-Plex-Version': id.version,
    'X-Plex-Platform': id.platform,
  }
  if (token) h['X-Plex-Token'] = token
  return h
}

export const newClientId = (): string => randomUUID()

export class PlexError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export interface FetchOpts {
  token?: string
  method?: string
  timeoutMs?: number
  query?: Record<string, string>
  headers?: Record<string, string>
}

/** JSON fetch with per-request timeout. Never logs the token. */
export async function plexFetch<T>(id: ClientIdentity, url: string, opts: FetchOpts = {}): Promise<T> {
  const u = new URL(url)
  for (const [k, v] of Object.entries(opts.query ?? {})) u.searchParams.set(k, v)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? SERVER_TIMEOUT_MS)
  try {
    const res = await fetch(u, { method: opts.method ?? 'GET', headers: { ...plexHeaders(id, opts.token), ...opts.headers }, signal: ctrl.signal })
    if (!res.ok) throw new PlexError(`HTTP ${res.status} for ${u.origin}${u.pathname}`, res.status)
    return (await res.json()) as T
  } catch (e) {
    if (e instanceof PlexError) throw e
    const aborted = e instanceof Error && e.name === 'AbortError'
    throw new PlexError(aborted ? `timeout for ${u.origin}${u.pathname}` : `network error for ${u.origin}${u.pathname}`)
  } finally {
    clearTimeout(timer)
  }
}

import { resourcesUrl } from './endpoints'
import { plexFetch, type ClientIdentity } from './client'
import type { ServerInfo } from '@shared/types'

interface RawConnection {
  uri: string
  local: boolean
  relay: boolean
  protocol: string
}
interface RawResource {
  name: string
  clientIdentifier: string
  provides: string
  owned: boolean
  accessToken?: string
  connections: RawConnection[]
}

export interface ServerCreds extends ServerInfo {
  accessToken: string
  connections: RawConnection[]
}

export async function listServers(id: ClientIdentity, userToken: string): Promise<ServerCreds[]> {
  const res = await plexFetch<RawResource[]>(id, resourcesUrl(), { token: userToken })
  return res
    .filter((r) => r.provides.split(',').includes('server'))
    .map((r) => ({
      id: r.clientIdentifier,
      name: r.name,
      owned: r.owned,
      accessToken: r.accessToken ?? userToken,
      connections: r.connections,
      baseUrl: null,
      connectionPref: 1,
      online: false,
      latencyMs: null,
    }))
}

/** Local > remote > relay preference rank. */
const rank = (c: RawConnection) => (c.relay ? 2 : c.local ? 0 : 1)

const GRACE_MS = 600

/**
 * Probe all connections in parallel. Resolve shortly after the first success (waiting up to GRACE_MS
 * for a better-ranked one) instead of waiting for dead addresses to time out.
 */
export async function pickConnection(id: ClientIdentity, s: ServerCreds, timeoutMs = 5000): Promise<ServerInfo> {
  const { accessToken: _t, connections: _c, ...info } = s
  void _t
  void _c
  const sorted = [...s.connections].sort((a, b) => rank(a) - rank(b))
  type Ok = { c: RawConnection; ms: number }
  const oks: Ok[] = []
  return new Promise<ServerInfo>((resolve) => {
    let pending = sorted.length
    let done = false
    const finish = () => {
      if (done) return
      done = true
      const best = [...oks].sort((a, b) => rank(a.c) - rank(b.c) || a.ms - b.ms)[0]
      resolve(best ? { ...info, baseUrl: best.c.uri, connectionPref: rank(best.c), online: true, latencyMs: best.ms } : { ...info, online: false })
    }
    if (pending === 0) return finish()
    for (const c of sorted) {
      const t0 = Date.now()
      plexFetch(id, `${c.uri}/identity`, { token: s.accessToken, timeoutMs })
        .then(() => {
          oks.push({ c, ms: Date.now() - t0 })
          if (rank(c) === 0) finish()
          else setTimeout(finish, GRACE_MS)
        })
        .catch(() => undefined)
        .finally(() => {
          if (--pending === 0) finish()
        })
    }
  })
}

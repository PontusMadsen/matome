// Offline stand-in for plex.tv + two PMS servers, serving ./fixtures. Used by tests.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface MockOpts {
  /** serverId -> sections -> items (Plex "Metadata" objects) */
  servers: Record<string, { name: string; owned?: boolean; sections: { key: string; title: string; type: 'movie' | 'show'; items: unknown[] }[]; slowMs?: number; metadata?: Record<string, unknown>; children?: Record<string, unknown[]> }>
}

export async function startMockPlex(opts: MockOpts): Promise<{ url: string; server: Server; pinPolls: () => number }> {
  let polls = 0
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x')
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    if (req.method === 'POST' && u.pathname === '/api/v2/pins') return json(201, { id: 42, code: 'ABCD', authToken: null })
    if (u.pathname === '/api/v2/pins/42') return json(200, { id: 42, code: 'ABCD', authToken: ++polls >= 2 ? 'tok-user' : null })
    if (u.pathname === '/api/v2/resources')
      return json(
        200,
        Object.entries(opts.servers).map(([id, s]) => ({
          name: s.name,
          clientIdentifier: id,
          provides: 'server',
          owned: s.owned ?? true,
          accessToken: `tok-${id}`,
          connections: [
            { uri: `${base}/pms/${id}`, local: true, relay: false, protocol: 'http' },
            { uri: 'http://127.0.0.1:1/dead', local: false, relay: true, protocol: 'http' },
          ],
        })),
      )
    const m = /^\/pms\/([^/]+)(\/.*)$/.exec(u.pathname)
    const srv = m && opts.servers[m[1]!]
    if (!m || !srv) return json(404, {})
    const respond = () => {
      const path = m[2]!
      if (path === '/identity') return json(200, { MediaContainer: { machineIdentifier: m[1] } })
      if (path === '/library/sections')
        return json(200, { MediaContainer: { Directory: srv.sections.map((s) => ({ key: s.key, title: s.title, type: s.type })) } })
      const all = /^\/library\/sections\/([^/]+)\/all$/.exec(path)
      if (all) {
        const sec = srv.sections.find((s) => s.key === all[1])
        if (!sec) return json(404, {})
        const start = Number(req.headers['x-plex-container-start'] ?? u.searchParams.get('X-Plex-Container-Start') ?? 0)
        const size = Number(req.headers['x-plex-container-size'] ?? u.searchParams.get('X-Plex-Container-Size') ?? 50)
        return json(200, { MediaContainer: { totalSize: sec.items.length, offset: start, Metadata: sec.items.slice(start, start + size) } })
      }
      const kids = /^\/library\/metadata\/([^/]+)\/children$/.exec(path)
      if (kids) return json(200, { MediaContainer: { Metadata: srv.children?.[kids[1]!] ?? [] } })
      const md = /^\/library\/metadata\/([^/]+)$/.exec(path)
      if (md && srv.metadata?.[md[1]!]) return json(200, { MediaContainer: { Metadata: [srv.metadata[md[1]!]] } })
      return json(404, {})
    }
    if (srv.slowMs) setTimeout(respond, srv.slowMs)
    else respond()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, pinPolls: () => polls }
}

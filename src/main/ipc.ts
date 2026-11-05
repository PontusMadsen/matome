import { fetchRemoteImage } from './remote-image'
import { app, protocol, shell, type IpcMain } from 'electron'
import { createReadStream, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { Downloads, downloadFileName, parseRange, sniffImageType, uniquePath, videoType } from './downloads'
import type { IpcChannel, IpcChannels } from '@shared/ipc'
import { log, scrub } from './log'
import type { Service } from './service'
import type { Updater } from './updater'

type Handlers = { [C in IpcChannel]: (req: IpcChannels[C]['req']) => Promise<IpcChannels[C]['res']> | IpcChannels[C]['res'] }

export function registerIpc(ipc: IpcMain, svc: Service, upd: Updater): void {
  const downloads = new Downloads(join(app.getPath('userData'), 'downloads.json'))
  const handlers: Handlers = {
    'app:version': () => app.getVersion(),
    'auth:state': () => ({ signedIn: svc.signedIn, pending: svc.loginPending, error: svc.loginError ?? undefined }),
    'auth:start': () => svc.startLogin(),
    'auth:signOut': () => svc.signOut(),
    'servers:list': () => svc.servers(),
    'servers:refresh': () => svc.refresh(),
    'library:list': ({ type }) => svc.libraryForList(type),
    'settings:get': () => svc.getSettings(),
    'settings:set': (v) => svc.setSettings(v),
    'mpv:available': () => svc.mpvAvailable(),
    'mpv:play': (r) => svc.playMpv(r),
    'mpv:command': ({ args }) => svc.mpvCommand(args),
    'title:setWatched': ({ id, watched }) => svc.setWatched(id, watched),
    'title:addToWatchlist': ({ id }) => svc.addTitleToWatchlist(id),
    'play:resumePoint': ({ sources }) => svc.resumePoint(sources),
    'title:rate': ({ id, rating }) => svc.rate(id, rating),
    'collections:list': () => svc.collections(),
    'playlists:list': () => svc.playlists(),
    'playlists:write': (r) => svc.playlistWrite(r),
    'title:refresh': ({ id }) => svc.refreshTitle(id),
    'update:status': () => upd.getStatus(),
    'update:check': () => upd.check(),
    'update:apply': () => upd.apply(),
    // Instant from cache when there is one; otherwise wait for the first real answer.
    'home:continue': () => svc.cachedContinue() ?? svc.refreshContinue(),
    'home:continue:refresh': () => svc.refreshContinue(),
    'search:query': ({ query }) => svc.search(query),
    'watchlist:list': () => svc.watchlist(),
    'watchlist:set': ({ ratingKey, on }) => svc.setWatchlist(ratingKey, on),
    'title:detail': ({ id }) => svc.detail(id),
    'title:episodes': ({ id, season }) => svc.episodes(id, season),
    'play:streams': ({ serverId, ratingKey }) => svc.streams(serverId, ratingKey),
    'download:start': async ({ title, year, meta, poster, sources }) => {
      const src = await svc.downloadSource(sources)
      // No dialog: files live in the app's own folder, so cleaning out ~/Downloads can't take them along.
      const dest = uniquePath(join(app.getPath('userData'), 'Downloads'), downloadFileName(title, year, src.container))
      log(`download started: ${title}`)
      const id = downloads.start({ title, meta, url: src.url, headers: src.headers, dest })
      void saveHere(poster, `${dest}.poster`).then((ok) => { if (ok) downloads.markPoster(id) })
      return { id }
    },
    'download:servers': () => svc.downloadPermissions(),
    'download:list': () => downloads.list(),
    'download:cancel': ({ id }) => downloads.cancel(id),
    'download:clear': () => downloads.clear(),
    'download:remove': ({ id }) => downloads.remove(id),
    'download:open': async ({ id }) => { const p = downloads.pathOf(id); if (p) await shell.openPath(p) },
    'download:position': ({ id, ms }) => downloads.setPosition(id, ms),
    'download:reveal': ({ id }) => { const p = downloads.pathOf(id); if (p) shell.showItemInFolder(p) },
    'app:log': ({ msg }) => log(`renderer: ${scrub(msg)}`),
    'episode:setWatched': (r) => svc.setEpisodeWatched(r.titleId, r.sources, r.watched),
    'play:stop': ({ serverId, session }) => svc.stopSession(serverId, session),
    'subtitle:fetch': ({ serverId, streamId, key }) => svc.fetchSubtitle(serverId, streamId, key),
    'play:start': (r) => svc.playStart(r),
    'play:timeline': (r) => svc.timeline(r),
    'play:scrobble': (r) => svc.scrobble(r),
  }
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    ipc.handle(channel, (_e, req) => (handlers[channel] as (r: unknown) => unknown)(req))
  }
  protocol.handle('matome-stream', (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS' } })
    }
    const u = new URL(request.url)
    return svc.stream(u.hostname, u.pathname + u.search, request.headers.get('range'))
  })
  /** Save the image behind one of our matome-img URLs to `dest` (best effort; offline playback shows it as the cover). */
  const saveHere = async (url: string | undefined, dest: string): Promise<boolean> => {
    if (!url?.startsWith('matome-img://')) return false
    try {
      const u = new URL(url)
      const img =
        u.hostname === 'remote' ? await fetchRemoteImage(decodeURIComponent(u.pathname.slice(1)))
        : u.hostname === 'discover' ? await svc.discoverImage(u.pathname + u.search)
        : await svc.image(u.hostname, u.pathname + u.search)
      if (!img) return false
      writeFileSync(dest, new Uint8Array(img.data))
      return true
    } catch { return false }
  }
  // matome-local://file/<id> (video, with Range) and matome-local://poster/<id>: files from the Downloaded section
  protocol.handle('matome-local', (request) => {
    const u = new URL(request.url)
    const id = u.pathname.slice(1)
    const path = downloads.pathOf(id)
    if (!path || !existsSync(path)) return new Response(null, { status: 404 })
    if (u.hostname === 'poster') {
      const file = `${path}.poster`
      if (!existsSync(file)) return new Response(null, { status: 404 })
      const buf = readFileSync(file)
      return new Response(new Uint8Array(buf), { headers: { 'content-type': sniffImageType(buf), 'cache-control': 'public, max-age=86400' } })
    }
    const size = statSync(path).size
    const range = parseRange(request.headers.get('range'), size)
    const base = { 'content-type': videoType(path), 'accept-ranges': 'bytes' }
    if (range === 'invalid') return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } })
    const span = range ?? { start: 0, end: size - 1 }
    const body = size === 0 ? null : (Readable.toWeb(createReadStream(path, span)) as unknown as ReadableStream)
    return new Response(body, { status: range ? 206 : 200, headers: { ...base, 'content-length': String(size === 0 ? 0 : span.end - span.start + 1), ...(range ? { 'content-range': `bytes ${span.start}-${span.end}/${size}` } : {}) } })
  })
  // matome-img://<serverId>/<plex path> -> authenticated fetch in main
  protocol.handle('matome-img', async (request) => {
    const u = new URL(request.url)
    const img =
      u.hostname === 'remote' ? await fetchRemoteImage(decodeURIComponent(u.pathname.slice(1))).catch(() => null)
      : u.hostname === 'discover' ? await svc.discoverImage(u.pathname + u.search).catch(() => null)
      : await svc.image(u.hostname, u.pathname + u.search).catch(() => null)
    return img ? new Response(new Uint8Array(img.data), { headers: { 'content-type': img.type, 'cache-control': 'public, max-age=86400' } }) : new Response(null, { status: 404 })
  })
}

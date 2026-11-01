import { fetchRemoteImage } from './remote-image'
import { app, protocol, shell, type IpcMain } from 'electron'
import { join } from 'node:path'
import { Downloads, downloadFileName, uniquePath } from './downloads'
import type { IpcChannel, IpcChannels } from '@shared/ipc'
import { log, scrub } from './log'
import type { Service } from './service'
import type { Updater } from './updater'

type Handlers = { [C in IpcChannel]: (req: IpcChannels[C]['req']) => Promise<IpcChannels[C]['res']> | IpcChannels[C]['res'] }

export function registerIpc(ipc: IpcMain, svc: Service, upd: Updater): void {
  const downloads = new Downloads()
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
    'download:start': async ({ title, year, sources }) => {
      const src = await svc.downloadSource(sources)
      // No dialog: files live in the app's own folder, so cleaning out ~/Downloads can't take them along.
      const dest = uniquePath(join(app.getPath('userData'), 'Downloads'), downloadFileName(title, year, src.container))
      log(`download started: ${title}`)
      return { id: downloads.start({ title, url: src.url, headers: src.headers, dest }) }
    },
    'download:list': () => downloads.list(),
    'download:cancel': ({ id }) => downloads.cancel(id),
    'download:clear': () => downloads.clear(),
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
  protocol.handle('flax-stream', (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS' } })
    }
    const u = new URL(request.url)
    return svc.stream(u.hostname, u.pathname + u.search, request.headers.get('range'))
  })
  // flax-img://<serverId>/<plex path> -> authenticated fetch in main
  protocol.handle('flax-img', async (request) => {
    const u = new URL(request.url)
    const img =
      u.hostname === 'remote' ? await fetchRemoteImage(decodeURIComponent(u.pathname.slice(1))).catch(() => null)
      : u.hostname === 'discover' ? await svc.discoverImage(u.pathname + u.search).catch(() => null)
      : await svc.image(u.hostname, u.pathname + u.search).catch(() => null)
    return img ? new Response(new Uint8Array(img.data), { headers: { 'content-type': img.type, 'cache-control': 'public, max-age=86400' } }) : new Response(null, { status: 404 })
  })
}

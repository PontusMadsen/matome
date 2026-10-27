import type { PlayableStreams, UpdateStatus, CollectionInfo, PlaylistInfo, MpvRequest, Settings, ContinueItem, DiscoverItem, MediaType, MergedEpisode, MergedTitle, PlayRequest, ServerInfo, TitleDetail } from './types'

export interface SyncStatus {
  serverId: string
  ok: boolean
  added: number
  error?: string
}

// Typed IPC contract. Renderer never sees the Plex token.
export interface IpcChannels {
  'app:version': { req: void; res: string }
  'auth:state': { req: void; res: { signedIn: boolean } }
  'auth:start': { req: void; res: { authUrl: string } }
  'auth:signOut': { req: void; res: void }
  'servers:list': { req: void; res: ServerInfo[] }
  'servers:refresh': { req: void; res: SyncStatus[] }
  'title:detail': { req: { id: string }; res: TitleDetail }
  'title:episodes': { req: { id: string; season: number }; res: MergedEpisode[] }
  'play:start': { req: PlayRequest; res: { url: string; session: string } }
  'play:timeline': { req: { serverId: string; ratingKey: string; state: 'playing' | 'paused' | 'stopped'; timeMs: number; durationMs: number }; res: void }
  'play:scrobble': { req: { serverId: string; ratingKey: string }; res: void }
  'home:continue': { req: void; res: ContinueItem[] }
  'home:continue:refresh': { req: void; res: ContinueItem[] }
  'search:query': { req: { query: string }; res: { local: MergedTitle[]; discover: DiscoverItem[] } }
  'watchlist:list': { req: void; res: DiscoverItem[] }
  'watchlist:set': { req: { ratingKey: string; on: boolean }; res: void }
  'settings:get': { req: void; res: Settings }
  'settings:set': { req: Settings; res: Settings }
  'mpv:available': { req: void; res: boolean }
  'mpv:play': { req: MpvRequest; res: void }
  'mpv:command': { req: { args: unknown[] }; res: unknown }
  'title:setWatched': { req: { id: string; watched: boolean }; res: void }
  'title:rate': { req: { id: string; rating: number | null }; res: void }
  'collections:list': { req: void; res: CollectionInfo[] }
  'playlists:list': { req: void; res: PlaylistInfo[] }
  'playlists:write': { req: { serverId: string; titleId: string; playlistRatingKey?: string; newTitle?: string }; res: void }
  'title:refresh': { req: { id: string }; res: void }
  'update:status': { req: void; res: UpdateStatus }
  'update:check': { req: void; res: UpdateStatus }
  'update:apply': { req: void; res: void }
  'play:streams': { req: { serverId: string; ratingKey: string }; res: PlayableStreams }
  'app:log': { req: { msg: string }; res: void }
  'episode:setWatched': { req: { titleId: string; sources: { serverId: string; ratingKey: string }[]; watched: boolean }; res: void }
  'play:stop': { req: { serverId: string; session: string }; res: void }
  'subtitle:fetch': { req: { serverId: string; streamId: number; key?: string }; res: { text: string; via: string } }
  'library:list': { req: { type: MediaType }; res: MergedTitle[] }
}

export type IpcChannel = keyof IpcChannels

export interface FlaxApi {
  invoke<C extends IpcChannel>(channel: C, req: IpcChannels[C]['req']): Promise<IpcChannels[C]['res']>
}

declare global {
  interface Window {
    flax: FlaxApi
  }
}

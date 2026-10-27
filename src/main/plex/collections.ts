// Playlists & collections. Docs: https://developer.plex.tv/pms/ (Playlists, Collections),
// https://www.plexopedia.com/plex-media-server/api/playlists/
import { plexFetch, type ClientIdentity } from './client'
import type { ServerInfo } from '@shared/types'

interface M { ratingKey: string; title: string; thumb?: string; composite?: string; leafCount?: number; childCount?: number; type?: string }
type C = { MediaContainer: { Metadata?: M[] } }

export interface RawCollection { serverId: string; ratingKey: string; title: string; poster?: string }
export interface RawPlaylist { serverId: string; serverName: string; ratingKey: string; title: string; count: number }

export const playlistsPath = () => '/playlists?playlistType=video'
export const playlistItemsPath = (rk: string) => `/playlists/${rk}/items`
export const sectionCollectionsPath = (sectionKey: string) => `/library/sections/${sectionKey}/collections`
export const collectionChildrenPath = (rk: string) => `/library/collections/${rk}/children`

/** `server://<machineId>/com.plexapp.plugins.library/library/metadata/<key>` — item URI used by playlist writes. */
export const itemUri = (machineId: string, ratingKey: string) =>
  `server://${machineId}/com.plexapp.plugins.library/library/metadata/${ratingKey}`
export const createPlaylistPath = (title: string, uri: string) =>
  `/playlists?${new URLSearchParams({ type: 'video', title, smart: '0', uri })}`
export const addToPlaylistPath = (rk: string, uri: string) => `/playlists/${rk}/items?${new URLSearchParams({ uri })}`
export const removeFromPlaylistPath = (rk: string, playlistItemId: string) => `/playlists/${rk}/items/${playlistItemId}`

export async function fetchPlaylists(id: ClientIdentity, s: ServerInfo, token: string): Promise<RawPlaylist[]> {
  const r = await plexFetch<C>(id, s.baseUrl + playlistsPath(), { token })
  return (r.MediaContainer.Metadata ?? []).map((m) => ({ serverId: s.id, serverName: s.name, ratingKey: m.ratingKey, title: m.title, count: m.leafCount ?? 0 }))
}

export async function fetchItemKeys(id: ClientIdentity, s: ServerInfo, token: string, path: string): Promise<string[]> {
  const r = await plexFetch<C>(id, s.baseUrl + path, { token })
  return (r.MediaContainer.Metadata ?? []).map((m) => m.ratingKey)
}

export async function fetchCollections(id: ClientIdentity, s: ServerInfo, token: string, sectionKey: string): Promise<RawCollection[]> {
  const r = await plexFetch<C>(id, s.baseUrl + sectionCollectionsPath(sectionKey), { token })
  return (r.MediaContainer.Metadata ?? []).map((m) => ({ serverId: s.id, ratingKey: m.ratingKey, title: m.title, poster: m.thumb ? `flax-img://${s.id}${m.thumb}` : m.composite ? `flax-img://${s.id}${m.composite}` : undefined }))
}

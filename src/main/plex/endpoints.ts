// All Plex endpoints live here. Docs: https://developer.plex.tv/pms/ ,
// https://www.plexopedia.com/plex-media-server/api/
/** Mutable so tests / mock-plex can redirect (env FLESK_PLEX_TV, FLESK_DISCOVER). */
export const hosts = {
  plexTv: process.env['FLESK_PLEX_TV'] ?? 'https://plex.tv',
  discover: process.env['FLESK_DISCOVER'] ?? 'https://discover.provider.plex.tv',
}

export const pinsUrl = (strong = true) => `${hosts.plexTv}/api/v2/pins?strong=${strong}`
export const pinUrl = (id: number) => `${hosts.plexTv}/api/v2/pins/${id}`
export const resourcesUrl = () => `${hosts.plexTv}/api/v2/resources?includeHttps=1&includeRelay=1`
export const authAppUrl = (clientId: string, code: string, product = 'Fläx') =>
  `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientId)}&code=${encodeURIComponent(code)}&context%5Bdevice%5D%5Bproduct%5D=${product}`

export const sectionsPath = () => '/library/sections'
export const sectionAllPath = (id: string, type: 1 | 2) => `/library/sections/${id}/all?includeGuids=1&type=${type}`
export const recentlyAddedPath = (id: string) => `/library/sections/${id}/recentlyAdded`
export const childrenPath = (ratingKey: string) => `/library/metadata/${ratingKey}/children`

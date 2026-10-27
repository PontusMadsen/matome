// Transcode/timeline/scrobble paths. Source: https://developer.plex.tv/pms/ and
// https://www.plexopedia.com/plex-media-server/api/ (universal transcoder, timeline, scrobble).
export interface TranscodeOpts {
  offsetMs: number
  session: string
  /** how subtitles reach the player: burned into the video, off, or the server default */
  subtitles?: 'auto' | 'burn' | 'none'
  maxBitrateKbps?: number
  /** minimal parameter set, for servers that reject the fuller request with a bare 400 */
  compat?: boolean
}

export function transcodeStartPath(ratingKey: string, o: TranscodeOpts): string {
  const q = new URLSearchParams({
    path: `/library/metadata/${ratingKey}`,
    protocol: 'hls',
    mediaIndex: '0',
    partIndex: '0',
    offset: String(Math.floor(o.offsetMs / 1000)),
    session: o.session,
    directPlay: '0',
    // With a bitrate cap the server transcodes anyway; asking for a full transcode avoids copying audio
    // (DTS/E-AC3/TrueHD) that a browser can't decode. Uncapped streams may direct-stream.
    directStream: o.maxBitrateKbps ? '0' : '1',
    fastSeek: '1',
    'X-Plex-Session-Identifier': o.session,
  })
  q.set('subtitles', o.subtitles ?? 'auto')
  if (o.maxBitrateKbps) q.set('maxVideoBitrate', String(o.maxBitrateKbps))
  if (o.compat) {
    for (const k of ['subtitles', 'fastSeek', 'X-Plex-Session-Identifier']) q.delete(k)
    q.set('directStream', '1')
  }
  return `/video/:/transcode/universal/start.m3u8?${q}`
}

/** Ends a transcode session so the server frees the slot (shared servers often cap simultaneous transcodes). */
export const stopSessionPath = (session: string) => `/video/:/transcode/universal/stop?session=${encodeURIComponent(session)}`

export function timelinePath(ratingKey: string, state: 'playing' | 'paused' | 'stopped', timeMs: number, durationMs: number): string {
  const q = new URLSearchParams({
    ratingKey,
    key: `/library/metadata/${ratingKey}`,
    state,
    time: String(Math.floor(timeMs)),
    duration: String(Math.floor(durationMs)),
  })
  return `/:/timeline?${q}`
}

export const scrobblePath = (ratingKey: string) => `/:/scrobble?key=${ratingKey}&identifier=com.plexapp.plugins.library`
export const unscrobblePath = (ratingKey: string) => `/:/unscrobble?key=${ratingKey}&identifier=com.plexapp.plugins.library`

/** rating is 0-10 (Plex stars x2); omit via 'unrate' semantics by sending -1 is not supported, so clear with rating= (empty). */
export const ratePath = (ratingKey: string, rating: number | null) =>
  `/:/rate?key=${ratingKey}&identifier=com.plexapp.plugins.library&rating=${rating === null ? '' : Math.max(0, Math.min(10, Math.round(rating)))}`

/**
 * Pick the audio / subtitle stream of a media part (id 0 = no subtitles). The transcoder takes its stream choice
 * from this selection, NOT from query parameters: passing `subtitleStreamID` to start.m3u8 is rejected with HTTP 400.
 * Same call python-plexapi uses (Part.setSelectedAudioStream / setSelectedSubtitleStream).
 */
export function selectStreamsPath(partId: number, audioStreamId?: number, subtitleStreamId?: number): string {
  const q = new URLSearchParams({ allParts: '1' })
  if (audioStreamId !== undefined) q.set('audioStreamID', String(audioStreamId))
  if (subtitleStreamId !== undefined) q.set('subtitleStreamID', String(subtitleStreamId))
  return `/library/parts/${partId}?${q}`
}

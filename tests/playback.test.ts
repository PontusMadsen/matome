import { expect, test } from 'vitest'
import { transcodeStartPath, timelinePath } from '../src/main/plex/playback'
import { mergeEpisodes } from '../src/main/merge/episodes'

test('transcode path carries offset, session, stream choices', () => {
  const p = transcodeStartPath('42', { offsetMs: 90_500, session: 's1', subtitles: 'burn' })
  expect(p).toContain('/video/:/transcode/universal/start.m3u8?')
  const q = new URLSearchParams(p.split('?')[1])
  expect(q.get('path')).toBe('/library/metadata/42')
  expect(q.get('offset')).toBe('90')
  expect(q.get('subtitles')).toBe('burn')
  // regression: Plex answers HTTP 400 if stream ids are put on the transcode URL
  expect(q.has('audioStreamID')).toBe(false)
  expect(q.has('subtitleStreamID')).toBe(false)
  expect(q.get('protocol')).toBe('hls')
})

test('a bitrate cap forces a full transcode; uncapped may direct stream', () => {
  const q = (kbps?: number) => new URLSearchParams(transcodeStartPath('1', { offsetMs: 0, session: 's', maxBitrateKbps: kbps }).split('?')[1])
  expect(q(2000).get('directStream')).toBe('0')
  expect(q(2000).get('maxVideoBitrate')).toBe('2000')
  expect(q(undefined).get('directStream')).toBe('1')
  expect(q(undefined).get('maxVideoBitrate')).toBeNull()
})

test('timeline path', () => {
  const q = new URLSearchParams(timelinePath('42', 'playing', 1500.7, 9000).split('?')[1])
  expect(q.get('time')).toBe('1500')
  expect(q.get('state')).toBe('playing')
})

const src = (serverId: string, online = true, pref = 0) => ({ serverId, serverName: serverId, ratingKey: '1', online, connectionPref: pref })
test('episodes merge by season/episode across servers', () => {
  const m = mergeEpisodes([
    { source: src('a', false), season: 1, episode: 2, title: 'Two', watched: false, viewOffsetMs: 0 },
    { source: src('b'), season: 1, episode: 2, title: 'Two', watched: true, viewOffsetMs: 500 },
    { source: src('a', false), season: 1, episode: 1, title: 'One', watched: false, viewOffsetMs: 0 },
  ])
  expect(m.map((e) => e.episode)).toEqual([1, 2])
  expect(m[1]!.sources.map((s) => s.serverId)).toEqual(['b', 'a'])
  expect(m[1]!.watched).toBe(true)
  expect(m[1]!.viewOffsetMs).toBe(500)
})

import { ratePath } from '../src/main/plex/playback'
test('rate path clamps 0-10', () => {
  expect(ratePath('1', 7.4)).toContain('rating=7')
  expect(ratePath('1', 99)).toContain('rating=10')
  expect(ratePath('1', null)).toMatch(/rating=$/)
})

import { selectStreamsPath } from '../src/main/plex/playback'
test('stream selection is a PUT on the media part, 0 turns subtitles off', () => {
  expect(selectStreamsPath(55, 3, 9)).toBe('/library/parts/55?allParts=1&audioStreamID=3&subtitleStreamID=9')
  expect(selectStreamsPath(55, undefined, 0)).toBe('/library/parts/55?allParts=1&subtitleStreamID=0')
})

import { stopSessionPath } from '../src/main/plex/playback'
test('compat mode sends only the minimal parameters', () => {
  const q = new URLSearchParams(transcodeStartPath('42', { offsetMs: 0, session: 's', maxBitrateKbps: 2000, subtitles: 'burn', compat: true }).split('?')[1])
  expect(q.has('subtitles')).toBe(false)
  expect(q.has('fastSeek')).toBe(false)
  expect(q.has('X-Plex-Session-Identifier')).toBe(false)
  expect(q.get('directStream')).toBe('1')
  expect(q.get('maxVideoBitrate')).toBe('2000')
})

test('stop path', () => {
  expect(stopSessionPath('a b')).toBe('/video/:/transcode/universal/stop?session=a%20b')
})

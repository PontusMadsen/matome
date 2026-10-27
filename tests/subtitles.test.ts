import { describe, expect, test } from 'vitest'
import { isTextSubtitle, looksLikeSubtitles, parseSubtitles, parseTime, subtitleCandidates } from '../src/shared/subtitles'

describe('parseSubtitles', () => {
  test('SRT with commas, BOM, CRLF, multi-line and markup', () => {
    const srt = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>there</i>\r\nsecond line\r\n\r\n2\r\n00:01:02,250 --> 00:01:04,000\r\n<font color="red">Bye</font>\r\n'
    expect(parseSubtitles(srt)).toEqual([
      { start: 1, end: 3.5, text: 'Hello <i>there</i>\nsecond line' },
      { start: 62.25, end: 64, text: 'Bye' },
    ])
  })
  test('WebVTT with header, cue ids and settings', () => {
    const vtt = 'WEBVTT\n\nintro\n00:00:00.500 --> 00:00:02.000 align:start\nFirst\n\n01:00:00.000 --> 01:00:01.000\nHour in\n'
    const c = parseSubtitles(vtt)
    expect(c).toHaveLength(2)
    expect(c[0]).toEqual({ start: 0.5, end: 2, text: 'First' })
    expect(c[1]!.start).toBe(3600)
  })
  test('ASS/SSA: dialogue fields, override tags, \\N, commas in text, sorted by time', () => {
    const ass = `[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:10.00,0:00:12.50,Default,,0,0,0,,{\\an8}Later, line\\Nbreak\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Early\n`
    expect(parseSubtitles(ass)).toEqual([
      { start: 1, end: 2, text: 'Early' },
      { start: 10, end: 12.5, text: 'Later, line\nbreak' },
    ])
  })
  test('garbage and HTML error pages produce nothing', () => {
    expect(parseSubtitles('<html><body>Bad Request</body></html>')).toEqual([])
    expect(looksLikeSubtitles('<html><head><title>Bad Request</title></head></html>')).toBe(false)
    expect(looksLikeSubtitles('1\n00:00:01,000 --> 00:00:02,000\nHi')).toBe(true)
    expect(looksLikeSubtitles('[Script Info]\nTitle: x')).toBe(true)
  })
})

test('parseTime', () => {
  expect(parseTime('00:00:01,500')).toBe(1.5)
  expect(parseTime('1:02.5')).toBe(62.5)
  expect(parseTime('nope')).toBeNaN()
})

test('text vs image subtitle codecs', () => {
  expect(isTextSubtitle('srt')).toBe(true)
  expect(isTextSubtitle('ass')).toBe(true)
  expect(isTextSubtitle('pgs')).toBe(false)
  expect(isTextSubtitle('dvd_subtitle')).toBe(false)
  expect(isTextSubtitle('unknown', 'srt')).toBe(true)
})

test('download candidates: external key first, de-duplicated', () => {
  expect(subtitleCandidates(7, '/library/streams/7')[0]).toBe('/library/streams/7')
  expect(subtitleCandidates(7, '/library/streams/7')).toHaveLength(4)
  expect(subtitleCandidates(7)[0]).toBe('/library/streams/7')
})

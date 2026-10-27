// Text subtitle parsing (WebVTT / SRT / ASS-SSA) for in-player rendering. Pure, shared by main and renderer.
export interface Cue {
  start: number
  end: number
  text: string
}

/** Codecs Plex reports for subtitles that are plain text (can be drawn by the player). Image formats (pgs, vobsub, dvd_subtitle) cannot. */
export const TEXT_SUBTITLE_CODECS = ['srt', 'subrip', 'ass', 'ssa', 'webvtt', 'vtt', 'mov_text', 'text', 'tx3g']
export const isTextSubtitle = (codec?: string, format?: string): boolean => {
  const c = (format || codec || '').toLowerCase()
  return TEXT_SUBTITLE_CODECS.includes(c)
}

/** Does this look like a subtitle file (and not an HTML error page)? */
export function looksLikeSubtitles(text: string): boolean {
  const t = text.slice(0, 4000)
  if (/^\s*<(!doctype|html)/i.test(t)) return false
  return /-->/.test(t) || /\[Script Info\]/i.test(t) || /^Dialogue:/m.test(text.slice(0, 20000))
}

const clean = (s: string) =>
  s
    .replace(/\{\\[^}]*\}/g, '') // ASS override tags
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/<(?!\/?(i|b|u)\b)[^>]*>/gi, '') // strip markup except <i> <b> <u>
    .trim()

/** "00:01:02,500" | "01:02.500" | "1:02:03.5" -> seconds */
export function parseTime(t: string): number {
  const m = /^(?:(\d+):)?(\d+):(\d+)(?:[.,](\d+))?$/.exec(t.trim())
  if (!m) return NaN
  const frac = m[4] ? Number(`0.${m[4]}`) : 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac
}

function parseSrtVtt(text: string): Cue[] {
  const cues: Cue[] = []
  for (const block of text.replace(/\r/g, '').replace(/^\uFEFF/, '').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const [a, b] = lines[i]!.split('-->')
    const start = parseTime(a!)
    const end = parseTime((b ?? '').trim().split(/\s+/)[0] ?? '')
    const body = clean(lines.slice(i + 1).join('\n'))
    if (Number.isFinite(start) && Number.isFinite(end) && body) cues.push({ start, end, text: body })
  }
  return cues
}

function parseAss(text: string): Cue[] {
  const cues: Cue[] = []
  let fields: string[] | null = null
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    if (/^Format:/i.test(line) && fields === null) {
      const f = line.slice(7).split(',').map((x) => x.trim().toLowerCase())
      if (f.includes('start') && f.includes('text')) fields = f
    } else if (/^Dialogue:/i.test(line)) {
      const f = fields ?? ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text']
      const parts = line.slice(9).split(',')
      const textAt = f.indexOf('text')
      const body = parts.slice(textAt).join(',') // the text itself may contain commas
      const start = parseTime(parts[f.indexOf('start')] ?? '')
      const end = parseTime(parts[f.indexOf('end')] ?? '')
      const t = clean(body)
      if (Number.isFinite(start) && Number.isFinite(end) && t) cues.push({ start, end, text: t })
    }
  }
  return cues.sort((x, y) => x.start - y.start)
}

export function parseSubtitles(text: string): Cue[] {
  return /\[Script Info\]|^Dialogue:/im.test(text.slice(0, 20000)) && !/-->/.test(text.slice(0, 2000)) ? parseAss(text) : parseSrtVtt(text)
}

/** Download paths to try, in order: external file key, then the stream endpoint in a few conversions. */
export function subtitleCandidates(streamId: number, key?: string): string[] {
  const base = `/library/streams/${streamId}`
  const list = [...(key ? [key] : []), base, `${base}?encoding=utf-8&format=vtt`, `${base}?encoding=utf-8&format=srt`, `${base}?encoding=utf-8`]
  return [...new Set(list)]
}

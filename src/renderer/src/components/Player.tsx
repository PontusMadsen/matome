import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { QUALITY_OPTIONS, type Marker, type Stream } from '@shared/types'
import { Icon } from './Icon'
import { detectBase, safeStartMs } from './playbackBase'
import { isTextSubtitle, parseSubtitles, type Cue } from '@shared/subtitles'
import s from './Player.module.css'

export interface PlayTarget {
  title: string
  durationMs?: number
  /** candidate sources in failover order */
  sources: { serverId: string; serverName: string; ratingKey: string }[]
  startMs: number
  audio: Stream[]
  subtitles: Stream[]
  onNext?: () => void
  /** called after every server's copy has been marked watched */
  onWatched?: () => void
}

const fmt = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function Player({ target, onClose }: { target: PlayTarget; onClose: () => void }) {
  const qc = useQueryClient()
  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<Hls | null>(null)
  const [srcIdx, setSrcIdx] = useState(0)
  const [audioTracks, setAudioTracks] = useState<Stream[]>(target.audio)
  const [subTracks, setSubTracks] = useState<Stream[]>(target.subtitles)
  const [markers, setMarkers] = useState<Marker[]>([])
  const [autoSkip, setAutoSkip] = useState(false)
  const skipped = useRef(new Set<number>())
  const [audioId, setAudioId] = useState<number | undefined>(target.audio.find((a) => a.default)?.id)
  /** undefined = untouched (server default); 0 = the user switched subtitles off */
  const [subId, setSubId] = useState<number | undefined>()
  const [partId, setPartId] = useState<number | undefined>()
  /** Plex servers differ in what they accept: start with 'burn', fall back to 'auto', then to no subtitles. */
  const [subMode, setSubMode] = useState<'burn' | 'auto'>('burn')
  const [note, setNote] = useState('')
  /** Subtitle track drawn by the player itself (text formats); no stream restart involved. */
  const [textSubId, setTextSubId] = useState<number | undefined>()
  /** Subtitle tracks the stream itself carries (HLS #EXT-X-MEDIA TYPE=SUBTITLES). */
  const [feedSubs, setFeedSubs] = useState<{ index: number; name: string }[]>([])
  const [feedSub, setFeedSub] = useState<number | undefined>()
  const feedSubRef = useRef<number | undefined>(undefined)
  const cues = useRef<Cue[]>([])
  const track = useRef<TextTrack | null>(null)
  /** Vertical position (% of video height) of the subtitle's bottom edge: above the controls while they show. */
  const lineRef = useRef(80)
  /** Last resort when the server rejects the full request with a bare 400: minimal parameters. */
  const [compat, setCompat] = useState(false)
  /** Resolves once the previous transcode session has been stopped on the server (shared servers often allow only one at a time). */
  const stopPending = useRef<Promise<unknown>>(Promise.resolve())
  /** One transcode session id for this whole playback (see PlayRequest.session). */
  const sessionId = useRef(crypto.randomUUID())
  /** Server currently holding our stream, so it can be released when we leave it. */
  const liveServer = useRef<string | null>(null)
  /** Consecutive 'server busy' (bare 400) retries for the current request; reset once playing. */
  const busyRetries = useRef(0)
  const [error, setError] = useState('')
  const [rate, setRate] = useState(1)
  // Transcode cap: starts from the Settings default, changeable mid-playback (resumes at the same position).
  const [kbps, setKbps] = useState<number | null>(null)
  useEffect(() => { void window.flax.invoke('settings:get', undefined).then((p) => { setKbps((cur) => cur ?? p.maxBitrateKbps); setAutoSkip(p.autoSkipIntro) }) }, [])
  /** Where the next transcode session should start (absolute ms). */
  const resumeMs = useRef(target.startMs)
  /** Absolute ms that video.currentTime=0 corresponds to: Plex starts the stream at the requested offset. */
  const base = useRef(0)
  const [restart, setRestart] = useState(0)
  // Before the first request, ask every server for the furthest saved position: the copy we stream from may not be the one that has our progress.
  const [startReady, setStartReady] = useState(false)
  useEffect(() => {
    let off = false
    void window.flax.invoke('play:resumePoint', { sources: target.sources.map((x) => ({ serverId: x.serverId, ratingKey: x.ratingKey })) })
      .then((ms) => { if (!off && ms > resumeMs.current) { resumeMs.current = ms; lastPos.current = ms; setCur(safeStartMs(ms, target.durationMs ?? 0)) } })
      .catch(() => undefined)
      .finally(() => { if (!off) setStartReady(true) })
    return () => { off = true }
  }, [])
  const src = target.sources[srcIdx]

  // UI state
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(safeStartMs(target.startMs, target.durationMs ?? 0))
  const [bufEnd, setBufEnd] = useState(0)
  const [waiting, setWaiting] = useState(true)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [flash, setFlash] = useState<{ n: number; icon: 'play' | 'pause' } | null>(null)

  const durMs = target.durationMs ?? (video.current && Number.isFinite(video.current.duration) ? base.current + video.current.duration * 1000 : 0)
  /** Absolute playback position in ms. */
  const lastPos = useRef(target.startMs)
  /** Falls back to the last known position: on unmount React has already detached the <video> ref, and reading 0 there would report the stream's start offset as the stop position. */
  const abs = useCallback(() => {
    const el = video.current
    if (el) lastPos.current = base.current + el.currentTime * 1000
    return lastPos.current
  }, [])

  /** (Re)draw the chosen subtitle: cue times are on the original timeline; the video clock is shifted by `base`. */
  const applyCues = useCallback(() => {
    const el = video.current
    if (!el) return
    track.current ??= el.addTextTrack('subtitles', 'Flax', 'und')
    const t = track.current
    while (t.cues && t.cues.length) t.removeCue(t.cues[0]!)
    const shift = base.current / 1000
    for (const c of cues.current) {
      if (c.end - shift <= 0) continue
      const cue = new VTTCue(Math.max(0, c.start - shift), c.end - shift, c.text)
      cue.snapToLines = false // position by percentage so we can keep clear of the controls
      cue.lineAlign = 'end'
      cue.line = lineRef.current
      t.addCue(cue)
    }
    t.mode = cues.current.length ? 'showing' : 'disabled'
  }, [])
  const applyCuesRef = useRef(applyCues)
  applyCuesRef.current = applyCues

  // Episodes (and failover sources) don't carry track lists up front: load them for the current source.
  useEffect(() => {
    if (!src) return
    let cancelled = false
    void window.flax.invoke('play:streams', { serverId: src.serverId, ratingKey: src.ratingKey }).then((st) => {
      if (cancelled) return
      setAudioTracks(st.audio)
      setSubTracks(st.subtitles)
      setMarkers(st.markers)
      setPartId(st.partId)
      // undefined = server default; avoids restarting the transcode
      setAudioId((c) => (c !== undefined && st.audio.some((a) => a.id === c) ? c : undefined))
      setSubId((c) => (c !== undefined && (c === 0 || st.subtitles.some((a) => a.id === c)) ? c : undefined))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [src])

  const report = useCallback(
    (state: 'playing' | 'paused' | 'stopped') => {
      if (!src) return Promise.resolve()
      return window.flax.invoke('play:timeline', { serverId: src.serverId, ratingKey: src.ratingKey, state, timeMs: abs(), durationMs: durMs }).catch(() => undefined)
    },
    [src, abs, durMs],
  )

  // (Re)start a transcode session whenever source / track / quality / seek-out-of-range changes.
  useEffect(() => {
    if (!src || !video.current || kbps === null || !startReady) return // wait for the Settings default and the resume point so we start once
    const el = video.current
    let cancelled = false
    const offset = Math.floor(safeStartMs(resumeMs.current, target.durationMs ?? 0) / 1000) * 1000
    base.current = offset
    // Once the stream is actually playing, learn whether its clock includes the offset (see detectBase).
    // Unless a stream track was picked from the menu, nothing the stream turns on by itself (default/forced tracks) may show.
    const logged = new Set<string>()
    const quiet = () => {
      if (feedSubRef.current !== undefined) return
      for (let i = 0; i < el.textTracks.length; i++) {
        const t = el.textTracks[i]!
        if (t === track.current || t.mode === 'disabled') continue
        t.mode = 'disabled'
        const k = `${t.kind}/${t.label || '-'}/${t.language || '-'}`
        if (!logged.has(k)) { logged.add(k); void window.flax.invoke('app:log', { msg: `subtitles: switched off a track the stream turned on by itself (${k})` }) }
      }
    }
    el.textTracks.addEventListener('addtrack', quiet)
    const onPlaying = () => { base.current = detectBase(offset, el.currentTime); busyRetries.current = 0; applyCuesRef.current(); quiet() }
    el.addEventListener('playing', onPlaying, { once: true })
    setWaiting(true)
    if (liveServer.current && liveServer.current !== src.serverId) {
      const old = liveServer.current
      stopPending.current = window.flax.invoke('play:stop', { serverId: old, session: sessionId.current }).then(() => new Promise((r) => setTimeout(r, 500)))
    }
    liveServer.current = src.serverId
    void stopPending.current
      .then(() => (cancelled ? Promise.reject(new Error('cancelled')) : window.flax.invoke('play:start', { serverId: src.serverId, ratingKey: src.ratingKey, offsetMs: offset, partId, audioStreamId: audioId, subtitleStreamId: subId, subtitleMode: subMode, compat, session: sessionId.current, maxBitrateKbps: kbps })))
      .then(({ url }) => {
        if (cancelled) return
        setError('')
        if (Hls.isSupported()) {
          // Friends' servers transcode in real time over a long link: buffer further ahead so short hiccups don't freeze playback.
          const h = new Hls({ maxBufferLength: 60, maxMaxBufferLength: 180, backBufferLength: 30, enableWorker: true })
          hls.current = h
          h.on(Hls.Events.ERROR, (_e, d) => {
            const detail = `${d.type}/${d.details}${d.response?.code ? ` HTTP ${d.response.code}` : ''}`
            void window.flax.invoke('app:log', { msg: `hls ${d.fatal ? 'FATAL' : 'error'} ${src.serverName}: ${detail}` })
            if (!d.fatal) return
            // A bare 400 usually means the server is still busy with the previous stream: wait and retry as-is first.
            if (d.details === 'manifestLoadError' && busyRetries.current < 2) {
              busyRetries.current += 1
              resumeMs.current = base.current + el.currentTime * 1000
              void window.flax.invoke('app:log', { msg: `server busy? retry ${busyRetries.current}/2 on ${src.serverName}` })
              setTimeout(() => setRestart((n) => n + 1), 1500)
              return
            }
            // A subtitle the server won't deliver must not kill playback: burn -> auto -> off, at the same position.
            if (subId && d.details === 'manifestLoadError') {
              resumeMs.current = base.current + el.currentTime * 1000
              if (subMode === 'burn') { setSubMode('auto'); return }
              setSubId(0); setSubMode('burn'); setNote("That subtitle track couldn't be loaded by the server; continuing without subtitles.")
              return
            }
            // Bare 400 with nothing exotic selected: retry once with the minimal parameter set before giving up on this server.
            if (!compat && d.details === 'manifestLoadError') {
              resumeMs.current = base.current + el.currentTime * 1000
              void window.flax.invoke('app:log', { msg: `retrying ${src.serverName} with minimal parameters` })
              setCompat(true)
              return
            }
            // Failover: try the next source automatically, resuming at the true position.
            resumeMs.current = base.current + el.currentTime * 1000
            if (srcIdx + 1 < target.sources.length) setSrcIdx((i) => i + 1)
            else setError(`Playback failed on ${src.serverName}: ${detail}`)
          })
          h.subtitleDisplay = false // only turned on when a stream track is picked in the menu
          h.subtitleTrack = -1
          h.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, d) => {
            quiet()
            setFeedSubs(d.subtitleTracks.map((t, i) => ({ index: i, name: t.name || t.lang || `Track ${i + 1}` })))
            setFeedSub((cur) => (cur !== undefined && cur < d.subtitleTracks.length ? cur : undefined))
          })
          // keep cues clear of the controls, like our own subtitles
          h.on(Hls.Events.CUES_PARSED, (_e, d) => {
            for (const c of d.cues as VTTCue[]) { c.snapToLines = false; c.lineAlign = 'end'; c.line = lineRef.current }
          })
          h.loadSource(url)
          h.attachMedia(el)
          h.on(Hls.Events.MANIFEST_PARSED, () => { el.playbackRate = rate; void el.play() })
          h.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => { h.subtitleTrack = feedSubRef.current ?? -1; if (feedSubRef.current === undefined) h.subtitleDisplay = false; quiet() })
          h.on(Hls.Events.SUBTITLE_TRACK_SWITCH, quiet)
        } else {
          el.src = url
          void el.play()
        }
      })
      .catch(() => undefined) // superseded before it started
    return () => {
      cancelled = true
      el.removeEventListener('playing', onPlaying)
      el.textTracks.removeEventListener('addtrack', quiet)

      hls.current?.destroy()
      hls.current = null
    }
  }, [src, audioId, subId, subMode, compat, kbps, srcIdx, restart, startReady, target.sources.length])

  // Closing the player (or moving to another episode, which remounts it) frees the server's stream slot.
  useEffect(() => {
    const id = sessionId.current
    return () => {
      const sv = liveServer.current
      if (sv) void window.flax.invoke('play:stop', { serverId: sv, session: id })
    }
  }, [])

  // progress reporting every 10s + stop on close
  useEffect(() => {
    const t = setInterval(() => report('playing'), 10_000)
    return () => {
      clearInterval(t)
      // The server now knows where we stopped: refresh everything that shows or resumes from that position.
      void report('stopped').then(() => {
        void qc.invalidateQueries({ queryKey: ['detail'] })
        void qc.invalidateQueries({ queryKey: ['episodes'] })
        void window.flax.invoke('home:continue:refresh', undefined).then((fresh) => qc.setQueryData(['continue'], fresh)).catch(() => undefined)
      })
    }
  }, [report])

  /** Restart the session at the current true position (track / quality / source switch). */
  const keepPlace = () => { resumeMs.current = abs() }
  /** Pick a subtitle from the menu: '' = off, 'f:<n>' = a track carried by the stream, 'p:<id>' = a track from the server's metadata. */
  const chooseSubtitle = async (value: string) => {
    setNote('')
    // always start from "nothing showing"
    cues.current = []
    setTextSubId(undefined)
    applyCues()
    feedSubRef.current = undefined
    setFeedSub(undefined)
    if (hls.current) hls.current.subtitleTrack = -1

    if (value.startsWith('f:')) {
      const i = Number(value.slice(2))
      feedSubRef.current = i
      setFeedSub(i)
      if (hls.current) { hls.current.subtitleDisplay = true; hls.current.subtitleTrack = i }
      if (subId) changeTrack('sub', undefined)
      return
    }
    const id = value.startsWith('p:') ? Number(value.slice(2)) : undefined
    const t = id === undefined ? undefined : subTracks.find((x) => x.id === id)
    if (t && src && isTextSubtitle(t.codec, t.format)) {
      try {
        const { text } = await window.flax.invoke('subtitle:fetch', { serverId: src.serverId, streamId: t.id, key: t.key })
        const parsed = parseSubtitles(text)
        if (parsed.length === 0) throw new Error('no cues')
        cues.current = parsed
        setTextSubId(t.id)
        applyCues()
        if (subId) changeTrack('sub', undefined) // stop burning a previous server-side choice
        return
      } catch (e) {
        void window.flax.invoke('app:log', { msg: `client-side subtitles failed (${e instanceof Error ? e.message : String(e)}); using the server` })
        setNote('Showing subtitles through the server instead…')
      }
    }
    if (id !== undefined || subId) changeTrack('sub', id) // 'off' needs a server round-trip only if the server was showing one
  }

  const changeTrack = (kind: 'audio' | 'sub', id: number | undefined) => {
    keepPlace()
    setNote('')
    if (kind === 'audio') setAudioId(id)
    else { setSubId(id ?? 0); setSubMode('burn') } // 'off' is an explicit choice, distinct from never having touched it
  }

  /** Seek to an absolute position: in-range seeks are instant; out-of-range restarts the stream there. */
  const seek = useCallback((absMs: number) => {
    const v = video.current
    if (!v) return
    const to = Math.max(0, durMs ? Math.min(absMs, durMs - 500) : absMs)
    const rel = (to - base.current) / 1000
    // A restarted stream only contains media from its start offset on; seeking outside what it holds needs a new session.
    const start = v.seekable.length ? v.seekable.start(0) : 0
    const end = v.seekable.length ? v.seekable.end(v.seekable.length - 1) : 0
    if (rel >= start - 0.5 && rel <= end) v.currentTime = rel
    else { resumeMs.current = to; setCur(to); setRestart((n) => n + 1) }
  }, [durMs])

  // Mark watched on ALL servers that have this item: once at 90% and on end.
  const marked = useRef(false)
  const markAll = useCallback(() => {
    if (marked.current) return
    marked.current = true
    void Promise.all(target.sources.map((x) => window.flax.invoke('play:scrobble', { serverId: x.serverId, ratingKey: x.ratingKey }))).then(() => target.onWatched?.())
  }, [target])
  const onTime = () => {
    const v = video.current
    if (!v) return
    const a = abs()
    setCur(a)
    if (v.buffered.length) setBufEnd(base.current + v.buffered.end(v.buffered.length - 1) * 1000)
    if (durMs > 0 && a / durMs >= 0.9) markAll()
    const m = markers.find((x) => a >= x.startMs && a < x.endMs - 500)
    if (m && m.type === 'intro' && autoSkip && !skipped.current.has(m.startMs)) { skipped.current.add(m.startMs); seek(m.endMs) }
  }
  const onEnded = () => {
    markAll()
    // Next episode if there is one; otherwise (a movie, or the last episode) go back to the screen we came from.
    if (target.onNext) target.onNext()
    else onClose()
  }

  const toggle = useCallback(() => {
    const v = video.current
    if (!v) return
    if (v.paused) { void v.play(); setFlash({ n: Date.now(), icon: 'play' }) }
    else { v.pause(); setFlash({ n: Date.now(), icon: 'pause' }) }
  }, [])
  const fullscreen = useCallback(() => {
    void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())
  }, [])
  const setVol = (v: number) => { setVolume(v); setMuted(v === 0); if (video.current) { video.current.volume = v; video.current.muted = v === 0 } }
  const toggleMute = () => { const m = !muted; setMuted(m); if (video.current) video.current.muted = m }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('select')) return
      const step = e.shiftKey ? 30_000 : 10_000
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(abs() + step) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(abs() - step) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setVol(Math.min(1, volume + 0.1)) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setVol(Math.max(0, volume - 0.1)) }
      else if (e.key === 'm') toggleMute()
      else if (e.key === 'f') fullscreen()
      else if (e.key === 'Escape' && !document.fullscreenElement) onClose()
    }
    window.addEventListener('keydown', onKey)
    // Media keys
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: target.title })
      navigator.mediaSession.setActionHandler('play', () => void video.current?.play())
      navigator.mediaSession.setActionHandler('pause', () => video.current?.pause())
      navigator.mediaSession.setActionHandler('nexttrack', () => target.onNext?.())
    }
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, target, toggle, seek, abs, volume, fullscreen, muted])

  // Controls fade out after 3s without pointer movement, but only while playing.
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 3000) }
    wake()
    window.addEventListener('pointermove', wake)
    window.addEventListener('keydown', wake)
    return () => { window.removeEventListener('pointermove', wake); window.removeEventListener('keydown', wake); clearTimeout(t) }
  }, [])
  const hideUi = idle && playing && !error
  useEffect(() => {
    lineRef.current = hideUi ? 93 : 79
    const t = track.current
    if (t?.cues) for (let i = 0; i < t.cues.length; i++) (t.cues[i] as VTTCue).line = lineRef.current
  }, [hideUi])

  // Scrubber (pointer events: works with pen, mouse and touch)
  const scrub = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ x: number; ms: number } | null>(null)
  const [dragMs, setDragMs] = useState<number | null>(null)
  const posToMs = (clientX: number) => {
    const r = scrub.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * durMs
  }
  const onScrubDown = (e: React.PointerEvent) => {
    if (!durMs) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragMs(posToMs(e.clientX))
  }
  const onScrubMove = (e: React.PointerEvent) => {
    const r = scrub.current!.getBoundingClientRect()
    setHover({ x: e.clientX - r.left, ms: posToMs(e.clientX) })
    if (dragMs !== null) setDragMs(posToMs(e.clientX))
  }
  const onScrubUp = (e: React.PointerEvent) => {
    if (dragMs === null) return
    seek(posToMs(e.clientX))
    setDragMs(null)
  }
  const shown = Math.min(dragMs ?? cur, durMs || Infinity)
  const activeMarker = markers.find((x) => cur >= x.startMs && cur < x.endMs - 500)
  const pct = (ms: number) => (durMs ? `${Math.max(0, Math.min(100, (ms / durMs) * 100))}%` : '0%')

  return (
    <div data-player className={`${s.overlay} ${hideUi ? s.hidecursor : ''}`}>
      <video
        ref={video}
        className={s.video}
        autoPlay
        onClick={toggle}
        onDoubleClick={fullscreen}
        onEnded={onEnded}
        onTimeUpdate={onTime}
        onPlay={() => { setPlaying(true); report('playing') }}
        onPause={() => { setPlaying(false); report('paused') }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
      />
      {waiting && !error && <div className={s.spin} />}
      {flash && <div key={flash.n} className={s.flash}><Icon name={flash.icon} size={36} fill /></div>}

      {activeMarker && (
        <button className={`${s.skip} ${hideUi ? s.skipLow : ''}`} onClick={() => (activeMarker.type === 'credits' && target.onNext ? target.onNext() : seek(activeMarker.endMs))}>
          {activeMarker.type === 'intro' ? 'Skip intro' : target.onNext ? 'Next episode' : 'Skip credits'}
          <Icon name="next" size={16} fill />
        </button>
      )}

      <div className={`${s.top} ${hideUi ? s.hide : ''}`}>
        <button className="btn" onClick={onClose}><Icon name="back" size={16} /> Back</button>
        <span className={s.title}>{target.title}</span>
        {error && <span className={s.err}>{error}</span>}
        {!error && note && <span className={s.err} style={{ color: 'var(--text)' }}>{note}</span>}
        {target.sources.length > 1 && (
          <select className={s.pill} value={srcIdx} onChange={(e) => { keepPlace(); setSrcIdx(Number(e.target.value)) }} title="Source" aria-label="Source">
            {target.sources.map((x, i) => <option key={x.serverId} value={i}>{x.serverName}</option>)}
          </select>
        )}
      </div>

      <div className={`${s.bottom} ${hideUi ? s.hide : ''}`}>
        <div
          ref={scrub}
          className={`${s.scrub} ${dragMs !== null ? s.scrubbing : ''}`}
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerLeave={() => setHover(null)}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(durMs / 1000)}
          aria-valuenow={Math.round(shown / 1000)}
        >
          <div className={s.track}>
            <div className={s.buf} style={{ width: pct(bufEnd) }} />
            <div className={s.fill} style={{ width: pct(shown) }} />
            <div className={s.knob} style={{ left: pct(shown) }} />
          </div>
          {hover && durMs > 0 && <div className={s.tip} style={{ left: hover.x }}>{fmt(dragMs ?? hover.ms)}</div>}
        </div>
        <div className={s.row}>
          <button className={`${s.ctl} ${s.play}`} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={22} fill /></button>
          <button className={s.ctl} onClick={() => seek(abs() - 10_000)} aria-label="Back 10 seconds" title="Back 10s"><Icon name="rew" size={22} /></button>
          <button className={s.ctl} onClick={() => seek(abs() + 10_000)} aria-label="Forward 10 seconds" title="Forward 10s"><Icon name="fwd" size={22} /></button>
          {target.onNext && <button className={s.ctl} onClick={target.onNext} aria-label="Next episode" title="Next episode"><Icon name="next" size={20} fill /></button>}
          <span className={s.time}>{fmt(shown)} / {durMs ? fmt(durMs) : '--:--'}</span>
          <div className={s.grow} />
          <div className={s.vol}>
            <button className={s.ctl} onClick={toggleMute} aria-label="Mute"><Icon name={muted || volume === 0 ? 'mute' : 'volume'} size={20} /></button>
            <input className={s.volslider} type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume} onChange={(e) => setVol(Number(e.target.value))} aria-label="Volume" />
          </div>
          {audioTracks.length > 1 && (
            <select className={`${s.pill} btn`} value={audioId ?? audioTracks.find((a) => a.default)?.id ?? ''} onChange={(e) => changeTrack('audio', Number(e.target.value))} title="Audio" aria-label="Audio">
              {audioTracks.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          )}
          {subTracks.length + feedSubs.length > 0 && (
            <select
              className={`${s.pill} btn`}
              value={feedSub !== undefined ? `f:${feedSub}` : textSubId !== undefined ? `p:${textSubId}` : subId ? `p:${subId}` : ''}
              onChange={(e) => void chooseSubtitle(e.target.value)}
              title="Subtitles"
              aria-label="Subtitles"
            >
              <option value="">Subtitles off</option>
              {subTracks.length > 0 && (
                <optgroup label={feedSubs.length ? 'Server tracks' : 'Subtitles'}>
                  {subTracks.map((a) => <option key={`p${a.id}`} value={`p:${a.id}`}>{a.title}</option>)}
                </optgroup>
              )}
              {feedSubs.length > 0 && (
                <optgroup label="In this stream">
                  {feedSubs.map((a) => <option key={`f${a.index}`} value={`f:${a.index}`}>{a.name}</option>)}
                </optgroup>
              )}
            </select>
          )}
          <select className={`${s.pill} btn`} value={kbps ?? 0} onChange={(e) => { keepPlace(); setKbps(Number(e.target.value)) }} title="Quality" aria-label="Quality">
            {QUALITY_OPTIONS.map((q) => <option key={q.kbps} value={q.kbps}>{q.label}</option>)}
          </select>
          <select className={`${s.pill} btn`} value={rate} onChange={(e) => { const r = Number(e.target.value); setRate(r); if (video.current) video.current.playbackRate = r }} title="Speed" aria-label="Speed">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
          <button className={s.ctl} onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen (f)"><Icon name="full" size={20} /></button>
        </div>
      </div>
    </div>
  )
}

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MpvClient } from './client'
import { markerAt } from './markers'
import type { Marker, Settings } from '@shared/types'

const CANDIDATES = ['/opt/homebrew/bin/mpv', '/usr/local/bin/mpv', '/usr/bin/mpv', '/Applications/mpv.app/Contents/MacOS/mpv']

export function findMpv(custom?: string): string | null {
  if (custom && existsSync(custom)) return custom
  return CANDIDATES.find(existsSync) ?? null
}

export interface MpvPlay {
  url: string
  /** Sent as per-file HTTP headers over IPC so the token never appears in the process list. */
  headers: string[]
  startMs: number
  title: string
  markers: Marker[]
  onTimeline: (state: 'playing' | 'paused' | 'stopped', timeMs: number) => void
  onEnded: () => void
}

/** Settings subset used for mpv playback. */
export type MpvPrefs = Pick<Settings, 'mpvPath' | 'autoSkipIntro' | 'playbackSpeed' | 'audioBoostPct' | 'subScale'>

/** mpv flags for hardware decode, HDR passthrough-friendly output and subtitle styling. */
export function mpvArgs(sock: string, p: MpvPrefs): string[] {
  return [
    `--input-ipc-server=${sock}`,
    '--force-window=yes',
    '--idle=no',
    '--hwdec=auto-safe',
    '--keep-open=no',
    `--speed=${p.playbackSpeed}`,
    `--volume=${Math.min(130, 100 + p.audioBoostPct)}`,
    `--sub-scale=${p.subScale}`,
    '--sub-auto=fuzzy',
    '--audio-spdif=ac3,eac3,dts,dts-hd,truehd',
  ]
}

export class MpvSession {
  private proc: ChildProcess | null = null
  private client = new MpvClient()

  async start(bin: string, prefs: MpvPrefs, p: MpvPlay): Promise<void> {
    const sock = join(tmpdir(), `flax-mpv-${process.pid}-${Date.now()}.sock`)
    this.proc = spawn(bin, mpvArgs(sock, prefs), { stdio: 'ignore' })
    this.proc.once('exit', () => this.client.close())
    await this.client.connect(sock)
    let pos = 0
    let paused = false
    let skipped = new Set<string>()
    this.client.on('property', (name: string, v: unknown) => {
      if (name === 'time-pos' && typeof v === 'number') {
        pos = v * 1000
        const m = markerAt(p.markers, pos)
        if (m && prefs.autoSkipIntro && m.type === 'intro' && !skipped.has(`${m.startMs}`)) {
          skipped.add(`${m.startMs}`)
          void this.client.command('seek', m.endMs / 1000, 'absolute')
        }
      } else if (name === 'pause') {
        paused = Boolean(v)
        p.onTimeline(paused ? 'paused' : 'playing', pos)
      }
    })
    this.client.on('end-file', (e: { reason?: string }) => {
      p.onTimeline('stopped', pos)
      if (e.reason === 'eof') p.onEnded()
    })
    await this.client.observe('time-pos')
    await this.client.observe('pause')
    const opts = [`start=${p.startMs / 1000}`, `force-media-title=${p.title}`, `http-header-fields=${p.headers.join(',')}`]
    await this.client.command('loadfile', p.url, 'replace', -1, opts.join(','))
    const timer = setInterval(() => p.onTimeline(paused ? 'paused' : 'playing', pos), 10_000)
    this.proc.once('exit', () => { clearInterval(timer); skipped = new Set() })
  }

  command(...args: unknown[]): Promise<unknown> {
    return this.client.command(...args)
  }

  stop(): void {
    this.client.close()
    this.proc?.kill()
    this.proc = null
  }
}

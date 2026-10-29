/**
 * Plex's transcoder can number the restarted HLS stream from 0 (the stream begins at `offset`) or keep the
 * original timeline (video.currentTime already includes the offset). Which one we get depends on the server, so
 * decide from the first playing position instead of assuming.
 *
 * Returns the absolute time (ms) that video.currentTime === 0 corresponds to.
 */
export function detectBase(offsetMs: number, currentTimeSec: number): number {
  if (offsetMs > 10_000 && currentTimeSec * 1000 > offsetMs - 5_000) return 0 // timeline is continuous
  return offsetMs
}

/** A resume point at (or past) the end of the file would make Plex answer HTTP 400; start over instead. */
export function safeStartMs(startMs: number, durationMs: number): number {
  if (!Number.isFinite(startMs) || startMs < 0) return 0
  if (durationMs > 0 && startMs > durationMs - 15_000) return 0
  return startMs
}

/**
 * The server dropped our transcode session (paused for long, server restarted or busy): its segments now answer 404/410.
 * Starting a new session at the current position brings playback back.
 */
export function isDeadSession(d: { type?: string; details?: string; response?: { code?: number } }): boolean {
  return d.type === 'networkError' && (d.details === 'fragLoadError' || d.details === 'levelLoadError') && (d.response?.code === 404 || d.response?.code === 410)
}

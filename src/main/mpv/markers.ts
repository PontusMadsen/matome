import type { Marker } from '@shared/types'

/** Marker (intro/credits) covering the position, if any. Plex markers: `Marker[{type,startTimeOffset,endTimeOffset}]`. */
export function markerAt(markers: Marker[], posMs: number): Marker | undefined {
  return markers.find((m) => posMs >= m.startMs && posMs < m.endMs - 500)
}

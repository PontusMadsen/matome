/** How an episode's air date is shown: the date itself, plus a tag for episodes from the last two weeks (or not aired yet). */
export interface AirLabel { text: string; tag?: 'New' | 'Upcoming' }

const DAY = 86_400_000

export function airLabel(airDate: string | undefined, now: Date = new Date(), locale?: string): AirLabel | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(airDate ?? '')
  if (!m) return null
  const aired = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) // local midnight: the date has no time zone
  if (Number.isNaN(aired.getTime())) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - aired.getTime()) / DAY)
  return { text: aired.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }), tag: days < 0 ? 'Upcoming' : days <= 14 ? 'New' : undefined }
}

import type { SkinId } from '@shared/types'

export const SKINS: { id: SkinId; name: string; blurb: string; swatch: [string, string, string] }[] = [
  { id: 'default', name: 'Default', blurb: 'Dark, dense, teal.', swatch: ['#0E1116', '#1B212B', '#2DD4BF'] },
  { id: 'xp', name: 'Windows XP', blurb: 'Luna blue, beige and bevels.', swatch: ['#ECE9D8', '#6375D6', '#245EDC'] },
  { id: 'classicmac', name: 'Classic Mac', blurb: '1984: black, white and dithered shadows.', swatch: ['#FFFFFF', '#000000', '#8A8A8A'] },
  { id: 'winamp', name: 'Winamp', blurb: 'Brushed metal and green LEDs.', swatch: ['#232432', '#3A3D52', '#00E000'] },
]

const KEY = 'flax-skin'

/** Sets the skin on <html>; remembered locally so the next launch paints with it from the first frame. */
export function applySkin(id: string | undefined): void {
  if (id === 'macos') id = 'classicmac' // the first draft of this skin was glassy modern macOS; it became the 1984 look
  const skin = SKINS.some((s) => s.id === id) ? (id as SkinId) : 'default'
  document.documentElement.dataset.skin = skin
  try { localStorage.setItem(KEY, skin) } catch { /* private mode etc. */ }
}

export function applyRememberedSkin(): void {
  try {
    const k = localStorage.getItem(KEY)
    document.documentElement.dataset.skin = k === 'macos' ? 'classicmac' : (k ?? 'default')
  } catch { /* default look */ }
}

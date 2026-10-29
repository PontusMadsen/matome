import type { SkinId } from '@shared/types'

export const SKINS: { id: SkinId; name: string; blurb: string; swatch: [string, string, string] }[] = [
  { id: 'default', name: 'Default', blurb: 'Dark, dense, teal.', swatch: ['#0E1116', '#1B212B', '#2DD4BF'] },
  { id: 'xp', name: 'Windows XP', blurb: 'Luna blue, beige and bevels.', swatch: ['#ECE9D8', '#6375D6', '#245EDC'] },
  { id: 'macos', name: 'macOS', blurb: 'Glass and rounded corners. Follows light / dark.', swatch: ['#F2F2F7', '#FFFFFF', '#0A84FF'] },
  { id: 'winamp', name: 'Winamp', blurb: 'Brushed metal and green LEDs.', swatch: ['#232432', '#3A3D52', '#00E000'] },
]

const KEY = 'flax-skin'

/** Sets the skin on <html>; remembered locally so the next launch paints with it from the first frame. */
export function applySkin(id: string | undefined): void {
  const skin = SKINS.some((s) => s.id === id) ? (id as SkinId) : 'default'
  document.documentElement.dataset.skin = skin
  try { localStorage.setItem(KEY, skin) } catch { /* private mode etc. */ }
}

export function applyRememberedSkin(): void {
  try { document.documentElement.dataset.skin = localStorage.getItem(KEY) ?? 'default' } catch { /* default look */ }
}

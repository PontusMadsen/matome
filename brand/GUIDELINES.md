# Matome: logo guidelines

## 1. The logo
- **Idea:** one library, in one tidy player. A screen curves around a round tile, with controls below.
- **Versions:** horizontal lockup (primary), stacked lockup, symbol, wordmark, small symbol.
- **Files:** `symbol/`, `lockup/`, `wordmark/` each hold SVGs in teal, teal-light, ink, black and white. App icons are in `app-icon/` and web icons in `web/`.
- The wordmark is always plain ASCII "Matome", capital M. The Japanese まとめ is optional and sits apart from the logo, never inside it.

## 2. Clear space
Keep one round-tile diameter clear on all sides, measured from the logo's edge. It scales with the logo.

## 3. Minimum size
| Version | On screen | Use |
|---|---|---|
| Horizontal lockup | 120 px wide | Headers, DMG window, GitHub page |
| Stacked lockup | 80 px wide | Square spaces |
| Symbol | 25 px | Sidebar (34 px), Finder, Dock |
| Small symbol | 16 to 24 px | Favicon and tiny UI only, never larger |

## 4. Colour
| Name | HEX | RGB | CMYK (approx.) | Use |
|---|---|---|---|---|
| Teal | #0B8F86 | 11 143 134 | 92 0 6 44 | Logo on light backgrounds |
| Teal-light | #2DD4BF | 45 212 191 | 79 0 10 17 | Logo on dark backgrounds |
| Ink | #0E1116 | 14 17 22 | 36 23 0 91 | Dark backgrounds, one-colour on light |

**Approved pairs:** teal on white (3.97:1), teal-light on ink (10.16:1), ink on white, white on ink, black on white and white on black for the Classic Mac skin.

**Avoid:** teal-light on white (1.86:1, too faint). Teal on white passes for graphics at 3:1 but not for small body text at 4.5:1, so don't use it for that.

CMYK values are calculated conversions, not press-tested. No Pantone match has been chosen.

## 5. Typography
The wordmark is custom-drawn outlines and uses no font. Don't retype it. No companion typeface has been chosen.

## 6. Don'ts
Don't stretch, rotate or recolour outside the palette. Don't add shadows, outlines or gradients. Don't rearrange the parts of a lockup or the tiles in the symbol. Don't add a play triangle. Don't use the Plex amber or chevron near the logo in a way that suggests Plex made or endorses Matome.

## 7. Master files
`src/build.py` generates the black masters and `make_svgs.py` generates the colour variants.

# Fläx — Logo Guidelines (compact)

## 1. The logo
- **Idea**: two libraries interleave, row by row, into one play-shaped wedge. Alternate rows are the two sources; the shared 45° edge is the merge.
- **Versions**: horizontal (primary) · stacked · symbol · wordmark · small-size symbol (5 bars)
- **Files**: `svg/` masters + one-colour variants + PNGs · `web/` favicon.ico, PNG icon set, `site.webmanifest`, `head-snippet.html`
- All shapes are filled paths (no live text, no strokes, no effects).

## 2. Clear space
Keep **1 bar height** (the thickness of one symbol bar) clear on all sides. In the horizontal lockup that is 1/12 of the symbol height. It scales with the logo.

## 3. Minimum size
| Version | Screen | Print |
|---|---|---|
| Horizontal | 110 px wide | 28 mm wide |
| Stacked | 80 px wide | 20 mm wide |
| Symbol (7 bars) | 32 px | 8 mm |
| Symbol small cut (5 bars, `flax-symbol-small.svg` / `-favicon.svg`) | 16 px | 5 mm |

Below 32 px always use the small cut. Favicons and app icons already do.

## 4. Colour
| Name | HEX | RGB | CMYK (approx.) | Use |
|---|---|---|---|---|
| Flax Teal | #0B8F86 | 11 143 134 | 92 0 6 44 | Symbol on light, tiles, app icon |
| Flax Teal Light | #2DD4BF | 45 212 191 | 79 0 10 17 | Symbol on dark only |
| Ink | #0E1116 | 14 17 22 | 36 23 0 91 | Wordmark on light, dark surfaces |
| White | #FFFFFF | 255 255 255 | 0 0 0 0 | Reversed |

CMYK values are calculated conversions, not proofed. Pantone is not assigned: match to a printed proof.

**Contrast**: Ink on white 18.9:1. Teal on white 4.0:1 (large graphics only, never body text). White on teal 4.0:1 (symbol/large only). Teal Light on Ink 10.2:1.

**Approved pairs**: teal symbol + ink wordmark on white · teal-light symbol + white wordmark on Ink · white on Flax Teal · black on white · white on black.
One-colour files: `*-black.svg`, `*-white.svg`, `*-mono-0b8f86.svg`.

## 5. Typography
The wordmark is custom-drawn from the symbol's bar (20-unit stroke, full round caps); it is not a font and must not be retyped.
For UI/body copy pair it with a friendly geometric sans, e.g. Inter or Nunito Sans (both open licence). Not yet decided: confirm before use.

## 6. Don'ts
Don't stretch, rotate or recolour outside the palette · no shadows, outlines or gradients · don't change bar lengths or row offsets · don't use the 7-bar symbol under 32 px · don't use Teal Light on white · don't retype the wordmark · don't place on busy photos without a solid container.

## 7. Open items
- Trademark/design search not done (class 9/38/41; check "Flax" marks and similar bar-wedge icons).
- Reads as audio waveform to some viewers; confirm in context with the app UI.
- Mockup sample text (names, email) is placeholder.

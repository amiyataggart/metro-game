import { Line } from '@/lib/types'

// Shared roundel geometry. This is the single source of truth for the
// TfL-roundel-style swatch used both by the legend (ProgressBars) and by the
// completion confetti (each particle is a line's roundel). Extracted from the
// original inline SVG in ProgressBars' LegendRoundel so the two can never drift.
//
// The roundel = a coloured progress ring + a horizontal bar in the line colour
// + (per line.stripe) a solid or dashed white core stripe. At pct = 1 the ring
// is a full circle and it reads as a roundel; below that the ring draws a
// clockwise arc from 12 o'clock as a progress indicator.

const S = 32
const cx = S / 2
const cy = S / 2
const barH = S * 0.17
const stripeW = Math.max(1, barH / 3)
const ringStroke = barH
const ringOuterR = (S * 0.8) / 2
const ringR = ringOuterR - ringStroke / 2
const circumference = 2 * Math.PI * ringR

/** Returns SVG markup for a line's roundel. `pct` (0..1) controls the progress
 *  arc; confetti passes pct = 1 for a full roundel. `px` sets the rendered
 *  width/height (geometry is in a fixed 0 0 32 32 viewBox, so it scales). */
export function roundelSvg(line: Line, opts?: { pct?: number; px?: number }): string {
  const pct = Math.min(1, Math.max(0, opts?.pct ?? 1))
  const px = opts?.px ?? S
  const dashOffset = circumference * (1 - pct)

  const stripe =
    line.stripe === 'solid'
      ? `<line x1="0" x2="${S}" y1="${cy}" y2="${cy}" stroke="#ffffff" stroke-width="${stripeW}" stroke-linecap="butt" />`
      : line.stripe === 'dashed'
        ? `<line x1="0" x2="${S}" y1="${cy}" y2="${cy}" stroke="#ffffff" stroke-width="${stripeW}" stroke-dasharray="${stripeW * 2.4} ${stripeW * 1.8}" stroke-linecap="butt" />`
        : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${px}" height="${px}">` +
    `<circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${line.color}" stroke-width="${ringStroke}" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" stroke-linecap="butt" transform="rotate(-90 ${cx} ${cy})" />` +
    `<rect x="0" y="${cy - barH / 2}" width="${S}" height="${barH}" fill="${line.color}" />` +
    stripe +
    `</svg>`
}

const imageCache = new Map<string, { src: string; width: number; height: number }>()

/** Cached data-URL image descriptor for tsparticles-confetti image particles.
 *  Built once per line key (keyed by colour + stripe so palette changes refresh). */
export function roundelImage(line: Line): { src: string; width: number; height: number } {
  const key = `${line.color}|${line.stripe ?? 'none'}`
  const cached = imageCache.get(key)
  if (cached) return cached
  const svg = roundelSvg(line, { pct: 1, px: 128 })
  const descriptor = {
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width: 128,
    height: 128,
  }
  imageCache.set(key, descriptor)
  return descriptor
}

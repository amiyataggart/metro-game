import { roundelImage } from '@/lib/roundel'
import { Line } from '@/lib/types'
import { useCallback } from 'react'

// Confetti orchestration. tsparticles-confetti is dynamically imported on first
// use so it stays out of the initial bundle and only ever runs in the browser
// (the static export has no DOM at build time). Each particle is a line's
// roundel image — reusing the legend geometry via lib/roundel.

type ConfettiFn = (opts: Record<string, unknown>) => void

const loadConfetti = (() => {
  let p: Promise<ConfettiFn> | null = null
  return () => {
    if (!p) p = import('tsparticles-confetti').then((m) => m.confetti as ConfettiFn)
    return p
  }
})()

const imagesFor = (lines: Line[]) =>
  lines.map((line) => roundelImage(line))

// Where to fire confetti, in window-normalised (0..1) coords. Computed from the
// map element so bursts land over the MAP (not under the desktop sidebar) and
// near the top. Falls back to sensible window-centred defaults.
export interface ConfettiRegion {
  centerX: number
  leftX: number
  rightX: number
  // Burst origin height, window-normalised (0 = top, 1 = bottom). Mid-map so
  // particles travel up into the top half and fall through the bottom half,
  // covering the full height rather than hugging the top.
  originY: number
}
const DEFAULT_REGION: ConfettiRegion = { centerX: 0.5, leftX: 0.15, rightX: 0.85, originY: 0.55 }

export function useCelebration() {
  // One burst from mid-map, raining the roundels of the just-completed line(s).
  const celebrateLines = useCallback((lines: Line[], region: ConfettiRegion = DEFAULT_REGION) => {
    if (!lines.length) return
    loadConfetti().then((confetti) =>
      confetti({
        spread: 150,
        // NB: tsparticles-confetti INVERTS canvas-confetti's `ticks`. Internally
        // opacitySpeed = ticks / 432 and particles die when opacity hits 0, so a
        // LOWER `ticks` = slower fade = stays bright longer. (Default is 200.)
        // Lifetime ∝ 1/ticks, so +33% ticks ≈ −25% linger time.
        ticks: 200,
        particleCount: 180,
        origin: { x: region.centerX, y: region.originY },
        decay: 0.92,
        gravity: 1.1,
        startVelocity: 62,
        scalar: 3,
        shapes: ['image'],
        shapeOptions: { image: imagesFor(lines) },
      }),
    )
  }, [])

  // Bigger finale: two angled cannons from the map's lower corners plus a fat
  // top burst, raining a mix of every visible line's roundel.
  const celebrateFinale = useCallback((lines: Line[], region: ConfettiRegion = DEFAULT_REGION) => {
    if (!lines.length) return
    const images = imagesFor(lines)
    loadConfetti().then((confetti) => {
      const base = {
        // Lower `ticks` = slower fade (see note in celebrateLines). Even lower
        // than the per-line burst so the finale lingers brightest.
        ticks: 100,
        particleCount: 180,
        decay: 0.92,
        gravity: 1.0,
        startVelocity: 70,
        scalar: 3,
        shapes: ['image'] as string[],
        shapeOptions: { image: images },
      }
      confetti({ ...base, angle: 60, spread: 75, origin: { x: region.leftX, y: 0.9 } })
      confetti({ ...base, angle: 120, spread: 75, origin: { x: region.rightX, y: 0.9 } })
      confetti({ ...base, spread: 160, particleCount: 220, origin: { x: region.centerX, y: region.originY } })
    })
  }, [])

  return { celebrateLines, celebrateFinale }
}

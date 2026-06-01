import maplibregl from 'maplibre-gl'

// On-map line flash: a temporary white halo drawn over a just-completed line
// (or every line, for the finale), pulsed once and removed. It reuses the same
// `line-offset` expression as the ribbon layers so the glow tracks the real
// (offset) ribbon position rather than the shared centreline.

type Expr = maplibregl.ExpressionSpecification

let counter = 0

// Piecewise-linear evaluation of the ribbon LINE_WIDTH_EXPR stops at a given
// zoom, so the flash can animate `line-width` as a plain number (a zoom
// expression nested inside an arithmetic op trips MapLibre's per-frame paint
// validation). Keep these stops in sync with LINE_WIDTH_EXPR in GamePage.
const WIDTH_STOPS: [number, number][] = [
  [8.763, 2.925],
  [13, 5.0625],
  [18, 8.4375],
  [22, 10.125],
]
function widthAtZoom(z: number): number {
  const s = WIDTH_STOPS
  if (z <= s[0][0]) return s[0][1]
  if (z >= s[s.length - 1][0]) return s[s.length - 1][1]
  for (let i = 0; i < s.length - 1; i++) {
    const [z0, w0] = s[i]
    const [z1, w1] = s[i + 1]
    if (z >= z0 && z <= z1) return w0 + ((w1 - w0) * (z - z0)) / (z1 - z0)
  }
  return s[s.length - 1][1]
}

export function flashLines(
  map: maplibregl.Map,
  lineKeys: string[],
  expr: { lineOffset: Expr; lineWidth: Expr },
  opts?: { finale?: boolean },
): void {
  if (!map || !lineKeys.length || !map.getSource('lines')) return

  const id = `lines-flash-${counter++}`
  const filter = ['in', ['get', 'line'], ['literal', lineKeys]] as unknown as maplibregl.FilterSpecification

  // Insert just under the station markers so the glow sits above the ribbons
  // but never hides the dots/pies.
  const before = map.getLayer('stations-base') ? 'stations-base' : undefined

  try {
    map.addLayer(
      {
        id,
        type: 'line',
        source: 'lines',
        filter,
        paint: {
          'line-color': '#ffffff',
          'line-opacity': 0,
          'line-width': expr.lineWidth,
          'line-offset': expr.lineOffset,
          'line-blur': 2,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      },
      before,
    )
  } catch {
    return
  }

  const duration = opts?.finale ? 1400 : 900
  const pulses = opts?.finale ? 2 : 1
  const peakWidthMult = opts?.finale ? 3 : 2.5
  const peakOpacity = 0.9
  const peakBlur = opts?.finale ? 4 : 3
  const start = performance.now()

  const step = (now: number) => {
    if (!map.getLayer(id)) return
    const t = Math.min(1, (now - start) / duration)
    // Envelope: a smooth rise-and-fall (sin^2 over `pulses` half-cycles),
    // tapered by (1 - t) so it settles cleanly to nothing.
    const env = Math.pow(Math.sin(t * Math.PI * pulses), 2) * (1 - t)
    const mult = 1 + (peakWidthMult - 1) * env
    try {
      map.setPaintProperty(id, 'line-opacity', peakOpacity * env)
      map.setPaintProperty(id, 'line-blur', peakBlur * env)
      // Plain number (not an expression) — evaluate the zoom-based width in JS.
      map.setPaintProperty(id, 'line-width', widthAtZoom(map.getZoom()) * mult)
    } catch {
      /* layer/style torn down mid-animation */
    }
    if (t < 1) {
      requestAnimationFrame(step)
    } else if (map.getLayer(id)) {
      map.removeLayer(id)
    }
  }
  requestAnimationFrame(step)
}

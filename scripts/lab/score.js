/*
 * LAB scorecard: rebuild the ribbons as MapLibre draws them at a zoom
 * (centreline + line-offset) and measure, for DIFFERENT lines running
 * near-parallel: overlap (centres closer than 0.6 line widths, km) and
 * parallel crossings (a pair swapping sides within a parallel run — the
 * "twisting" look). Tram + cable car are ignored.
 */
const MG = 69300, ML = 111320
const WIDTH_STOPS = [[8.763, 2.925], [13, 5.0625], [18, 8.4375], [22, 10.125]]
function widthPx(z) {
  if (z <= WIDTH_STOPS[0][0]) return WIDTH_STOPS[0][1]
  for (let i = 1; i < WIDTH_STOPS.length; i++)
    if (z <= WIDTH_STOPS[i][0]) {
      const [z0, w0] = WIDTH_STOPS[i - 1], [z1, w1] = WIDTH_STOPS[i]
      return w0 + ((w1 - w0) * (z - z0)) / (z1 - z0)
    }
  return WIDTH_STOPS.at(-1)[1]
}
// metres per CSS pixel in MapLibre (512-px tiles) at London's latitude
const mpp = (z) => (78271.517 * Math.cos((51.5 * Math.PI) / 180)) / 2 ** z
// /lab ?size=map: line width pinned to the map at its z12.4 size (~43 m)
const MAP_REF_Z = 12.4
const MAP_W = widthPx(MAP_REF_Z) * mpp(MAP_REF_Z)
// line-offset (px) of a feature at zoom z; mode 'lane', 'map' or a MORPH config
function offsetPx(p, z, mode) {
  const lf = p.laneOff || 0
  if (mode === 'lane') return lf * widthPx(z)
  if (mode === 'map') return (lf * MAP_W) / mpp(z)
  if (mode.width) return lf * mode.width(z)
  // blend in GROUND space: (1-t)·bundled + t·true, t linear in zoom
  const coarse = (p.dm || 0) / mpp(z) + (p.lc ?? lf) * widthPx(z)
  const fine = lf * widthPx(z)
  const t = Math.max(0, Math.min(1, (z - mode.zCoarse) / (mode.zFine - mode.zCoarse)))
  return coarse * (1 - t) + fine * t
}

function scoreAt(fc, z, mode) {
  const W = mode === 'map' ? MAP_W : mode.width ? mode.width(z) * mpp(z) : widthPx(z) * mpp(z)
  const samples = []
  for (const f of fc.features) {
    const line = f.properties.line
    if (line === 'Tramlink' || line === 'CableCar') continue
    const xy = f.geometry.coordinates.map((c) => [c[0] * MG, c[1] * ML])
    const off = offsetPx(f.properties, z, mode) * mpp(z)
    const pts = xy.map((p, i) => {
      const a = xy[Math.max(0, i - 1)], b = xy[Math.min(xy.length - 1, i + 1)]
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
      return [p[0] + (off * dy) / L, p[1] - (off * dx) / L]
    })
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (!L) continue
      const n = Math.max(1, Math.round(L / 10))
      for (let k = 0; k < n; k++) {
        const t = k / n
        samples.push({ line, x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / L, ty: (b[1] - a[1]) / L })
      }
    }
  }
  const C = Math.max(50, 2 * W), grid = new Map()
  samples.forEach((s, i) => { const k = Math.floor(s.x / C) + ',' + Math.floor(s.y / C); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i) })
  let overlapM = 0, twists = 0
  const last = new Map() // pair -> {i, side}
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i], cx = Math.floor(s.x / C), cy = Math.floor(s.y / C)
    const best = new Map()
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++)
      for (const j of grid.get(gx + ',' + gy) || []) {
        const o = samples[j]
        if (o.line <= s.line) continue // each pair once
        if (Math.abs(s.tx * o.tx + s.ty * o.ty) < 0.9) continue
        const d = Math.hypot(o.x - s.x, o.y - s.y)
        if (d > 2 * W) continue
        const cur = best.get(o.line)
        if (!cur || d < cur.d) best.set(o.line, { d, j })
      }
    for (const [ol, { d, j }] of best) {
      const o = samples[j]
      if (d < 0.6 * W) overlapM += 10
      const side = Math.sign((o.x - s.x) * -s.ty + (o.y - s.y) * s.tx)
      const key = s.line + '|' + ol
      const prev = last.get(key)
      if (prev && i - prev.i <= 3 && side && prev.side && side !== prev.side) twists++
      last.set(key, { i, side })
    }
  }
  return { overlapKm: +(overlapM / 1000).toFixed(1), twists, widthM: +W.toFixed(1) }
}

function score(zooms, fcAt, mode) {
  const out = {}
  for (const z of zooms) out[z] = scoreAt(fcAt(z), z, mode)
  return out
}
// /lab/staging1 sizing: clamped z11.4–12.4 (half → full z12.4 width), map
// scale below z11.4 (must match GamePage's clamp + mapBelow sizing)
const STAGING = {
  width: (z) => {
    const hi = widthPx(MAP_REF_Z)
    if (z < 11.4) return hi * 0.5 * 2 ** (z - 11.4)
    return hi * (0.5 + 0.5 * Math.min(1, (z - 11.4) / (MAP_REF_Z - 11.4)))
  },
}
module.exports = { score, scoreAt, widthPx, mpp, offsetPx, MAP_W, STAGING }

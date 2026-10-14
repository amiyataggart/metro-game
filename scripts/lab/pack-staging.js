#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * LAB — pack the /lab/staging3* line data (the Staging 2 efficiency pass).
 *
 * Importing routes.*.json into a page inlines megabytes of GeoJSON in the
 * HTML, parsed by the page, held in React props and copied again to
 * MapLibre's worker. The staging pages instead serve small
 * static files from public/lab-data/staging3/ that MapLibre fetches and parses
 * in its worker. This script shrinks them:
 *  - properties: only what the map reads (`line`, `order`, `laneOff` — omitted
 *    when 0, the paint expressions coalesce it);
 *  - coordinates: consecutive duplicates dropped (kept at 6 dp: 5 dp, ~1 m,
 *    jitters lines that nearly coincide by ~0.5 px and flips their sides);
 *  - pieces: a line's touching pieces with equal laneOff are merged into one
 *    LineString (fewer features to tile, sort and draw). Taper steps stay at
 *    0.05 lane (0.1 added crossings).
 * Diagnostics: DP=1e5 (coordinate precision), QL=0.1 (laneOff step),
 * NOMERGE=1. Defaults reproduce staging1's scorecard exactly.
 *
 *   node scripts/lab/pack-staging.js [graph5,graph7,graph7t]   (after build-lab-v2.js)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const LAB = path.join(ROOT, 'src', 'app', '(game)', 'lab', 'data')
const OUT = path.join(ROOT, 'public', 'lab-data', 'staging3')
const IDS = (process.argv[2] || 'graph5,graph7,graph7t').split(',')
const Q_LANE = +(process.env.QL || 0.05)
const SIMPLIFY_M = +(process.env.SIMPLIFY ?? 0.75) // Douglas-Peucker tolerance (m)

// Douglas-Peucker on lng/lat in a local metric frame
function simplify(coords, eps) {
  if (coords.length < 3 || !eps) return coords
  const MG = 69300, ML = 111320
  const xy = coords.map((c) => [c[0] * MG, c[1] * ML])
  const keep = new Uint8Array(xy.length); keep[0] = keep[xy.length - 1] = 1
  const st = [[0, xy.length - 1]]
  while (st.length) {
    const [lo, hi] = st.pop(), a = xy[lo], b = xy[hi]
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    let far = -1, fd = eps
    for (let i = lo + 1; i < hi; i++) { const d = Math.abs((xy[i][0] - a[0]) * dy - (xy[i][1] - a[1]) * dx) / L; if (d > fd) { fd = d; far = i } }
    if (far >= 0) { keep[far] = 1; st.push([lo, far], [far, hi]) }
  }
  return coords.filter((_, i) => keep[i])
}
const DP = +(process.env.DP || 1e6)

function pack(fc) {
  const round = (c) => [Math.round(c[0] * DP) / DP, Math.round(c[1] * DP) / DP]
  const feats = []
  for (const f of fc.features) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue
    const coords = []
    for (const c of f.geometry.coordinates.map(round)) {
      const p = coords[coords.length - 1]
      if (!p || p[0] !== c[0] || p[1] !== c[1]) coords.push(c)
    }
    if (coords.length < 2) continue
    const lo = Math.round((f.properties.laneOff || 0) / Q_LANE) * Q_LANE
    feats.push({ line: f.properties.line, order: f.properties.order, lo: Math.round(lo * 100) / 100, coords })
  }
  // merge touching pieces of the same line with the same laneOff (in order;
  // pieces are emitted along each source feature, so neighbours are adjacent)
  const merged = []
  for (const f of feats) {
    const prev = merged[merged.length - 1]
    if (!process.env.NOMERGE && prev && prev.line === f.line && prev.lo === f.lo) {
      const a = prev.coords[prev.coords.length - 1], b = f.coords[0]
      if (a[0] === b[0] && a[1] === b[1]) { prev.coords.push(...f.coords.slice(1)); continue }
    }
    merged.push({ ...f, coords: [...f.coords] })
  }
  return {
    type: 'FeatureCollection',
    features: merged.map((f) => ({
      type: 'Feature',
      properties: { line: f.line, order: f.order, ...(f.lo ? { laneOff: f.lo } : {}) },
      geometry: { type: 'LineString', coordinates: simplify(f.coords, SIMPLIFY_M) },
    })),
  }
}

function main() {
  fs.mkdirSync(OUT, { recursive: true })
  for (const id of IDS) {
    const src = path.join(LAB, `routes.${id}.json`)
    const fc = JSON.parse(fs.readFileSync(src, 'utf8'))
    const packed = pack(fc)
    const out = path.join(OUT, `${id}.json`)
    fs.writeFileSync(out, JSON.stringify(packed))
    console.log(`${id}: ${fc.features.length} -> ${packed.features.length} features, ${(fs.statSync(src).size / 1e6).toFixed(2)} -> ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`)
  }
}

main()

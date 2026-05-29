#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Same-line endpoint weld — closes junction gaps (ISSUES #1).
 *
 * OSM models a line as several disjoint LineString features that meet at
 * junctions, but their endpoints don't quite touch, so the rendered line shows
 * a small gap where two features should join. This snaps any feature ENDPOINT
 * that lies CLOSE_LO..CLOSE_HI metres from another feature of the SAME line
 * onto the nearest point of that other feature, closing the gap. Handles both
 * end-to-end and end-to-middle joints.
 *
 * Endpoints already within CLOSE_LO of another same-line feature are left
 * alone (already visually joined); endpoints farther than CLOSE_HI are treated
 * as true termini / branch tips and left open (so no spurious links are made,
 * e.g. Northern Bank vs Charing Cross several hundred m apart near Kennington).
 *
 * Only feature endpoints move (never interior vertices) and only by <= CLOSE_HI,
 * so the parallel-offset ribbons are preserved. Idempotent: re-running is a
 * no-op once gaps are closed.
 *
 * Pipeline stage (required by bake-offsets.js, pre-bake) and runnable
 * standalone to weld the committed routes.json in place:
 *   node scripts/weld-endpoints.js
 */
const fs = require('fs')
const path = require('path')

const M_LAT = 111320
const M_LNG = 69300 // ~51.5N

const CLOSE_LO = 6 // already touching -> skip
const CLOSE_HI = 70 // beyond this an open end is a genuine terminus -> leave open

// nearest point on segment a->b to p, returned as [coord, distMetres]
function nearestOnSeg(p, a, b) {
  const ax = a[0] * M_LNG, ay = a[1] * M_LAT
  const bx = b[0] * M_LNG, by = b[1] * M_LAT
  const px = p[0] * M_LNG, py = p[1] * M_LAT
  const dx = bx - ax, dy = by - ay
  const L = dx * dx + dy * dy
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0
  t = Math.max(0, Math.min(1, t))
  const cxM = ax + t * dx, cyM = ay + t * dy
  const dist = Math.hypot(cxM - px, cyM - py)
  // convert the metric point back to lng/lat
  return [[cxM / M_LNG, cyM / M_LAT], dist]
}

function nearestOnOthers(p, polys, selfIdx) {
  let best = null
  let bestD = Infinity
  for (let k = 0; k < polys.length; k++) {
    if (k === selfIdx) continue
    const c = polys[k]
    for (let i = 1; i < c.length; i++) {
      const [pt, d] = nearestOnSeg(p, c[i - 1], c[i])
      if (d < bestD) { bestD = d; best = pt }
    }
  }
  return [best, bestD]
}

function weldEndpoints(features) {
  const byLine = new Map()
  features.forEach((f, i) => {
    const l = f.properties.line
    if (!byLine.has(l)) byLine.set(l, [])
    byLine.get(l).push(i)
  })

  let closed = 0
  for (const [, idxs] of byLine) {
    if (idxs.length < 2) continue
    const polys = idxs.map((fi) => features[fi].geometry.coordinates)
    // Snap each open endpoint onto the nearest other same-line feature, using a
    // SNAPSHOT of the geometry so welds within one line don't cascade.
    const snapshot = polys.map((c) => c.map((p) => p.slice()))
    idxs.forEach((fi, li) => {
      const c = features[fi].geometry.coordinates
      for (const end of [0, c.length - 1]) {
        const [pt, d] = nearestOnOthers(snapshot[li][end], snapshot, li)
        if (pt && d > CLOSE_LO && d <= CLOSE_HI) {
          c[end] = pt
          closed++
        }
      }
    })
  }
  console.log(`Endpoint weld: closed ${closed} junction gap(s) (snap ${CLOSE_LO}-${CLOSE_HI}m onto same-line geometry).`)
  return features
}

module.exports = { weldEndpoints }

if (require.main === module) {
  const ROUTES = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data', 'routes.json')
  const fc = JSON.parse(fs.readFileSync(ROUTES, 'utf8'))
  weldEndpoints(fc.features)
  let bad = 0
  for (const f of fc.features) for (const c of f.geometry.coordinates) if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) bad++
  if (bad) throw new Error(`${bad} non-finite coords after weld`)
  fs.writeFileSync(ROUTES, JSON.stringify(fc))
  console.log(`Wrote ${fc.features.length} feature(s) to ${path.relative(process.cwd(), ROUTES)}.`)
}

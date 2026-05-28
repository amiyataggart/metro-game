#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Browser-free geometric scorecard for the route variants. Measures, per
 * routes file, the three issues the variants are meant to fix:
 *   1. Junction connectivity — do all features of a line that serve a station
 *      actually have a vertex AT the station (else: gap)?
 *   2. Same-line doubles — total length of parallel same-line overlap.
 *   3. Cross-line shared geometry — # coords byte-identical across >=2 lines
 *      (the mechanism that stops co-running lines flipping order).
 *
 * Usage: node scripts/qa-geometry.js
 */
const fs = require('fs')
const path = require('path')

const DATA = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')
const FILES = {
  base: 'routes.json',
  v1: 'routes.v1.json',
  v2: 'routes.v2.json',
  v3: 'routes.v3.json',
  v4: 'routes.v4.json',
}

const M_LAT = 111320
const M_LNG = 69300 // ~ at 51.5N
const mx = (c) => c[0] * M_LNG
const my = (c) => c[1] * M_LAT
const distM = (a, b) => Math.hypot(mx(a) - mx(b), my(a) - my(b))

// ---- station coords per line (ground truth) ----
function loadStations() {
  const feats = JSON.parse(fs.readFileSync(path.join(DATA, 'features.json'), 'utf8'))
  const extras = JSON.parse(fs.readFileSync(path.join(DATA, 'stations-extras.json'), 'utf8'))
  const byLine = new Map()
  const add = (line, coord) => {
    if (!byLine.has(line)) byLine.set(line, [])
    byLine.get(line).push(coord)
  }
  for (const f of feats.features) {
    if (f.geometry && f.geometry.type === 'Point' && f.properties.line) {
      add(f.properties.line, f.geometry.coordinates)
    }
  }
  for (const s of extras) if (s.line && s.coords) add(s.line, s.coords)
  return byLine
}

function nearestVertexDist(coords, p) {
  let best = Infinity
  for (const c of coords) {
    const d = distM(c, p)
    if (d < best) best = d
  }
  return best
}

// segment sampling every ~stepM metres
function sampleEvery(coords, stepM) {
  const out = []
  let carry = 0
  out.push(coords[0])
  for (let i = 1; i < coords.length; i++) {
    let segLen = distM(coords[i - 1], coords[i])
    if (segLen === 0) continue
    let t = (stepM - carry) / segLen
    while (t <= 1) {
      out.push([
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
      ])
      t += stepM / segLen
    }
    carry = (carry + segLen) % stepM
  }
  return out
}

function minDistToPolyline(p, coords) {
  // point to nearest segment
  let best = Infinity
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i]
    const ax = mx(a), ay = my(a), bx = mx(b), by = my(b)
    const px = mx(p), py = my(p)
    const dx = bx - ax, dy = by - ay
    const L = dx * dx + dy * dy
    let t = L === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / L
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx, cy = ay + t * dy
    const d = Math.hypot(cx - px, cy - py)
    if (d < best) best = d
  }
  return best
}

function analyze(name, file) {
  const full = path.join(DATA, file)
  if (!fs.existsSync(full)) return { name, missing: true }
  const fc = JSON.parse(fs.readFileSync(full, 'utf8'))
  const stations = loadStations()
  const feats = fc.features

  const byLine = new Map()
  for (const f of feats) {
    const l = f.properties.line
    if (!byLine.has(l)) byLine.set(l, [])
    byLine.get(l).push(f.geometry.coordinates)
  }

  // ---- 1. junction connectivity ----
  const R_SERVE = 60
  const EPS = 12
  let junctions = 0 // (station,line) with >=2 serving features
  let gaps = 0 // of those, where some serving feature has no vertex within EPS
  for (const [line, polys] of byLine) {
    const sts = stations.get(line) || []
    for (const s of sts) {
      const serving = polys.filter((c) => nearestVertexDist(c, s) < R_SERVE)
      if (serving.length < 2) continue
      junctions++
      const worst = Math.max(...serving.map((c) => nearestVertexDist(c, s)))
      if (worst > EPS) gaps++
    }
  }

  // ---- 2. same-line doubles ----
  // A *visible* double = two same-line features running PARALLEL BUT SEPARATE
  // (MIN_SEP..SHADOW apart) so both ribbons are drawn. Near-exact overlap
  // (< MIN_SEP) renders as a single line — NOT a double — so it's excluded
  // (this is what v1/v3's shared-centerline alignment produces).
  const STEP = 40
  const SHADOW = 35
  const MIN_SEP = 5
  let doubleLenM = 0
  for (const [, polys] of byLine) {
    for (let i = 0; i < polys.length; i++) {
      for (let j = 0; j < polys.length; j++) {
        if (i >= j) continue
        if (polys[i].length < 2 || polys[j].length < 2) continue
        const samp = sampleEvery(polys[i], STEP)
        let shadow = 0
        for (const p of samp) {
          const d = minDistToPolyline(p, polys[j])
          if (d >= MIN_SEP && d < SHADOW) shadow++
        }
        doubleLenM += shadow * STEP
      }
    }
  }

  // ---- 3. cross-line shared geometry ----
  const coordToLines = new Map()
  for (const f of feats) {
    const l = f.properties.line
    for (const c of f.geometry.coordinates) {
      const k = `${c[0]},${c[1]}`
      if (!coordToLines.has(k)) coordToLines.set(k, new Set())
      coordToLines.get(k).add(l)
    }
  }
  let sharedCoords = 0
  for (const set of coordToLines.values()) if (set.size >= 2) sharedCoords++

  const totalVerts = feats.reduce((s, f) => s + f.geometry.coordinates.length, 0)
  return {
    name,
    features: feats.length,
    vertices: totalVerts,
    junctions,
    junctionGaps: gaps,
    junctionGapPct: junctions ? +((100 * gaps) / junctions).toFixed(1) : 0,
    sameLineDoubleKm: +(doubleLenM / 1000).toFixed(2),
    crossLineSharedCoords: sharedCoords,
  }
}

console.log('Geometry scorecard (lower gaps & doubles = better; shared coords = co-running lines aligned)\n')
const rows = Object.entries(FILES).map(([n, f]) => analyze(n, f))
const cols = ['name', 'features', 'vertices', 'junctions', 'junctionGaps', 'junctionGapPct', 'sameLineDoubleKm', 'crossLineSharedCoords']
const head = cols.map((c) => c.padStart(c === 'name' ? 6 : 13)).join('')
console.log(head)
console.log('-'.repeat(head.length))
for (const r of rows) {
  if (r.missing) { console.log(r.name.padStart(6) + '   (missing)'); continue }
  console.log(cols.map((c) => String(r[c]).padStart(c === 'name' ? 6 : 13)).join(''))
}
// ---- targeted junction probe: did welds hold? ----
function stationCoord(name, line) {
  const feats = JSON.parse(fs.readFileSync(path.join(DATA, 'features.json'), 'utf8'))
  const f = feats.features.find(
    (x) => x.properties.line === line && x.properties.name === name,
  )
  return f ? f.geometry.coordinates : null
}
const PROBES = [
  ['Earl\'s Court', 'District'],
  ['Kennington', 'Northern'],
  ['Camden Town', 'Northern'],
  ['Gloucester Road', 'District'],
]
console.log('\n\nJunction probe — min vertex distance (m) from each serving feature to the station:')
console.log('(serving = nearest vertex < 60m. After a correct weld all serving features read ~0m.)')
for (const [name, line] of PROBES) {
  const s = stationCoord(name, line)
  if (!s) { console.log(`\n  ${name} (${line}): not found in features.json`); continue }
  console.log(`\n  ${name} (${line})  @ ${s.map((v) => v.toFixed(4))}`)
  for (const [vn, file] of Object.entries(FILES)) {
    const full = path.join(DATA, file)
    if (!fs.existsSync(full)) continue
    const fc = JSON.parse(fs.readFileSync(full, 'utf8'))
    const dists = fc.features
      .filter((f) => f.properties.line === line)
      .map((f) => nearestVertexDist(f.geometry.coordinates, s))
      .filter((d) => d < 60)
      .sort((a, b) => a - b)
      .map((d) => d.toFixed(1))
    console.log(`    ${vn.padStart(5)}: [${dists.join(', ')}]`)
  }
}

console.log('\nLegend:')
console.log('  junctions          = (station,line) pairs served by >=2 features of that line')
console.log('  junctionGaps       = of those, how many have a serving feature with NO vertex within 12m of the station (visible gap)')
console.log('  sameLineDoubleKm   = total km of same-line parallel overlap (issue 3: lower is better)')
console.log('  crossLineSharedCoords = coords byte-identical across >=2 lines (issue 2 fix mechanism: higher = more co-running lines aligned)')

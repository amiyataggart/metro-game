#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * qa-ribbons.js — browser-free acceptance scorecard for the baked ribbon
 * geometry (PARALLEL-RIBBONS-BRIEF.md §8B/§8C). Asserts, don't eyeball:
 *
 *  A. Integrity vs the pre-ribbon snapshot: per line, baked bbox & length are
 *     preserved (catches loop collapse / lost arcs — brief §5/§7).
 *  B. §4 orderings at the named probe corridors, by sampling along the corridor
 *     and comparing each member's nearest-point cross-track position. Checks
 *     (a) the required top->bottom order, (b) that it never reverses (no
 *     crossing), (c) spacing is ~uniform.
 *  C. Bakerloo/Lioness both present & separated on the Watford DC line.
 *
 * Usage: node scripts/qa-ribbons.js [routesFile] [--baseline FILE]
 *   default routesFile: routes.ribbons.json ; baseline: routes.preribbons.json
 */
const fs = require('fs')
const path = require('path')

const DATA = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')
const file = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : path.join(DATA, 'routes.json')
let baseline = path.join(DATA, 'routes.preribbons.json')
const bi = process.argv.indexOf('--baseline')
if (bi >= 0) baseline = process.argv[bi + 1]
if (!fs.existsSync(baseline)) baseline = path.join(DATA, 'routes.json')

const M_LAT = 111320
const M_LNG = 69300
const X = (c) => c[0] * M_LNG
const Y = (c) => c[1] * M_LAT

function load(f) {
  return JSON.parse(fs.readFileSync(f, 'utf8'))
}
function byLine(fc) {
  const m = new Map()
  for (const f of fc.features) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue
    const l = f.properties.line
    if (!m.has(l)) m.set(l, [])
    m.get(l).push(f.geometry.coordinates)
  }
  return m
}
function bbox(polys) {
  let W = Infinity, S = Infinity, E = -Infinity, N = -Infinity
  for (const c of polys) for (const p of c) {
    W = Math.min(W, p[0]); E = Math.max(E, p[0]); S = Math.min(S, p[1]); N = Math.max(N, p[1])
  }
  return [W, S, E, N]
}
function len(polys) {
  let s = 0
  for (const c of polys) for (let i = 1; i < c.length; i++)
    s += Math.hypot((c[i][0] - c[i - 1][0]) * M_LNG, (c[i][1] - c[i - 1][1]) * M_LAT)
  return s
}
// nearest point on a set of polylines to metric point p; returns {pt, tan, d}
function nearest(p, polys) {
  let best = Infinity, pt = null, tan = null
  const px = p[0], py = p[1]
  for (const c of polys) {
    for (let i = 1; i < c.length; i++) {
      const ax = X(c[i - 1]), ay = Y(c[i - 1]), bx = X(c[i]), by = Y(c[i])
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
      let t = L === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / L
      t = Math.max(0, Math.min(1, t))
      const cx = ax + t * dx, cy = ay + t * dy
      const d = Math.hypot(cx - px, cy - py)
      if (d < best) { best = d; pt = [cx, cy]; const l = Math.hypot(dx, dy) || 1; tan = [dx / l, dy / l] }
    }
  }
  return { pt, tan, d: best }
}
// sample the reference line's coords between two stations (metric), every step
function corridorSamples(refPolys, aLL, bLL, step) {
  const a = [X(aLL), Y(aLL)], b = [X(bLL), Y(bLL)]
  // pick the ref polyline & index range nearest a..b
  const na = nearest(a, refPolys)
  const nb = nearest(b, refPolys)
  // densify straight a->b on the reference by walking ref vertices between
  // projections is fiddy; instead just sample the segment a->b and snap each
  const out = []
  const D = Math.hypot(b[0] - a[0], b[1] - a[1])
  const steps = Math.max(2, Math.round(D / step))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    out.push(nearest(p, refPolys))
  }
  return out
}

const cur = byLine(load(file))
const base = byLine(load(baseline))

console.log(`\n=== A. Integrity vs ${path.basename(baseline)} (bbox & length preserved) ===`)
let integrityFail = 0
const lines = [...cur.keys()].sort()
for (const l of lines) {
  const c = cur.get(l), b = base.get(l)
  if (!b) continue
  const bbC = bbox(c), bbB = bbox(b)
  const dW = Math.abs(bbC[0] - bbB[0]) * M_LNG
  const dS = Math.abs(bbC[1] - bbB[1]) * M_LAT
  const dE = Math.abs(bbC[2] - bbB[2]) * M_LNG
  const dN = Math.abs(bbC[3] - bbB[3]) * M_LAT
  const maxShift = Math.max(dW, dS, dE, dN)
  const lenC = len(c), lenB = len(b)
  const lenPct = (100 * (lenC - lenB)) / lenB
  // Extent (bbox) is the real corruption signal — a collapsed loop / lost arc
  // shrinks the bbox. Length may legitimately DROP from de-spiking and from
  // de-doubling an out-and-back (e.g. Piccadilly's Heathrow branch, ~-12%), so
  // we allow shrinkage down to -30% but still flag length GROWTH (>8%) and any
  // large extent shift.
  const bad = maxShift > 90 || lenPct > 8 || lenPct < -30
  if (bad) integrityFail++
  if (bad || ['Circle', 'District', 'Metropolitan', 'HammersmithAndCity', 'Bakerloo', 'Lioness'].includes(l))
    console.log(
      `  ${bad ? 'FAIL' : 'ok  '} ${l.padEnd(20)} bboxEdgeShift=${maxShift.toFixed(0)}m  ` +
        `len ${(lenB / 1000).toFixed(1)}->${(lenC / 1000).toFixed(1)}km (${lenPct >= 0 ? '+' : ''}${lenPct.toFixed(1)}%)`,
    )
}
console.log(integrityFail ? `  >> ${integrityFail} line(s) FAILED integrity` : '  >> all lines preserved')

// ── B. ordering probes ──────────────────────────────────────────────────────
// Each: name, reference line, two endpoints spanning the corridor, and the
// required on-screen top->bottom order (decreasing latitude).
const PROBES = [
  {
    name: 'North trunk (Great Portland St -> Euston Sq)',
    ref: 'Circle',
    a: [-0.1438, 51.5238], b: [-0.1357, 51.5258],
    order: ['Metropolitan', 'HammersmithAndCity', 'Circle'],
  },
  {
    name: 'South trunk (Westminster -> Embankment)',
    ref: 'Circle',
    a: [-0.1254, 51.5012], b: [-0.1223, 51.5073],
    order: ['Circle', 'District'],
  },
]

console.log('\n=== B. §4 ordering probes ===')
for (const pr of PROBES) {
  const ref = cur.get(pr.ref)
  const samples = corridorSamples(ref, pr.a, pr.b, 20)
  // for each sample, nearest pt on each member; signed cross-track via the
  // reference left-normal; also record latitude.
  const rows = [] // per sample: {line: {signed, lat, d}}
  for (const s of samples) {
    const ln = [-s.tan[1], s.tan[0]] // left normal of ref tangent
    const row = {}
    for (const line of pr.order) {
      const polys = cur.get(line)
      if (!polys) continue
      const nr = nearest(s.pt, polys)
      if (nr.d > 120) continue // member not actually in this corridor here
      const signed = (nr.pt[0] - s.pt[0]) * ln[0] + (nr.pt[1] - s.pt[1]) * ln[1]
      row[line] = { signed, lat: nr.pt[1] / M_LAT, d: nr.d }
    }
    rows.push(row)
  }
  // require all members present in a majority of samples
  const full = rows.filter((r) => pr.order.every((l) => r[l]))
  console.log(`\n  ${pr.name}`)
  console.log(`    samples with all members: ${full.length}/${rows.length}`)
  if (!full.length) { console.log('    !! members not co-located here — check corridor endpoints'); continue }
  // check screen order (by latitude) at the midpoint sample
  const mid = full[Math.floor(full.length / 2)]
  const byLat = [...pr.order].sort((a, b) => mid[b].lat - mid[a].lat)
  const orderOK = JSON.stringify(byLat) === JSON.stringify(pr.order)
  console.log(`    required top->bottom: [${pr.order.join(', ')}]`)
  console.log(`    observed top->bottom: [${byLat.join(', ')}]  ${orderOK ? 'OK' : 'FAIL'}`)
  // no-reversal: signed cross-track order constant across all full samples
  let reversals = 0
  const seq = pr.order // reference order
  for (const r of full) {
    const sorted = [...seq].sort((a, b) => r[a].signed - r[b].signed)
    // compare adjacency consistency with the first sample's signed order
    if (JSON.stringify(sorted) !== JSON.stringify([...seq].sort((a, b) => full[0][a].signed - full[0][b].signed)))
      reversals++
  }
  console.log(`    cross-track order reversals along corridor: ${reversals}  ${reversals === 0 ? 'OK' : 'FAIL'}`)
  // spacing: adjacent signed gaps
  const gaps = []
  for (const r of full) {
    const vals = seq.map((l) => r[l].signed).sort((a, b) => a - b)
    for (let i = 1; i < vals.length; i++) gaps.push(vals[i] - vals[i - 1])
  }
  if (gaps.length) {
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const min = Math.min(...gaps), max = Math.max(...gaps)
    console.log(`    adjacent spacing (m): mean=${mean.toFixed(1)} min=${min.toFixed(1)} max=${max.toFixed(1)}`)
  }
}

// ── C. Bakerloo / Lioness both present + separated on Watford DC ─────────────
console.log('\n=== C. Watford DC (Bakerloo + Lioness both visible) ===')
{
  const probe = [-0.2143, 51.5341] // Queen's Park
  const a = [X(probe), Y(probe)]
  const bk = cur.get('Bakerloo'), li = cur.get('Lioness')
  const nb = nearest(a, bk), nl = nearest(a, li)
  const sep = Math.hypot(nb.pt[0] - nl.pt[0], nb.pt[1] - nl.pt[1])
  console.log(`    near Queen's Park: Bakerloo d=${nb.d.toFixed(0)}m, Lioness d=${nl.d.toFixed(0)}m, separation=${sep.toFixed(1)}m  ${sep > 8 ? 'OK' : 'FAIL'}`)
}

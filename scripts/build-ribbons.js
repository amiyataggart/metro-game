#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * build-ribbons.js — bake correctly-ordered parallel-ribbon geometry into
 * routes.json. Replaces the archived postprocess-routes.js / bake-offsets.js
 * pipeline (see PARALLEL-RIBBONS-BRIEF.md §7 for why those failed).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY
 * ──────────────────────────────────────────────────────────────────────────
 * The map renders the `lines` layer at `line-offset: 0`, so the ONLY thing
 * that separates co-running lines on screen is the baked coordinate geometry.
 * MapLibre's runtime line-offset pushes each line along its OWN local tangent,
 * so where two co-runners have slightly different vertices (they come from
 * different OSM ways) the ribbons diverge and flip order across zoom. The fix
 * is to give every member of a shared corridor the SAME centreline and offset
 * each by a lane multiple of that one shared normal field — then the ribbons
 * are exact parallel offsets of one curve, so they can never cross or flip.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * HOW (the model)
 * ──────────────────────────────────────────────────────────────────────────
 * 1. RESAMPLE every feature to a uniform step (S) in a local metric frame.
 *
 * 2. SPINES (shared centrelines) by first-come snapping. Process features in
 *    ascending `order` (then longest-first). Each feature walks its points and
 *    snaps each to the nearest EXISTING spine within D that is tangent-parallel
 *    (|cos Δθ| > ANG_COS). Maximal solo runs (≥ MIN_SPINE) become NEW spines
 *    laid by this feature. Net effect: the lowest-order line in any corridor
 *    lays the shared centreline; higher-order co-runners snap onto it.
 *      · Hysteresis cleans the per-point assignment (fills short gaps, drops
 *        sub-MIN_MEMBER blips) so junctions don't fragment a line into shards.
 *
 * 3. LANES per spine, packed per arc-length BIN. In each bin the lines present
 *    there are sorted by `order` and placed at symmetric lanes about the spine
 *    centre: lane = rank - (m-1)/2. Sorting by `order` is what produces the
 *    brief's §4 orderings (proof: order Circle(2) < District(3) < H&C(4) <
 *    Met(6) gives Circle interior on both subsurface trunks once the loop
 *    spine's sign is oriented — the closed loop flips screen-side N/S for free).
 *    Per-bin packing keeps the stack dense (no empty lanes) as members join/
 *    leave; ordering-by-a-single-global-key keeps every pair's order identical
 *    everywhere, so nothing ever crosses.
 *
 * 4. BAKE + SMOOTH. For each feature point we compute a target offset VECTOR:
 *    on a spine -> (sharedCentrelinePoint - ownPoint) + laneOffset*normal;
 *    solo       -> 0. The (centreline - own) term snaps the line off its noisy
 *    OSM vertices onto the shared centreline so co-runners are truly parallel.
 *    We then MOVING-AVERAGE the offset vector over a TAPER window and add it to
 *    the own point. Smoothing the offset (not the geometry) makes corridor
 *    entries/exits and membership changes ease in over ~TAPER with no sideways
 *    jump and no pinch — while leaving the underlying route detail intact.
 *
 * 5. LOOP / SELF-OVERLAP SAFETY. A spine's own laying feature is reconstructed
 *    by IDENTITY (point i of the run == spine vertex i), never by nearest-point
 *    projection — so the Circle loop (which doubles back at Edgware Rd) can't
 *    project onto its own opposite arc and collapse. Non-laying members project
 *    with the same tangent-parallel guard that disambiguates the two arcs.
 *
 * Deterministic: no Math.random / Date. Every tunable is in CONFIG below.
 *
 * Usage (build from the pristine raw-OSM source, never from routes.json):
 *   node scripts/build-ribbons.js \
 *     --in src/app/(game)/london/data/routes.osm.json \
 *     --out src/app/(game)/london/data/routes.json
 * `routes.osm.json` is produced by scripts/fetch-osm-routes.js. build-ribbons
 * refuses an already-processed input (one carrying `laneOff`).
 */

const fs = require('fs')
const path = require('path')

// ──────────────────────────────────────────────────────────────────────────
// CONFIG — every tunable, documented.
// ──────────────────────────────────────────────────────────────────────────
const CONFIG = {
  S: 10, // resample step (m). All geometry is rebuilt at this resolution.
  D: 34, // snap radius (m): a point joins a spine if within D of it... Wide
  // enough to gather the subsurface 3-4 track bundles (OSM way-averaging
  // spreads co-running centrelines ~20-30m); genuinely-separate railways are
  // usually >40m apart, so the tangent test still keeps them distinct.
  ANG_COS: Math.cos((32 * Math.PI) / 180), // ...AND tangents are this parallel.
  // Centre-to-centre lane spacing (m, ground units) BY number of co-running
  // lines in a corridor bin. Fewer lines => wider spacing, so a 2-line pair
  // (Bakerloo/Lioness, H&C/District, Met/Jubilee) visually separates at a lower
  // zoom instead of the higher-order line hiding the other; dense 3-4 line
  // stacks (the subsurface trunk) stay compact and on-track. Ground-unit
  // offsets still blend at the far overview zoom — inherent to baked offsets.
  LANE_SPACING: { 1: 0, 2: 22, 3: 17, 4: 14 },
  LANE_SPACING_DEFAULT: 12, // 5+ co-runners
  TAPER: 80, // offset-vector smoothing window (m): corridor entry/exit easing.
  MIN_SPINE: 120, // a solo run shorter than this does NOT seed a new spine
  // (it still renders as its own geometry; it's just not offered to snap to).
  MIN_MEMBER: 140, // a co-run shorter than this is ignored (stays solo) so
  // brief stretches don't splay the stack. All named corridors are >> this.
  GAP_FILL: 70, // hysteresis: bridge same-spine assignment gaps shorter than
  // this (m) — closes flicker at junction vertices.
  D2: 130, // corridor ceiling (m): inside a shared-station span a line bundles
  // onto a spine only where it stays within D2 — generous enough for the OSM
  // between-station bow (co-running subsurface tracks aren't really >100m
  // apart), tight enough to drop a genuine divergence.
  MAX_NODE_GAP: 3000, // a shared-station run splits where two consecutive
  // shared nodes are farther apart than this (m) along the line — i.e. the
  // lines genuinely diverge (real branch) rather than just skipping a stop.
  BIN: 10, // lane-packing bin width along a spine (m). == S keeps it crisp.
  OFFSET_QUANT: 0.1, // offset-mode: quantise the (smoothed) laneOff into this
  // many lane-unit steps when splitting segments — smaller = smoother junction
  // ramps but more features.
  SMOOTH_WIN: 2, // final gentle moving-average window (samples, ~±S·win/2 m)
  // on output coords, endpoints pinned — rounds raw-OSM spikes without
  // collapsing curves or the loop. 0 disables.
  SIMPLIFY_EPS: 1.5, // Douglas-Peucker tolerance (m) on the final coords. Well
  // below the lane spacing so ribbon shape/separation is untouched; collapses
  // straight runs to keep the output file small.
  COORD_DP: 6, // output coordinate decimal places (6dp ≈ 0.11m).
  SPIKE_ANGLE: 88, // de-spike: drop an input vertex whose turn angle exceeds
  // this (deg) = a near-reversal, i.e. a station-weld dart (the line jumps to a
  // station point and back). Kept high so genuine sharp junction curves (and
  // tight turn-back loops like Kennington) are preserved — faithful geometry.
  DEDUP_DIST: 110, // collapse-doubling: a vertex duplicates an earlier part of
  // the SAME feature if within this (m)... (wide, because the two running tracks
  // bow apart between stations, like co-running lines do).
  DEDUP_ANTICOS: -0.45, // ...AND anti-parallel (tangent dot below this)...
  DEDUP_MIN_ARC: 800, // ...AND that earlier part is >= this far back (m).
  DEDUP_CLOSE: 600, // merge duplicate runs separated by gaps shorter than this
  // (m) so the bowing return becomes one contiguous run.
  DEDUP_MIN_RUN: 1500, // only collapse a duplicate run at least this long (m).
  // Catches an out-and-back tracing both running tracks (Piccadilly's Heathrow
  // branch) but leaves genuine one-way loops (Heathrow T4, Circle): their sides
  // aren't close+anti-parallel over a long arc, so no long duplicate run forms.
  WELD_R: 42, // de-weld radius (m): near a station node, blend the line toward
  // a heavily-smoothed version to flatten "weld bulges" (the line pulled to a
  // platform point and back, e.g. Angel). Falls to 0 weight at WELD_R, so
  // geometry between stations is untouched (stays faithful).
  WELD_WIN: 11, // heavy-smoothing window (samples) used by the de-weld blend.
  R_NODE: 45, // a station node attaches to a line if its geometry passes within
  // this (m). Shared stations sit ~1-13m off each serving line (OSM noise).
  CLUSTER: 30, // station points within this (m) merge into one physical node.
  // Shared-line points are coincident (0m); genuinely separate stations
  // (Edgware Rd ~173m, Farringdon Thameslink ~93m) stay distinct.
  MIN_SHARED_NODES: 2, // a line bundles onto a spine only if they share at
  // least this many CONSECUTIVE station nodes (>=2 ⇒ they co-run a segment,
  // not just cross at one station).
}

// ──────────────────────────────────────────────────────────────────────────
// metric frame (flat-earth, fine at city scale; matches scripts/qa-geometry.js)
// ──────────────────────────────────────────────────────────────────────────
const M_LAT = 111320
const M_LNG = 69300 // ~ at 51.5°N
const toXY = (c) => [c[0] * M_LNG, c[1] * M_LAT]
const toLL = (p) => [p[0] / M_LNG, p[1] / M_LAT]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// ──────────────────────────────────────────────────────────────────────────
// geometry helpers
// ──────────────────────────────────────────────────────────────────────────
// Resample a polyline (metric) to ~step spacing, always keeping first & last.
function resample(xy, step) {
  if (xy.length < 2) return xy.slice()
  const out = [xy[0]]
  let carry = 0
  for (let i = 1; i < xy.length; i++) {
    let seg = dist(xy[i - 1], xy[i])
    if (seg === 0) continue
    let t = (step - carry) / seg
    while (t <= 1) {
      out.push([
        xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * t,
        xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * t,
      ])
      t += step / seg
    }
    carry = (carry + seg) % step
  }
  const last = xy[xy.length - 1]
  if (dist(out[out.length - 1], last) > step * 0.25) out.push(last)
  return out
}

// Remove "spike" vertices (near-reversals) — station-weld artifacts in the
// source where a vertex was pulled to a station and back. Iterative; endpoints
// preserved. A removed vertex's neighbours are re-evaluated against the kept
// path, so a multi-vertex spike collapses over a few passes.
function deSpike(xy, angleDeg) {
  if (xy.length < 3) return xy.slice()
  const cosT = Math.cos((angleDeg * Math.PI) / 180)
  let pts = xy
  for (let pass = 0; pass < 8; pass++) {
    let changed = false
    const out = [pts[0]]
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1]
      const b = pts[i]
      const c = pts[i + 1]
      const v1x = b[0] - a[0], v1y = b[1] - a[1]
      const v2x = c[0] - b[0], v2y = c[1] - b[1]
      const l1 = Math.hypot(v1x, v1y) || 1
      const l2 = Math.hypot(v2x, v2y) || 1
      const cos = (v1x * v2x + v1y * v2y) / (l1 * l2)
      if (cos < cosT) changed = true // turn angle > threshold -> drop b
      else out.push(b)
    }
    out.push(pts[pts.length - 1])
    pts = out
    if (!changed) break
  }
  return pts
}

// Collapse an out-and-back feature that traces both running tracks as one
// polyline (the up & down rails, ~10-20m apart, run anti-parallel). Keeps the
// FIRST pass and drops the later duplicate. A genuine one-way loop (Heathrow
// T4, the Circle line) is untouched: its sides are not both close AND
// anti-parallel over a long arc gap. Reverts if removal would splice a gap.
function collapseDoubling(xy, opts) {
  const n = xy.length
  if (n < 20) return xy
  const cum = cumlen(xy)
  if (cum[n - 1] < opts.minArc * 1.5) return xy
  const tan = (i) => {
    const a = xy[Math.max(0, i - 1)]
    const b = xy[Math.min(n - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    return [dx / L, dy / L]
  }
  const tans = []
  for (let i = 0; i < n; i++) tans.push(tan(i))
  const cell = opts.dist
  const grid = new Map()
  for (let i = 0; i < n; i++) {
    const k = Math.floor(xy[i][0] / cell) + ',' + Math.floor(xy[i][1] / cell)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(i)
  }
  const dup = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(xy[i][0] / cell), cy = Math.floor(xy[i][1] / cell)
    let hit = false
    for (let gx = cx - 1; gx <= cx + 1 && !hit; gx++)
      for (let gy = cy - 1; gy <= cy + 1 && !hit; gy++) {
        const arr = grid.get(gx + ',' + gy)
        if (!arr) continue
        for (const j of arr) {
          if (cum[j] >= cum[i] || cum[i] - cum[j] < opts.minArc) continue // partner must be earlier & far back
          if (dist(xy[i], xy[j]) > opts.dist) continue
          if (tans[i][0] * tans[j][0] + tans[i][1] * tans[j][1] > opts.antiCos) continue // anti-parallel
          dup[i] = 1; hit = true; break
        }
      }
  }
  // Close short non-duplicate gaps so the bowing return becomes one run, then
  // mark for removal only duplicate runs at least DEDUP_MIN_RUN long.
  const isDup = Array.from(dup)
  let s = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || isDup[i] !== isDup[s]) {
      if (!isDup[s] && s > 0 && i < n && cum[i - 1] - cum[s] < opts.closeArc)
        for (let k = s; k < i; k++) isDup[k] = 1 // bridge a short gap between dup runs
      s = i
    }
  }
  const remove = new Uint8Array(n)
  s = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || isDup[i] !== isDup[s]) {
      if (isDup[s] && cum[i - 1] - cum[s] >= opts.minRun)
        for (let k = s; k < i; k++) remove[k] = 1
      s = i
    }
  }
  let removed = 0
  for (let i = 0; i < n; i++) removed += remove[i]
  if (!removed || removed > n * 0.55) return xy // nothing to do / safety
  const keep = []
  for (let i = 0; i < n; i++) if (!remove[i]) keep.push(i)
  // revert if removal would splice a visible mid-feature gap
  for (let k = 1; k < keep.length; k++)
    if (keep[k] - keep[k - 1] > 1 && dist(xy[keep[k]], xy[keep[k - 1]]) > 60) return xy
  return keep.length >= 2 ? keep.map((i) => xy[i]) : xy
}

// Per-vertex unit tangent (central difference), and cumulative arc length.
function tangents(xy) {
  const n = xy.length
  const tan = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = xy[Math.max(0, i - 1)]
    const b = xy[Math.min(n - 1, i + 1)]
    let dx = b[0] - a[0]
    let dy = b[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    tan[i] = [dx / L, dy / L]
  }
  return tan
}
function cumlen(xy) {
  const c = [0]
  for (let i = 1; i < xy.length; i++) c.push(c[i - 1] + dist(xy[i - 1], xy[i]))
  return c
}
// Light tangent smoothing (3-tap) so the shared normal field is stable.
function smoothTangents(tan) {
  const n = tan.length
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = tan[Math.max(0, i - 1)]
    const b = tan[i]
    const c = tan[Math.min(n - 1, i + 1)]
    let dx = a[0] + 2 * b[0] + c[0]
    let dy = a[1] + 2 * b[1] + c[1]
    const L = Math.hypot(dx, dy) || 1
    out[i] = [dx / L, dy / L]
  }
  return out
}
// Left normal of a tangent (rotate +90°): (dx,dy) -> (-dy,dx).
const leftNormal = (t) => [-t[1], t[0]]

// Douglas-Peucker simplification (metric). eps << SPACING so ribbon shape and
// separation are preserved while straight runs collapse to few vertices —
// keeps the output file small (resampling at S explodes the vertex count).
function simplifyDP(xy, eps) {
  if (xy.length < 3) return xy.slice()
  const keep = new Uint8Array(xy.length)
  keep[0] = keep[xy.length - 1] = 1
  const stack = [[0, xy.length - 1]]
  while (stack.length) {
    const [lo, hi] = stack.pop()
    const a = xy[lo]
    const b = xy[hi]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    let far = -1
    let fd = eps
    for (let i = lo + 1; i < hi; i++) {
      const d = Math.abs((xy[i][0] - a[0]) * dy - (xy[i][1] - a[1]) * dx) / L
      if (d > fd) { fd = d; far = i }
    }
    if (far >= 0) { keep[far] = 1; stack.push([lo, far], [far, hi]) }
  }
  const out = []
  for (let i = 0; i < xy.length; i++) if (keep[i]) out.push(xy[i])
  return out
}

// Moving-average smooth of a vector series over a window of `win` samples.
function smoothVecs(vecs, win) {
  const n = vecs.length
  if (win < 1) return vecs.map((v) => v.slice())
  const half = Math.floor(win / 2)
  // prefix sums for O(n)
  const px = [0]
  const py = [0]
  for (let i = 0; i < n; i++) {
    px.push(px[i] + vecs[i][0])
    py.push(py[i] + vecs[i][1])
  }
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(n - 1, i + half)
    const cnt = hi - lo + 1
    out[i] = [(px[hi + 1] - px[lo]) / cnt, (py[hi + 1] - py[lo]) / cnt]
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────────
// spatial grid over spine vertices for fast nearest-with-tangent queries
// ──────────────────────────────────────────────────────────────────────────
class SpineGrid {
  constructor(cell) {
    this.cell = cell
    this.map = new Map()
  }
  key(x, y) {
    return Math.floor(x / this.cell) + ',' + Math.floor(y / this.cell)
  }
  add(spineId, idx, x, y, tx, ty) {
    const k = this.key(x, y)
    let arr = this.map.get(k)
    if (!arr) this.map.set(k, (arr = []))
    arr.push({ spineId, idx, x, y, tx, ty })
  }
  // nearest spine vertex within D of p that is tangent-parallel to `tan`.
  // If onlySpine >= 0, restrict to that spine.
  nearest(p, tan, D, angCos, onlySpine = -1) {
    const cx = Math.floor(p[0] / this.cell)
    const cy = Math.floor(p[1] / this.cell)
    let best = null
    let bestD = D
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const arr = this.map.get(gx + ',' + gy)
        if (!arr) continue
        for (const e of arr) {
          if (onlySpine >= 0 && e.spineId !== onlySpine) continue
          const d = Math.hypot(e.x - p[0], e.y - p[1])
          if (d >= bestD) continue
          if (tan) {
            const dot = Math.abs(tan[0] * e.tx + tan[1] * e.ty)
            if (dot < angCos) continue
          }
          bestD = d
          best = e
        }
      }
    }
    return best
  }
}

// ──────────────────────────────────────────────────────────────────────────
// main
// ──────────────────────────────────────────────────────────────────────────
// Load station Points from features.json and cluster them into physical nodes
// (union-find by proximity <= cluster metres). Returns node centroids [[x,y]].
function loadNodes(dataDir, cluster) {
  const fc = JSON.parse(fs.readFileSync(path.join(dataDir, 'features.json'), 'utf8'))
  const pts = []
  for (const f of fc.features)
    if (f.geometry && f.geometry.type === 'Point') pts.push(toXY(f.geometry.coordinates))
  const parent = pts.map((_, i) => i)
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  // grid-bucket so we only test nearby pairs
  const cell = cluster
  const g = new Map()
  pts.forEach((p, i) => {
    const k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell)
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(i)
  })
  pts.forEach((p, i) => {
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell)
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const arr = g.get(gx + ',' + gy)
        if (!arr) continue
        for (const j of arr)
          if (j > i && Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) <= cluster)
            parent[find(i)] = find(j)
      }
  })
  const agg = new Map()
  pts.forEach((p, i) => {
    const r = find(i)
    if (!agg.has(r)) agg.set(r, [0, 0, 0])
    const a = agg.get(r)
    a[0] += p[0]; a[1] += p[1]; a[2]++
  })
  return [...agg.values()].map((a) => [a[0] / a[2], a[1] / a[2]])
}

function parseArgs() {
  const a = process.argv.slice(2)
  const DATA = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')
  const o = {
    in: path.join(DATA, 'routes.json'),
    out: path.join(DATA, 'routes.json'),
    report: false,
    mode: 'offset', // 'offset' (render-time line-offset; default) | 'baked'
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--in') o.in = a[++i]
    else if (a[i] === '--out') o.out = a[++i]
    else if (a[i] === '--report') o.report = true
    else if (a[i] === '--debug') o.debug = a[++i].split(',').map(Number)
    else if (a[i] === '--debug-line') o.debugLine = a[++i]
    else if (a[i] === '--mode') o.mode = a[++i] // 'offset' (default) | 'baked'
    else if (a[i] === '--force') o.force = true // allow building from processed input
  }
  return o
}

function main() {
  const args = parseArgs()
  const raw = JSON.parse(fs.readFileSync(args.in, 'utf8'))
  // Footgun guard: always build from the pristine pre-offset source, never from
  // an already-processed routes.json (that double-snaps / double-offsets).
  const alreadyProcessed = raw.features.some((f) => f.properties && 'laneOff' in f.properties)
  if (alreadyProcessed && !args.force) {
    console.error(
      `Refusing to build from ${path.basename(args.in)} — it is already ribbon-processed ` +
        `(has 'laneOff'). Build from the pristine raw-OSM source, e.g.\n  --in ` +
        `src/app/(game)/london/data/routes.osm.json --out src/app/(game)/london/data/routes.json\n` +
        `(use --force to override).`,
    )
    process.exit(1)
  }
  const ORDER = require('./line-order.js') // {lineKey: order}

  // ---- load features ----
  // feat = { line, order, props, xyRaw, xy, tan, cum, segments:[] }
  const feats = []
  for (const f of raw.features) {
    if (!f.geometry || f.geometry.type !== 'LineString') {
      feats.push({ passthrough: f })
      continue
    }
    const line = f.properties.line
    const collapsed = collapseDoubling(f.geometry.coordinates.map(toXY), {
      dist: CONFIG.DEDUP_DIST, antiCos: CONFIG.DEDUP_ANTICOS, minArc: CONFIG.DEDUP_MIN_ARC,
      closeArc: CONFIG.DEDUP_CLOSE, minRun: CONFIG.DEDUP_MIN_RUN,
    })
    const xy = resample(deSpike(collapsed, CONFIG.SPIKE_ANGLE), CONFIG.S)
    feats.push({
      line,
      order: ORDER[line] != null ? ORDER[line] : 999,
      props: f.properties,
      xy,
      tan: smoothTangents(tangents(xy)),
      cum: cumlen(xy),
      segments: [], // filled during snapping
    })
  }
  const lineFeats = feats.filter((f) => !f.passthrough)

  // ---- station nodes (topology anchors, brief §3) -------------------------
  // Cluster every station Point into physical nodes. Shared-station points are
  // coincident across lines (0m), so a tiny cluster radius groups co-running
  // lines' anchors while keeping genuinely-separate stations (Edgware Rd ~173m,
  // Farringdon Thameslink ~93m) distinct. We only need node POSITIONS: two
  // lines that pass near >=2 consecutive nodes provably co-run between them —
  // the robust corridor signal the raw geometry (which bows up to ~60m apart)
  // can't give. Nodes are used for membership DETECTION only; they never bend
  // line geometry (no station welding — that was the old pipeline's bad UX).
  const nodes = loadNodes(path.dirname(args.in), CONFIG.CLUSTER) // [[x,y],...]
  const nodeGrid = new SpineGrid(CONFIG.R_NODE)
  nodes.forEach((p, i) => nodeGrid.add(i, i, p[0], p[1], 0, 0))
  // For each feature, the ordered sequence of nodes it passes (within R_NODE).
  for (const f of lineFeats) f.nodes = projectNodes(f.xy, f.cum)

  // De-weld: flatten station-weld bulges (the source pulled vertices to platform
  // points, e.g. Angel). Blend each vertex toward a heavily-smoothed copy with a
  // weight that's 1 at a station node and 0 by WELD_R — so a short bulge at a
  // through-station gets flattened, but sustained real curvature (a junction,
  // or geometry between stations) is left faithful. Recompute tangents/arc/nodes.
  for (const f of lineFeats) {
    f.xy = deWeld(f.xy)
    f.tan = smoothTangents(tangents(f.xy))
    f.cum = cumlen(f.xy)
    f.nodes = projectNodes(f.xy, f.cum)
  }
  function deWeld(xy) {
    const n = xy.length
    if (n < CONFIG.WELD_WIN + 2) return xy
    const heavy = smoothVecs(xy, CONFIG.WELD_WIN)
    const out = xy.map((p, i) => {
      const e = nodeGrid.nearest(p, null, CONFIG.WELD_R, 0)
      if (!e) return p
      const d = Math.hypot(e.x - p[0], e.y - p[1])
      const w = Math.max(0, 1 - d / CONFIG.WELD_R) // 1 at node -> 0 at WELD_R
      return [p[0] + (heavy[i][0] - p[0]) * w, p[1] + (heavy[i][1] - p[1]) * w]
    })
    out[0] = xy[0]
    out[n - 1] = xy[n - 1]
    return out
  }

  // returns ordered [{node, vertIdx, arc}] for nodes within R_NODE of the line
  function projectNodes(xy, cum) {
    const best = new Map() // node -> {d, vertIdx}
    for (let i = 0; i < xy.length; i++) {
      const cx = Math.floor(xy[i][0] / nodeGrid.cell)
      const cy = Math.floor(xy[i][1] / nodeGrid.cell)
      for (let gx = cx - 1; gx <= cx + 1; gx++)
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const arr = nodeGrid.map.get(gx + ',' + gy)
          if (!arr) continue
          for (const e of arr) {
            const d = Math.hypot(e.x - xy[i][0], e.y - xy[i][1])
            if (d > CONFIG.R_NODE) continue
            const cur = best.get(e.idx)
            if (!cur || d < cur.d) best.set(e.idx, { d, vertIdx: i })
          }
        }
    }
    return [...best.entries()]
      .map(([node, v]) => ({ node, vertIdx: v.vertIdx, arc: cum[v.vertIdx] }))
      .sort((a, b) => a.arc - b.arc)
  }

  // ---- processing order: lowest config order first, then longest first ----
  const procOrder = lineFeats
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.order - b.f.order || b.f.cum.at(-1) - a.f.cum.at(-1))

  // ---- spines ----
  const spines = [] // {id, xy, tan, cum, members:Map(line->[[s0,s1]]), sign}
  const grid = new SpineGrid(CONFIG.D)

  function addSpine(xy) {
    const tan = smoothTangents(tangents(xy))
    const cum = cumlen(xy)
    const id = spines.length
    const nseq = projectNodes(xy, cum) // ordered nodes along this spine
    const npos = new Map() // node -> index in nseq
    nseq.forEach((e, k) => npos.set(e.node, k))
    spines.push({ id, xy, tan, cum, members: new Map(), sign: 1, nseq, npos })
    for (let i = 0; i < xy.length; i++)
      grid.add(id, i, xy[i][0], xy[i][1], tan[i][0], tan[i][1])
    return id
  }

  // Maximal runs of f's nodes (consecutive in f's order) that all lie on spine
  // X, each spanning >= MIN_SHARED_NODES. Returns [{vLo, vHi}] f-vertex ranges.
  // This is the robust co-running signal: two lines sharing >=2 consecutive
  // stations provably run together between them, however far their raw
  // geometries bow apart. We do NOT require monotonicity in X's order — X may
  // be a cyclic loop (Circle), and reconstruction re-projects each vertex onto
  // X independently, so the run only bounds WHICH vertices to bundle.
  function sharedNodeRuns(fNodes, X) {
    // f's nodes that also lie on X, in f order
    const shared = fNodes.filter((nd) => X.npos.has(nd.node))
    if (shared.length < CONFIG.MIN_SHARED_NODES) return []
    // split into runs at large arc gaps (genuine divergence, not a skipped stop)
    const out = []
    let start = 0
    for (let k = 1; k <= shared.length; k++) {
      const gap = k < shared.length ? shared[k].arc - shared[k - 1].arc : Infinity
      if (gap > CONFIG.MAX_NODE_GAP) {
        if (k - start >= CONFIG.MIN_SHARED_NODES)
          out.push({ vLo: shared[start].vertIdx, vHi: shared[k - 1].vertIdx })
        start = k
      }
    }
    return out
  }
  function addMember(spineId, line, s0, s1) {
    const m = spines[spineId].members
    if (!m.has(line)) m.set(line, [])
    m.get(line).push([Math.min(s0, s1), Math.max(s0, s1)])
  }

  // hysteresis on a per-point assignment array of spineIds (-1 = solo).
  // ptStep = metres per point (= S). Bridges gaps < GAP_FILL between same
  // spine; removes snapped runs < MIN_MEMBER. Returns cleaned array.
  function hysteresis(assign, fxy) {
    const n = assign.length
    const ptsFor = (m) => Math.max(1, Math.round(m / CONFIG.S))
    // pass 1: drop short snapped blips -> solo
    let a = assign.slice()
    for (const [val, lo, hi] of runs(a)) {
      if (val >= 0 && (hi - lo + 1) < ptsFor(CONFIG.MIN_MEMBER)) {
        for (let i = lo; i <= hi; i++) a[i] = -1
      }
    }
    // pass 2: bridge short gaps flanked by the SAME spine
    const gp = ptsFor(CONFIG.GAP_FILL)
    let r = runs(a)
    for (let k = 1; k < r.length - 1; k++) {
      const [val, lo, hi] = r[k]
      const prev = r[k - 1]
      const next = r[k + 1]
      if (val !== prev[0] && prev[0] === next[0] && prev[0] >= 0 && (hi - lo + 1) <= gp) {
        for (let i = lo; i <= hi; i++) a[i] = prev[0]
      }
    }
    // (Membership across the between-station "bow" of co-runners is handled
    // by station-run extension in the main loop, NOT by widening the geometric
    // radius — in dense central London a wide radius grabs the wrong spine.)
    return a
  }
  function runs(arr) {
    const out = []
    let s = 0
    for (let i = 1; i <= arr.length; i++) {
      if (i === arr.length || arr[i] !== arr[s]) {
        out.push([arr[s], s, i - 1])
        s = i
      }
    }
    return out
  }

  for (const { f } of procOrder) {
    const n = f.xy.length
    // 1) assign each point to nearest existing spine (or -1)
    const assign = new Array(n).fill(-1)
    for (let i = 0; i < n; i++) {
      const e = grid.nearest(f.xy[i], f.tan[i], CONFIG.D, CONFIG.ANG_COS)
      if (e) assign[i] = e.spineId
    }
    const clean = hysteresis(assign, f.xy)

    // 1b) STATION-RUN EXTENSION: bundle f onto any existing spine it shares
    // >=2 consecutive station nodes with, filling the between-station bow that
    // the geometric radius misses. Only fills -1 (solo) vertices, and only
    // where f stays within D2 of the spine (rules out same-name-far-apart).
    for (const X of spines) {
      for (const run of sharedNodeRuns(f.nodes, X)) {
        // Within each shared-station span, fill each solo vertex onto X — but
        // only where f actually stays within the D2 corridor of X (per-vertex,
        // so the close "bow" stretches bundle while any genuinely-divergent
        // middle does not). Captures Met's ~50-60m bow off Circle north trunk.
        for (let i = run.vLo; i <= run.vHi; i++)
          if (clean[i] === -1 && grid.nearest(f.xy[i], null, CONFIG.D2, 0, X.id)) clean[i] = X.id
      }
    }
    // re-clean (drop any tiny snapped blips the extension left, bridge gaps)
    const clean2 = hysteresis(clean, f.xy)
    for (let i = 0; i < n; i++) clean[i] = clean2[i]

    // 2) walk runs: snapped runs -> member; solo runs >= MIN_SPINE -> new spine
    for (const [val, lo, hi] of runs(clean)) {
      const segLen = f.cum[hi] - f.cum[lo]
      if (val >= 0) {
        // member of existing spine `val`; record arc range on that spine
        const sp = spines[val]
        const s0 = projectArc(sp, f.xy[lo])
        const s1 = projectArc(sp, f.xy[hi])
        addMember(val, f.line, s0, s1)
        f.segments.push({ kind: 'snap', spineId: val, lo, hi })
      } else if (segLen >= CONFIG.MIN_SPINE || (f.segments.length === 0 && hi === n - 1)) {
        // lay a new spine from this feature's own run
        const runXY = f.xy.slice(lo, hi + 1)
        if (runXY.length >= 2) {
          const id = addSpine(runXY)
          addMember(id, f.line, 0, spines[id].cum.at(-1))
          // own run maps to spine vertices 1:1 (offset lo)
          f.segments.push({ kind: 'own', spineId: id, lo, hi, base: lo })
        } else {
          f.segments.push({ kind: 'solo', lo, hi })
        }
      } else {
        f.segments.push({ kind: 'solo', lo, hi })
      }
    }
  }

  // project a metric point onto a spine polyline -> arc length (m)
  function projectArc(sp, p) {
    let best = Infinity
    let bestS = 0
    for (let i = 1; i < sp.xy.length; i++) {
      const a = sp.xy[i - 1]
      const b = sp.xy[i]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const L = dx * dx + dy * dy
      let t = L === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L
      t = Math.max(0, Math.min(1, t))
      const cx = a[0] + t * dx
      const cy = a[1] + t * dy
      const d = Math.hypot(cx - p[0], cy - p[1])
      if (d < best) {
        best = d
        bestS = sp.cum[i - 1] + t * Math.sqrt(L)
      }
    }
    return bestS
  }
  // sample a spine at arc length s -> {pt:[x,y], normal:[nx,ny]}
  function spineAt(sp, s) {
    const cum = sp.cum
    let i = 1
    // binary-ish linear search
    while (i < cum.length - 1 && cum[i] < s) i++
    const s0 = cum[i - 1]
    const s1 = cum[i]
    const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0
    const a = sp.xy[i - 1]
    const b = sp.xy[i]
    const pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const ta = sp.tan[i - 1]
    const tb = sp.tan[i]
    let nx = -(ta[1] + tb[1])
    let ny = ta[0] + tb[0]
    const L = Math.hypot(nx, ny) || 1
    return { pt, normal: [nx / L, ny / L] }
  }

  // ---- lane packing per spine (per BIN, sorted by order) ----
  for (const sp of spines) {
    const total = sp.cum.at(-1)
    const nb = Math.max(1, Math.ceil(total / CONFIG.BIN))
    sp.nb = nb
    sp.lanes = new Map() // line -> Float array of LANE INDEX (NaN where absent)
    sp.mcount = new Int16Array(nb) // # co-runners present per bin
    const memberLines = [...sp.members.keys()]
    for (const line of memberLines) sp.lanes.set(line, new Float64Array(nb).fill(NaN))
    for (let b = 0; b < nb; b++) {
      const mid = (b + 0.5) * CONFIG.BIN
      const present = []
      for (const line of memberLines) {
        const segs = sp.members.get(line)
        if (segs.some(([a, c]) => mid >= a - CONFIG.BIN && mid <= c + CONFIG.BIN)) present.push(line)
      }
      present.sort((a, c) => (ORDER[a] ?? 999) - (ORDER[c] ?? 999) || (a < c ? -1 : 1))
      const m = present.length
      sp.mcount[b] = m
      for (let r = 0; r < m; r++) {
        sp.lanes.get(present[r])[b] = r - (m - 1) / 2 // signed lane INDEX
      }
    }
  }
  const spacingFor = (m) => CONFIG.LANE_SPACING[m] ?? CONFIG.LANE_SPACING_DEFAULT
  function mcountAt(sp, s) {
    let b = Math.floor(s / CONFIG.BIN)
    return sp.mcount[Math.max(0, Math.min(sp.nb - 1, b))] || 1
  }
  // signed lane INDEX for a line at spine arc s (rank centred on the stack)
  function laneAt(sp, line, s) {
    const arr = sp.lanes.get(line)
    if (!arr) return 0
    let b = Math.floor(s / CONFIG.BIN)
    b = Math.max(0, Math.min(sp.nb - 1, b))
    let v = arr[b]
    if (!Number.isNaN(v)) return v
    // nearest non-NaN (line briefly outside its recorded segs)
    for (let d = 1; d < sp.nb; d++) {
      if (b - d >= 0 && !Number.isNaN(arr[b - d])) return arr[b - d]
      if (b + d < sp.nb && !Number.isNaN(arr[b + d])) return arr[b + d]
    }
    return 0
  }

  // ---- bake offsets for one feature given current spine signs ----
  function bake(f) {
    const n = f.xy.length
    const off = new Array(n)
    for (let i = 0; i < n; i++) off[i] = [0, 0]
    for (const seg of f.segments) {
      if (seg.kind === 'solo') continue
      const sp = spines[seg.spineId]
      for (let i = seg.lo; i <= seg.hi; i++) {
        let spt, normal, s
        if (seg.kind === 'own') {
          const k = i - seg.base
          spt = sp.xy[k]
          const t = sp.tan[k]
          normal = [-t[1], t[0]]
          s = sp.cum[k]
        } else {
          s = projectArc(sp, f.xy[i])
          const r = spineAt(sp, s)
          spt = r.pt
          normal = r.normal
        }
        const lane = laneAt(sp, f.line, s) * spacingFor(mcountAt(sp, s)) * sp.sign // metres
        off[i] = [spt[0] - f.xy[i][0] + lane * normal[0], spt[1] - f.xy[i][1] + lane * normal[1]]
      }
    }
    const sm = smoothVecs(off, Math.round(CONFIG.TAPER / CONFIG.S))
    let out = f.xy.map((p, i) => [p[0] + sm[i][0], p[1] + sm[i][1]])
    // gentle final smoothing of the baked coords (endpoints pinned) to round
    // raw-OSM spikes; a small window can't collapse curves or the loop.
    if (CONFIG.SMOOTH_WIN >= 2 && out.length > CONFIG.SMOOTH_WIN + 2) {
      const s = smoothVecs(out, CONFIG.SMOOTH_WIN)
      out = out.map((p, i) => (i === 0 || i === out.length - 1 ? p : s[i]))
    }
    return out
  }

  // ---- OFFSET MODE: emit shared-centreline geometry + a per-segment lane
  // offset (in lane units), to be separated at render time by `line-offset`.
  // Geometry eases onto the shared centreline (smoothed snap, no lane term);
  // the cross-track separation is the runtime offset. Co-runners share ~the
  // same centreline so their tangents match and they stay parallel. A feature
  // is split where its lane changes (junctions) — each piece carries a constant
  // laneOff. MapLibre: +offset = right of line direction, so we flip per the
  // emitted tangent (dir) and spine sign. Returns [{coords(metric), off}].
  function offsetSegments(f) {
    const n = f.xy.length
    const snap = []
    for (let i = 0; i < n; i++) snap.push([0, 0])
    const offv = new Float64Array(n)
    for (const seg of f.segments) {
      if (seg.kind === 'solo') continue
      const sp = spines[seg.spineId]
      let dir = 1
      if (seg.kind !== 'own') {
        const s0 = projectArc(sp, f.xy[seg.lo])
        const s1 = projectArc(sp, f.xy[seg.hi])
        dir = s1 - s0 >= 0 ? 1 : -1
      }
      for (let i = seg.lo; i <= seg.hi; i++) {
        let spt, s
        if (seg.kind === 'own') {
          const k = i - seg.base
          spt = sp.xy[k]
          s = sp.cum[k]
        } else {
          s = projectArc(sp, f.xy[i])
          spt = spineAt(sp, s).pt
        }
        snap[i] = [spt[0] - f.xy[i][0], spt[1] - f.xy[i][1]]
        offv[i] = -laneAt(sp, f.line, s) * sp.sign * dir // lane units, render-side
      }
    }
    const sm = smoothVecs(snap, Math.round(CONFIG.TAPER / CONFIG.S))
    let pos = f.xy.map((p, i) => [p[0] + sm[i][0], p[1] + sm[i][1]])
    if (CONFIG.SMOOTH_WIN >= 2 && pos.length > CONFIG.SMOOTH_WIN + 2) {
      const sp2 = smoothVecs(pos, CONFIG.SMOOTH_WIN)
      pos = pos.map((p, i) => (i === 0 || i === pos.length - 1 ? p : sp2[i]))
    }
    // Smooth the per-vertex laneOff over a taper so it RAMPS where a line joins
    // / leaves a stack instead of stepping (line-offset can't taper, so the jump
    // showed as a discontinuity at junctions, e.g. Ealing/Acton). Then split
    // into runs of quantised laneOff: stable corridors stay one segment; a ramp
    // becomes a few short segments whose tiny offset steps read as a smooth ease.
    const win = Math.round(CONFIG.TAPER / CONFIG.S)
    const offS = smoothScalar(offv, win)
    const Q = CONFIG.OFFSET_QUANT
    const out = []
    let start = 0
    const keyAt = (i) => Math.round(offS[i] / Q)
    for (let i = 1; i <= n; i++) {
      if (i === n || keyAt(i) !== keyAt(start)) {
        out.push({ coords: pos.slice(start, Math.min(n, i + 1)), off: keyAt(start) * Q })
        start = i
      }
    }
    return out
  }
  // 1D moving average (endpoints clamped) — used to ramp laneOff at junctions.
  function smoothScalar(arr, win) {
    const n = arr.length
    if (win < 1) return Array.from(arr)
    const half = Math.floor(win / 2)
    const pre = [0]
    for (let i = 0; i < n; i++) pre.push(pre[i] + arr[i])
    const out = new Array(n)
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - half)
      const hi = Math.min(n - 1, i + half)
      out[i] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1)
    }
    return out
  }

  // ---- orient spine signs to satisfy §4 (Circle interior) -----------------
  // For each ordering assertion, if it fails, flip the sign of the spine that
  // the two named lines share at that probe, and re-evaluate. Deterministic;
  // converges in a couple of passes (only the loop spine actually needs it).
  const ASSERTS = [
    // [probe lng,lat], northLine, southLine  (northLine must end up N of southLine)
    [[-0.1223, 51.5073], 'Circle', 'District'], // Embankment (south trunk)
  ]
  function bakedLLForLineNear(probeLL, line) {
    // returns the baked latitude of `line` nearest the probe
    let best = Infinity
    let lat = null
    const p = toXY(probeLL)
    for (const f of lineFeats) {
      if (f.line !== line) continue
      const out = f._baked
      for (const q of out) {
        const d = Math.hypot(q[0] - p[0], q[1] - p[1])
        if (d < best) {
          best = d
          lat = q[1] / M_LAT
        }
      }
    }
    return { lat, d: best }
  }
  function spineNear(probeLL, line) {
    // which spine does `line` use nearest the probe?
    const p = toXY(probeLL)
    let best = Infinity
    let sid = -1
    for (const f of lineFeats) {
      if (f.line !== line) continue
      for (const seg of f.segments) {
        if (seg.kind === 'solo') continue
        for (let i = seg.lo; i <= seg.hi; i++) {
          const d = Math.hypot(f.xy[i][0] - p[0], f.xy[i][1] - p[1])
          if (d < best) {
            best = d
            sid = seg.spineId
          }
        }
      }
    }
    return sid
  }
  function bakeAll() {
    for (const f of lineFeats) f._baked = bake(f)
  }
  bakeAll()
  for (let pass = 0; pass < 6; pass++) {
    let changed = false
    for (const [probe, nLine, sLine] of ASSERTS) {
      const a = bakedLLForLineNear(probe, nLine)
      const b = bakedLLForLineNear(probe, sLine)
      if (a.lat == null || b.lat == null) continue
      if (a.lat <= b.lat) {
        // wrong: flip the spine shared at the probe
        const sid = spineNear(probe, nLine)
        if (sid >= 0) {
          spines[sid].sign *= -1
          changed = true
        }
      }
    }
    if (!changed) break
    bakeAll()
  }

  // ---- write output, preserving schema ----
  const k = Math.pow(10, CONFIG.COORD_DP)
  const round = (v) => Math.round(v * k) / k
  const toOut = (coords) => coords.map((p) => [round(p[0] / M_LNG), round(p[1] / M_LAT)])
  let fi = 0
  let outFeatures
  if (args.mode === 'offset') {
    // each line -> one feature per constant-laneOff segment (centreline geom +
    // laneOff property); separation is applied at render via line-offset.
    outFeatures = []
    for (const orig of raw.features) {
      if (!orig.geometry || orig.geometry.type !== 'LineString') { outFeatures.push(orig); continue }
      const f = lineFeats[fi++]
      for (const seg of offsetSegments(f)) {
        const simp = simplifyDP(seg.coords, CONFIG.SIMPLIFY_EPS)
        if (simp.length < 2) continue
        outFeatures.push({
          type: 'Feature',
          properties: { ...orig.properties, offset: 0, laneOff: round(seg.off) },
          geometry: { type: 'LineString', coordinates: toOut(simp) },
        })
      }
    }
  } else {
    outFeatures = raw.features.map((orig) => {
      if (!orig.geometry || orig.geometry.type !== 'LineString') return orig
      const f = lineFeats[fi++]
      const simp = simplifyDP(f._baked, CONFIG.SIMPLIFY_EPS)
      return {
        type: 'Feature',
        properties: { ...orig.properties, offset: 0, laneOff: 0 }, // baked: no runtime offset
        geometry: { type: 'LineString', coordinates: toOut(simp) },
      }
    })
  }
  const out = { ...raw, features: outFeatures }
  fs.writeFileSync(args.out, JSON.stringify(out))
  console.log(
    `Wrote ${path.relative(process.cwd(), args.out)} [mode=${args.mode}]: ` +
      `${outFeatures.length} features, ${spines.length} spines.`,
  )

  if (args.report) printReport(spines, lineFeats)
  if (args.debug) debugProbe(args.debug, lineFeats, spines, laneAt, projectArc, ORDER)
  if (args.debugLine) {
    console.log(`\n=== debug line ${args.debugLine} ===`)
    lineFeats.filter((f) => f.line === args.debugLine).forEach((f, fi) => {
      console.log(`feature ${fi}: ${f.xy.length} verts, ${(f.cum.at(-1) / 1000).toFixed(1)}km`)
      console.log('  nodes(id@vertIdx):', f.nodes.map((nd) => `${nd.node}@${nd.vertIdx}`).join(' '))
      console.log('  segments:', f.segments.map((s) => `${s.kind}#${s.spineId ?? ''}[${s.lo}-${s.hi}]`).join(' '))
    })
  }
}

// Print, for every line feature passing near a probe, which spine/lane/sign it
// uses there and the baked latitude — for diagnosing ordering failures.
function debugProbe(probeLL, lineFeats, spines, laneAt, projectArc, ORDER) {
  const p = toXY(probeLL)
  console.log(`\n=== debug probe @ ${probeLL} ===`)
  const rows = []
  for (const f of lineFeats) {
    let best = Infinity, bestSeg = null, bestI = -1
    f.segments.forEach((seg) => {
      for (let i = seg.lo; i <= seg.hi; i++) {
        const d = Math.hypot(f.xy[i][0] - p[0], f.xy[i][1] - p[1])
        if (d < best) { best = d; bestSeg = seg; bestI = i }
      }
    })
    if (best > 200) continue
    const bakedLat = f._baked[bestI][1]
    let info = `solo`
    if (bestSeg.kind !== 'solo') {
      const sp = spines[bestSeg.spineId]
      const s = bestSeg.kind === 'own' ? sp.cum[bestI - bestSeg.base] : projectArc(sp, f.xy[bestI])
      const lane = laneAt(sp, f.line, s)
      info = `spine#${bestSeg.spineId}(${bestSeg.kind}) members=[${[...sp.members.keys()].join(',')}] offsetM=${lane} sign=${sp.sign}`
    }
    rows.push({ line: f.line, order: ORDER[f.line], d: best, bakedLat, info })
  }
  rows.sort((a, b) => b.bakedLat - a.bakedLat)
  console.log('  (sorted N->S by baked latitude)')
  for (const r of rows)
    console.log(`  ${r.line.padEnd(20)} ord=${String(r.order).padStart(2)} d=${r.d.toFixed(0).padStart(4)}m lat=${r.bakedLat.toFixed(5)}  ${r.info}`)
}

function printReport(spines, lineFeats) {
  const multi = spines.filter((s) => s.members.size >= 2)
  console.log(`\nShared corridors (spines with >=2 member lines): ${multi.length}`)
  multi
    .map((s) => ({
      len: s.cum.at(-1),
      members: [...s.members.keys()],
    }))
    .sort((a, b) => b.len - a.len)
    .slice(0, 25)
    .forEach((s) =>
      console.log(`  ${(s.len / 1000).toFixed(2)}km  [${s.members.join(', ')}]`),
    )
}

main()

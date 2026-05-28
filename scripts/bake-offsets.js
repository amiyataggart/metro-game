#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * bake-offsets.js — BAKE PARALLEL OFFSETS INTO LINE GEOMETRY.
 *
 * Final stage of the route pipeline, and the reason GamePage.tsx renders with
 * `line-offset: 0`. MapLibre's runtime `line-offset` pushes each line
 * perpendicular to its OWN local tangent; where two co-running lines have even
 * slightly different vertex geometry (each comes from a different OSM way
 * average) their tangents differ, so the ribbons cross, fan out and flip sides
 * across zoom. Baking the offset into the coordinates removes that whole class
 * of bug — co-running lines stay exactly parallel and never reorder.
 *
 * Pipeline order (regenerating from scratch):
 *   node scripts/fetch-osm-routes.js     # OSM geometry  -> routes.json
 *   node scripts/postprocess-routes.js   # weld+offset+smooth, IN PLACE
 *   node scripts/bake-offsets.js         # bake offsets,  IN PLACE   <-- this
 *
 * Approach (all at BUILD time):
 *   2a SHARED CENTERLINE: detect co-running spans between different lines and
 *      replace each member span with one shared resampled centerline, so
 *      co-runners share identical underlying geometry.
 *   2b STATION WELD: snap each (station,line) nearest vertex onto the canonical
 *      station coord (topology: lines pass through their own stations).
 *   3  pin-aware Chaikin smoothing (welds/seams pinned so they survive).
 *   3b same-line byte-share (align overlapping same-line spans).
 *   4  BAKE the uniform parallel offset = offsetUnits * SPACING_DEG via
 *      per-vertex miter normals; properties.offset := 0.
 *
 * NOTE: the committed routes.json is the human-reviewed baked snapshot. This
 * script is guarded against double-baking (it refuses to run when every offset
 * is already 0); regenerate via the full pipeline above. A fresh run is
 * equivalent in approach but not byte-identical to the committed snapshot.
 *
 * In:  src/app/(game)/london/data/routes.json (postprocess output; offsets != 0)
 *      src/app/(game)/london/data/features.json          (station welding)
 *      src/app/(game)/london/data/stations-extras.json   (station welding)
 * Out: src/app/(game)/london/data/routes.json (baked, IN PLACE; offsets 0)
 */

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(
  __dirname,
  '..',
  'src',
  'app',
  '(game)',
  'london',
  'data',
)
const ROUTES_SRC = path.join(DATA_DIR, 'routes.json')
const FEATURES_SRC = path.join(DATA_DIR, 'features.json')
const STATIONS_EXTRAS_SRC = path.join(DATA_DIR, 'stations-extras.json')
const ROUTES_DST = path.join(DATA_DIR, 'routes.json')

// Keep in sync with config.ts. Lower = drawn underneath. (Copied verbatim.)
const LINE_ORDER = {
  Bakerloo: 0, Central: 1, Circle: 2, District: 3, HammersmithAndCity: 4,
  Jubilee: 5, Metropolitan: 6, Northern: 7, Piccadilly: 8, Victoria: 9,
  WaterlooAndCity: 10, ElizabethLine: 11, DLR: 12, Lioness: 13, Mildmay: 14,
  Windrush: 15, Weaver: 16, Suffragette: 17, Liberty: 18, Thameslink: 19,
  GreatNorthern: 20, Southern: 21, GatwickExpress: 22,
}

// The 23 canonical line keys — used for the final validation assert.
const LINE_KEYS = Object.keys(LINE_ORDER)

// ─── Tunables ──────────────────────────────────────────────────────────────

// Perpendicular spacing between adjacent stacked lines, in degrees.
// At ~51.5°N, 1° lat ≈ 111.2 km, so 0.00018° ≈ 20m N–S; lon is compressed by
// cos(51.5°)≈0.62 so E–W ≈ 12.4m. Averaged ground spacing ≈ 12–14m, which
// reads as cleanly-parallel ribbons around zoom 12–13. Because the offset is
// baked in GROUND units (not screen pixels), it looks tight when zoomed out
// and generous when zoomed in — that is the explicit tradeoff of this variant.
const SPACING_DEG = 0.00018

// Co-running detection tolerance (~45m) and minimum overlapping vertices.
const CORUN_TOL_DEG = 0.00045 // ~45–50m
const CORUN_MIN_VERTS = 12

// Station weld radius (~60m): nearest vertex of a (station,line) line snaps
// onto the canonical station coordinate.
const WELD_TOL_DEG = 0.00055 // ~60m

// Bucket grid (copied) — ~14m × ~22m.
const GRID = 0.0002

// ─── Copied helpers (postprocess-routes.js / fetch-osm-routes.js) ───────────

const bucketsFor = (coords) => {
  const set = new Set()
  for (const [lng, lat] of coords) {
    set.add(`${Math.round(lng / GRID)},${Math.round(lat / GRID)}`)
  }
  return set
}

// Distance from point p to segment a→b, squared (degree units).
function pointToSegmentSq(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lensq = dx * dx + dy * dy
  if (lensq === 0) {
    const px = p[0] - a[0]
    const py = p[1] - a[1]
    return px * px + py * py
  }
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lensq
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const cx = a[0] + t * dx - p[0]
  const cy = a[1] + t * dy - p[1]
  return cx * cx + cy * cy
}

// Spatial-hash index of one or more polylines' SEGMENTS. Returns a predicate
// "is point p within tolDeg of any indexed segment?" in ~O(1).
function buildSegmentIndex(polylines, tolDeg) {
  const cell = tolDeg
  const idx = new Map()
  const add = (key, payload) => {
    if (!idx.has(key)) idx.set(key, [])
    idx.get(key).push(payload)
  }
  for (const coords of polylines) {
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1]
      const b = coords[i]
      const minX = Math.min(a[0], b[0]) - tolDeg
      const maxX = Math.max(a[0], b[0]) + tolDeg
      const minY = Math.min(a[1], b[1]) - tolDeg
      const maxY = Math.max(a[1], b[1]) + tolDeg
      const x0 = Math.floor(minX / cell)
      const x1 = Math.floor(maxX / cell)
      const y0 = Math.floor(minY / cell)
      const y1 = Math.floor(maxY / cell)
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          add(`${x},${y}`, [a, b])
        }
      }
    }
  }
  const tolSq = tolDeg * tolDeg
  return (p) => {
    const cx = Math.floor(p[0] / cell)
    const cy = Math.floor(p[1] / cell)
    const bucket = idx.get(`${cx},${cy}`)
    if (!bucket) return false
    for (const [a, b] of bucket) {
      if (pointToSegmentSq(p, a, b) < tolSq) return true
    }
    return false
  }
}

// Closest point on a single polyline to (px,py) → [[x,y], dist]. (Copied.)
function closestPointOnPolyline(coords, px, py) {
  let bestD = Infinity
  let best = coords[0]
  for (let i = 1; i < coords.length; i++) {
    const ax = coords[i - 1][0], ay = coords[i - 1][1]
    const bx = coords[i][0], by = coords[i][1]
    const dx = bx - ax, dy = by - ay
    const denom = dx * dx + dy * dy
    const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denom))
    const x = ax + t * dx
    const y = ay + t * dy
    const d = Math.hypot(x - px, y - py)
    if (d < bestD) { bestD = d; best = [x, y] }
  }
  return [best, bestD]
}

// Closest point on a polyline to (px,py) returning the projected point AND the
// segment index + parametric t of the projection. Used by the same-line share
// to splice BYTE-IDENTICAL canonical sub-polylines into overlapping members.
function closestPointRich(coords, px, py) {
  let bestD = Infinity
  let best = coords[0]
  let bestSeg = 0
  let bestT = 0
  for (let i = 1; i < coords.length; i++) {
    const ax = coords[i - 1][0], ay = coords[i - 1][1]
    const bx = coords[i][0], by = coords[i][1]
    const dx = bx - ax, dy = by - ay
    const denom = dx * dx + dy * dy
    const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denom))
    const x = ax + t * dx
    const y = ay + t * dy
    const d = Math.hypot(x - px, y - py)
    if (d < bestD) { bestD = d; best = [x, y]; bestSeg = i - 1; bestT = t }
  }
  return { best, dist: bestD, seg: bestSeg, t: bestT }
}

// Closest point across many polylines → [x,y] (or null). (Copied/generalised.)
function closestPointOnPolylines(p, polylines) {
  let bestD = Infinity
  let best = null
  for (const coords of polylines) {
    const [cp, d] = closestPointOnPolyline(coords, p[0], p[1])
    if (d < bestD) {
      bestD = d
      best = cp
    }
  }
  return best
}

// Resample a polyline to n points by arc length. (Copied.)
function sampleAtArcLength(coords, n) {
  const segLens = []
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1])
    segLens.push(d)
    total += d
  }
  if (total === 0) return coords.slice()
  const out = []
  for (let i = 0; i < n; i++) {
    const t = (total * i) / (n - 1)
    let accum = 0
    let j = 0
    while (j < segLens.length && accum + segLens[j] < t) {
      accum += segLens[j]
      j++
    }
    if (j >= segLens.length) {
      out.push(coords[coords.length - 1].slice())
    } else {
      const remain = t - accum
      const frac = segLens[j] === 0 ? 0 : remain / segLens[j]
      out.push([
        coords[j][0] + (coords[j + 1][0] - coords[j][0]) * frac,
        coords[j][1] + (coords[j + 1][1] - coords[j][1]) * frac,
      ])
    }
  }
  return out
}

// Average two polylines by sampling the reference and projecting onto the
// other. (Copied from fetch-osm-routes.js.)
function averageTwoWays(c1, c2) {
  const ref = c1.length >= c2.length ? c1 : c2
  const other = ref === c1 ? c2 : c1
  const n = Math.max(10, Math.min(400, ref.length * 2))
  const samples = sampleAtArcLength(ref, n)
  const out = []
  const MAX_SNAP = 0.0005
  for (const p of samples) {
    const [cp, d] = closestPointOnPolyline(other, p[0], p[1])
    if (d < MAX_SNAP) {
      out.push([(p[0] + cp[0]) / 2, (p[1] + cp[1]) / 2])
    } else {
      out.push(p)
    }
  }
  return out
}

// Arc-length parameter (0..total) of the closest point on a polyline to p.
function arcLengthOfClosest(coords, p) {
  let bestD = Infinity
  let bestArc = 0
  let accum = 0
  for (let i = 1; i < coords.length; i++) {
    const ax = coords[i - 1][0], ay = coords[i - 1][1]
    const bx = coords[i][0], by = coords[i][1]
    const dx = bx - ax, dy = by - ay
    const denom = dx * dx + dy * dy
    const segLen = Math.sqrt(denom)
    const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / denom))
    const x = ax + t * dx
    const y = ay + t * dy
    const d = Math.hypot(x - p[0], y - p[1])
    if (d < bestD) {
      bestD = d
      bestArc = accum + t * segLen
    }
    accum += segLen
  }
  return bestArc
}

// Total arc length of a polyline.
function polylineLength(coords) {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1])
  }
  return total
}

// Sample n points along a polyline between arc-length a0 and a1 (inclusive).
function sampleBetweenArc(coords, a0, a1, n) {
  if (n < 2) n = 2
  const out = []
  for (let i = 0; i < n; i++) {
    const t = a0 + ((a1 - a0) * i) / (n - 1)
    out.push(pointAtArc(coords, t))
  }
  return out
}

// Point at arc-length t along a polyline.
function pointAtArc(coords, t) {
  if (t <= 0) return coords[0].slice()
  let accum = 0
  for (let i = 1; i < coords.length; i++) {
    const segLen = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1])
    if (accum + segLen >= t) {
      const frac = segLen === 0 ? 0 : (t - accum) / segLen
      return [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * frac,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * frac,
      ]
    }
    accum += segLen
  }
  return coords[coords.length - 1].slice()
}

// Generalised: average an arbitrary number of polylines onto a shared
// resampled centerline. Resample the longest member, then for every sample
// point average in every other member's nearest point within MAX_SNAP.
function averageManyWays(polylines) {
  if (polylines.length === 1) return polylines[0].slice()
  let ref = polylines[0]
  for (const pl of polylines) if (pl.length > ref.length) ref = pl
  const n = Math.max(10, Math.min(600, ref.length * 2))
  const samples = sampleAtArcLength(ref, n)
  const MAX_SNAP = 0.0006
  const out = []
  for (const p of samples) {
    let sx = p[0]
    let sy = p[1]
    let cnt = 1
    for (const pl of polylines) {
      if (pl === ref) continue
      const [cp, d] = closestPointOnPolyline(pl, p[0], p[1])
      if (d < MAX_SNAP) {
        sx += cp[0]
        sy += cp[1]
        cnt++
      }
    }
    out.push([sx / cnt, sy / cnt])
  }
  return out
}

// Chaikin corner-cutting. (Copied.)
function chaikin(coords, passes = 1) {
  let cur = coords
  for (let p = 0; p < passes; p++) {
    if (cur.length < 3) return cur
    const next = [cur[0]]
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i]
      const b = cur[i + 1]
      const q = [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]
      const r = [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]
      next.push(q, r)
    }
    next.push(cur[cur.length - 1])
    cur = next
  }
  return cur
}

// Pin-aware Chaikin. Identical corner-cutting, but `pinned` (a Set of vertex
// indices in the ORIGINAL coords) are emitted verbatim and never averaged
// away — corners are only cut on segments where NEITHER endpoint is pinned.
// This preserves junction seams (feature endpoints) and station welds so the
// smoothing pass can't pull them apart before baking. Single-pass only
// (the build uses one pass); index-tracking across multiple passes isn't
// needed and would complicate pin bookkeeping.
function chaikinPinned(coords, pinned, passes = 1) {
  if (passes !== 1) return chaikin(coords, passes)
  if (coords.length < 3) return coords.map((c) => c.slice())
  const next = [coords[0].slice()]
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]
    const b = coords[i + 1]
    const aPinned = pinned.has(i)
    const bPinned = pinned.has(i + 1)
    if (aPinned && bPinned) {
      // Both ends pinned: keep the segment exactly (push b; a already pushed).
      next.push(b.slice())
    } else if (aPinned) {
      // Keep a (already emitted as the previous point's b or the seed); cut
      // only the far quarter so the pinned vertex stays put.
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
      next.push(b.slice())
    } else if (bPinned) {
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      next.push(b.slice())
    } else {
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
  }
  next.push(coords[coords.length - 1].slice())
  // Dedupe consecutive duplicates that the pin logic can introduce when an
  // interior vertex was pinned (we may push b twice across adjacent segments).
  const out = [next[0]]
  for (let i = 1; i < next.length; i++) {
    const p = out[out.length - 1]
    if (next[i][0] !== p[0] || next[i][1] !== p[1]) out.push(next[i])
  }
  return out
}

// RDP simplification. (Copied.)
function rdp(coords, epsilonDeg) {
  if (coords.length < 3) return coords
  const tolSq = epsilonDeg * epsilonDeg
  const keep = new Array(coords.length).fill(false)
  keep[0] = true
  keep[coords.length - 1] = true
  const stack = [[0, coords.length - 1]]
  while (stack.length) {
    const [lo, hi] = stack.pop()
    let maxD = 0
    let maxI = -1
    for (let i = lo + 1; i < hi; i++) {
      const d = pointToSegmentSq(coords[i], coords[lo], coords[hi])
      if (d > maxD) {
        maxD = d
        maxI = i
      }
    }
    if (maxI !== -1 && maxD > tolSq) {
      keep[maxI] = true
      stack.push([lo, maxI])
      stack.push([maxI, hi])
    }
  }
  const out = []
  for (let i = 0; i < coords.length; i++) if (keep[i]) out.push(coords[i])
  return out
}

// assignOffsets — copied from postprocess-routes.js. Writes per-LINE integer
// stack position (centred at 0) into f.properties.offset and RETURNS the
// line→offset map so we can bake it.
function assignOffsets(features) {
  const lineBuckets = new Map()
  for (const f of features) {
    const l = f.properties.line
    if (!lineBuckets.has(l)) lineBuckets.set(l, new Set())
    const dst = lineBuckets.get(l)
    for (const b of bucketsFor(f.geometry.coordinates)) dst.add(b)
  }

  const lines = [...lineBuckets.keys()].sort(
    (a, b) => (LINE_ORDER[a] ?? 99) - (LINE_ORDER[b] ?? 99),
  )

  const OVERLAP_K = 20
  const overlap = new Map()
  for (let i = 0; i < lines.length; i++) {
    overlap.set(lines[i], new Map())
  }
  for (let i = 0; i < lines.length; i++) {
    const a = lineBuckets.get(lines[i])
    for (let j = i + 1; j < lines.length; j++) {
      const b = lineBuckets.get(lines[j])
      let common = 0
      const [small, big] = a.size <= b.size ? [a, b] : [b, a]
      for (const k of small) if (big.has(k)) common++
      if (common >= OVERLAP_K) {
        overlap.get(lines[i]).set(lines[j], common)
        overlap.get(lines[j]).set(lines[i], common)
      }
    }
  }

  const offset = new Map()
  for (const line of lines) {
    const stack = new Set([line])
    for (const nb of (overlap.get(line) || new Map()).keys()) stack.add(nb)
    const sortedStack = [...stack].sort(
      (a, b) => (LINE_ORDER[a] ?? 99) - (LINE_ORDER[b] ?? 99),
    )
    const idx = sortedStack.indexOf(line)
    offset.set(line, idx - (sortedStack.length - 1) / 2)
  }

  let nudged = true
  while (nudged) {
    nudged = false
    for (const a of lines) {
      for (const b of (overlap.get(a) || new Map()).keys()) {
        if (offset.get(a) === offset.get(b)) {
          const hi = (LINE_ORDER[a] ?? 0) > (LINE_ORDER[b] ?? 0) ? a : b
          offset.set(hi, offset.get(hi) + 1)
          nudged = true
        }
      }
    }
  }

  for (const f of features) {
    f.properties.offset = offset.get(f.properties.line) ?? 0
  }

  console.log('Per-line offsets (LINE_ORDER ascending):')
  for (const l of lines) {
    const nbStr = [...(overlap.get(l) || new Map()).keys()]
      .sort((a, b) => (LINE_ORDER[a] ?? 99) - (LINE_ORDER[b] ?? 99))
      .map((n) => `${n}=${offset.get(n)}`)
      .join(', ')
    console.log(
      `  ${l.padEnd(22)} offset=${String(offset.get(l)).padStart(3)}  shares with: ${nbStr || '(none)'}`,
    )
  }
  return offset
}

// ─── Step 2a: SHARED CENTERLINE per corridor (cross-line) ───────────────────
//
// For each feature, find maximal spans of vertices that co-run with a
// DIFFERENT line's segment (within CORUN_TOL_DEG). Group spans that overlap
// the same corridor together, build ONE shared centerline (averageManyWays of
// the participating spans), and overwrite every member's span with a resample
// of that shared centerline. This guarantees co-runners share identical
// underlying geometry, so equal baked offsets stay perfectly parallel.
//
// Done conservatively: only spans of ≥ CORUN_MIN_VERTS overlapping vertices
// qualify, and we re-project the shared centerline back onto each member's
// own span length so seams stay connected to the un-touched remainder.

function shareCenterlines(features) {
  let corridorsBuilt = 0
  let spansReplaced = 0

  // Index every feature's segments grouped by line so we can test "does
  // vertex p of feature i sit near a DIFFERENT line?".
  const byLineCoords = new Map() // line → [coords,...]
  for (const f of features) {
    const l = f.properties.line
    if (!byLineCoords.has(l)) byLineCoords.set(l, [])
    byLineCoords.get(l).push(f.geometry.coordinates)
  }

  // For a target feature, build a predicate "near some OTHER line".
  function otherLineHitIndex(targetLine) {
    const others = []
    for (const [l, arr] of byLineCoords) {
      if (l === targetLine) continue
      for (const c of arr) others.push(c)
    }
    return buildSegmentIndex(others, CORUN_TOL_DEG)
  }

  // Pre-build one predicate per line.
  const hitFnByLine = new Map()
  for (const l of byLineCoords.keys()) {
    hitFnByLine.set(l, otherLineHitIndex(l))
  }

  // Collect co-running spans per feature: list of [startIdx, endIdx)
  // (inclusive start, exclusive end) where every vertex is near another line.
  const featureSpans = features.map((f) => {
    const coords = f.geometry.coordinates
    const hit = hitFnByLine.get(f.properties.line)
    const flags = coords.map((p) => hit(p))
    const spans = []
    let i = 0
    while (i < coords.length) {
      if (!flags[i]) { i++; continue }
      const start = i
      while (i < coords.length && flags[i]) i++
      const end = i
      if (end - start >= CORUN_MIN_VERTS) spans.push([start, end])
    }
    return spans
  })

  // Build a spatial grouping of spans: two spans belong to the same corridor
  // if their midpoints are within CORUN_TOL_DEG*2 AND they substantially
  // overlap (most of the shorter span's sample points sit near the other).
  const spanList = [] // { fi, start, end, coords }
  for (let fi = 0; fi < features.length; fi++) {
    for (const [start, end] of featureSpans[fi]) {
      spanList.push({
        fi,
        start,
        end,
        coords: features[fi].geometry.coordinates.slice(start, end),
      })
    }
  }

  // Union-Find over spanList by mutual containment.
  const parent = spanList.map((_, i) => i)
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  function spanContained(a, b) {
    // fraction of a's sample points within CORUN_TOL_DEG of polyline b
    const samples = sampleAtArcLength(a.coords, Math.min(24, a.coords.length))
    let near = 0
    for (const p of samples) {
      const [, d] = closestPointOnPolyline(b.coords, p[0], p[1])
      if (d < CORUN_TOL_DEG) near++
    }
    return near / samples.length >= 0.6
  }

  for (let i = 0; i < spanList.length; i++) {
    for (let j = i + 1; j < spanList.length; j++) {
      if (spanList[i].fi === spanList[j].fi) continue
      if (find(i) === find(j)) continue
      // cheap reject: bounding-box midpoint distance
      const mi = spanList[i].coords[Math.floor(spanList[i].coords.length / 2)]
      const mj = spanList[j].coords[Math.floor(spanList[j].coords.length / 2)]
      if (Math.hypot(mi[0] - mj[0], mi[1] - mj[1]) > 0.02) continue
      if (spanContained(spanList[i], spanList[j]) || spanContained(spanList[j], spanList[i])) {
        union(i, j)
      }
    }
  }

  // Group spans by root.
  const groups = new Map()
  for (let i = 0; i < spanList.length; i++) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(i)
  }

  for (const [, members] of groups) {
    // A corridor must involve ≥ 2 spans from DIFFERENT features.
    const fis = new Set(members.map((m) => spanList[m].fi))
    if (fis.size < 2) continue

    const polylines = members.map((m) => spanList[m].coords)
    const centerline = averageManyWays(polylines)
    if (centerline.length < 2) continue
    corridorsBuilt++

    // Replace each member's span with a resample of ONLY the portion of the
    // shared centerline that this span actually covers. We project the span's
    // own endpoints onto the centerline to find the corresponding arc-length
    // sub-range, then sample that sub-range to the span's vertex count. This
    // keeps every replaced vertex close to its original position (no big seam
    // jumps) while still aligning all members onto one shared geometry.
    const clLen = polylineLength(centerline)
    for (const m of members) {
      const s = spanList[m]
      const f = features[s.fi]
      const coords = f.geometry.coordinates
      const spanLen = s.end - s.start
      const head = coords[s.start]
      const tail = coords[s.end - 1]
      let a0 = arcLengthOfClosest(centerline, head)
      let a1 = arcLengthOfClosest(centerline, tail)
      // Guard: if the projection collapsed (endpoints landed at the same arc
      // position, e.g. a tight loop), fall back to leaving this span as-is so
      // we never introduce a degenerate replacement.
      if (Math.abs(a1 - a0) < clLen * 0.01) continue
      const cl = sampleBetweenArc(centerline, a0, a1, Math.max(2, spanLen))
      // Guard against degrading sparse spans: if re-laying onto the centerline
      // would create a segment substantially longer than anything in the
      // original span (e.g. a sparse mainline span whose vertices collapse
      // into a near-2-point sub-range), skip it and keep the original span.
      // Co-running detection already preferred dense urban spans, so this only
      // bails on the rare sparse-rail case and never on the visible inner-zone
      // corridors that motivate the shared centerline.
      const origSpan = coords.slice(s.start, s.end)
      let origMax = 0
      for (let i = 1; i < origSpan.length; i++) {
        const d = Math.hypot(origSpan[i][0] - origSpan[i - 1][0], origSpan[i][1] - origSpan[i - 1][1])
        if (d > origMax) origMax = d
      }
      let newMax = 0
      for (let i = 1; i < cl.length; i++) {
        const d = Math.hypot(cl[i][0] - cl[i - 1][0], cl[i][1] - cl[i - 1][1])
        if (d > newMax) newMax = d
      }
      if (newMax > origMax * 1.5 + 1e-6) continue
      // Splice the sub-range in, vertex for vertex.
      for (let k = 0; k < spanLen; k++) {
        coords[s.start + k] = cl[Math.min(k, cl.length - 1)].slice()
      }
      spansReplaced++
    }
  }

  console.log(
    `Shared centerline: ${corridorsBuilt} corridor(s) built, ${spansReplaced} span(s) re-laid onto shared geometry.`,
  )
}

// ─── Step 2b: STATION WELD ──────────────────────────────────────────────────
//
// For each (station, line), snap the nearest vertex of EVERY serving feature of
// that line (within WELD_TOL_DEG) onto the canonical station coordinate. We weld
// every serving feature — not just the single closest one — so that where two or
// more same-line features meet at a junction they share the EXACT station vertex
// before baking. Because the baked offset is uniform per line, those welded
// vertices then move together and the seam stays joined (no intra-line gap). We
// only ever move one existing vertex per feature (never insert), so the rest of
// the polyline is untouched.

function weldStations(features, stationCoordsByLine, weldedSet) {
  let welded = 0
  // Map each feature to its index so we can record welded (feature,vertex)
  // pairs for the pin-aware smoothing pass.
  const indexOf = new Map()
  features.forEach((f, i) => indexOf.set(f, i))
  const byLine = new Map()
  for (const f of features) {
    const l = f.properties.line
    if (!byLine.has(l)) byLine.set(l, [])
    byLine.get(l).push(f)
  }
  const tolSq = WELD_TOL_DEG * WELD_TOL_DEG
  for (const [line, stations] of stationCoordsByLine) {
    const feats = byLine.get(line)
    if (!feats) continue
    for (const sc of stations) {
      // Weld the nearest vertex of EVERY feature that serves this station
      // (its nearest vertex sits within WELD_TOL_DEG) onto the station coord.
      for (const f of feats) {
        const coords = f.geometry.coordinates
        let bestD = Infinity
        let bestVi = -1
        for (let vi = 0; vi < coords.length; vi++) {
          const dx = coords[vi][0] - sc[0]
          const dy = coords[vi][1] - sc[1]
          const d = dx * dx + dy * dy
          if (d < bestD) { bestD = d; bestVi = vi }
        }
        if (bestVi >= 0 && bestD < tolSq) {
          coords[bestVi] = [sc[0], sc[1]]
          if (weldedSet) weldedSet.add(`${indexOf.get(f)}:${bestVi}`)
          welded++
        }
      }
    }
  }
  console.log(`Station weld: ${welded} vertex(es) snapped onto station coords.`)
}

// ─── SAME-LINE SHARED GEOMETRY (collapse visible doubles) ────────────────────
//
// THE same-line-doubles fix. Where two or more features of the SAME line run
// parallel-but-separate (the OSM way-averages produce slightly different
// polylines for the same physical track), they render as two ribbons of one
// colour. The miter-normal bake makes this worse: offsetting two NON-identical
// polylines by the same magnitude diverges them further (their local tangents,
// and hence their perpendiculars, differ).
//
// We collapse the separation by making overlapping same-line spans
// BYTE-IDENTICAL. Per line, features are processed longest-first; the longest is
// the canonical geometry. For every later feature we find maximal vertex spans
// that hug ONE canonical polyline within `tolDeg`, and we SPLICE the canonical's
// exact vertices (same float objects, copied) into that span — so the member
// literally traces the canonical's polyline there. Isolated near-misses
// (< MIN_SPAN vertices) are left alone, preserving genuine branch divergences.
//
// Because the spliced spans share byte-identical coordinates:
//   • pre-bake  — it aligns the underlying centerlines (and feeds the cross-line
//                 ordering / shared-coord mechanism); and
//   • post-bake — applied to the already-offset geometry it GUARANTEES the
//                 overlapping spans are coincident in the final output, since
//                 the same per-line offset has already been baked into the
//                 canonical and we copy that canonical verbatim.
//
// Running it BOTH before and after the bake means: the bake operates on aligned
// centerlines (clean parallel ribbons between lines), and any residual
// miter-normal divergence between same-line members is then snapped away.

const SAMELINE_TOL_DEG = 0.0004 // ~40m: capture parallel same-line ribbons
const SAMELINE_MIN_SPAN = 4 // ignore spans shorter than this many vertices

function shareSameLine(features, tolDeg = SAMELINE_TOL_DEG, label = '') {
  const byLine = new Map()
  features.forEach((f, idx) => {
    const l = f.properties.line
    if (!byLine.has(l)) byLine.set(l, [])
    byLine.get(l).push(idx)
  })

  let spans = 0
  let linesTouched = 0

  for (const [, idxs] of byLine) {
    if (idxs.length < 2) continue
    // Longest feature first = canonical; shorter features trace onto it.
    idxs.sort(
      (a, b) =>
        features[b].geometry.coordinates.length -
        features[a].geometry.coordinates.length,
    )
    let touchedThisLine = false
    const canon = [] // canonical polylines accumulated so far
    for (const id of idxs) {
      const coords = features[id].geometry.coordinates
      if (canon.length < 1 || coords.length < 2) {
        canon.push(coords)
        continue
      }
      // For each vertex, find its nearest point on any canonical polyline,
      // capturing the projection's segment index + t for byte-identical splice.
      const near = coords.map((v) => {
        let best = null
        let bestC = null
        for (const c of canon) {
          const r = closestPointRich(c, v[0], v[1])
          if (!best || r.dist < best.dist) {
            best = r
            bestC = c
          }
        }
        return { d: best.dist, r: best, c: bestC }
      })
      // Rebuild this feature, splicing canonical bytes over in-tolerance spans.
      const out = []
      let i = 0
      while (i < coords.length) {
        if (near[i].d >= tolDeg) {
          out.push(coords[i].slice())
          i++
          continue
        }
        const spanCanon = near[i].c
        const start = i
        while (
          i < coords.length &&
          near[i].d < tolDeg &&
          near[i].c === spanCanon
        ) {
          i++
        }
        const end = i // exclusive
        if (end - start < SAMELINE_MIN_SPAN) {
          for (let k = start; k < end; k++) out.push(coords[k].slice())
          continue
        }
        // Splice the canonical sub-polyline between the projected endpoints.
        const r0 = near[start].r
        const r1 = near[end - 1].r
        const forward =
          r1.seg > r0.seg || (r1.seg === r0.seg && r1.t >= r0.t)
        out.push([r0.best[0], r0.best[1]]) // projected start onto canonical
        if (forward) {
          for (let s = r0.seg + 1; s <= r1.seg; s++) {
            out.push(spanCanon[s].slice()) // byte-identical canonical vertex
          }
        } else {
          for (let s = r0.seg; s > r1.seg; s--) {
            out.push(spanCanon[s].slice())
          }
        }
        out.push([r1.best[0], r1.best[1]]) // projected end onto canonical
        spans++
        touchedThisLine = true
      }
      features[id].geometry.coordinates = out
      canon.push(out)
    }
    if (touchedThisLine) linesTouched++
  }

  console.log(
    `Same-line share${label ? ` (${label})` : ''}: spliced ${spans} span(s) across ${linesTouched} line(s) onto canonical geometry.`,
  )
}

// ─── Step 3: BAKE THE OFFSET via per-vertex miter normals ───────────────────
//
// Offset a polyline to one side by `amount` (signed degrees). At each vertex
// use the normalized average of the two adjacent segment unit normals (a
// miter join). Clamp the miter length to ≤ MITER_LIMIT × |amount| to avoid
// spikes on tight bends; if the local turn is sharp enough that the mitered
// offset would self-intersect on the inside of the corner, fall back to the
// single adjacent-segment normal (bevel-ish), which never spikes.

const MITER_LIMIT = 3 // miter length ≤ 3× spacing

function leftNormal(ax, ay, bx, by) {
  // Unit normal to segment a→b, pointing to the segment's LEFT
  // (90° CCW of the direction). Returns null for a degenerate segment.
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len === 0) return null
  // left normal of (dx,dy) is (-dy, dx)
  return [-dy / len, dx / len]
}

function offsetPolyline(coords, amount) {
  if (amount === 0) return coords.map((c) => c.slice())
  const n = coords.length
  if (n < 2) return coords.map((c) => c.slice())

  // Segment left-normals (n-1 of them). Carry the previous valid normal
  // forward across degenerate (zero-length) segments.
  const segN = []
  let lastValid = null
  for (let i = 0; i < n - 1; i++) {
    let nm = leftNormal(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])
    if (!nm) nm = lastValid
    if (nm) lastValid = nm
    segN.push(nm)
  }
  // If the whole line was degenerate, just return a copy.
  if (!lastValid) return coords.map((c) => c.slice())
  // Backfill any leading nulls.
  for (let i = 0; i < segN.length; i++) {
    if (!segN[i]) segN[i] = segN.find((x) => x) || lastValid
  }

  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? segN[i - 1] : segN[0]
    const next = i < n - 1 ? segN[i] : segN[n - 2]

    // Average the two adjacent normals → miter direction.
    let mx = prev[0] + next[0]
    let my = prev[1] + next[1]
    const mlen = Math.hypot(mx, my)

    let nx
    let ny
    let scale = 1

    if (mlen < 1e-9) {
      // ~180° reversal (hairpin): adjacent normals cancel. Fall back to one
      // adjacent normal to avoid a divide-by-zero / infinite miter.
      nx = next[0]
      ny = next[1]
    } else {
      mx /= mlen
      my /= mlen
      // Miter length factor = 1 / cos(theta/2), where the mitered normal is
      // m̂ and cos(theta/2) = m̂·n̂(adjacent). Guard against tiny values.
      const cosHalf = mx * next[0] + my * next[1]
      if (Math.abs(cosHalf) < 1e-6) {
        nx = next[0]
        ny = next[1]
      } else {
        scale = 1 / cosHalf
        // Clamp miter spike on tight corners; on a very sharp inside corner
        // (large miter) fall back to the single adjacent-segment normal so
        // the offset polyline can't shoot across and self-intersect.
        if (Math.abs(scale) > MITER_LIMIT) {
          nx = next[0]
          ny = next[1]
          scale = 1
        } else {
          nx = mx
          ny = my
        }
      }
    }

    out[i] = [
      coords[i][0] + nx * amount * scale,
      coords[i][1] + ny * amount * scale,
    ]
  }
  return out
}

// ─── Build helpers ──────────────────────────────────────────────────────────

function collectStationCoordsByLine() {
  const byLine = new Map()
  const push = (line, coords) => {
    if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return
    if (!byLine.has(line)) byLine.set(line, [])
    byLine.get(line).push([coords[0], coords[1]])
  }
  // From features.json (Point geometry).
  try {
    const fc = JSON.parse(fs.readFileSync(FEATURES_SRC, 'utf8'))
    for (const f of fc.features || []) {
      const l = f.properties && f.properties.line
      if (!l || f.geometry.type !== 'Point') continue
      push(l, f.geometry.coordinates)
    }
  } catch (e) {
    console.warn('  (warn) could not read features.json for welding:', e.message)
  }
  // From stations-extras.json (coords field).
  try {
    const extras = JSON.parse(fs.readFileSync(STATIONS_EXTRAS_SRC, 'utf8'))
    for (const s of extras || []) {
      if (!s.line || !Array.isArray(s.coords)) continue
      push(s.line, s.coords)
    }
  } catch (e) {
    console.warn('  (warn) could not read stations-extras.json for welding:', e.message)
  }
  return byLine
}

function totalVertices(features) {
  return features.reduce((s, f) => s + f.geometry.coordinates.length, 0)
}

// ─── main ───────────────────────────────────────────────────────────────────

function main() {
  const fc = JSON.parse(fs.readFileSync(ROUTES_SRC, 'utf8'))
  const features = fc.features
  const beforeFeatures = features.length
  const beforeVertices = totalVertices(features)
  console.log(
    `Loaded ${beforeFeatures} feature(s), ${beforeVertices} vertices from ${path.relative(process.cwd(), ROUTES_SRC)}.`,
  )

  // Idempotency guard: baking sets every feature's offset to 0. If the input is
  // already fully baked (all offsets 0), re-running would double-bake and push
  // every line a second SPACING_DEG sideways — bail out. Regenerate the
  // non-baked routes.json with postprocess-routes.js first.
  if (beforeFeatures > 0 && features.every((f) => (f.properties.offset ?? 0) === 0)) {
    console.error(
      'Refusing to bake: every feature already has offset 0 — routes.json looks already baked.\n' +
        'Run `node scripts/postprocess-routes.js` first to regenerate the non-baked geometry.',
    )
    process.exit(1)
  }

  // ORDERING IS LOAD-BEARING.
  //   2a  cross-line shared centerline   (co-running lines share geometry)
  //   2b  station weld                   (topology: vertices sit on stations)
  //   3   pin-aware Chaikin smoothing    (seams/welds pinned so they survive)
  //   3b  same-line byte-share (pre-bake) (align overlapping same-line spans)
  //   4   BAKE the uniform parallel offset
  //   4b  same-line byte-share (post-bake) (snap away residual miter divergence)
  //
  // The centerline is fully normalised (shared + welded + smoothed) before the
  // offset is baked, so the bake operates on clean aligned geometry. The
  // post-bake same-line pass then guarantees overlapping same-line features are
  // coincident in the FINAL output: because they share one per-line offset, the
  // canonical feature already carries the correct baked offset and the members
  // simply trace it byte-for-byte. Cross-line spacing is never touched by the
  // same-line passes, so the baked parallel ribbons stay intact.

  console.log('\n--- 2a. Shared centerline per corridor (cross-line) ---')
  try {
    shareCenterlines(features)
  } catch (e) {
    console.warn('  (warn) shareCenterlines failed, continuing with raw geometry:', e.message)
  }

  console.log('\n--- 2b. Station weld ---')
  const weldedSet = new Set() // `${featureIndex}:${vertexIndex}` of welded verts
  try {
    const stationCoordsByLine = collectStationCoordsByLine()
    weldStations(features, stationCoordsByLine, weldedSet)
  } catch (e) {
    console.warn('  (warn) weldStations failed, continuing:', e.message)
  }

  console.log('\n--- 3. Chaikin smoothing (pin-aware, BEFORE baking) ---')
  // Pin-aware Chaikin: smooth the centerline but keep feature endpoints (the
  // junction seams where consecutive same-line features meet) and station-welded
  // vertices exactly where they are, so smoothing can't pull seams/welds apart.
  // Endpoints are pinned implicitly (chaikin preserves first/last); welded
  // interior vertices are pinned explicitly.
  let cBefore = 0
  let cAfter = 0
  features.forEach((f, fi) => {
    const before = f.geometry.coordinates
    cBefore += before.length
    const pins = new Set([0, before.length - 1])
    for (let vi = 0; vi < before.length; vi++) {
      if (weldedSet.has(`${fi}:${vi}`)) pins.add(vi)
    }
    const smoothed = chaikinPinned(before, pins, 1)
    const simplified = rdp(smoothed, 0.00001)
    f.geometry.coordinates = simplified
    cAfter += simplified.length
  })
  console.log(`Chaikin+RDP (pin-aware): ${cBefore} → ${cAfter} vertices.`)

  console.log('\n--- 3b. Same-line shared geometry (pre-bake align) ---')
  try {
    shareSameLine(features, SAMELINE_TOL_DEG, 'pre-bake')
  } catch (e) {
    console.warn('  (warn) shareSameLine (pre-bake) failed, continuing:', e.message)
  }

  console.log('\n--- Offset assignment (copied assignOffsets) ---')
  const offsetMap = assignOffsets(features)

  console.log('\n--- 4. Bake parallel offset into geometry ---')
  let baked = 0
  for (const f of features) {
    const units = offsetMap.get(f.properties.line) ?? f.properties.offset ?? 0
    const amount = units * SPACING_DEG
    if (amount !== 0) {
      f.geometry.coordinates = offsetPolyline(f.geometry.coordinates, amount)
      baked++
    } else {
      // Keep a clean copy.
      f.geometry.coordinates = f.geometry.coordinates.map((c) => c.slice())
    }
    // Offset is now baked into coordinates — renderer must use line-offset 0.
    f.properties.offset = 0
  }
  console.log(
    `Baked offset on ${baked}/${features.length} feature(s) (SPACING_DEG=${SPACING_DEG}, MITER_LIMIT=${MITER_LIMIT}).`,
  )

  // ─── Validate before writing ───────────────────────────────────────────
  const lineSet = new Set(LINE_KEYS)
  let bad = 0
  for (const f of features) {
    if (!lineSet.has(f.properties.line)) {
      console.error(`  INVALID line key: ${f.properties.line}`)
      bad++
    }
    for (const c of f.geometry.coordinates) {
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) {
        console.error(`  NON-FINITE coord on line ${f.properties.line}: ${JSON.stringify(c)}`)
        bad++
        break
      }
    }
    // Preserve line/color/order; force offset 0.
    f.properties.offset = 0
  }
  if (bad > 0) {
    throw new Error(`Validation failed: ${bad} problem(s).`)
  }

  fs.writeFileSync(ROUTES_DST, JSON.stringify(fc))
  const afterVertices = totalVertices(features)
  console.log(
    `\nWrote ${features.length} feature(s), ${afterVertices} vertices to ${path.relative(process.cwd(), ROUTES_DST)}.`,
  )
  console.log(
    `Summary: features ${beforeFeatures} → ${features.length}; vertices ${beforeVertices} → ${afterVertices}.`,
  )
}

main()

#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Post-processes routes.json:
 *
 *   1. Drops same-line LineStrings whose geometry is largely shadowed by a
 *      longer LineString of the same line. The OSM pipeline already does a
 *      Hausdorff-style dedup; this pass is more aggressive and operates on
 *      the post-pipeline output, catching residual parallel branches that
 *      slipped through (e.g. Piccadilly Heathrow loop, Thameslink branches
 *      that share the East Coast Main Line).
 *
 *   2. Re-assigns per-LINE offsets via global graph colouring so that two
 *      lines sharing a corridor never get the same offset (the bug that
 *      had Piccadilly and Metropolitan stacked on top of each other from
 *      Rayners Lane to Uxbridge). Offsets are picked greedily in LINE_ORDER
 *      ascending so the line stack is visually predictable.
 *
 *   3. Applies one pass of Chaikin corner-cutting to soften zig-zags that
 *      arise from the OSM centerline averaging — improves how parallel
 *      ribbons read at high zooms.
 *
 * In:  src/app/(game)/london/data/routes.json
 * Out: same path (overwritten in place)
 */

const fs = require('fs')
const path = require('path')

const ROUTES = path.join(
  __dirname,
  '..',
  'src',
  'app',
  '(game)',
  'london',
  'data',
  'routes.json',
)

// Keep in sync with config.ts. Lower = drawn underneath.
const LINE_ORDER = {
  Bakerloo: 0, Central: 1, Circle: 2, District: 3, HammersmithAndCity: 4,
  Jubilee: 5, Metropolitan: 6, Northern: 7, Piccadilly: 8, Victoria: 9,
  WaterlooAndCity: 10, ElizabethLine: 11, DLR: 12, Lioness: 13, Mildmay: 14,
  Windrush: 15, Weaver: 16, Suffragette: 17, Liberty: 18, Thameslink: 19,
  GreatNorthern: 20, Southern: 21, GatwickExpress: 22,
}

// ~14m × ~22m at 51.5°N. Smaller = stricter same-rail / parallel detection.
const GRID = 0.0002
const bucketsFor = (coords) => {
  const set = new Set()
  for (const [lng, lat] of coords) {
    set.add(`${Math.round(lng / GRID)},${Math.round(lat / GRID)}`)
  }
  return set
}

// ---- 1. Same-line trunk merging ------------------------------------------

// Distance from point p to segment a→b, squared (in degree units).
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

// Spatial-hash index of one or more polylines' SEGMENTS, used to answer
// "is point p within `tol` of any indexed segment?" in roughly O(1).
function buildSegmentIndex(polylines, tolDeg) {
  const cell = tolDeg // one cell per tolerance window
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

// For each unique (non-shadowed) run we want to remember the SHADOWED
// vertices immediately before and after, so we can snap the run's
// endpoints back onto the trunk and avoid leaving a gap at the junction
// where the branch diverges/rejoins.
function extractUniqueRunsWithAnchors(coords, shadowedFn, minLen) {
  const flags = coords.map((p) => shadowedFn(p))
  const runs = []
  let i = 0
  while (i < coords.length) {
    if (flags[i]) { i++; continue }
    const start = i
    while (i < coords.length && !flags[i]) i++
    const end = i // exclusive
    if (end - start < minLen) continue
    const preAnchor = start > 0 ? coords[start - 1] : null
    const postAnchor = end < coords.length ? coords[end] : null
    runs.push({ coords: coords.slice(start, end), preAnchor, postAnchor })
  }
  return runs
}

// Snap each unique run to the nearest point on the trunk at both endpoints
// so the branch visibly meets the kept feature (otherwise there's a small
// gap at every junction).
function snapEndpointsToTrunk(run, kept) {
  const { coords, preAnchor, postAnchor } = run
  const out = coords.slice()
  if (preAnchor) {
    const snapped = closestPointOnPolylines(preAnchor, kept)
    if (snapped) out.unshift(snapped)
  }
  if (postAnchor) {
    const snapped = closestPointOnPolylines(postAnchor, kept)
    if (snapped) out.push(snapped)
  }
  return out
}

function closestPointOnPolylines(p, polylines) {
  let bestD = Infinity
  let best = null
  for (const coords of polylines) {
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1]
      const b = coords[i]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const lensq = dx * dx + dy * dy
      let t = lensq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lensq
      if (t < 0) t = 0
      else if (t > 1) t = 1
      const cx = a[0] + t * dx
      const cy = a[1] + t * dy
      const d = (cx - p[0]) ** 2 + (cy - p[1]) ** 2
      if (d < bestD) {
        bestD = d
        best = [cx, cy]
      }
    }
  }
  return best
}

// Merge same-line features by trimming each one to the portion that isn't
// already covered by a longer kept feature of the same line. The shared
// trunk is therefore drawn exactly once; the diverging branches stay
// connected via endpoint snapping.
function mergeSameLineTrunks(features) {
  // ~50m. Tight enough that physically distinct same-line branches (e.g.
  // Northern Bank vs Charing Cross around Kennington, which run a few
  // hundred metres apart) stay distinct; generous enough to absorb the
  // averaging wobble between two rails of one double track.
  const SHADOW_TOL = 0.00045
  // Minimum vertices required for a surviving unique run. Drops vertex-level
  // wobble at endpoints without losing any meaningful branch.
  const MIN_RUN = 6

  const byLine = new Map()
  for (let i = 0; i < features.length; i++) {
    const l = features[i].properties.line
    if (!byLine.has(l)) byLine.set(l, [])
    byLine.get(l).push(i)
  }

  const newFeatures = []
  let trimmedCount = 0

  for (const [line, idxs] of byLine) {
    const sorted = idxs
      .slice()
      .sort(
        (a, b) =>
          features[b].geometry.coordinates.length -
          features[a].geometry.coordinates.length,
      )

    const keptCoords = []
    let runsThisLine = 0
    const inputThisLine = idxs.length

    for (const i of sorted) {
      const coords = features[i].geometry.coordinates
      if (keptCoords.length === 0) {
        newFeatures.push(features[i])
        keptCoords.push(coords)
        runsThisLine++
        continue
      }

      const shadowedFn = buildSegmentIndex(keptCoords, SHADOW_TOL)
      const runs = extractUniqueRunsWithAnchors(coords, shadowedFn, MIN_RUN)
      if (runs.length === 0) {
        trimmedCount++
        continue
      }
      // No trimming happened — single full run, no anchors.
      if (
        runs.length === 1 &&
        runs[0].coords.length === coords.length &&
        runs[0].preAnchor === null &&
        runs[0].postAnchor === null
      ) {
        newFeatures.push(features[i])
        keptCoords.push(coords)
        runsThisLine++
        continue
      }

      // Replace this feature with one feature per unique run, each snapped
      // back onto the trunk at its dangling endpoint(s) so the branch
      // visibly meets the kept feature.
      trimmedCount++
      for (const run of runs) {
        const snapped = snapEndpointsToTrunk(run, keptCoords)
        newFeatures.push({
          ...features[i],
          geometry: { type: 'LineString', coordinates: snapped },
        })
        keptCoords.push(snapped)
        runsThisLine++
      }
    }

    if (runsThisLine !== inputThisLine) {
      console.log(
        `  ${line.padEnd(22)} ${inputThisLine} → ${runsThisLine} feature(s)`,
      )
    }
  }

  console.log(
    `Same-line trunk merge: trimmed/dropped ${trimmedCount} feature(s).`,
  )
  return newFeatures
}

// ---- Same-line vertex welding --------------------------------------------

// Where two features of the same line have vertices within a small
// tolerance of each other (typically at junction stations like Earl's
// Court or Camden Town, where OSM models each platform/track as a
// separate way), snap them to a shared coordinate so the rendered lines
// look continuous at the junction. Operates in place.
function weldSameLineVertices(features) {
  // ~40m. Tight enough not to pull genuinely different tracks together,
  // generous enough to absorb OSM platform-level divergence between two
  // ways representing the same physical junction.
  const TOL_DEG = 0.00045
  const TOL_SQ = TOL_DEG * TOL_DEG

  const byLine = new Map()
  for (let i = 0; i < features.length; i++) {
    const l = features[i].properties.line
    if (!byLine.has(l)) byLine.set(l, [])
    byLine.get(l).push(i)
  }

  let totalWelded = 0
  for (const [line, idxs] of byLine) {
    if (idxs.length < 2) continue

    // 3×3 grid lookup using cell = TOL_DEG so any candidate pair is in
    // the same cell or an immediate neighbour.
    const grid = new Map()
    const cellKey = (x, y) => `${x},${y}`
    const cellOf = (c) => [
      Math.floor(c[0] / TOL_DEG),
      Math.floor(c[1] / TOL_DEG),
    ]
    for (const fi of idxs) {
      const c = features[fi].geometry.coordinates
      for (let vi = 0; vi < c.length; vi++) {
        const [bx, by] = cellOf(c[vi])
        const k = cellKey(bx, by)
        if (!grid.has(k)) grid.set(k, [])
        grid.get(k).push({ fi, vi })
      }
    }

    // Union-Find across (fi, vi) keys.
    const parent = new Map()
    const idKey = (e) => `${e.fi}|${e.vi}`
    function find(k) {
      let cur = k
      while (parent.get(cur) !== cur) {
        parent.set(cur, parent.get(parent.get(cur)) ?? cur)
        cur = parent.get(cur)
      }
      return cur
    }
    function union(a, b) {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }
    // Initialise.
    for (const fi of idxs) {
      const c = features[fi].geometry.coordinates
      for (let vi = 0; vi < c.length; vi++) {
        parent.set(idKey({ fi, vi }), idKey({ fi, vi }))
      }
    }

    // For each cell, gather entries from this cell and its 8 neighbours,
    // then union any cross-feature pairs within TOL.
    for (const [k] of grid) {
      const [bx, by] = k.split(',').map(Number)
      const candidates = []
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nk = cellKey(bx + dx, by + dy)
          const arr = grid.get(nk)
          if (arr) candidates.push(...arr)
        }
      }
      for (let i = 0; i < candidates.length; i++) {
        const a = candidates[i]
        const ca = features[a.fi].geometry.coordinates[a.vi]
        for (let j = i + 1; j < candidates.length; j++) {
          const b = candidates[j]
          if (a.fi === b.fi) continue
          const cb = features[b.fi].geometry.coordinates[b.vi]
          const dxc = ca[0] - cb[0]
          const dyc = ca[1] - cb[1]
          if (dxc * dxc + dyc * dyc < TOL_SQ) {
            union(idKey(a), idKey(b))
          }
        }
      }
    }

    // Compute group representatives (average coord) and rewrite vertices.
    const groups = new Map()
    for (const key of parent.keys()) {
      const r = find(key)
      if (!groups.has(r)) groups.set(r, [])
      groups.get(r).push(key)
    }
    let weldedInLine = 0
    for (const [, members] of groups) {
      if (members.length < 2) continue
      let sx = 0
      let sy = 0
      const parsed = members.map((m) => {
        const [fi, vi] = m.split('|').map(Number)
        const c = features[fi].geometry.coordinates[vi]
        sx += c[0]
        sy += c[1]
        return { fi, vi }
      })
      const ax = sx / members.length
      const ay = sy / members.length
      for (const { fi, vi } of parsed) {
        features[fi].geometry.coordinates[vi] = [ax, ay]
        weldedInLine++
      }
    }
    if (weldedInLine > 0) {
      console.log(
        `  ${line.padEnd(22)} welded ${weldedInLine} vertex(es) into shared points`,
      )
    }
    totalWelded += weldedInLine
  }
  console.log(`Vertex weld: ${totalWelded} vertices snapped across all lines.`)
}

// ---- 2. Global offset assignment -----------------------------------------

function assignOffsets(features) {
  // Combined buckets per line (across all features).
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

  // Adjacency: lines that share >= K buckets are neighbours. K = 20 (~280m
  // of co-running) — picks up real parallel sections (Circle/District on
  // the Subsurface route, Thameslink/Met from Farringdon to St Pancras,
  // GreatNorthern/Thameslink up the ECML) without binding the whole
  // network into one giant cluster.
  const OVERLAP_K = 20
  const overlap = new Map() // line → Map<line, count>
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

  // Per-line local stack: each line's offset is its position in the
  // LINE_ORDER-sorted list of its strong neighbours (incl. itself),
  // centred at 0. This keeps stacks compact (no transitive blow-up
  // through low-overlap hubs) while still putting every pair of
  // strongly-overlapping lines at distinct offsets.
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

  // Same-line consistency check: if two lines that share a strong corridor
  // collided (because their local stacks differed but the LINE_ORDER
  // position happened to map to the same offset), nudge the higher-order
  // one outward by 1 to break the tie.
  let nudged = true
  while (nudged) {
    nudged = false
    for (const a of lines) {
      for (const b of (overlap.get(a) || new Map()).keys()) {
        if (offset.get(a) === offset.get(b)) {
          const hi =
            (LINE_ORDER[a] ?? 0) > (LINE_ORDER[b] ?? 0) ? a : b
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
}

// ---- 3. Chaikin smoothing --------------------------------------------------

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

// RDP simplification to keep coord counts reasonable after smoothing.
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

function smoothAll(features) {
  let totalBefore = 0
  let totalAfter = 0
  for (const f of features) {
    const before = f.geometry.coordinates
    totalBefore += before.length
    // One Chaikin pass softens corners (each iteration ~2× the vertex
    // count). RDP at ~1m brings counts down without re-creating sharp
    // angles — kept very tight so distinct branches that pass close by
    // (Northern Bank vs Charing Cross around Kennington) don't get
    // snapped together as the simplifier discards their separation.
    const smoothed = chaikin(before, 1)
    const simplified = rdp(smoothed, 0.00001)
    f.geometry.coordinates = simplified
    totalAfter += simplified.length
  }
  console.log(
    `Smoothing: ${totalBefore} → ${totalAfter} total vertices across ${features.length} feature(s).`,
  )
}

// ---- main -----------------------------------------------------------------

function main() {
  const fc = JSON.parse(fs.readFileSync(ROUTES, 'utf8'))
  console.log(`Loaded ${fc.features.length} feature(s) from ${path.relative(process.cwd(), ROUTES)}.`)

  // Note: same-line trunk merging was tried but it severs branches from the
  // trunk at every junction (Earl's Court, Harrow on the Hill, Kennington
  // forks, Camden Town, etc.) — the OSM pipeline already builds a
  // continuous chain per branch with junction-aware merging, so we trust
  // that and don't trim here. The remaining cosmetic issue of seeing two
  // parallel ribbons of the same line on rare double-tracked sections
  // (Piccadilly main vs T4 loop) is the lesser evil compared to broken
  // visual connectivity at every fork.

  console.log('\n--- 1. Same-line vertex weld ---')
  weldSameLineVertices(fc.features)

  console.log('\n--- 2. Global offset assignment ---')
  assignOffsets(fc.features)

  console.log('\n--- 3. Chaikin smoothing ---')
  smoothAll(fc.features)

  fs.writeFileSync(ROUTES, JSON.stringify(fc))
  console.log(
    `\nWrote ${fc.features.length} feature(s) to ${path.relative(process.cwd(), ROUTES)}.`,
  )
}

main()

#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * LAB v2 — /lab/graph2 and /lab/graph3. Same idea as /lab/graph (build-lab-tracks.js),
 * with the problems found reviewing it fixed:
 *
 *  - HYBRID SOURCE. Only surface lines (National Rail, Overground, Elizabeth,
 *    Thameslink) are routed over the OSM track graph — that is where the graph
 *    wins (shared track, e.g. Thameslink/EMR). Tube + DLR keep their single raw
 *    OSM centreline (as /london): the graph has one tunnel per direction and the
 *    router zig-zagged between them (Piccadilly, Kennington).
 *  - STRATA. Every piece is tagged surface / main-line tunnel / tube tunnel /
 *    light-rail tunnel from the OSM tracks under it; lines only bundle within
 *    the same stratum (the deep Jubilee no longer snaps onto the Waterloo East
 *    viaduct, Great Northern no longer onto the Piccadilly at King's Cross).
 *  - HAND RULES ON. NO_SNAP etc. stay enabled (West Hampstead, St Pancras,
 *    Warren St); NO_SNAP zones are also frozen during mean-shift bundling.
 *  - TERMINI reach the station: end cost weighted 3x (Cannon Street stopped
 *    mid-bridge), and each service's end is extended along the track into the
 *    platforms where the raw geometry stops short (HS1 at St Pancras).
 *  - TAPERS. A line's laneOff ramps smoothly across feature boundaries (forks,
 *    corridor hand-overs), instead of jumping a lane in one step.
 *
 * graph2: mean-shift bundling (d = 35 m) then tight ribbon snap (as /lab/graph).
 * graph3: no mean-shift; the /london ribbon builder (D 34 m, D2 130 m) bundles
 *         the routed tracks directly: corridor membership is all-or-nothing, so no
 *         partial pulls / wobbles.
 *
 *   node scripts/lab/build-lab-v2.js [--only graph2,graph3]
 *
 * Track data © OpenStreetMap contributors, ODbL.
 */
const fs = require('fs')
const path = require('path')
const L1 = require('./build-lab-tracks.js')
const { toXY, toLL, dist, resample, tangentsOf, PASSTHROUGH } = L1

const ROOT = path.join(__dirname, '..', '..')
const LDATA = path.join(ROOT, 'src', 'app', '(game)', 'london', 'data')
const OUTDIR = path.join(ROOT, 'src', 'app', '(game)', 'lab', 'data')

const TUBE = new Set([
  'Bakerloo', 'Central', 'Circle', 'District', 'HammersmithAndCity', 'Jubilee',
  'Metropolitan', 'Northern', 'Piccadilly', 'Victoria', 'WaterlooAndCity', 'DLR',
])
// graph4 = graph2 + network-wide lane order. graph5 = everything, for map-scale
// sizing (line width fixed in METRES, MAP_W ~43 m): corridors only where tracks
// are within one line width (D = MAP_W), network lane order, and lane offsets
// BAKED into the geometry as continuous curves (no stepped pieces, laneOff 0).
const { MAP_W } = require('./score.js')
const VARIANTS = [
  { id: 'graph2', d: 35, ribbon: { D: 35 / 3, D2: 70 / 3 } },
  { id: 'graph3', d: 0, ribbon: {} },
  { id: 'graph4', preSame: 60, dedupe: 20, d: 35, ribbon: { D: 35 / 3, D2: 70 / 3, GLOBAL_ORDER: 4 } },
  // graph7 = graph4 for surface lines; tube/DLR from their raw OSM centrelines
  // with only repeated stretches removed, snapped with /london's radii (see
  // WIDE_LINES): tight snapping is right for routed track geometry but wrong
  // for raw tube data, which /london's loose snap absorbs
  { id: 'graph7', tubeRaw: 'dedupe', preSame: 12, preSameTunnel: 30, dedupe: 12, dedupeTunnel: 30, d: 35, ribbon: { D: 35 / 3, D2: 70 / 3, GLOBAL_ORDER: 4 } },
  // graph7t = 'true track' for the zoomed-in end (/lab/staging3t, z >= 13.5):
  // as Graph 7, but surface lines are not pulled toward other lines and only
  // share a corridor on the same physical track (snap 6 m)
  { id: 'graph7t', tubeRaw: 'dedupe', preSame: 12, preSameTunnel: 30, dedupe: 12, dedupeTunnel: 30, d: 0, ribbon: { D: 6, D2: 12, GLOBAL_ORDER: 4 } },
  { id: 'graph5', d: MAP_W, sameLine: true, ribbon: { D: MAP_W, D2: 130, GLOBAL_ORDER: 4 }, bake: true },
]
// experiments: VX='{"id":"graph4x","from":"graph4","ribbon":{...},...}' adds a
// variant cloned from another with overrides (writes routes.<id>.json only)
if (process.env.VX) {
  const x = JSON.parse(process.env.VX)
  const base = VARIANTS.find((v) => v.id === x.from)
  VARIANTS.push({ ...base, ...x, ribbon: { ...base.ribbon, ...(x.ribbon || {}) }, experiment: true })
}
// Thameslink's 5 km NO_SNAP north of King's Cross keeps it off the Piccadilly /
// Victoria at Finsbury Park; with strata those tunnels can't bundle with it
// anyway, and the rule split Thameslink from Great Northern on shared track.
const NO_SNAP_DROP = [{ line: 'Thameslink', radius: 5000 }]
const END_K = 3
const REUSE = 0.6 // routing: a line's services prefer track it already uses
// Route pieces dropped as noise: a crossover between two of the line's own
// tracks (both ends at its junctions) shorter than CROSSOVER_M, and a dead-end
// spur shorter than SPUR_M that doesn't lead to one of its stations.
const CROSSOVER_M = 80, SPUR_M = 50
function pruneChains(chains, stations) {
  const key = (p) => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10)
  const len = (xy) => xy.reduce((a, q, i) => (i ? a + dist(xy[i - 1], q) : 0), 0)
  let cur = chains
  for (let pass = 0; pass < 3; pass++) {
    const deg = new Map()
    for (const xy of cur) for (const p of [xy[0], xy.at(-1)]) deg.set(key(p), (deg.get(key(p)) || 0) + 1)
    const nearStation = (p) => stations.some((s) => dist(s, p) < 150)
    const next = cur.filter((xy) => {
      const L = len(xy), da = deg.get(key(xy[0])), db = deg.get(key(xy.at(-1)))
      if (L < CROSSOVER_M && da >= 2 && db >= 2 && key(xy[0]) !== key(xy.at(-1))) return false
      if (L < SPUR_M && (da === 1) !== (db === 1) && !nearStation(da === 1 ? xy[0] : xy.at(-1))) return false
      return true
    })
    if (next.length === cur.length) break
    cur = next
  }
  return cur
}
const STRATUM_MIN_RUN = 150 // m: shorter tunnel/surface flips are noise
const TAPER_M = 160 // m: total length of a laneOff ramp across a feature boundary
const TAPER_STEP = 10 // m: ramp piece length (laneOff steps of ~1/16 lane)

// NO_SNAP is defined once, in build-ribbons.js (which runs main() on require),
// so read the table from its source.
function loadNoSnap() {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'build-ribbons.js'), 'utf8')
  const m = src.match(/const NO_SNAP = (\[[\s\S]*?\n\])/)
  return Function(`return ${m[1]}`)()
    .filter((o) => !NO_SNAP_DROP.some((d) => d.line === o.line && d.radius === o.radius))
    .map((o) => ({ ...o, atXY: toXY(o.at) }))
}

// ---------------------------------------------------------------- strata
// Per track-graph node: tunnel (every way through it is a tunnel) and type bits.
function nodeInfo(G) {
  const T = L1.readTracks()
  const idx = new Map(T.nodes.map(([id], i) => [id, i]))
  const n = T.nodes.length
  const tun = new Uint8Array(n).fill(1), seen = new Uint8Array(n), type = new Uint8Array(n)
  const BIT = { rail: 1, subway: 2, light_rail: 4 }
  for (const [, t, tunnel, , ns] of T.ways) for (const id of ns) {
    const i = idx.get(id)
    if (i == null) continue
    seen[i] = 1; type[i] |= BIT[t] || 1
    if (!tunnel) tun[i] = 0
  }
  for (let i = 0; i < n; i++) if (!seen[i]) tun[i] = 0
  if (n !== G.X.length) throw new Error('track graph / node info mismatch')
  return { tun, type }
}
// Stratum per point: the nearest track node (preferring `prefer` type bits)
// within R decides; runs shorter than STRATUM_MIN_RUN take their neighbours'.
// preferOnly: only `prefer` tracks count (raw tube/DLR centrelines can sit
// 25–80 m from their own OSM tunnel; falling back to the nearest track of any
// kind then classed the deep Jubilee as 'surface' under the Southwark–London
// Bridge viaduct and bundled it there).
function strataOf(G, info, xy, R, prefer, preferOnly = false) {
  const raw = xy.map((p) => {
    let best = -1, bd = Infinity, bestP = -1, bdP = Infinity
    for (const j of G.near(p, R)) {
      const d = Math.hypot(G.X[j] - p[0], G.Y[j] - p[1])
      if (d < bd) { bd = d; best = j }
      if (prefer && info.type[j] & prefer && d < bdP) { bdP = d; bestP = j }
    }
    const j = bestP >= 0 ? bestP : preferOnly ? -1 : best
    // tunnels by kind: a deep tube tunnel and a main-line tunnel (Gasworks /
    // Copenhagen, under King's Cross) are different strata too
    if (j < 0 || !info.tun[j]) return 'surface'
    return info.type[j] & 2 ? 'tunnel-subway' : info.type[j] & 4 ? 'tunnel-light' : 'tunnel-rail'
  })
  const cum = [0]
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + dist(xy[i - 1], xy[i]))
  for (let pass = 0; pass < 3; pass++) {
    const runs = []
    let s = 0
    for (let i = 1; i <= raw.length; i++) if (i === raw.length || raw[i] !== raw[s]) { runs.push([s, i - 1]); s = i }
    if (runs.length < 2) break
    let changed = false
    for (let k = 0; k < runs.length; k++) {
      const [lo, hi] = runs[k]
      if (cum[hi] - cum[lo] >= STRATUM_MIN_RUN) continue
      const nb = runs[k > 0 ? k - 1 : k + 1]
      const v = raw[nb[0]]
      if (v !== raw[lo]) { for (let i = lo; i <= hi; i++) raw[i] = v; changed = true }
    }
    if (!changed) break
  }
  return raw
}
// Carry per-point strata from an old polyline onto a new one (resampled,
// trimmed or moved), by nearest old vertex walking forward.
function mapSt(newXY, oldXY, oldSts) {
  if (!oldSts) return null
  let k = 0
  return newXY.map((q) => {
    let best = k, bd = dist(oldXY[k], q)
    for (let j = Math.max(0, k - 5); j < Math.min(oldXY.length, k + 60); j++) { const d = dist(oldXY[j], q); if (d < bd) { bd = d; best = j } }
    k = best
    return oldSts[best]
  })
}
const isTunnel = (st) => st && st !== 'surface'
// Split a polyline where its stratum changes (the split vertex is shared).
function splitByStratum(poly, st) {
  const out = []
  let s = 0
  for (let i = 1; i <= poly.xy.length; i++)
    if (i === poly.xy.length || st[i] !== st[s]) {
      const xy = poly.xy.slice(s, Math.min(poly.xy.length, i + 1))
      if (xy.length >= 2) out.push({ ...poly, xy, st: st[s] })
      s = i
    }
  return out
}

// ---------------------------------------------------------------- raw smoothing
// Raw OSM tube / DLR centrelines are coarse: corners and 5–15 m wobbles a real
// tunnel never has (the Victoria at Arsenal, the District at West Brompton and
// Fulham Broadway; /london shows them too). Gaussian-smooth the 10 m-resampled
// line (sigma RAW_SIGMA m; window shrinks towards the ends, which stay put),
// never moving a point more than RAW_MAXD m, so stations and junctions keep
// their place.
const RAW_SIGMA = 25, RAW_MAXD = 8
function smoothRaw(xy) {
  const n = xy.length
  if (n < 5) return xy
  const step = 10, half = Math.ceil((2.5 * RAW_SIGMA) / step)
  const w = []
  for (let k = -half; k <= half; k++) w.push(Math.exp(-((k * step) ** 2) / (2 * RAW_SIGMA ** 2)))
  return xy.map((p, i) => {
    const h = Math.min(half, i, n - 1 - i) // symmetric window: ends stay fixed
    if (!h) return p
    let sx = 0, sy = 0, sw = 0
    for (let k = -h; k <= h; k++) { const wk = w[k + half]; sx += wk * xy[i + k][0]; sy += wk * xy[i + k][1]; sw += wk }
    const q = [sx / sw, sy / sw], d = dist(p, q)
    return d <= RAW_MAXD ? q : [p[0] + ((q[0] - p[0]) * RAW_MAXD) / d, p[1] + ((q[1] - p[1]) * RAW_MAXD) / d]
  })
}

// ---------------------------------------------------------------- raw duplicates
// Raw OSM tube relations trace shared trunks more than once: one feature per
// branch route (the Piccadilly's Heathrow and Uxbridge features both run the
// whole trunk from Cockfosters, through West Kensington, 5–25 m apart). The
// tight Graph 4 snap can't merge them, so they braid and their lanes disagree.
// Per line, longest feature first: drop the STRETCHES of a feature covered
// (within RAW_DUP_M, near-parallel) by features already kept; keep its
// uncovered runs (>= RAW_DUP_RUN m) with one point of overlap each side, which
// cleanEnds() then joins onto the kept trunk.
const DUP_PAR_COS = 0.97, DUP_MIN_COVER = 150
const RAW_DUP_M = 40, RAW_DUP_RUN = 60, RAW_MEET_M = 6, RAW_FOLLOW_M = 300
function dropDuplicateRaw(fc) {
  const items = fc.features.map((f) => ({ f, line: f.properties.line, st: '', xy: resample(f.geometry.coordinates.map(toXY), 10) }))
  const r = dedupeXY(items, RAW_DUP_M)
  console.log(`raw tube/DLR: ${(r.dropped / 1000).toFixed(1)} km of repeated trunk dropped`)
  return { ...fc, features: r.items.map((it) => ({ ...it.f, geometry: { type: 'LineString', coordinates: it.xy.map(toLL) } })) }
}
// Per line (+ stratum), longest first: drop the stretches of an item running
// near-parallel within M of geometry already kept; keep uncovered runs, each
// extended along its dropped stretch until it meets the kept line (see above).
// items: [{line, st, xy (resampled ~10 m), ...}] -> {items, dropped (m)}
function dedupeXY(items, M0, Mtunnel = M0) {
  const groups = new Map()
  for (const it of items) { const k = it.line; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it) }
  const out = []
  let dropped = 0
  const len = (xy) => xy.reduce((a, q, i) => (i ? a + dist(xy[i - 1], q) : 0), 0)
  for (const P of groups.values()) {
    P.sort((a, b) => len(b.xy) - len(a.xy))
    const M = Math.max(M0, Mtunnel) // grid reach; the threshold is per point
    const CELL = 100, grid = new Map()
    const addKept = (xy) => {
      for (let j = 1; j < xy.length; j++) {
        const a = xy[j - 1], b = xy[j]
        const x0 = Math.floor((Math.min(a[0], b[0]) - M) / CELL), x1 = Math.floor((Math.max(a[0], b[0]) + M) / CELL)
        const y0 = Math.floor((Math.min(a[1], b[1]) - M) / CELL), y1 = Math.floor((Math.max(a[1], b[1]) + M) / CELL)
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([a, b]) }
      }
    }
    for (const p of P) {
      if (p.xy.length < 2) continue
      const tan = tangentsOf(p.xy, 1)
      // per point: distance + projection onto the kept geometry (near-parallel only)
      const near = p.xy.map((q, i) => {
        const t = tan[i]
        let bd = Infinity, proj = null
        for (const [a, b] of grid.get(Math.floor(q[0] / CELL) + ',' + Math.floor(q[1] / CELL)) || []) {
          const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy
          if (!L2 || Math.abs((dx * t[0] + dy * t[1]) / Math.sqrt(L2)) < DUP_PAR_COS) continue
          const u = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2))
          const pr = [a[0] + u * dx, a[1] + u * dy], d = dist(pr, q)
          if (d < bd) { bd = d; proj = pr }
        }
        return { d: bd, proj }
      })
      // covered = genuinely running alongside: near-parallel and for at least
      // DUP_MIN_COVER m; a shallow CROSSING of another route of the same line
      // is not a duplicate (Great Northern's Moorgate branch crossing the main
      // line at Arsenal lost a stretch and left a hook)
      const covered = near.map((n, i) => n.d < (isTunnel(p.sts && p.sts[i]) ? Mtunnel : M0))
      {
        let s0 = 0
        for (let i = 1; i <= covered.length; i++) {
          if (i < covered.length && covered[i] === covered[s0]) continue
          if (covered[s0]) {
            let L = 0
            for (let k = s0 + 1; k < i; k++) L += dist(p.xy[k - 1], p.xy[k])
            const touchesEnd = s0 === 0 || i === covered.length
            if (L < DUP_MIN_COVER && !touchesEnd) for (let k = s0; k < i; k++) covered[k] = false
          }
          s0 = i
        }
      }
      // from a cut, follow the dropped stretch until it really meets the kept
      // line (< RAW_MEET_M; else its closest point within RAW_FOLLOW_M) and
      // end ON it, so the branch merges instead of stopping short
      const follow = (from, dir) => {
        const pts = []
        let best = -1, bd = Infinity, run = 0
        for (let i = from; i >= 0 && i < p.xy.length && covered[i] && run <= RAW_FOLLOW_M; i += dir) {
          pts.push(i)
          if (near[i].d < bd) { bd = near[i].d; best = pts.length - 1 }
          if (near[i].d < RAW_MEET_M) break
          if (i !== from) run += dist(p.xy[i], p.xy[i - dir])
        }
        if (best < 0) return []
        const idx = pts.slice(0, best + 1)
        return [...idx, -idx.at(-1) - 1] // -(i+1): the projection of point i onto the kept line
      }
      const ptOf = (k) => (k >= 0 ? p.xy[k] : near[-k - 1].proj)
      const stOf = (k) => (p.sts ? p.sts[k >= 0 ? k : -k - 1] : undefined)
      let s0 = 0
      for (let i = 1; i <= p.xy.length; i++) {
        if (i < p.xy.length && covered[i] === covered[s0]) continue
        const lo = s0, hi = i - 1
        s0 = i
        if (covered[lo]) { dropped += len(p.xy.slice(lo, hi + 1)); continue }
        const ids = [
          ...(lo > 0 ? follow(lo - 1, -1).reverse() : []),
          ...Array.from({ length: hi - lo + 1 }, (_, k) => lo + k),
          ...(hi < p.xy.length - 1 ? follow(hi + 1, 1) : []),
        ]
        const run = ids.map(ptOf)
        if (len(run) < RAW_DUP_RUN && (lo > 0 || hi < p.xy.length - 1)) { dropped += len(run); continue }
        addKept(run)
        out.push({ ...p, xy: run, sts: p.sts ? ids.map(stOf) : p.sts })
      }
    }
  }
  return { items: out, dropped }
}

// ---------------------------------------------------------------- line ends
// Per line, on the base pieces (metric): an end that no other piece of the
// line shares is either a loose end near the line itself (raw tube loop arms
// stopping ~20 m short of the main line at Kennington -> an arrow-shaped
// stub) or a terminus. A loose end within JOIN_M of another piece of the same
// line loses its sharply-turning tail and is joined onto that piece; any other
// end loses a short sharply-turning tail (a crossover onto the next platform
// at New Cross / Clapham Junction drawn as a hook).
const TOUCH_M = 10, JOIN_M = 40, HOOK_M = 40, HOOK_DEG = 50, HOOK_SWING = 25, CONT_M = 70, OVER_M = 8, OVER_RUN = 150, SHOOT_M = 60, SHOOT_D = 4
const turn = (a, b, c) => {
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1]
  const d = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1)
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI
}
// drop trailing vertices within HOOK_M of the end while the path turns
// sharply, and cut the last HOOK_M off if, as a whole, it heads more than
// HOOK_SWING away from the HOOK_M before it (a gentle flick onto the next
// platform road over a few short segments)
const back = (xy, from, m) => { let run = 0, i = from; while (i > 0 && run < m) { run += dist(xy[i], xy[i - 1]); i-- } return run >= m ? i : -1 }
const trimTail = (xy) => {
  let k = xy.length - 1, run = 0
  for (let i = xy.length - 1; i >= 2; i--) {
    run += dist(xy[i], xy[i - 1])
    if (run > HOOK_M) break
    if (turn(xy[i - 2], xy[i - 1], xy[i]) > HOOK_DEG) k = i - 1
  }
  let out = xy.slice(0, k + 1)
  // heading swing, measured on the tail resampled every 5 m (vertices can be
  // 100+ m apart before a short flick)
  const keep = back(out, out.length - 1, HOOK_M + 60)
  if (keep < 0) return out
  const head = out.slice(0, keep), tail = resample(out.slice(keep), 5)
  const T = tail.length - 1
  let cut = -1
  for (const L of [15, 25, HOOK_M]) {
    const a = T - L / 5, b = a - 40 / 5
    if (b < 0) continue
    if (turn(tail[b], tail[a], tail[T]) > HOOK_SWING) cut = a
  }
  if (cut < 0) return out
  return [...head, ...tail.slice(0, cut + 1)]
}
function cleanEnds(pieces) {
  const nearestOn = (p, segs, R = JOIN_M) => {
    let best = null, bd = R
    for (const [a, b] of segs) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy
      const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0
      const q = [a[0] + t * dx, a[1] + t * dy], d = dist(p, q)
      if (d < bd) { bd = d; best = q }
    }
    return best
  }
  const byLine = new Map()
  pieces.forEach((p, i) => { if (!byLine.has(p.line)) byLine.set(p.line, []); byLine.get(p.line).push(i) })
  let joined = 0, trimmed = 0
  const out = pieces.map((p) => ({ ...p, xy: p.xy.slice() }))
  for (const ids of byLine.values()) {
    for (const i of ids) for (const atEnd of [true, false]) {
      let xy = atEnd ? out[i].xy : out[i].xy.slice().reverse()
      if (xy.length < 3) continue
      const e = xy.at(-1)
      const shared = ids.some((j) => j !== i && (dist(out[j].xy[0], e) < 3 || dist(out[j].xy.at(-1), e) < 3))
      if (shared) continue
      const segs = []
      for (const j of ids) {
        if (j === i) continue
        const o = out[j].xy
        for (let k = 1; k < o.length; k++) segs.push([o[k - 1], o[k]])
      }
      // an end already touching its own line mid-piece is a junction (a branch
      // curving into its trunk: the District's Olympia branch at Earl's
      // Court), not a hook: attach it as it is, no trimming
      {
        const touch = nearestOn(e, segs, TOUCH_M)
        if (touch) {
          if (dist(touch, e) > 0.5) { xy = [...xy, touch]; out[i].xy = atEnd ? xy : xy.slice().reverse() }
          joined++
          continue
        }
      }
      let overlapCut = false
      // a loose end that runs ALONGSIDE another piece of its own line (raw
      // branches overlapping past a junction: the Charing Cross branch runs
      // ~30 m up beside the Edgware branch at Camden Town) is cut back to
      // where the overlap starts; the join below then attaches it there
      {
        const near = (p) => { let bd = Infinity; for (const [a, b] of segs) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; const tt = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; bd = Math.min(bd, dist(p, [a[0] + tt * dx, a[1] + tt * dy])) } return bd }
        // overshoot: in its last SHOOT_M the end passes within SHOOT_D of
        // another piece of the line and carries on past it (a branch drawn
        // ~20 m beyond the junction at Camden Town) -> cut at that crossing
        {
          let best = -1, bd = SHOOT_D, run2 = 0
          for (let m = xy.length - 2; m >= 1 && run2 <= SHOOT_M; m--) {
            run2 += dist(xy[m + 1], xy[m])
            const dm = near(xy[m])
            if (dm < bd) { bd = dm; best = m }
          }
          if (best >= 1 && dist(xy[best], xy.at(-1)) > 5) { xy = xy.slice(0, best + 1); trimmed++; overlapCut = true }
        }
        let k = xy.length - 1, run = 0
        while (k > 0 && run <= OVER_RUN && near(xy[k]) < OVER_M) { run += dist(xy[k], xy[k - 1]); k-- }
        if (k < xy.length - 1 && run <= OVER_RUN && k >= 1) { xy = xy.slice(0, k + 2); trimmed++; overlapCut = true }
      }
      const t = trimTail(xy)
      // first choice: continue END-TO-END into another unshared end of the
      // line just ahead (Camden Town: the Charing Cross branch stops ~30 m
      // short of where the Edgware / High Barnet branch starts; joining it
      // sideways onto the Bank branch drew a tick)
      let q = null
      {
        const k0 = back(t, t.length - 1, 30)
        const a0 = t[k0 >= 0 ? k0 : 0], p0 = t.at(-1)
        let bd = CONT_M
        for (const j of ids) {
          if (j === i) continue
          const o = out[j].xy
          for (const [c, nx] of [[o[0], o[Math.min(1, o.length - 1)]], [o.at(-1), o[Math.max(0, o.length - 2)]]]) {
            const d = dist(p0, c)
            if (d >= bd || d < 1) continue
            const free = !ids.some((m) => m !== j && (dist(out[m].xy[0], c) < 3 || dist(out[m].xy.at(-1), c) < 3))
            // straight on: little turn into the gap, and the other piece carries on the same way
            if (free && turn(a0, p0, c) < 35 && turn(p0, c, nx) < 35) { bd = d; q = c }
          }
        }
      }
      q = q || nearestOn(t.at(-1), segs) || nearestOn(e, segs)
      // only join onto the line AHEAD (or right here): a parallel platform
      // road beside a terminus is not a continuation
      if (q && dist(q, t.at(-1)) > 8) {
        const k = back(t, t.length - 1, 30)
        const a = t[k >= 0 ? k : 0]
        if (turn(a, t.at(-1), q) > 60) q = null
      }
      if (q) { xy = [...t, q]; joined++ }
      else if (t.length < xy.length || overlapCut) { xy = t; trimmed++ }
      else continue
      out[i].xy = atEnd ? xy : xy.slice().reverse()
    }
  }
  // ends were trimmed / extended: re-carry each piece's per-point strata
  out.forEach((q, i) => { q.sts = mapSt(q.xy, pieces[i].xy, pieces[i].sts) })
  return { pieces: out, joined, trimmed }
}

// The ribbon builder's smoothing / snapping can still bend the last metres of
// a line that ENDS inside a corridor (Windrush at New Cross, Mildmay and
// Windrush at Clapham Junction): trim the same kind of tail on the output
// features at every line end no other feature of the line continues from.
function trimFeatureHooks(fc) {
  const byLine = new Map()
  fc.features.forEach((f, i) => {
    if (PASSTHROUGH.has(f.properties.line) || f.geometry.type !== 'LineString') return
    if (!byLine.has(f.properties.line)) byLine.set(f.properties.line, [])
    byLine.get(f.properties.line).push(i)
  })
  let n = 0
  const xys = new Map()
  fc.features.forEach((f, i) => { if (f.geometry.type === 'LineString') xys.set(i, f.geometry.coordinates.map(toXY)) })
  const dead = new Set()
  const len = (xy) => xy.reduce((a, q, i) => (i ? a + dist(xy[i - 1], q) : 0), 0)
  for (const ids of byLine.values()) {
    const endsAt = (p, not) => ids.filter((j) => !dead.has(j) && j !== not).flatMap((j) => {
      const xy = xys.get(j), o = []
      if (dist(xy[0], p) < 1) o.push({ j, atEnd: false })
      if (dist(xy.at(-1), p) < 1) o.push({ j, atEnd: true })
      return o
    })
    for (const i of ids) for (const atEnd of [true, false]) {
      if (dead.has(i)) continue
      const own = xys.get(i), e = atEnd ? own.at(-1) : own[0]
      if (ids.some((j) => j !== i && !dead.has(j) && (dist(xys.get(j)[0], e) < 3 || dist(xys.get(j).at(-1), e) < 3))) continue
      // chain of pieces back from this end (each oriented towards the end),
      // until ~HOOK_M + 100 m, through one-to-one joints only
      const chain = [{ j: i, atEnd }]
      let total = len(own)
      while (total < HOOK_M + 100) {
        const c = chain.at(-1), xy = xys.get(c.j)
        const far = c.atEnd ? xy[0] : xy.at(-1)
        const nx = endsAt(far, c.j)
        if (nx.length !== 1 || chain.some((q) => q.j === nx[0].j)) break
        chain.push({ j: nx[0].j, atEnd: !nx[0].atEnd ? false : true })
        // orient: the continuation's end AT `far` is the end nearer our tip
        chain.at(-1).atEnd = nx[0].atEnd
        total += len(xys.get(nx[0].j))
      }
      // combined tail polyline, from far to tip
      const pts = []
      for (let k = chain.length - 1; k >= 0; k--) {
        const xy = xys.get(chain[k].j)
        const seq = chain[k].atEnd ? xy : xy.slice().reverse()
        for (const q of seq) if (!pts.length || dist(pts.at(-1), q) > 1e-6) pts.push(q)
      }
      if (pts.length < 3) continue
      const t = trimTail(pts)
      let remove = len(pts) - len(t)
      if (remove < 1) continue
      n++
      // remove `remove` metres from the tip, piece by piece
      for (const c of chain) {
        const xy = xys.get(c.j)
        const L = len(xy)
        if (L <= remove + 1e-6) { dead.add(c.j); remove -= L; continue }
        const seq = c.atEnd ? xy.slice() : xy.slice().reverse() // ends at the tip
        let r = remove
        while (seq.length > 1 && r > 0) {
          const d = dist(seq.at(-2), seq.at(-1))
          if (d <= r) { seq.pop(); r -= d; continue }
          const a = seq.at(-2), b = seq.at(-1), f = (d - r) / d
          seq[seq.length - 1] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
          r = 0
        }
        xys.set(c.j, c.atEnd ? seq : seq.reverse())
        break
      }
    }
  }
  const feats = []
  fc.features.forEach((f, i) => {
    if (dead.has(i)) return
    if (!xys.has(i) || f.geometry.type !== 'LineString') { feats.push(f); return }
    if (xys.get(i).length < 2) return
    feats.push({ ...f, geometry: { type: 'LineString', coordinates: xys.get(i).map(toLL) } })
  })
  return { fc: { ...fc, features: feats }, trimmed: n }
}

// ---------------------------------------------------------------- bundling
// build-lab-tracks bundle(), plus: only same-stratum points attract, and points
// inside a NO_SNAP zone for their own line neither move nor attract.
// Underground lines may bundle with each other across surface / tube tunnel
// (District + Piccadilly through West Kensington); any other pair only within
// one stratum (Jubilee tunnel vs the Waterloo East viaduct). Same rule is
// passed to build-ribbons as STRATA_TUBE.
const UNDERGROUND = [...TUBE].filter((l) => l !== 'DLR')
// lines on their own dedicated track throughout the lab area: bundled only
// with themselves (HS1 was pulled into the Midland / Thameslink corridor on
// the St Pancras approach). Passed to build-ribbons as SOLO_LINES.
const SOLO = new Set(['SoutheasternHighSpeed'])
const strataOk = (sa, la, sb, lb) =>
  sa === sb || (UNDERGROUND.includes(la) && UNDERGROUND.includes(lb) && [sa, sb].every((x) => x === 'surface' || x === 'tunnel-subway'))
// sameLine: only a line's own parallel copies attract (a line routed over the
// fast AND slow tracks becomes one line), never two different lines.
// dTun: radius for pairs of points both in tunnel (a line's twin bores run
// ~20–30 m apart, its surface tracks 5–15 m); d for every other pair.
function bundle2(polys, d0, noSnap, sameLine = false, dTun = d0) {
  const STEP = 10
  const d = Math.max(d0, dTun)
  const P = polys.map((p) => {
    const xy = resample(p.xy, STEP)
    const frozen = xy.map((q) => noSnap.some((o) => o.line === p.line && dist(q, o.atXY) < o.radius))
    return { ...p, xy, sts: mapSt(xy, p.xy, p.sts), frozen }
  })
  if (d <= STEP) return P
  // Chains: a line's pieces joined end to end where exactly two of its pieces
  // meet (stratum splits at portals, chain breaks). The displacement is
  // smoothed along the whole chain and only the chain's real ends are pinned,
  // so a joint never becomes a kink (pinning every piece end made a V where
  // the pull differs across it: HS1's surface piece pulled toward the North
  // London Line while its tunnel piece is not, at the York Way portal).
  const chains = (() => {
    const key = (q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)
    const ends = new Map()
    P.forEach((p, pi) => {
      for (const [q, atStart] of [[p.xy[0], true], [p.xy.at(-1), false]]) {
        const k = p.line + '|' + key(q)
        if (!ends.has(k)) ends.set(k, [])
        ends.get(k).push({ pi, atStart })
      }
    })
    const other = (pi, atStart) => {
      const p = P[pi], q = atStart ? p.xy[0] : p.xy.at(-1)
      const list = ends.get(p.line + '|' + key(q))
      return list.length === 2 ? list.find((e) => e.pi !== pi || e.atStart !== atStart) : null
    }
    const used = new Uint8Array(P.length)
    const out = []
    const build = (pi) => {
      // walk back to the chain start, then forward
      let cur = { pi, rev: false }, guard = 0
      for (;;) {
        const o = other(cur.pi, !cur.rev) // the end we came from
        if (!o || o.pi === pi || guard++ > P.length) break
        cur = { pi: o.pi, rev: o.atStart } // entering o at its start -> walk it reversed when going back
      }
      const start = cur
      const seq = [start]
      used[start.pi] = 1
      let c = start
      for (;;) {
        const o = other(c.pi, c.rev) // the far end of c in walking direction
        if (!o || used[o.pi]) break
        c = { pi: o.pi, rev: !o.atStart }
        used[c.pi] = 1
        seq.push(c)
      }
      return seq
    }
    P.forEach((_, pi) => { if (!used[pi]) out.push(build(pi)) })
    return out
  })()
  const COS = Math.cos((35 * Math.PI) / 180)
  const kernel = (r) => (1 - (r / d) ** 2) ** 2
  for (let it = 0; it < 10; it++) {
    const tans = P.map((p) => tangentsOf(p.xy))
    const grid = new Map()
    P.forEach((p, pi) => p.xy.forEach((q, i) => {
      if (p.frozen[i]) return
      const k = Math.floor(q[0] / d) + ',' + Math.floor(q[1] / d)
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k).push([pi, i])
    }))
    const raw = P.map((p, pi) => {
      return p.xy.map((q, i) => {
        if (p.frozen[i]) return [0, 0]
        const t = tans[pi][i], nx = -t[1], ny = t[0]
        const cx = Math.floor(q[0] / d), cy = Math.floor(q[1] / d)
        let sw = 1, so = 0
        for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++)
          for (const [pj, j] of grid.get(gx + ',' + gy) || []) {
            const sa = P[pj].sts ? P[pj].sts[j] : null, sb = p.sts ? p.sts[i] : null
            if (pj === pi || !strataOk(sa, P[pj].line, sb, p.line) || (sameLine && P[pj].line !== p.line)) continue
            if (SOLO.has(p.line) !== SOLO.has(P[pj].line) || (SOLO.has(p.line) && P[pj].line !== p.line)) continue
            const o = P[pj].xy[j]
            const r = Math.hypot(o[0] - q[0], o[1] - q[1])
            const dd = isTunnel(sa) && isTunnel(sb) ? dTun : d0
            if (r >= dd) continue
            const tj = tans[pj][j]
            if (Math.abs(t[0] * tj[0] + t[1] * tj[1]) < COS) continue
            const w = (1 - (r / dd) ** 2) ** 2
            sw += w; so += w * ((o[0] - q[0]) * nx + (o[1] - q[1]) * ny)
          }
        const off = so / sw
        return [off * nx, off * ny]
      })
    })
    // smooth along each chain (~d/2 window); pin only the chain's ends
    const half = Math.max(1, Math.round(d / (2 * STEP)))
    const next = P.map((p) => p.xy.map((q) => [q[0], q[1]]))
    for (const seq of chains) {
      const refs = [] // [[pi, i], ...] per chain point (a joint lists both pieces)
      seq.forEach(({ pi, rev }, k) => {
        const n = P[pi].xy.length
        for (let j = 0; j < n; j++) {
          const i = rev ? n - 1 - j : j
          if (k > 0 && j === 0) refs[refs.length - 1].push([pi, i])
          else refs.push([[pi, i]])
        }
      })
      const D = refs.map((r) => { let x = 0, y = 0; for (const [pi, i] of r) { x += raw[pi][i][0]; y += raw[pi][i][1] } return [x / r.length, y / r.length] })
      const m = refs.length
      for (let a = 1; a < m - 1; a++) {
        let sx = 0, sy = 0, c = 0
        for (let k = Math.max(0, a - half); k <= Math.min(m - 1, a + half); k++) { sx += D[k][0]; sy += D[k][1]; c++ }
        for (const [pi, i] of refs[a]) next[pi][i] = [P[pi].xy[i][0] + sx / c, P[pi].xy[i][1] + sy / c]
      }
    }
    P.forEach((p, pi) => (p.xy = next[pi]))
  }
  return P
}

// ---------------------------------------------------------------- tapers
// line-offset is one value per feature, so build-ribbons ramps laneOff only
// inside a feature; where a line passes from one feature to the next (a fork,
// a stratum split, a corridor hand-over) the offset jumped a whole lane. Here,
// per line, features meeting at a point get their ends re-cut into short
// pieces whose laneOff eases (smoothstep) from the shared value at the joint to
// the feature's own value. At a fork the trunk keeps its value; branches ease
// out of it.
// opts.geoW (metres, map-scale sizing only): a branch leaving a corridor onto
// its own track keeps its lane until its true track has moved out past that
// lane, then hands over (smooth max of lane offset and true separation), so
// it never swings back towards the corridor before peeling off (no S-bend).
function taper(fc, opts = {}) {
  const byLine = new Map()
  fc.features.forEach((f, fi) => {
    const l = f.properties.line
    if (PASSTHROUGH.has(l) || f.properties.laneOff == null) return
    if (!byLine.has(l)) byLine.set(l, [])
    byLine.get(l).push(fi)
  })
  const ramps = new Map() // fi -> {start: {L, m}, end: {L, m}} (m in feature frame)
  const geo = new Map() // fi -> {xy, cum}
  const G = (fi) => {
    if (!geo.has(fi)) {
      const xy = fc.features[fi].geometry.coordinates.map(toXY)
      const cum = [0]
      for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + dist(xy[i - 1], xy[i]))
      geo.set(fi, { xy, cum })
    }
    return geo.get(fi)
  }
  const outTan = (fi, atStart) => {
    const { xy, cum } = G(fi)
    const L = cum.at(-1), want = Math.min(40, L / 2)
    let a, b
    if (atStart) { a = xy[0]; b = xy.find((_, i) => cum[i] >= want) || xy.at(-1) } else { a = xy.at(-1); b = [...xy].reverse().find((_, i) => L - cum[xy.length - 1 - i] >= want) || xy[0] }
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1
    return [dx / n, dy / n]
  }
  let joints = 0
  for (const fis of byLine.values()) {
    const CELL = 3
    const nodes = []
    const grid = new Map()
    const ends = []
    for (const fi of fis) for (const atStart of [true, false]) {
      const { xy } = G(fi)
      const p = atStart ? xy[0] : xy.at(-1)
      const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
      let node = -1
      for (let gx = cx - 1; gx <= cx + 1 && node < 0; gx++) for (let gy = cy - 1; gy <= cy + 1 && node < 0; gy++)
        for (const k of grid.get(gx + ',' + gy) || []) if (dist(nodes[k].p, p) < 2) { node = k; break }
      if (node < 0) {
        node = nodes.length
        nodes.push({ p, inc: [] })
        const key = cx + ',' + cy
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key).push(node)
      }
      nodes[node].inc.push({ fi, atStart })
      ends.push(node)
    }
    for (const nd of nodes) {
      if (nd.inc.length < 2) continue
      // outward-frame offsets: + = right of the direction leaving the joint
      const inc = nd.inc.map((e) => {
        const lo = fc.features[e.fi].properties.laneOff || 0
        return { ...e, o: e.atStart ? lo : -lo, t: outTan(e.fi, e.atStart), len: G(e.fi).cum.at(-1) }
      })
      const set = (e, mOut, L, geoRamp = false) => {
        if (Math.abs(mOut - e.o) < 1e-6 || L < TAPER_STEP) return
        if (!ramps.has(e.fi)) ramps.set(e.fi, {})
        ramps.get(e.fi)[e.atStart ? 'start' : 'end'] = { L, m: e.atStart ? mOut : -mOut, ...(geoRamp ? { geo: { J: nd.p, t: e.t, mOut, atStart: e.atStart } } : {}) }
        joints++
      }
      const solo = (e) => Math.abs(e.o) < 1e-6
      if (opts.geoW && inc.length === 2 && solo(inc[0]) !== solo(inc[1])) {
        const [cor, own] = solo(inc[0]) ? [inc[1], inc[0]] : [inc[0], inc[1]]
        set(own, -cor.o, Math.min(400, 0.9 * own.len), true)
      } else if (inc.length === 2) {
        const [a, b] = inc
        const mB = (b.o - a.o) / 2 // joint value in b's outward frame
        set(a, -mB, Math.min(TAPER_M / 2, 0.45 * a.len))
        set(b, mB, Math.min(TAPER_M / 2, 0.45 * b.len))
      } else {
        // trunk: the end pointing away from the others
        let trunk = inc[0], best = Infinity
        for (const e of inc) {
          let s = 0
          for (const o of inc) if (o !== e) s += e.t[0] * o.t[0] + e.t[1] * o.t[1]
          if (s < best) { best = s; trunk = e }
        }
        for (const e of inc) if (e !== trunk) set(e, -trunk.o, opts.geoW && solo(e) ? Math.min(400, 0.9 * e.len) : Math.min(TAPER_M, 0.45 * e.len), !!opts.geoW && solo(e))
      }
    }
  }
  const ease = (x) => x * x * (3 - 2 * x)
  const out = []
  fc.features.forEach((f, fi) => {
    const r = ramps.get(fi)
    if (!r) { out.push(f); return }
    const { xy, cum } = G(fi)
    const L = cum.at(-1)
    const lo = f.properties.laneOff || 0
    const W = opts.geoW
    // geo ramp: outward-frame lane offset that keeps the line at
    // smoothmax(lane position, its true lateral distance from the joint)
    const geoVal = (g, s, Lr, p) => {
      const rn = [g.t[1], -g.t[0]] // right of the outward direction
      const d = (p[0] - g.J[0]) * rn[0] + (p[1] - g.J[1]) * rn[1]
      const sg = Math.sign(g.mOut), a = Math.abs(g.mOut) * W, b = Math.max(0, d * sg), k = W / 2
      const smax = (a + b + Math.sqrt((a - b) ** 2 + k * k)) / 2 - (Math.sqrt(a * a + k * k) - a) / 2
      const fade = s < 0.7 * Lr ? 1 : 1 - ease((s - 0.7 * Lr) / (0.3 * Lr))
      const v = ((sg * smax - d) / W) * fade
      return g.atStart ? v : -v
    }
    // geo ramps are precomputed outward from the joint every 10 m and made
    // one-way: once the line has left its lane it never drifts back (a
    // curving track would otherwise pull the offset in and out again).
    const pointAt = (s) => {
      let k = 1
      while (k < cum.length - 1 && cum[k] < s) k++
      const t = (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1)
      return [xy[k - 1][0] + (xy[k][0] - xy[k - 1][0]) * t, xy[k - 1][1] + (xy[k][1] - xy[k - 1][1]) * t]
    }
    const profiles = {}
    for (const side of ['start', 'end']) {
      const rr = r[side]
      if (!rr || !rr.geo) continue
      const prof = []
      let lim = Infinity
      for (let u = 0; u <= rr.L + 1e-6; u += 10) {
        const v = geoVal(rr.geo, u, rr.L, pointAt(side === 'start' ? u : L - u))
        const sg = Math.sign(rr.m) || 1
        lim = Math.min(lim, Math.max(0, v * sg))
        prof.push(sg * lim)
      }
      profiles[side] = prof
    }
    const look = (prof, u) => { const k = Math.min(prof.length - 1, Math.max(0, u / 10)); const a = Math.floor(k), b = Math.min(prof.length - 1, a + 1); return prof[a] + (prof[b] - prof[a]) * (k - a) }
    const val = (s) => {
      if (r.start && s < r.start.L) return profiles.start ? look(profiles.start, s) : r.start.m + (lo - r.start.m) * ease(s / r.start.L)
      if (r.end && L - s < r.end.L) return profiles.end ? look(profiles.end, L - s) : r.end.m + (lo - r.end.m) * ease((L - s) / r.end.L)
      return lo
    }
    // densify inside the ramps, keep original vertices elsewhere
    const pts = [], arc = []
    for (let i = 0; i < xy.length; i++) {
      if (i) {
        const a = xy[i - 1], b = xy[i], s0 = cum[i - 1], seg = cum[i] - s0
        const inRamp = (s) => (r.start && s < r.start.L) || (r.end && L - s < r.end.L)
        const k = Math.ceil(seg / TAPER_STEP)
        if (k > 1 && (inRamp(s0) || inRamp(cum[i]) || inRamp(s0 + seg / 2)))
          for (let q = 1; q < k; q++) { const t = q / k; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); arc.push(s0 + seg * t) }
      }
      pts.push(xy[i]); arc.push(cum[i])
    }
    const q = (v) => Math.round(v * 20) / 20
    let s = 0
    for (let i = 1; i < pts.length; i++) {
      const vi = q(val((arc[i - 1] + arc[i]) / 2))
      const last = i === pts.length - 1
      const vn = last ? null : q(val((arc[i] + arc[i + 1]) / 2))
      if (last || vn !== vi) {
        out.push({ ...f, properties: { ...f.properties, laneOff: vi }, geometry: { type: 'LineString', coordinates: pts.slice(s, i + 1).map(toLL) } })
        s = i
      }
    }
  })
  return { fc: { ...fc, features: out }, joints }
}

// ---------------------------------------------------------------- bake
// For map-scale sizing only (a line is W metres wide at every zoom): per line,
// chain the (tapered) pieces end to end, give every vertex its laneOff, smooth
// that along the chain, and move the vertex laneOff * W metres to the right of
// the chain's smoothed direction (MapLibre's +offset side). One continuous
// curve per chain; output laneOff 0.
function bake(fc, W) {
  const out = [], byLine = new Map()
  for (const f of fc.features) {
    if (PASSTHROUGH.has(f.properties.line) || f.geometry.type !== 'LineString') { out.push(f); continue }
    if (!byLine.has(f.properties.line)) byLine.set(f.properties.line, [])
    byLine.get(f.properties.line).push(f)
  }
  const key = (p) => Math.round(p[0]) + ',' + Math.round(p[1])
  for (const [line, fs_] of byLine) {
    const P = fs_.map((f) => ({ xy: f.geometry.coordinates.map(toXY), lo: f.properties.laneOff || 0, props: f.properties }))
    const ends = new Map()
    P.forEach((p, i) => { for (const [k, atStart] of [[key(p.xy[0]), true], [key(p.xy.at(-1)), false]]) { if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ i, atStart }) } })
    const used = new Uint8Array(P.length)
    const take = (i, reverse) => { used[i] = 1; const p = P[i]; return reverse ? { xy: [...p.xy].reverse(), lo: -p.lo } : { xy: p.xy, lo: p.lo } }
    const extend = (chain, endPt) => {
      for (;;) {
        const at = ends.get(key(endPt)) || []
        if (at.length !== 2) return
        const nx = at.find((e) => !used[e.i])
        if (!nx) return
        const piece = take(nx.i, !nx.atStart)
        chain.push(piece); endPt = piece.xy.at(-1)
      }
    }
    // start chains at non-degree-2 ends first, then whatever is left (loops)
    const order = P.map((p, i) => i).sort((a, b) => ((ends.get(key(P[a].xy[0])) || []).length === 2) - ((ends.get(key(P[b].xy[0])) || []).length === 2))
    for (const i of order) {
      if (used[i]) continue
      const chain = [take(i, false)]
      extend(chain, chain[0].xy.at(-1))
      // grow backwards too
      const back = []
      const rev = (c) => ({ xy: [...c.xy].reverse(), lo: -c.lo })
      const tmp = [rev(chain[0])]
      extend(tmp, tmp[0].xy.at(-1))
      for (let k = tmp.length - 1; k >= 1; k--) back.push(rev(tmp[k]))
      const all = [...back, ...chain]
      // concatenate, per-vertex offset
      const xy = [], off = []
      for (const c of all) c.xy.forEach((q, k) => { if (xy.length && k === 0) return; xy.push(q); off.push(c.lo) })
      if (xy.length < 2) continue
      const R = resample(xy, 10)
      // carry offsets onto the resampled points by arc length
      const cum = [0]; for (let k = 1; k < xy.length; k++) cum.push(cum[k - 1] + dist(xy[k - 1], xy[k]))
      const rc = [0]; for (let k = 1; k < R.length; k++) rc.push(rc[k - 1] + dist(R[k - 1], R[k]))
      let j = 0
      const ro = rc.map((s) => { while (j < cum.length - 2 && cum[j + 1] < s) j++; return off[Math.min(off.length - 1, j + 1)] })
      const sm = ro.map((_, k) => { let a = 0, c = 0; for (let q = Math.max(0, k - 3); q <= Math.min(ro.length - 1, k + 3); q++) { a += ro[q]; c++ } return a / c })
      const tan = tangentsOf(R, 2)
      const baked = R.map((q, k) => [q[0] + sm[k] * W * tan[k][1], q[1] - sm[k] * W * tan[k][0]])
      out.push({ type: 'Feature', properties: { ...fs_[i].properties, laneOff: 0 }, geometry: { type: 'LineString', coordinates: L1.simplify(baked, 1.5).map(toLL) } })
    }
  }
  return { ...fc, features: out }
}

// ---------------------------------------------------------------- main
function main() {
  const t0 = Date.now()
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null
  const services = L1.loadServices()
  const stationsFC = JSON.parse(fs.readFileSync(path.join(LDATA, 'features.json'), 'utf8'))
  const coordOf = new Map()
  for (const f of stationsFC.features) { const k = `${f.properties.name}|${f.properties.line}`; if (!coordOf.has(k)) coordOf.set(k, f.geometry.coordinates) }
  const raw = JSON.parse(fs.readFileSync(path.join(LDATA, 'routes.osm.json'), 'utf8'))
  const ownPolys = new Map(), colorOf = {}
  for (const f of raw.features) {
    if (f.geometry.type !== 'LineString') continue
    const l = f.properties.line
    if (!ownPolys.has(l)) ownPolys.set(l, [])
    ownPolys.get(l).push(f.geometry.coordinates.map(toXY))
    colorOf[l] = f.properties.color
  }
  const orderOf = require('../line-order.js')
  const ownGrid = new Map([...ownPolys].map(([l, p]) => [l, L1.segGrid(p)]))
  const london = JSON.parse(fs.readFileSync(path.join(LDATA, 'routes.json'), 'utf8'))
  const passthrough = london.features.filter((f) => PASSTHROUGH.has(f.properties.line))
  const noSnap = loadNoSnap()

  const stationXY = new Map()
  for (const [k, c] of coordOf) { const l = k.slice(k.lastIndexOf('|') + 1); if (!stationXY.has(l)) stationXY.set(l, []); stationXY.get(l).push(toXY(c)) }
  const G = L1.loadGraph()
  const info = nodeInfo(G)
  const surface = new Set(services.map((s) => s.line).filter((l) => !TUBE.has(l) && !PASSTHROUGH.has(l)))
  const { edgesOf, failures, fallbacks, extraPolys } = L1.routeLines(G, services, coordOf, ownGrid, ownPolys, { endK: END_K, extendEnds: true, reuse: REUSE, lines: surface })
  console.log(`routed ${edgesOf.size} surface lines; ${fallbacks.length} fallback pair(s), ${failures.length} failed`)
  for (const f of fallbacks) console.log('  fallback ' + f)
  for (const f of failures) console.log('  FAILED ' + f)

  const base = []
  for (const line of [...edgesOf.keys()].sort()) {
    for (const xy of pruneChains(L1.chains(G, edgesOf.get(line), true), stationXY.get(line) || [])) {
      const st = strataOf(G, info, xy, 2, 0)
      base.push({ line, xy, sts: st })
    }
    for (const xy of extraPolys.get(line) || []) {
      const st = strataOf(G, info, xy, 25, 0)
      base.push({ line, xy, sts: st })
    }
  }
  // tube + DLR: raw OSM centrelines, clipped to scope like /london
  const { clipToScope, loadScope } = require('../clip-to-scope.js')
  const tubeFC = { ...raw, features: raw.features.filter((f) => TUBE.has(f.properties.line) && f.geometry.type === 'LineString') }
  const clippedRaw = clipToScope(tubeFC, stationsFC, loadScope()).fc
  const clipped = dropDuplicateRaw(clippedRaw)
  // tubeRaw variants: the raw centrelines (as /london gets them) with repeated
  // stretches removed at source (one OSM feature per branch / direction); no
  // smoothing or end clean-up, split only by stratum
  const rawTubeDedup = []
  for (const f of clipped.features) {
    const xy = resample(f.geometry.coordinates.map(toXY), 10)
    const prefer = f.properties.line === 'DLR' ? 4 : 2
    rawTubeDedup.push({ line: f.properties.line, xy, sts: strataOf(G, info, xy, 80, prefer, true) })
  }
  for (const f of clipped.features) {
    const xy = smoothRaw(resample(f.geometry.coordinates.map(toXY), 10))
    const prefer = f.properties.line === 'DLR' ? 4 : 2
    base.push({ line: f.properties.line, xy, sts: strataOf(G, info, xy, 80, prefer, true) })
  }
  // DEBUG_AT=lng,lat: print base pieces passing within 150 m (diagnostics)
  const dbg = (tag) => {
    if (!process.env.DEBUG_AT) return
    const P = toXY(process.env.DEBUG_AT.split(',').map(Number))
    for (const p of base) {
      const m = Math.min(...p.xy.map((q) => dist(q, P)))
      if (m < 150) console.log(tag, p.line, p.sts ? [...new Set(p.sts)].join('/') : '-', 'n', p.xy.length, 'min', m.toFixed(0), 'start', dist(p.xy[0], P).toFixed(0), 'end', dist(p.xy.at(-1), P).toFixed(0), 'tail', p.xy.slice(-4).map((q) => dist(q, P).toFixed(0)).join(','))
    }
  }
  dbg('before')
  const ce = cleanEnds(base)
  base.length = 0
  base.push(...ce.pieces)
  console.log(`line ends: ${ce.joined} loose end(s) joined, ${ce.trimmed} hook(s) trimmed`)
  dbg('after')
  const km = (st) => (base.reduce((s, p) => s + p.xy.reduce((a, q, i) => (i && p.sts && p.sts[i] === st ? a + dist(p.xy[i - 1], q) : a), 0), 0) / 1000).toFixed(0)
  console.log(`${base.length} pieces: ${km('surface')} km surface, ${['tunnel-rail', 'tunnel-subway', 'tunnel-light'].map((t) => `${km(t)} km ${t}`).join(', ')}`)

  const { score } = require('./score.js')
  const scoresPath = path.join(OUTDIR, 'scores.json')
  const cards = JSON.parse(fs.readFileSync(scoresPath, 'utf8'))
  const meta = { fallbacks, failures, variants: {} }
  // baseline for map-scale variants: /london measured at the same fixed width
  cards['london-map'] = score([11, 12, 13, 14, 15], () => london, 'map')
  for (const V of VARIANTS) {
    if (only && !only.includes(V.id)) continue
    const t1 = Date.now()
    // preSame: first merge each line's own parallel copies (twin tube tunnels,
    // fast/slow tracks) so it is drawn once, then bundle different lines
    // tubeRaw: tube/DLR pieces are the raw centrelines and skip every
    // pre-processing step below; build-ribbons snaps them with /london's radii
    const tubeSet = V.tubeRaw ? rawTubeDedup : []
    const src = V.tubeRaw ? base.filter((p) => !TUBE.has(p.line)) : base
    // same-line merge radius by stratum: twin tunnel bores of one line run
    // ~20–30 m apart (Elizabeth line west of Whitechapel), surface tracks of
    // one line 5–15 m (a larger surface radius merges separate routes of the
    // line early: Great Northern's Moorgate branch at Arsenal)
    let pre = V.preSame ? bundle2(src, V.preSame, noSnap, true, V.preSameTunnel || V.preSame) : src
    // then drop what is left of each line's parallel copies (fast/slow tracks
    // used by different services: Southern drawn twice side by side)
    if (V.dedupe) {
      const r = dedupeXY(pre, V.dedupe, V.dedupeTunnel)
      console.log(`${V.id}: ${(r.dropped / 1000).toFixed(1)} km of same-line copies dropped`)
      pre = r.items
    }
    const polys = [...(V.d ? bundle2(pre, V.d, noSnap, !!V.sameLine) : pre), ...tubeSet]
    const cfg = { ...V.ribbon, ...(V.tubeRaw ? { WIDE_LINES: [...TUBE], D_XSTRATA: 15, RAIL_TUNNEL_TUBE: true, WIDE_STATIC_ORDER: true, SOLO_LINES: [...SOLO] } : {}), NO_SNAP_DROP, STRATA_TUBE: UNDERGROUND, ORIENT_SPINES: true, EXIT_ORDER: !process.argv.includes("--no-exit"), STRATA: !process.argv.includes('--no-strata') }
    const fcIn = polys.map((p) => ({ ...p, props: { st: p.sts } }))
    let built = ribbonsWithProps(fcIn, colorOf, orderOf, passthrough, V.id, cfg)
    for (const f of built.features) { delete f.properties.stratum; delete f.properties.st }
    const th = trimFeatureHooks(built)
    built = th.fc
    const tp = process.argv.includes('--no-taper') ? { fc: built, joints: 0 } : taper(built, V.bake ? { geoW: MAP_W } : {})
    built = tp.fc
    if (V.bake) built = bake(built, MAP_W)
    if (!process.argv.includes("--dry")) fs.writeFileSync(path.join(OUTDIR, `routes.${V.id}.json`), JSON.stringify(built))
    cards[V.id] = score([11, 12, 13, 14, 15], () => built, V.bake ? 'map' : 'lane')
    meta.variants[V.id] = { d: V.d, ribbon: cfg, features: built.features.length, taperedEnds: tp.joints, endHooksTrimmed: th.trimmed }
    console.log(`${V.id}: ${built.features.length} features, ${tp.joints} tapered ends (${((Date.now() - t1) / 1000).toFixed(0)} s)`)
  }
  // /lab/staging1: graph5 below z11.4, graph4 from z11.4, at its own sizing
  const { STAGING } = require('./score.js')
  const fromDisk = (id) => JSON.parse(fs.readFileSync(path.join(OUTDIR, `routes.${id}.json`), 'utf8'))
  const g4 = fromDisk('graph4'), g5 = fromDisk('graph5')
  cards.staging1 = score([11, 12, 13, 14, 15], (z) => (z < 11.4 ? g5 : g4), STAGING)
  cards['london-staging'] = score([11, 12, 13, 14, 15], () => london, STAGING)
  const g7 = fromDisk('graph7')
  cards.staging3 = score([11, 12, 13, 14, 15], (z) => (z < 11.4 ? g5 : g7), STAGING)
  if (fs.existsSync(path.join(OUTDIR, 'routes.graph7t.json'))) {
    const g7t = fromDisk('graph7t')
    cards.staging3t = score([11, 12, 13, 14, 15], (z) => (z < 11.4 ? g5 : z < 13.5 ? g7 : g7t), STAGING)
  }
  if (process.argv.includes('--dry')) { for (const V of VARIANTS) if (cards[V.id]) console.log(V.id, JSON.stringify(Object.values(cards[V.id]).map((c) => [+c.overlapKm.toFixed(1), c.twists]))); return }
  fs.writeFileSync(scoresPath, JSON.stringify(cards, null, 2))
  fs.writeFileSync(path.join(OUTDIR, 'v2.json'), JSON.stringify(meta, null, 2))
  console.log('\nscorecard: overlap km / parallel crossings, by zoom')
  for (const [k, c] of Object.entries(cards)) console.log(k.padEnd(12) + [11, 12, 13, 14, 15].map((z) => `${c[z].overlapKm.toFixed(1)} / ${c[z].twists}`.padStart(12)).join(''))
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}

// build-lab-tracks ribbons(), but carrying each piece's `stratum` property.
function ribbonsWithProps(polys, colorOf, orderOf, passthrough, level, cfg) {
  const { execFileSync } = require('child_process')
  const dir = path.join(L1.WORK, level)
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(path.join(LDATA, 'features.json'), path.join(dir, 'features.json'))
  const fc = {
    type: 'FeatureCollection',
    features: polys.filter((p) => p.xy.length >= 2).map((p) => ({
      type: 'Feature',
      properties: { line: p.line, color: colorOf[p.line], order: orderOf[p.line], offset: 0, ...p.props },
      geometry: { type: 'LineString', coordinates: p.xy.map(toLL) },
    })),
  }
  fs.writeFileSync(path.join(dir, 'in.json'), JSON.stringify(fc))
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-ribbons.js'), '--no-clip', '--in', path.join(dir, 'in.json'), '--out', path.join(dir, 'out.json'), '--config', JSON.stringify(cfg)], { stdio: ['ignore', 'ignore', 'inherit'] })
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8'))
  out.features.push(...passthrough)
  return out
}

if (require.main === module) main()
module.exports = { taper, strataOf, bundle2 }

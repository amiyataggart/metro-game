#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * clip-to-scope.js — clip the raw route geometry of the trimmed lines (scope.ts
 * END_STATIONS) to the stretches their scoped services actually run between,
 * so no line is drawn on past its end stations (spec §3). Lines kept in full
 * (FULL_LINES) are passed through untouched.
 *
 * Run by build-ribbons.js on its input (routes.osm.json stays the pristine,
 * unclipped source, so widening the scope later needs no re-fetch). Also a
 * CLI for inspection:
 *   node scripts/clip-to-scope.js --in routes.osm.json [--features features.json] [--out clipped.json]
 *
 * Per trimmed line, over the line's own LineStrings:
 *  1. Densify to ≤ STEP m and build a graph: consecutive points, plus links
 *     between points of different LineStrings within JOIN_M (junctions,
 *     parallel tracks).
 *  2. CORE: for every pair of consecutive stops of every service of the line
 *     (plus DRAWN_TO, e.g. Eurostar St Pancras -> Ebbsfleet), the shortest path
 *     along the graph from the station to the station (entering/leaving within
 *     SNAP_R, the off-track distance counted, so it runs right up to each
 *     station). A pair with no path within CAP_F·D + CAP_ADD keeps whatever
 *     geometry lies inside the ellipse around its two stations instead.
 *  3. KEEP every point within BUF_M of the core — the parallel tracks of the
 *     same corridor (fast/slow lines) survive, a terminus keeps a ≤ BUF_M stub.
 *  4. BYPASSES: a connected run of dropped geometry that leaves and rejoins the
 *     kept network at points ≥ BYPASS_MIN_ATT apart and is no longer than
 *     BYPASS_F × that distance + BYPASS_ADD, whose two ends attach to the
 *     path of the same stop pair and which lies wholly inside that pair's
 *     ellipse, is restored (a fast line or flyover that
 *     diverges from the stopping route; not e.g. Redhill–Tonbridge, which only
 *     touches the Oxted line where the two cross). Tails beyond an end
 *     station, branches to out-of-scope places and long loops between two end
 *     stations (e.g. the Coastway between Horsham and Brighton) stay dropped.
 *  5. Each LineString is cut into its maximal kept runs (original vertices
 *     plus the cut points); one that is entirely kept is returned as is.
 */
const fs = require('fs')
const path = require('path')

const MX = 69300
const MY = 111320
const OPTS = {
  STEP: 25,
  JOIN_M: 45,
  SNAP_R: 400,
  ENTRY_F: 3, // off-track distance to a station is weighted ×3, so a path
  // starts/ends at the track point nearest the station
  CAP_F: 1.6,
  CAP_ADD: 1000,
  BUF_M: 60,
  BYPASS_MIN_ATT: 300,
  BYPASS_F: 1.5,
  BYPASS_ADD: 1500,
  BYPASS_ELLIPSE_F: 1.3, // ...and every point of it lies in the ellipse of
  BYPASS_ELLIPSE_ADD: 1000, // that stop pair (as scope.data.test.ts checks)
  ELLIPSE_F: 1.2,
  ELLIPSE_ADD: 300,
  MIN_RUN_M: 30,
}

const r7 = (v) => Math.round(v * 1e7) / 1e7

function grid(cell) {
  const g = new Map()
  const k = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`
  return {
    add(i, x, y) {
      const key = k(x, y)
      if (!g.has(key)) g.set(key, [])
      g.get(key).push(i)
    },
    near(x, y, r, cb) {
      const n = Math.ceil(r / cell)
      const cx = Math.floor(x / cell)
      const cy = Math.floor(y / cell)
      for (let gx = cx - n; gx <= cx + n; gx++)
        for (let gy = cy - n; gy <= cy + n; gy++) for (const i of g.get(`${gx},${gy}`) || []) cb(i)
    },
  }
}

// features: LineString features of ONE line. stations: [lng,lat] of its
// stations. pairs: [[A,B]] of consecutive stops (and drawn-to pairs).
// Returns { features (clipped, input order), perInput: [[...]], stats }.
function clipLine(features, stations, pairs, opts = {}) {
  const o = { ...OPTS, ...opts }
  // ---- 1. densified points + graph ----
  const X = [], Y = [], FI = [], ORIG = [] // ORIG: original vertex index or -1
  const range = []
  features.forEach((f, fi) => {
    const c = f.geometry.coordinates
    const start = X.length
    for (let k = 0; k < c.length; k++) {
      if (k > 0) {
        const ax = c[k - 1][0] * MX, ay = c[k - 1][1] * MY, bx = c[k][0] * MX, by = c[k][1] * MY
        const n = Math.floor(Math.hypot(bx - ax, by - ay) / o.STEP)
        for (let s = 1; s <= n; s++) {
          const t = s / (n + 1)
          X.push(ax + (bx - ax) * t); Y.push(ay + (by - ay) * t); FI.push(fi); ORIG.push(-1)
        }
      }
      X.push(c[k][0] * MX); Y.push(c[k][1] * MY); FI.push(fi); ORIG.push(k)
    }
    range.push([start, X.length - 1])
  })
  const N = X.length
  const d = (i, j) => Math.hypot(X[i] - X[j], Y[i] - Y[j])
  const adj = Array.from({ length: N }, () => [])
  const link = (i, j) => { const w = d(i, j); adj[i].push(j, w); adj[j].push(i, w) }
  for (const [s, e] of range) for (let i = s + 1; i <= e; i++) link(i - 1, i)
  const G = grid(o.JOIN_M)
  for (let i = 0; i < N; i++) G.add(i, X[i], Y[i])
  for (let i = 0; i < N; i++)
    G.near(X[i], Y[i], o.JOIN_M, (j) => { if (j > i && FI[j] !== FI[i] && d(i, j) <= o.JOIN_M) link(i, j) })

  const toXY = (c) => [c[0] * MX, c[1] * MY]
  const within = (p, r) => { const out = []; G.near(p[0], p[1], r, (i) => { const dd = Math.hypot(X[i] - p[0], Y[i] - p[1]); if (dd <= r) out.push([i, dd]) }); return out }

  // ---- 2. core paths ----
  const core = new Uint8Array(N)
  const dist = new Float64Array(N).fill(Infinity)
  const prev = new Int32Array(N).fill(-1)
  const touched = []
  let pathed = 0, fallback = 0
  const fallbacks = []
  const seenPair = new Set()
  const corePairs = new Map() // core point -> indices (into pairs) of the paths through it
  const markCore = (u, pi) => { core[u] = 1; if (!corePairs.has(u)) corePairs.set(u, []); corePairs.get(u).push(pi) }
  for (let pi = 0; pi < pairs.length; pi++) {
    const [A, B] = pairs[pi]
    const pk = [A.join(), B.join()].sort().join('>')
    if (seenPair.has(pk)) continue
    seenPair.add(pk)
    const a = toXY(A), b = toXY(B)
    const D = Math.hypot(a[0] - b[0], a[1] - b[1])
    const cap = o.CAP_F * D + o.CAP_ADD
    const sinkCost = new Map(within(b, o.SNAP_R).map(([i, dd]) => [i, dd * o.ENTRY_F]))
    const entry = new Map()
    // binary heap Dijkstra, multi-source with off-track entry cost
    const heap = []
    const push = (k, v) => { heap.push([k, v]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q } }
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m } } return top }
    for (const [i, dd] of within(a, o.SNAP_R)) {
      const c = dd * o.ENTRY_F
      entry.set(i, c)
      if (dist[i] === Infinity) touched.push(i)
      dist[i] = c; prev[i] = -1; push(c, i)
    }
    const maxCost = cap + 2 * o.ENTRY_F * o.SNAP_R
    let best = Infinity, bestEnd = -1
    while (heap.length) {
      const [du, u] = pop()
      if (du > dist[u]) continue
      if (du >= best || du > maxCost) break
      const sc = sinkCost.get(u)
      if (sc != null && du + sc < best) { best = du + sc; bestEnd = u }
      const nb = adj[u]
      for (let k = 0; k < nb.length; k += 2) {
        const v = nb[k], nd = du + nb[k + 1]
        if (nd < dist[v]) { if (dist[v] === Infinity) touched.push(v); dist[v] = nd; prev[v] = u; push(nd, v) }
      }
    }
    let along = Infinity
    if (bestEnd >= 0) {
      let s0 = bestEnd
      while (prev[s0] >= 0) s0 = prev[s0]
      along = dist[bestEnd] - entry.get(s0)
    }
    if (along <= cap) {
      pathed++
      for (let u = bestEnd; u >= 0; u = prev[u]) markCore(u, pi)
    } else {
      fallback++
      fallbacks.push([A, B])
      for (let i = 0; i < N; i++) {
        const s = Math.hypot(X[i] - a[0], Y[i] - a[1]) + Math.hypot(X[i] - b[0], Y[i] - b[1])
        if (s <= o.ELLIPSE_F * D + o.ELLIPSE_ADD) markCore(i, pi)
      }
    }
    for (const i of touched) { dist[i] = Infinity; prev[i] = -1 }
    touched.length = 0
  }
  // the track point nearest each station is always core
  for (const s of stations) {
    let bi = -1, bd = Infinity
    for (const [i, dd] of within(toXY(s), o.SNAP_R)) if (dd < bd) { bd = dd; bi = i }
    if (bi >= 0) core[bi] = 1
  }

  // ---- 3. keep = within BUF_M of the core ----
  const CG = grid(o.BUF_M)
  for (let i = 0; i < N; i++) if (core[i]) CG.add(i, X[i], Y[i])
  const keep = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    if (core[i]) { keep[i] = 1; continue }
    CG.near(X[i], Y[i], o.BUF_M, (j) => { if (!keep[i] && d(i, j) <= o.BUF_M) keep[i] = 1 })
  }

  // ---- 4. restore bypasses ----
  const ellipses = pairs.map(([A, B]) => {
    const a = toXY(A), b = toXY(B)
    return [a[0], a[1], b[0], b[1], o.BYPASS_ELLIPSE_F * Math.hypot(a[0] - b[0], a[1] - b[1]) + o.BYPASS_ELLIPSE_ADD]
  })
  const comp = new Int32Array(N).fill(-1)
  let restored = 0, restoredM = 0
  for (let s = 0; s < N; s++) {
    if (keep[s] || comp[s] >= 0) continue
    const members = [s]
    comp[s] = s
    const attach = []
    let len = 0
    for (let q = 0; q < members.length; q++) {
      const u = members[q]
      const nb = adj[u]
      for (let k = 0; k < nb.length; k += 2) {
        const v = nb[k]
        if (keep[v]) { attach.push(v); continue }
        if (v > u) len += nb[k + 1]
        if (comp[v] < 0) { comp[v] = s; members.push(v) }
      }
    }
    if (attach.length < 2) continue
    const far = (from) => { let bi = from, bd = -1; for (const v of attach) { const dd = d(from, v); if (dd > bd) { bd = dd; bi = v } } return [bi, bd] }
    const [a1] = far(attach[0])
    const [a2, dAtt] = far(a1)
    if (dAtt < o.BYPASS_MIN_ATT || len > o.BYPASS_F * dAtt + o.BYPASS_ADD) continue
    // an alternative route for one stop pair: both ends attach to that pair's
    // path, and the whole run lies inside that pair's ellipse
    const pairsNear = (v) => { const set = new Set(); CG.near(X[v], Y[v], o.BUF_M, (j) => { if (d(v, j) <= o.BUF_M) for (const pi of corePairs.get(j) || []) set.add(pi) }); return set }
    const p1 = pairsNear(a1), p2 = pairsNear(a2)
    const shared = Array.from(p1).filter((pi) => p2.has(pi))
    const inEllipse = (pi) => { const [ax, ay, bx, by, lim] = ellipses[pi]; return members.every((u) => Math.hypot(X[u] - ax, Y[u] - ay) + Math.hypot(X[u] - bx, Y[u] - by) <= lim) }
    if (shared.some(inEllipse)) {
      for (const u of members) keep[u] = 1
      restored++
      restoredM += len
    }
  }

  // ---- 5. cut into kept runs ----
  const perInput = features.map((f, fi) => {
    const [s, e] = range[fi]
    let all = true
    for (let i = s; i <= e; i++) if (!keep[i]) { all = false; break }
    if (all) return [f]
    const out = []
    let i = s
    while (i <= e) {
      if (!keep[i]) { i++; continue }
      let j = i
      while (j + 1 <= e && keep[j + 1]) j++
      let runLen = 0
      for (let k = i + 1; k <= j; k++) runLen += d(k - 1, k)
      if (j > i && runLen >= o.MIN_RUN_M) {
        const coords = []
        for (let k = i; k <= j; k++) {
          if (ORIG[k] >= 0) coords.push(f.geometry.coordinates[ORIG[k]])
          else if (k === i || k === j) coords.push([r7(X[k] / MX), r7(Y[k] / MY)])
        }
        out.push({ ...f, geometry: { type: 'LineString', coordinates: coords } })
      }
      i = j + 1
    }
    return out
  })
  const lenOf = (fs) => fs.reduce((sum, f) => { const c = f.geometry.coordinates; for (let k = 1; k < c.length; k++) sum += Math.hypot((c[k][0] - c[k - 1][0]) * MX, (c[k][1] - c[k - 1][1]) * MY); return sum }, 0)
  const clipped = perInput.flat()
  return {
    features: clipped,
    perInput,
    stats: { pairs: seenPair.size, pathed, fallback, fallbacks, restored, restoredM: Math.round(restoredM), inKm: lenOf(features) / 1000, outKm: lenOf(clipped) / 1000 },
  }
}

// fc: raw routes FeatureCollection; stationsFC: features.json.
// scope: { SERVICES, END_STATIONS, DRAWN_TO }.
function clipToScope(fc, stationsFC, scope, opts) {
  const { SERVICES, END_STATIONS, DRAWN_TO = {} } = scope
  const coordOf = new Map()
  for (const f of stationsFC.features) {
    const k = `${f.properties.name}|${f.properties.line}`
    if (!coordOf.has(k)) coordOf.set(k, f.geometry.coordinates)
    if (!coordOf.has(f.properties.name)) coordOf.set(f.properties.name, f.geometry.coordinates)
  }
  const replacement = new Map() // input feature -> output features
  const stats = {}
  for (const line of Object.keys(END_STATIONS)) {
    const feats = fc.features.filter((f) => f.properties.line === line && f.geometry && f.geometry.type === 'LineString')
    if (!feats.length) continue
    const own = stationsFC.features.filter((f) => f.properties.line === line).map((f) => f.geometry.coordinates)
    const pairs = []
    for (const s of SERVICES.filter((x) => x.line === line))
      for (let i = 1; i < s.stops.length; i++) {
        const A = coordOf.get(`${s.stops[i - 1]}|${line}`), B = coordOf.get(`${s.stops[i]}|${line}`)
        if (!A || !B) throw new Error(`clip-to-scope: no station coordinates for ${s.stops[i - 1]} / ${s.stops[i]} (${line})`)
        pairs.push([A, B])
      }
    const extra = []
    for (const name of DRAWN_TO[line] || []) {
      const c = coordOf.get(name)
      if (!c) throw new Error(`clip-to-scope: DRAWN_TO station ${name} (${line}) not in features.json`)
      extra.push(c)
      for (const a of own) pairs.push([a, c])
    }
    const r = clipLine(feats, [...own, ...extra], pairs, opts)
    feats.forEach((f, i) => replacement.set(f, r.perInput[i]))
    stats[line] = r.stats
  }
  const features = fc.features.flatMap((f) => (replacement.has(f) ? replacement.get(f) : [f]))
  return { fc: { ...fc, features }, stats }
}

function loadScope() {
  require('./load-ts.js').registerTs()
  const LONDON = path.join(__dirname, '..', 'src', 'app', '(game)', 'london')
  const { SERVICES } = require(path.join(LONDON, 'services', 'index.ts'))
  const { END_STATIONS, DRAWN_TO } = require(path.join(LONDON, 'scope.ts'))
  return { SERVICES, END_STATIONS, DRAWN_TO }
}

function logStats(stats) {
  for (const [line, s] of Object.entries(stats)) {
    console.log(
      `  clip ${line.padEnd(22)} ${s.inKm.toFixed(0).padStart(6)} -> ${s.outKm.toFixed(0).padStart(4)} km; ` +
        `${s.pairs} stop pairs (${s.pathed} pathed, ${s.fallback} ellipse fallback); ${s.restored} bypass(es) restored (${s.restoredM} m)`,
    )
    for (const [A, B] of s.fallbacks) console.log(`      no path along ${line} geometry: ${A} -> ${B}`)
  }
}

function main() {
  const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null }
  const IN = arg('--in'), OUT = arg('--out')
  if (!IN) { console.error('usage: clip-to-scope.js --in routes.osm.json [--features features.json] [--out clipped.json]'); process.exit(2) }
  const FEATS = arg('--features') || path.join(path.dirname(IN), 'features.json')
  const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
  const { fc, stats } = clipToScope(read(IN), read(FEATS), loadScope())
  logStats(stats)
  if (OUT) { fs.writeFileSync(OUT, JSON.stringify(fc)); console.log(`wrote ${OUT}: ${fc.features.length} features`) }
}

if (require.main === module) main()
else module.exports = { clipLine, clipToScope, loadScope, logStats, OPTS }

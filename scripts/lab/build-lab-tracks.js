#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * LAB — build the line geometry for the /lab/* track-geometry experiments.
 * Not part of the /london pipeline (which stays routes.osm.json -> build-ribbons).
 *
 * 1. ROUTE every service stop-to-stop over the PHYSICAL OSM track graph
 *    (scripts/lab/data/tracks.json.gz: rail + subway + light_rail). A* with a
 *    cost that penalises track far from the line's own raw OSM geometry
 *    (routes.osm.json), so each line follows its real tracks (no Met-corridor
 *    style detours) and is drawn ONCE (per-line union of routed track edges).
 * 2. BUNDLE at several radii d (one per zoom level). Mean-shift on the routed
 *    lines' sample points: each point moves PERPENDICULAR to its track towards
 *    the weighted mean of nearby, near-parallel points (biweight kernel of
 *    radius d), iterated. Tracks closer than ~d converge to one shared
 *    centreline; farther ones stay put; the smooth kernel means lines ease in
 *    and out of a corridor without kinks. d small = true track positions.
 * 3. RIBBONS: each level goes through scripts/build-ribbons.js (--no-clip, tight
 *    snap radius because the bundled input already coincides) for shared
 *    centrelines, lane order (config order + ORDER_OVERRIDES) and laneOff.
 * 4. MORPH data: the finest level's features carry, per piece, the
 *    perpendicular distance `dm` (m) to the same line on a coarse level and the
 *    coarse lane `lc`, so the browser can blend true <-> bundled by zoom with
 *    line-offset alone.
 * 5. SCORE every page variant (overlap / parallel-crossing scorecard).
 *
 *   node scripts/lab/build-lab-tracks.js
 *
 * Track data © OpenStreetMap contributors, ODbL.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..', '..')
const LDATA = path.join(ROOT, 'src', 'app', '(game)', 'london', 'data')
const OUTDIR = path.join(ROOT, 'src', 'app', '(game)', 'lab', 'data')
const TRACKS = path.join(__dirname, 'data', 'tracks.json.gz')
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-tracks-'))

// Bundling radius per level (m) and the zoom range each level is shown at in
// /lab/levels. MapLibre zoom (512-px tiles): a line is ~96 m wide on the
// ground at z11, ~54 m at z12, ~30 m at z13, ~17 m at z14, ~9.5 m at z15.
const LEVELS = [
  { id: 'l0', d: 12, minzoom: 14.5, maxzoom: 24 },
  { id: 'l1', d: 35, minzoom: 13, maxzoom: 14.5 },
  { id: 'l2', d: 90, minzoom: 11.75, maxzoom: 13 },
  { id: 'l3', d: 220, minzoom: 0, maxzoom: 11.75 },
]
const GRAPH_LEVEL = 'l1' // /lab/graph: one level at every zoom
// /lab/morph: true tracks (fine) at z >= zFine, bundled (coarse) at z <= zCoarse,
// blended in between by line-offset alone.
const MORPH = { fine: 'l0', coarse: 'l2', dmQuant: 3, zCoarse: 12, zFine: 14.5 }
const PASSTHROUGH = new Set(['Tramlink', 'CableCar']) // not on rail/subway track

const MG = 69300, ML = 111320
const toXY = (c) => [c[0] * MG, c[1] * ML]
const toLL = (p) => [Math.round((p[0] / MG) * 1e6) / 1e6, Math.round((p[1] / ML) * 1e6) / 1e6]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// ---------------------------------------------------------------- services
function loadServices() {
  const ts = require('typescript')
  require.extensions['.ts'] = (module, filename) => {
    const src = fs.readFileSync(filename, 'utf8')
    module._compile(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true }, fileName: filename }).outputText, filename)
  }
  return require(path.join(ROOT, 'src', 'app', '(game)', 'london', 'services', 'index.ts')).SERVICES
}

// ---------------------------------------------------------------- track graph
// --from-cache: read the raw Overpass tiles in scripts/lab/.cache instead of
// the compact tracks.json.gz (debugging while a fetch is still running).
function readTracks() {
  if (!process.argv.includes('--from-cache')) return JSON.parse(zlib.gunzipSync(fs.readFileSync(TRACKS)))
  const dir = path.join(__dirname, '.cache')
  const nodes = new Map(), ways = new Map()
  let osmBase = ''
  for (const fn of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, fn), 'utf8'))
    osmBase = j.osm3s.timestamp_osm_base > osmBase ? j.osm3s.timestamp_osm_base : osmBase
    for (const e of j.elements) {
      if (e.type === 'node') nodes.set(e.id, [e.lon, e.lat])
      else if (e.type === 'way' && e.nodes) ways.set(e.id, [e.id, e.tags.railway, 0, e.tags.service || '', e.nodes])
    }
  }
  return { osmBase, nodes: [...nodes].map(([id, c]) => [id, ...c]), ways: [...ways.values()] }
}
function loadGraph() {
  const T = readTracks()
  const idx = new Map()
  const X = new Float64Array(T.nodes.length), Y = new Float64Array(T.nodes.length)
  T.nodes.forEach(([id, lon, lat], i) => { idx.set(id, i); X[i] = lon * MG; Y[i] = lat * ML })
  const adj = Array.from({ length: T.nodes.length }, () => [])
  const TYPE_BIT = { rail: 1, subway: 2, light_rail: 4 }
  const type = new Uint8Array(T.nodes.length)
  for (const [, t, , , ns] of T.ways) for (const id of ns) { const i = idx.get(id); if (i != null) type[i] |= TYPE_BIT[t] || 1 }
  const link = (a, b) => {
    if (a === b || adj[a].includes(b)) return
    adj[a].push(b); adj[b].push(a)
  }
  for (const [, , , , ns] of T.ways)
    for (let k = 1; k < ns.length; k++) {
      const a = idx.get(ns[k - 1]), b = idx.get(ns[k])
      if (a != null && b != null) link(a, b)
    }
  // grid (50 m) for nearest queries
  const CELL = 50
  const grid = new Map()
  for (let i = 0; i < X.length; i++) {
    if (!adj[i].length) continue
    const k = Math.floor(X[i] / CELL) + ',' + Math.floor(Y[i] / CELL)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(i)
  }
  function near(p, R) {
    const out = []
    const r = Math.ceil(R / CELL)
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
    for (let gx = cx - r; gx <= cx + r; gx++) for (let gy = cy - r; gy <= cy + r; gy++)
      for (const j of grid.get(gx + ',' + gy) || []) if (Math.hypot(X[j] - p[0], Y[j] - p[1]) <= R) out.push(j)
    return out
  }
  // Stitch dangling way ends to the nearest track node of the same kind
  // (rail / subway / light rail) within STITCH_M — OSM tube tunnels are often
  // split at platforms without sharing a node, which would otherwise push the
  // router onto other networks.
  const STITCH_M = 25
  let stitched = 0
  for (let i = 0; i < X.length; i++) {
    if (adj[i].length !== 1) continue
    let best = -1, bd = STITCH_M
    const nb = new Set([i, ...adj[i], ...adj[i].flatMap((j) => adj[j])])
    for (const j of near([X[i], Y[i]], STITCH_M)) {
      if (nb.has(j) || !(type[j] & type[i])) continue
      const d = Math.hypot(X[j] - X[i], Y[j] - Y[i])
      if (d < bd) { bd = d; best = j }
    }
    if (best >= 0) { link(i, best); stitched++ }
  }
  console.log(`track graph: ${T.nodes.length} nodes, ${T.ways.length} ways, ${stitched} stitched ends ≤${STITCH_M} m (OSM base ${T.osmBase})`)
  return { X, Y, adj, near }
}

// ---------------------------------------------------------------- guidance
// Distance (m) from a point to a line's own raw OSM geometry (capped at 400).
function segGrid(polys, cell = 100) {
  const g = new Map()
  for (const xy of polys)
    for (let i = 1; i < xy.length; i++) {
      const a = xy[i - 1], b = xy[i]
      const x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell)
      const y0 = Math.floor(Math.min(a[1], b[1]) / cell), y1 = Math.floor(Math.max(a[1], b[1]) / cell)
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = x + ',' + y
        if (!g.has(k)) g.set(k, [])
        g.get(k).push([a, b])
      }
    }
  return (p, maxR = 4) => {
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell)
    let best = 400
    for (let x = cx - maxR; x <= cx + maxR; x++) for (let y = cy - maxR; y <= cy + maxR; y++)
      for (const [a, b] of g.get(x + ',' + y) || []) {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy
        let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0
        t = Math.max(0, Math.min(1, t))
        best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]))
      }
    return best
  }
}
// Edge-cost multiplier from distance to own geometry: free within 25 m, then
// quadratic, capped — wrong-track shortcuts cost up to 60x their length.
const factor = (d) => (d <= 25 ? 1 : Math.min(60, 1 + ((d - 25) / 25) ** 2))

// ---------------------------------------------------------------- routing
// Multi-source / multi-target A*: `srcs` = [[node, startCost]], `dsts` =
// Map(node -> endCost). Picks the cheapest (start + track + end) combination, so
// a station near several tracks (a tube tunnel under a main line) resolves to
// whichever track actually carries the line between the two stops.
function makeRouter(G) {
  const { X, Y, adj } = G
  const n = X.length
  const gScore = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const touched = []
  return function route(srcs, dsts, nodeFactor, goal) {
    for (const i of touched) { gScore[i] = Infinity; prev[i] = -1 }
    touched.length = 0
    let slack = Infinity
    for (const c of dsts.values()) slack = Math.min(slack, c)
    // admissible: straight distance to the goal point minus the target radius
    const h = (i) => Math.max(0, Math.hypot(X[i] - goal[0], Y[i] - goal[1]) - 300) + slack
    const heap = []
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break;[heap[p], heap[k]] = [heap[k], heap[p]]; k = p } }
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break;[heap[m], heap[k]] = [heap[k], heap[m]]; k = m } } return top }
    for (const [i, c] of srcs) if (c < gScore[i]) { if (gScore[i] === Infinity) touched.push(i); gScore[i] = c; push(c + h(i), i) }
    let best = Infinity, bestNode = -1, expanded = 0
    while (heap.length) {
      const [f, u] = pop()
      if (f >= best) break
      if (f - h(u) > gScore[u] + 1e-6) continue
      if (dsts.has(u)) { const tot = gScore[u] + dsts.get(u); if (tot < best) { best = tot; bestNode = u } }
      if (++expanded > 400000) break
      const fu = nodeFactor(u)
      for (const v of adj[u]) {
        const g = gScore[u] + Math.hypot(X[v] - X[u], Y[v] - Y[u]) * (fu + nodeFactor(v)) / 2
        if (g < gScore[v]) {
          if (gScore[v] === Infinity) touched.push(v)
          gScore[v] = g; prev[v] = u; push(g + h(v), v)
        }
      }
    }
    if (bestNode < 0) return null
    const ids = [bestNode]
    let c = bestNode
    while (prev[c] >= 0) { c = prev[c]; ids.push(c) }
    return ids.reverse()
  }
}

// Shortest track path (plain length) from node `u` to the track node nearest
// station point `p` (within 80 m), if `u` is > 40 m from `p` and the path is
// <= 800 m. Returns node ids or null.
function makeExtender(G) {
  const { X, Y, adj } = G
  return (u, p) => {
    if (Math.hypot(X[u] - p[0], Y[u] - p[1]) <= 40) return null
    const tgt = G.near(p, 80)
    if (!tgt.length) return null
    const goal = tgt.reduce((b, j) => (Math.hypot(X[j] - p[0], Y[j] - p[1]) < Math.hypot(X[b] - p[0], Y[b] - p[1]) ? j : b))
    const D = new Map([[u, 0]]), prev = new Map(), heap = [[0, u]]
    while (heap.length) {
      heap.sort((x, y) => y[0] - x[0])
      const [d, v] = heap.pop()
      if (v === goal) break
      if (d > (D.get(v) ?? Infinity) || d > 800) continue
      for (const w of adj[v]) {
        const nd = d + Math.hypot(X[w] - X[v], Y[w] - Y[v])
        if (nd < (D.get(w) ?? Infinity)) { D.set(w, nd); prev.set(w, v); heap.push([nd, w]) }
      }
    }
    if (!prev.has(goal)) return null
    const ids = [goal]
    let c = goal
    while (c !== u) { c = prev.get(c); ids.push(c) }
    return ids.reverse()
  }
}

// Fallback: shortest path along the line's OWN raw polylines (vertices every
// <=50 m, polylines joined where within 30 m) between the vertices nearest two
// stations. Returns metric coords or null.
function ownPathFinder(polys) {
  const pts = [], adj = []
  const add = (p) => { pts.push(p); adj.push([]); return pts.length - 1 }
  const link = (i, j) => { const w = dist(pts[i], pts[j]); adj[i].push([j, w]); adj[j].push([i, w]) }
  const owner = []
  polys.forEach((xy, pi) => {
    let prev = -1
    for (let k = 0; k < xy.length; k++) {
      if (k) {
        const a = xy[k - 1], b = xy[k], n = Math.floor(dist(a, b) / 50)
        for (let q = 1; q <= n; q++) { const t = q / (n + 1); const i = add([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); owner.push(pi); link(prev, i); prev = i }
      }
      const i = add(xy[k]); owner.push(pi)
      if (prev >= 0) link(prev, i)
      prev = i
    }
  })
  const CELL = 60, grid = new Map()
  pts.forEach((p, i) => { const k = Math.floor(p[0] / CELL) + ',' + Math.floor(p[1] / CELL); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i) })
  pts.forEach((p, i) => {
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++)
      for (const j of grid.get(gx + ',' + gy) || []) if (j > i && owner[j] !== owner[i] && dist(p, pts[j]) <= 30) link(i, j)
  })
  const nearest = (p) => {
    let best = -1, bd = 400
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
    for (let gx = cx - 7; gx <= cx + 7; gx++) for (let gy = cy - 7; gy <= cy + 7; gy++)
      for (const j of grid.get(gx + ',' + gy) || []) { const d = dist(p, pts[j]); if (d < bd) { bd = d; best = j } }
    return best
  }
  return (a, b) => {
    const s = nearest(a), t = nearest(b)
    if (s < 0 || t < 0) return null
    const D = new Map([[s, 0]]), prev = new Map(), heap = [[0, s]]
    while (heap.length) {
      heap.sort((x, y) => y[0] - x[0])
      const [d, u] = heap.pop()
      if (u === t) break
      if (d > (D.get(u) ?? Infinity)) continue
      for (const [v, w] of adj[u]) if (d + w < (D.get(v) ?? Infinity)) { D.set(v, d + w); prev.set(v, u); heap.push([d + w, v]) }
    }
    if (s !== t && !prev.has(t)) return null
    const ids = [t]; let c = t
    while (c !== s) { c = prev.get(c); ids.push(c) }
    return ids.reverse().map((i) => pts[i])
  }
}

// opts.endK: weight on the station-distance part of the start/end cost (v1: 1).
// Higher makes a route run on to the track nearest the station instead of
// stopping early where the remaining track strays off the line's own geometry
// (Cannon Street stopped mid-bridge, 330 m short). opts.lines: only route these.
function routeLines(G, services, coordOf, ownGrid, ownPolys, opts = {}) {
  const endK = opts.endK ?? 1
  // opts.extendEnds: after routing, extend each service's FIRST/LAST stop
  // along the shortest track path (<= 800 m) to the track nearest the station,
  // where the route ends > 40 m short of it (termini whose raw geometry stops
  // before the platforms: HS1 at St Pancras). Route choice is unchanged.
  const extend = opts.extendEnds ? makeExtender(G) : null
  const { X, Y } = G
  const route = makeRouter(G)
  const edgesOf = new Map() // line -> Set("a:b")
  const snapCache = new Map()
  const pairCache = new Map()
  const failures = []
  const fallbacks = [] // stop pairs drawn from the line's own geometry instead
  const extraPolys = new Map() // line -> [metric polyline] (fallback pieces)
  const ownPathOf = new Map()
  const nodeFactorFor = new Map()
  for (const s of services) {
    const line = s.line
    if (PASSTHROUGH.has(line)) continue
    if (opts.lines && !opts.lines.has(line)) continue
    if (!edgesOf.has(line)) edgesOf.set(line, new Set())
    const own = ownGrid.get(line)
    if (!nodeFactorFor.has(line)) {
      const memo = new Map()
      nodeFactorFor.set(line, (i) => {
        let v = memo.get(i)
        if (v === undefined) { v = own ? factor(own([X[i], Y[i]])) : 1; memo.set(i, v) }
        return v
      })
    }
    const nf = nodeFactorFor.get(line)
    // Track nodes near a station, each with the cost of starting/ending there:
    // distance to the station + 2x distance to the line's own geometry.
    const cands = (name) => {
      const key = name + '|' + line
      if (snapCache.has(key)) return snapCache.get(key)
      const c = coordOf.get(key)
      let out = []
      if (c) {
        const p = toXY(c)
        for (const R of [300, 700]) {
          out = G.near(p, R).map((j) => [j, endK * Math.hypot(X[j] - p[0], Y[j] - p[1]) + 2 * (own ? own([X[j], Y[j]]) : 0)])
          if (out.length) break
        }
      }
      snapCache.set(key, out)
      return out
    }
    let at = null // node where the previous stop pair of this service ended
    for (let k = 1; k < s.stops.length; k++) {
      const a = s.stops[k - 1], b = s.stops[k]
      const pk = `${line}|${a}|${b}|${at}`
      if (pairCache.has(pk)) { at = pairCache.get(pk) ? pairCache.get(pk).at(-1) : null; continue }
      const srcs = at != null ? [[at, 0]] : cands(a)
      const dsts = new Map(cands(b))
      const goal = coordOf.get(b + '|' + line)
      let ids = null
      if (srcs.length && dsts.size) ids = route(srcs, dsts, nf, toXY(goal))
      const A = srcs.length ? 0 : -1, B = dsts.size ? 0 : -1
      pairCache.set(pk, ids)
      // Reject a route that strays from the line's own geometry (> 50 m away
      // for more than 250 m and 10% of its length) — e.g. a tube line forced
      // onto main-line track by a break in the tunnel data.
      let why = null
      if (!ids) why = A < 0 || B < 0 ? 'no track near station' : 'no route'
      else if (own) {
        let total = 0, bad = 0
        for (let i = 1; i < ids.length; i++) {
          const L = Math.hypot(X[ids[i]] - X[ids[i - 1]], Y[ids[i]] - Y[ids[i - 1]])
          total += L
          if (own([(X[ids[i]] + X[ids[i - 1]]) / 2, (Y[ids[i]] + Y[ids[i - 1]]) / 2]) > 50) bad += L
        }
        if (bad > 250 && bad > 0.1 * total) why = `strays ${Math.round(bad)} m off own geometry`
      }
      if (why) {
        if (!ownPathOf.has(line)) ownPathOf.set(line, ownPolys.get(line) ? ownPathFinder(ownPolys.get(line)) : () => null)
        const ca = coordOf.get(a + '|' + line), cb = coordOf.get(b + '|' + line)
        const fb = ca && cb ? ownPathOf.get(line)(toXY(ca), toXY(cb)) : null
        if (fb && fb.length >= 2) {
          if (!extraPolys.has(line)) extraPolys.set(line, [])
          extraPolys.get(line).push(fb)
          fallbacks.push(`${line}: ${a} -> ${b} (${why})`)
        } else failures.push(`${line}: ${a} -> ${b} (${why}; no own-geometry path either)`)
        pairCache.set(pk, null)
        at = null
        continue
      }
      at = ids.at(-1)
      const set = edgesOf.get(line)
      const addPath = (path) => { for (let i = 1; i < path.length; i++) set.add(path[i - 1] < path[i] ? path[i - 1] + ':' + path[i] : path[i] + ':' + path[i - 1]) }
      addPath(ids)
      if (extend) {
        if (k === 1) addPath(extend(ids[0], toXY(coordOf.get(a + '|' + line))) || [])
        if (k === s.stops.length - 1) addPath(extend(ids.at(-1), toXY(coordOf.get(b + '|' + line))) || [])
      }
    }
  }
  return { edgesOf, failures, fallbacks, extraPolys }
}

// Per line: chains of its routed edges between junction/end nodes -> polylines (metric).
// straight: at a fork, carry on into the straightest continuation instead of
// stopping, so a line's laneOff ramps smoothly through its own junctions.
function chains(G, edgeSet, straight = false) {
  const adj = new Map()
  for (const k of edgeSet) {
    const [a, b] = k.split(':').map(Number)
    if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, [])
    adj.get(a).push(b); adj.get(b).push(a)
  }
  const used = new Set()
  const ek = (a, b) => (a < b ? a + ':' + b : b + ':' + a)
  const out = []
  const walk = (start, next) => {
    const ids = [start, next]
    used.add(ek(start, next))
    let prev = start, cur = next
    for (;;) {
      let nx
      if (adj.get(cur).length === 2) nx = adj.get(cur).find((v) => v !== prev)
      else if (straight && adj.get(cur).length > 2) {
        const ix = G.X[cur] - G.X[prev], iy = G.Y[cur] - G.Y[prev], il = Math.hypot(ix, iy) || 1
        let bestCos = Math.cos((30 * Math.PI) / 180)
        for (const v of adj.get(cur)) {
          if (v === prev || used.has(ek(cur, v))) continue
          const ox = G.X[v] - G.X[cur], oy = G.Y[v] - G.Y[cur], c = (ix * ox + iy * oy) / (il * (Math.hypot(ox, oy) || 1))
          if (c > bestCos) { bestCos = c; nx = v }
        }
        if (nx == null) break
      } else break
      if (used.has(ek(cur, nx))) break
      used.add(ek(cur, nx)); ids.push(nx); prev = cur; cur = nx
    }
    out.push(ids.map((i) => [G.X[i], G.Y[i]]))
  }
  const nodesSorted = [...adj.keys()].sort((a, b) => a - b)
  for (const u of nodesSorted) if (adj.get(u).length !== 2) for (const v of adj.get(u)) if (!used.has(ek(u, v))) walk(u, v)
  for (const u of nodesSorted) for (const v of adj.get(u)) if (!used.has(ek(u, v))) walk(u, v) // pure cycles
  return out
}

// ---------------------------------------------------------------- bundling
function resample(xy, step) {
  const out = [xy[0]]
  let carry = 0
  for (let i = 1; i < xy.length; i++) {
    const seg = dist(xy[i - 1], xy[i])
    if (!seg) continue
    let t = (step - carry) / seg
    while (t <= 1) { out.push([xy[i - 1][0] + (xy[i][0] - xy[i - 1][0]) * t, xy[i - 1][1] + (xy[i][1] - xy[i - 1][1]) * t]); t += step / seg }
    carry = (carry + seg) % step
  }
  const last = xy[xy.length - 1]
  if (dist(out[out.length - 1], last) > step * 0.25) out.push(last)
  return out
}
function tangentsOf(xy, span = 2) {
  return xy.map((_, i) => {
    const a = xy[Math.max(0, i - span)], b = xy[Math.min(xy.length - 1, i + span)]
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    return [dx / L, dy / L]
  })
}
// polys: [{line, xy}] -> same shape with bundled xy. Deterministic.
function bundle(polys, d) {
  const STEP = 10
  const P = polys.map((p) => ({ ...p, xy: resample(p.xy, STEP) }))
  if (d <= STEP) return P
  const ITER = 10
  const COS = Math.cos((35 * Math.PI) / 180)
  // Biweight kernel: smooth, so lines ease in and out of a corridor. (A
  // flatter, more decisive kernel was tried: more crossings at the edges.)
  const kernel = (r) => (1 - (r / d) ** 2) ** 2
  const stride = Math.max(1, Math.round(d / 60)) // neighbour subsampling for big d
  for (let it = 0; it < ITER; it++) {
    const tans = P.map((p) => tangentsOf(p.xy))
    const grid = new Map()
    P.forEach((p, pi) => p.xy.forEach((q, i) => {
      if (i % stride) return
      const k = Math.floor(q[0] / d) + ',' + Math.floor(q[1] / d)
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k).push([pi, i])
    }))
    const next = P.map((p, pi) => {
      const disp = p.xy.map((q, i) => {
        const t = tans[pi][i], nx = -t[1], ny = t[0]
        const cx = Math.floor(q[0] / d), cy = Math.floor(q[1] / d)
        let sw = 1, so = 0 // self: weight 1 at offset 0 (damping)
        for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++)
          for (const [pj, j] of grid.get(gx + ',' + gy) || []) {
            if (pj === pi) continue
            const o = P[pj].xy[j]
            const r = Math.hypot(o[0] - q[0], o[1] - q[1])
            if (r >= d) continue
            const tj = tans[pj][j]
            if (Math.abs(t[0] * tj[0] + t[1] * tj[1]) < COS) continue
            const w = kernel(r)
            sw += w; so += w * ((o[0] - q[0]) * nx + (o[1] - q[1]) * ny)
          }
        const off = so / sw
        return [off * nx, off * ny]
      })
      // smooth the displacement along the line (~d/2 window), endpoints kept
      const half = Math.max(1, Math.round(d / (2 * STEP)))
      return p.xy.map((q, i) => {
        let sx = 0, sy = 0, c = 0
        for (let k = Math.max(0, i - half); k <= Math.min(p.xy.length - 1, i + half); k++) { sx += disp[k][0]; sy += disp[k][1]; c++ }
        return [q[0] + sx / c, q[1] + sy / c]
      })
    })
    P.forEach((p, pi) => (p.xy = next[pi]))
  }
  return P
}

// ---------------------------------------------------------------- ribbons
function ribbons(polys, colorOf, orderOf, passthrough, level, cfg) {
  const dir = path.join(WORK, level)
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(path.join(LDATA, 'features.json'), path.join(dir, 'features.json'))
  const fc = {
    type: 'FeatureCollection',
    features: polys.filter((p) => p.xy.length >= 2).map((p) => ({
      type: 'Feature',
      properties: { line: p.line, color: colorOf[p.line], order: orderOf[p.line], offset: 0 },
      geometry: { type: 'LineString', coordinates: p.xy.map(toLL) },
    })),
  }
  fs.writeFileSync(path.join(dir, 'in.json'), JSON.stringify(fc))
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-ribbons.js'), '--no-clip', '--in', path.join(dir, 'in.json'), '--out', path.join(dir, 'out.json'), '--config', JSON.stringify(cfg)], { stdio: ['ignore', 'ignore', 'inherit'] })
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8'))
  out.features.push(...passthrough)
  return out
}

// ---------------------------------------------------------------- align levels
// Separately-built levels may mirror a corridor's lane order (each build picks
// its own spine directions, and the hand order rules flip single spines). For
// each corridor (spine) of `fine`, compare its lanes' sides with the same
// lines' lanes on `coarse` (length-weighted vote) and mirror the corridor
// (negate laneOff on all its features) if most of it disagrees. Mirroring a
// whole corridor keeps its members consistent with each other.
function alignLevel(fine, coarse) {
  const match = coarseMatcher(coarse)
  const vote = new Map()
  for (const f of fine.features) {
    const sp = f.properties.spine
    const lf = f.properties.laneOff || 0
    if (sp == null || sp < 0 || !lf || PASSTHROUGH.has(f.properties.line)) continue
    const xy = resample(f.geometry.coordinates.map(toXY), 40)
    const tan = tangentsOf(xy, 1)
    for (let i = 0; i < xy.length; i++) {
      const m = match(f.properties.line, xy[i], tan[i])
      if (m && m.lc) vote.set(sp, (vote.get(sp) || 0) + Math.sign(m.lc) * Math.sign(lf))
    }
  }
  let flipped = 0
  for (const f of fine.features) {
    const v = vote.get(f.properties.spine)
    if (v != null && v < 0) { f.properties.laneOff = -(f.properties.laneOff || 0); flipped++ }
  }
  return flipped
}

// coarse matcher: (line, metric point, unit tangent) -> { dm, lc } for the
// nearest near-parallel piece of the same line on `coarse` within 400 m.
// dm: signed perpendicular distance (+ = right of the tangent, MapLibre's
// +offset side); lc: that piece's lane in the tangent's direction.
function coarseMatcher(coarse) {
  const byLine = new Map()
  for (const f of coarse.features) {
    const l = f.properties.line
    if (!byLine.has(l)) byLine.set(l, [])
    const xy = f.geometry.coordinates.map(toXY)
    for (let i = 1; i < xy.length; i++) byLine.get(l).push([xy[i - 1], xy[i], f.properties.laneOff || 0])
  }
  const CELL = 100
  const grids = new Map()
  for (const [l, segs] of byLine) {
    const g = new Map()
    segs.forEach((sg, si) => {
      const x0 = Math.floor(Math.min(sg[0][0], sg[1][0]) / CELL), x1 = Math.floor(Math.max(sg[0][0], sg[1][0]) / CELL)
      const y0 = Math.floor(Math.min(sg[0][1], sg[1][1]) / CELL), y1 = Math.floor(Math.max(sg[0][1], sg[1][1]) / CELL)
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; if (!g.has(k)) g.set(k, []); g.get(k).push(si) }
    })
    grids.set(l, g)
  }
  return (line, p, t) => {
    const segs = byLine.get(line), g = grids.get(line)
    if (!segs) return null
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
    let best = 400, bv = null
    for (let x = cx - 4; x <= cx + 4; x++) for (let y = cy - 4; y <= cy + 4; y++)
      for (const si of g.get(x + ',' + y) || []) {
        const [a, b, lo] = segs[si]
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy
        const L = Math.sqrt(L2) || 1
        if (Math.abs((dx * t[0] + dy * t[1]) / L) < 0.7) continue // near-parallel only
        let u = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0
        u = Math.max(0, Math.min(1, u))
        const qx = a[0] + u * dx, qy = a[1] + u * dy
        const d = Math.hypot(qx - p[0], qy - p[1])
        if (d < best) {
          best = d
          const same = dx * t[0] + dy * t[1] >= 0 ? 1 : -1
          bv = { dm: (qx - p[0]) * t[1] + (qy - p[1]) * -t[0], lc: lo * same }
        }
      }
    return bv
  }
}

// ---------------------------------------------------------------- morph
// For each fine feature: per piece, dm = signed perpendicular distance (m,
// + = right of the feature direction, MapLibre's +offset side) to the same
// line on the coarse level, and lc = that coarse lane in the fine feature's
// direction. Pieces split where round(dm/Q) or lc changes.
function morphData(fine, coarse) {
  const match = coarseMatcher(coarse)
  const Q = MORPH.dmQuant
  const out = []
  for (const f of fine.features) {
    const l = f.properties.line
    const lf = f.properties.laneOff || 0
    if (PASSTHROUGH.has(l)) { out.push({ ...f, properties: { ...f.properties, dm: 0, lc: lf } }); continue }
    const xy = resample(f.geometry.coordinates.map(toXY), 20)
    const tan = tangentsOf(xy, 1)
    const vals = xy.map((p, i) => match(l, p, tan[i]) || { dm: 0, lc: lf })
    // light smoothing of dm so the pieces step evenly
    const dmS = vals.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(vals.length - 1, i + 2); k++) { s += vals[k].dm; c++ } return s / c })
    const key = (i) => Math.round(dmS[i] / Q) + '|' + vals[i].lc
    let start = 0
    for (let i = 1; i <= xy.length; i++) {
      if (i === xy.length || key(i) !== key(start)) {
        const piece = xy.slice(start, Math.min(xy.length, i + 1))
        if (piece.length >= 2)
          out.push({ type: 'Feature', properties: { ...f.properties, dm: Math.round(dmS[start] / Q) * Q, lc: vals[start].lc }, geometry: { type: 'LineString', coordinates: simplify(piece, 1.5).map(toLL) } })
        start = i
      }
    }
  }
  return { ...fine, features: out }
}
function simplify(xy, eps) {
  if (xy.length < 3) return xy
  const keep = new Uint8Array(xy.length); keep[0] = keep[xy.length - 1] = 1
  const st = [[0, xy.length - 1]]
  while (st.length) {
    const [lo, hi] = st.pop(); const a = xy[lo], b = xy[hi]
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    let far = -1, fd = eps
    for (let i = lo + 1; i < hi; i++) { const d = Math.abs((xy[i][0] - a[0]) * dy - (xy[i][1] - a[1]) * dx) / L; if (d > fd) { fd = d; far = i } }
    if (far >= 0) { keep[far] = 1; st.push([lo, far], [far, hi]) }
  }
  return xy.filter((_, i) => keep[i])
}

// ---------------------------------------------------------------- main
function main() {
  const t0 = Date.now()
  const services = loadServices()
  const feats = JSON.parse(fs.readFileSync(path.join(LDATA, 'features.json'), 'utf8')).features
  const coordOf = new Map()
  for (const f of feats) { const k = `${f.properties.name}|${f.properties.line}`; if (!coordOf.has(k)) coordOf.set(k, f.geometry.coordinates) }
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
  const ownGrid = new Map([...ownPolys].map(([l, p]) => [l, segGrid(p)]))
  // Tram + cable car: keep the committed /london ribbons as they are.
  const london = JSON.parse(fs.readFileSync(path.join(LDATA, 'routes.json'), 'utf8'))
  const passthrough = london.features.filter((f) => PASSTHROUGH.has(f.properties.line))

  const G = loadGraph()
  const { edgesOf, failures, fallbacks, extraPolys } = routeLines(G, services, coordOf, ownGrid, ownPolys)
  console.log(`routed ${edgesOf.size} lines in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${fallbacks.length} stop pair(s) drawn from own geometry, ${failures.length} failed`)
  for (const f of fallbacks) console.log('  fallback ' + f)
  for (const f of failures) console.log('  FAILED ' + f)
  const base = []
  for (const line of [...edgesOf.keys()].sort()) {
    for (const xy of chains(G, edgesOf.get(line))) base.push({ line, xy })
    for (const xy of extraPolys.get(line) || []) base.push({ line, xy })
  }
  if (process.argv.includes('--route-only')) return
  const km = (ps) => (ps.reduce((s, p) => s + p.xy.reduce((a, q, i) => (i ? a + dist(p.xy[i - 1], q) : 0), 0), 0) / 1000).toFixed(0)
  console.log(`${base.length} track chains, ${km(base)} km of line`)

  fs.mkdirSync(OUTDIR, { recursive: true })
  const built = {}
  const only = process.argv.includes('--levels') ? process.argv[process.argv.indexOf('--levels') + 1].split(',') : null
  for (const L of LEVELS) {
    if (only && !only.includes(L.id)) { built[L.id] = JSON.parse(fs.readFileSync(path.join(OUTDIR, `routes.${L.id}.json`), 'utf8')); continue }
    const t1 = Date.now()
    const polys = bundle(base, L.d)
    // Bundled input already coincides: snap tightly; the hand rules that keep
    // lines OFF corridors (NO_SNAP) only make sense on true-track geometry.
    const snapR = Math.max(10, Math.min(34, L.d / 3))
    const cfg = { D: snapR, D2: snapR * 2, ORIENT_SPINES: true, EMIT_SPINE: true, ...(L.d > 20 ? { disable: ['NO_SNAP'] } : {}) }
    built[L.id] = ribbons(polys, colorOf, orderOf, passthrough, L.id, cfg)
    fs.writeFileSync(path.join(OUTDIR, `routes.${L.id}.json`), JSON.stringify(built[L.id]))
    console.log(`level ${L.id} (d=${L.d} m): ${built[L.id].features.length} features (${((Date.now() - t1) / 1000).toFixed(0)} s)`)
  }
  // /lab/graph shows one level on its own: keep it as built (alignment below
  // trades some within-level consistency for consistency between levels).
  const graph = JSON.parse(JSON.stringify(built[GRAPH_LEVEL]))
  for (const f of graph.features) delete f.properties.spine
  fs.writeFileSync(path.join(OUTDIR, 'routes.graph.json'), JSON.stringify(graph))
  // Align lane sides from the coarsest level down, so the /lab/levels fades
  // and the /lab/morph blend never swap lines.
  for (let i = LEVELS.length - 2; i >= 0; i--) {
    const fine = built[LEVELS[i].id], coarse = built[LEVELS[i + 1].id]
    console.log(`align ${LEVELS[i].id} to ${LEVELS[i + 1].id}: ${alignLevel(fine, coarse)} feature(s) mirrored`)
  }
  const morph = morphData(built[MORPH.fine], built[MORPH.coarse])
  // spine ids were only needed for alignment
  for (const fc of [...Object.values(built), morph]) for (const f of fc.features) delete f.properties.spine
  for (const L of LEVELS) fs.writeFileSync(path.join(OUTDIR, `routes.${L.id}.json`), JSON.stringify(built[L.id]))
  fs.writeFileSync(path.join(OUTDIR, 'routes.morph.json'), JSON.stringify(morph))
  console.log(`morph: ${morph.features.length} features`)
  fs.writeFileSync(path.join(OUTDIR, 'levels.json'), JSON.stringify({ levels: LEVELS, graphLevel: GRAPH_LEVEL, morph: MORPH, fallbacks, failures }, null, 2))

  // scorecards
  const { score } = require('./score.js')
  const zooms = [11, 12, 13, 14, 15]
  const pick = (z) => LEVELS.find((L) => z >= L.minzoom && z < L.maxzoom).id
  const cards = {
    london: score(zooms, () => london, 'lane'),
    graph: score(zooms, () => graph, 'lane'),
    levels: score(zooms, (z) => built[pick(z)], 'lane'),
    morph: score(zooms, () => morph, MORPH),
  }
  // merge: build-lab-v2.js adds its own variants to the same file
  const prevCards = fs.existsSync(path.join(OUTDIR, 'scores.json')) ? JSON.parse(fs.readFileSync(path.join(OUTDIR, 'scores.json'), 'utf8')) : {}
  fs.writeFileSync(path.join(OUTDIR, 'scores.json'), JSON.stringify({ ...prevCards, ...cards }, null, 2))
  console.log('\nscorecard: overlap km / parallel crossings, by zoom')
  console.log('            ' + zooms.map((z) => ('z' + z).padStart(12)).join(''))
  for (const [k, c] of Object.entries(cards)) console.log(k.padEnd(12) + zooms.map((z) => `${c[z].overlapKm.toFixed(1)} / ${c[z].twists}`.padStart(12)).join(''))
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}

if (require.main === module) main()
module.exports = { bundle, resample, tangentsOf, simplify, loadGraph, makeRouter, segGrid, factor, loadServices, routeLines, chains, ribbons, readTracks, toXY, toLL, dist, PASSTHROUGH, WORK }

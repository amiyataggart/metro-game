#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * route-over-rail-graph.js — fill gaps in a line's raw geometry by routing
 * between consecutive service stops over the physical OSM rail network.
 *
 * The graph code (centreline merge of parallel tracks, nearest-node grid,
 * binary-heap Dijkstra) is extracted from scripts/build-newtracks.js, which is
 * left untouched.
 *
 * CLI: for every Service of the given lines, each consecutive stop pair is
 * checked against the line's existing geometry in --in (a path along the
 * line's own polylines between the two stations, no longer than
 * 1.6 × straight distance + 500 m). Pairs that are not covered are routed over
 * the rail graph (railway=rail ways fetched from Overpass in 0.1° tiles around
 * the pair, cached in --cache; responses older than 24 h are rejected), and
 * the stretches of the routed path that are > COVER_M from the line's
 * geometry are emitted as new LineStrings (`src: 'graph-routed'`), padded
 * PAD_M into the covered part so they join up. A pair whose route fails or is
 * implausibly long is reported and NOT drawn (no straight-line fallback).
 *
 *   node scripts/route-over-rail-graph.js --in routes.osm.json \
 *     --features features.json --lines A,B --out gaps.json \
 *     [--cache DIR] [--report report.json] [--check-only] [--cover-m 40]
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const M = (a, b) => Math.hypot((a[0] - b[0]) * 69300, (a[1] - b[1]) * 111320)

// ---------- graph (from build-newtracks.js) ----------
// elements: Overpass JSON elements (nodes + railway=rail ways).
function buildGraph(elements, { rMerge = 13 } = {}) {
  const rawNodes = new Map() // id -> [lon,lat]
  const rawEdges = []
  const railIdSet = new Set()
  for (const e of elements) if (e.type === 'node' && !rawNodes.has(e.id)) rawNodes.set(e.id, [e.lon, e.lat])
  for (const e of elements) {
    if (e.type !== 'way' || !e.nodes || (e.tags && e.tags.railway !== 'rail')) continue
    for (let i = 1; i < e.nodes.length; i++) {
      const a = e.nodes[i - 1], b = e.nodes[i]
      if (rawNodes.has(a) && rawNodes.has(b)) { rawEdges.push([a, b]); railIdSet.add(a); railIdSet.add(b) }
    }
  }
  // Centreline merge: union-find rail nodes within rMerge so the parallel
  // tracks of a corridor collapse into one centreline.
  const X = (id) => rawNodes.get(id)[0] * 69300
  const Y = (id) => rawNodes.get(id)[1] * 111320
  const parent = new Map()
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  for (const id of railIdSet) parent.set(id, id)
  const cgrid = new Map()
  const ck = (x, y) => `${Math.floor(x / rMerge)},${Math.floor(y / rMerge)}`
  for (const id of railIdSet) { const k = ck(X(id), Y(id)); if (!cgrid.has(k)) cgrid.set(k, []); cgrid.get(k).push(id) }
  for (const id of railIdSet) {
    const x = X(id), y = Y(id), cx = Math.floor(x / rMerge), cy = Math.floor(y / rMerge)
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      const arr = cgrid.get(`${gx},${gy}`); if (!arr) continue
      for (const j of arr) if (j !== id && Math.hypot(X(j) - x, Y(j) - y) <= rMerge) parent.set(find(id), find(j))
    }
  }
  const acc = new Map()
  for (const id of railIdSet) { const r = find(id); const a = acc.get(r) || [0, 0, 0]; const c = rawNodes.get(id); a[0] += c[0]; a[1] += c[1]; a[2]++; acc.set(r, a) }
  const nodes = new Map()
  for (const [r, a] of acc) nodes.set(r, [a[0] / a[2], a[1] / a[2]])
  const adj = new Map()
  const seenEdge = new Set()
  for (const [a, b] of rawEdges) {
    const ra = find(a), rb = find(b); if (ra === rb) continue
    const key = ra < rb ? ra + ':' + rb : rb + ':' + ra; if (seenEdge.has(key)) continue; seenEdge.add(key)
    const w = M(nodes.get(ra), nodes.get(rb))
    if (!adj.has(ra)) adj.set(ra, []); adj.get(ra).push({ to: rb, w })
    if (!adj.has(rb)) adj.set(rb, []); adj.get(rb).push({ to: ra, w })
  }
  // nearest merged node (grid ~200 m)
  const CELL = 0.003
  const grid = new Map()
  for (const id of adj.keys()) { const [lon, lat] = nodes.get(id); const k = `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id) }
  function nearestNode(p) {
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
    let best = null, bd = Infinity
    for (let r = 0; r <= 4 && best === null; r++) {
      for (let gx = cx - r; gx <= cx + r; gx++) for (let gy = cy - r; gy <= cy + r; gy++) {
        const arr = grid.get(`${gx},${gy}`); if (!arr) continue
        for (const id of arr) { const d = M(p, nodes.get(id)); if (d < bd) { bd = d; best = id } }
      }
    }
    return { id: best, d: bd }
  }
  // binary-heap Dijkstra -> [[lon,lat], ...] or null
  function route(src, dst) {
    if (src === dst) return [nodes.get(src)]
    const dist = new Map([[src, 0]]), prev = new Map()
    const heap = [[0, src]]
    const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m } } return top }
    while (heap.length) {
      const [du, u] = pop()
      if (u === dst) break
      if (du > (dist.get(u) ?? Infinity)) continue
      for (const { to, w } of adj.get(u) || []) { const nd = du + w; if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, u); push(nd, to) } }
    }
    if (!prev.has(dst)) return null
    const ids = [dst]; let c = dst; while (c !== src) { c = prev.get(c); ids.push(c) }
    ids.reverse()
    return ids.map((id) => nodes.get(id))
  }
  return { nodes, adj, nearestNode, route, stats: { raw: railIdSet.size, merged: nodes.size, edges: seenEdge.size } }
}

const polyLen = (p) => p.reduce((s, c, k) => (k ? s + M(p[k - 1], c) : 0), 0)

// ---------- segment index over polylines (metres) ----------
function segIndex(polys, cell = 200) {
  const g = new Map()
  for (const c of polys) for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i]
    const x0 = Math.floor(Math.min(a[0], b[0]) * 69300 / cell), x1 = Math.floor(Math.max(a[0], b[0]) * 69300 / cell)
    const y0 = Math.floor(Math.min(a[1], b[1]) * 111320 / cell), y1 = Math.floor(Math.max(a[1], b[1]) * 111320 / cell)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; if (!g.has(k)) g.set(k, []); g.get(k).push([a, b]) }
  }
  return function dist(p, maxR = 2) {
    const cx = Math.floor(p[0] * 69300 / cell), cy = Math.floor(p[1] * 111320 / cell)
    let best = Infinity
    for (let x = cx - maxR; x <= cx + maxR; x++) for (let y = cy - maxR; y <= cy + maxR; y++) {
      for (const [a, b] of g.get(x + ',' + y) || []) {
        const ax = a[0] * 69300, ay = a[1] * 111320, dx = b[0] * 69300 - ax, dy = b[1] * 111320 - ay
        const px = p[0] * 69300, py = p[1] * 111320, L = dx * dx + dy * dy
        let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0
        t = Math.max(0, Math.min(1, t))
        best = Math.min(best, Math.hypot(ax + t * dx - px, ay + t * dy - py))
      }
    }
    return best
  }
}

// ---------- coverage: path along the line's own polylines ----------
// Graph over the line's vertices (resampled ≤ 50 m), consecutive edges plus
// links between vertices of different polylines within JOIN_M (junctions).
function lineGraph(polys, JOIN_M = 30) {
  const pts = [], adj = []
  const add = (c) => { pts.push(c); adj.push([]); return pts.length - 1 }
  const link = (i, j) => { const w = M(pts[i], pts[j]); adj[i].push([j, w]); adj[j].push([i, w]) }
  const owner = []
  polys.forEach((poly, pi) => {
    let prev = -1
    for (let k = 0; k < poly.length; k++) {
      if (k > 0) {
        const a = poly[k - 1], b = poly[k], n = Math.floor(M(a, b) / 50)
        for (let s = 1; s <= n; s++) {
          const t = s / (n + 1), i = add([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); owner.push(pi)
          link(prev, i); prev = i
        }
      }
      const i = add(poly[k]); owner.push(pi)
      if (prev >= 0) link(prev, i)
      prev = i
    }
  })
  const CELL = 0.0006
  const grid = new Map()
  pts.forEach((p, i) => { const k = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i) })
  pts.forEach((p, i) => {
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++)
      for (const j of grid.get(`${gx},${gy}`) || []) if (j > i && owner[j] !== owner[i] && M(p, pts[j]) <= JOIN_M) link(i, j)
  })
  function near(p, R) {
    const out = []
    const r = Math.ceil(R / 40)
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
    for (let gx = cx - r; gx <= cx + r; gx++) for (let gy = cy - r; gy <= cy + r; gy++)
      for (const j of grid.get(`${gx},${gy}`) || []) if (M(p, pts[j]) <= R) out.push(j)
    return out
  }
  // shortest along-line distance between any vertex near a and any near b
  function pathLen(a, b, R = 300, cap = Infinity) {
    const src = near(a, R), dst = new Set(near(b, R))
    if (!src.length || !dst.size) return null
    const dist = new Map()
    const heap = []
    const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break;[heap[q], heap[i]] = [heap[i], heap[q]]; i = q } }
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m } } return top }
    for (const s of src) { dist.set(s, 0); push(0, s) }
    while (heap.length) {
      const [d, u] = pop()
      if (d > cap) return null
      if (dst.has(u)) return d
      if (d > (dist.get(u) ?? Infinity)) continue
      for (const [v, w] of adj[u]) { const nd = d + w; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); push(nd, v) } }
    }
    return null
  }
  return { pathLen }
}

// ---------- Overpass rail tiles ----------
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const TILE = 0.1
const tileKey = (lon, lat) => `${Math.floor(lat / TILE)}_${Math.floor(lon / TILE)}`
const tileBox = (key) => {
  const [ty, tx] = key.split('_').map(Number)
  return `${(ty * TILE).toFixed(4)},${(tx * TILE).toFixed(4)},${((ty + 1) * TILE).toFixed(4)},${((tx + 1) * TILE).toFixed(4)}`
}
// One query per tile, cached while fresh (rail_<key>.json, or the legacy
// rail_batch_<key>.json). A box that keeps failing (Overpass 504/429 under
// load) is quartered and its quarters fetched instead, down to MAX_DEPTH.
const PARALLEL = 2
const MAX_DEPTH = 3
async function fetchTiles(keys, cacheDir, isFresh) {
  const out = []
  let next = 0, done = 0
  const worker = async () => {
    while (next < keys.length) {
      const k = keys[next++]
      const [ty, tx] = k.split('_').map(Number)
      out.push(...(await fetchBox([ty * TILE, tx * TILE, (ty + 1) * TILE, (tx + 1) * TILE], k, cacheDir, isFresh, 0)))
      console.log(`  rail tiles ${++done}/${keys.length}`)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  return out
}
const readFresh = (file, isFresh) => {
  if (!fs.existsSync(file)) return null
  const j = JSON.parse(fs.readFileSync(file, 'utf8'))
  return isFresh(j.osm3s) ? j : null
}
async function fetchBox(box, name, cacheDir, isFresh, depth) {
  const file = path.join(cacheDir, `rail_${name}.json`)
  const cached = readFresh(file, isFresh) || readFresh(path.join(cacheDir, `rail_batch_${name}.json`), isFresh)
  if (cached) return [cached]
  const bb = box.map((v) => v.toFixed(4)).join(',')
  const q = `[out:json][timeout:${depth ? 90 : 180}];way["railway"="rail"]["service"!~"^(siding|yard)$"](${bb});out body;>;out skel qt;`
  // The main endpoint's 504s are quick and intermittent: retry it often with a
  // short pause; mirrors that answer stale or hang are only tried every 4th round.
  let lastErr
  const rounds = depth < MAX_DEPTH ? 12 : 30
  for (let attempt = 0; attempt < rounds; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 3000))
    for (const url of attempt % 4 === 3 ? OVERPASS_MIRRORS.slice(1) : OVERPASS_MIRRORS.slice(0, 1)) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(depth ? 100000 : 200000),
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'tube-memory-dev/0.1 (offline build)' },
          body: 'data=' + encodeURIComponent(q),
        })
        if (!res.ok) { lastErr = new Error(`${url} ${res.status}`); continue }
        const j = await res.json()
        if (!isFresh(j.osm3s)) { lastErr = new Error(`${url} stale ${j.osm3s && j.osm3s.timestamp_osm_base}`); continue }
        fs.writeFileSync(file, JSON.stringify(j))
        return [j]
      } catch (err) { lastErr = err }
    }
  }
  if (depth >= MAX_DEPTH) throw new Error(`rail box ${name}: ${lastErr && lastErr.message}`)
  console.log(`  ${name}: ${lastErr && lastErr.message} -> quartering`)
  const [s, w, n, e] = box, my = (s + n) / 2, mx = (w + e) / 2
  const quads = [[s, w, my, mx], [s, mx, my, e], [my, w, n, mx], [my, mx, n, e]]
  const out = []
  for (let i = 0; i < 4; i++) out.push(...(await fetchBox(quads[i], `${name}q${i}`, cacheDir, isFresh, depth + 1)))
  return out
}

async function main() {
  const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null }
  const IN = arg('--in'), FEATS = arg('--features'), OUT = arg('--out')
  const LINES = new Set((arg('--lines') || '').split(',').filter(Boolean))
  const CACHE = arg('--cache') || path.join(os.tmpdir(), 'railtiles-task8')
  const REPORT = arg('--report')
  if (!IN || !FEATS || !OUT || !LINES.size) { console.error('usage: --in routes.osm.json --features features.json --lines A,B --out gaps.json'); process.exit(2) }
  fs.mkdirSync(CACHE, { recursive: true })
  const { isFresh } = require('./fetch-osm-routes.js')
  const ts = require('typescript')
  require.extensions['.ts'] = (module, filename) => {
    const src = fs.readFileSync(filename, 'utf8')
    module._compile(ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true }, fileName: filename }).outputText, filename)
  }
  const { SERVICES } = require(path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'services', 'index.ts'))
  const ORDER = require('./line-order.js')

  const routes = JSON.parse(fs.readFileSync(IN, 'utf8'))
  const feats = JSON.parse(fs.readFileSync(FEATS, 'utf8')).features
  const coordOf = new Map()
  for (const f of feats) { const k = `${f.properties.name}|${f.properties.line}`; if (!coordOf.has(k)) coordOf.set(k, f.geometry.coordinates) }
  const polysOf = new Map(), colorOf = {}
  for (const f of routes.features) {
    if (f.geometry.type !== 'LineString') continue
    const l = f.properties.line
    if (!polysOf.has(l)) polysOf.set(l, [])
    polysOf.get(l).push(f.geometry.coordinates)
    colorOf[l] = colorOf[l] || f.properties.color
  }

  // 1. coverage check
  const uncovered = [] // {line, service, a, b, A, B, D, why}
  const pairStats = {}
  for (const line of LINES) {
    const polys = polysOf.get(line) || []
    const lg = lineGraph(polys)
    const seen = new Set()
    let n = 0, gaps = 0
    for (const s of SERVICES.filter((x) => x.line === line)) {
      for (let i = 1; i < s.stops.length; i++) {
        const a = s.stops[i - 1], b = s.stops[i]
        const pk = [a, b].sort().join('>')
        if (seen.has(pk)) continue
        seen.add(pk); n++
        const A = coordOf.get(`${a}|${line}`), B = coordOf.get(`${b}|${line}`)
        if (!A || !B) throw new Error(`no coords for ${a} / ${b} on ${line}`)
        const D = M(A, B)
        const cap = 1.6 * D + 500
        const L = polys.length ? lg.pathLen(A, B, 300, cap) : null
        if (L == null || L > cap) { uncovered.push({ line, service: s.name, a, b, A, B, D, why: L == null ? 'no path along line geometry' : `path ${Math.round(L)} m` }); gaps++ }
      }
    }
    pairStats[line] = { pairs: n, uncovered: gaps }
    console.log(`  ${line.padEnd(22)} ${n} stop pairs, ${gaps} not covered by existing geometry`)
  }

  if (process.argv.includes('--check-only')) {
    for (const u of uncovered) console.log(`  uncovered ${u.line}: ${u.a} -> ${u.b} [${u.service}] — ${u.why}`)
    if (REPORT) fs.writeFileSync(REPORT, JSON.stringify({ pairStats, uncovered: uncovered.map(({ A, B, ...r }) => r) }, null, 2))
    return
  }

  // 2+3. shortest pairs first; a pair is re-checked against the geometry added
  // so far (a long fast-service pair is often covered once the short stopping
  // pairs inside it are filled). Each remaining pair is routed over a rail
  // graph built from the tiles of a corridor around it (cached per tile).
  const COVER_M = Number(arg('--cover-m')) || 40, PAD_M = 150, MIN_NEW_M = 100
  const out = [], failures = [], routed = [], coveredLater = []
  const idxOf = new Map()
  const addedOf = (line) => out.filter((f) => f.properties.line === line).map((f) => f.geometry.coordinates)
  uncovered.sort((x, y) => x.D - y.D)
  for (const u of uncovered) {
    if (!idxOf.has(u.line)) idxOf.set(u.line, segIndex(polysOf.get(u.line) || []))
    const prevAdded = addedOf(u.line)
    if (prevAdded.length) {
      const cap = 1.6 * u.D + 500
      const L0 = lineGraph([...(polysOf.get(u.line) || []), ...prevAdded]).pathLen(u.A, u.B, 300, cap)
      if (L0 != null && L0 <= cap) { coveredLater.push(`${u.line}: ${u.a} -> ${u.b}`); continue }
    }
    const tiles = new Set()
    const n = Math.max(1, Math.ceil(u.D / 2000))
    for (let i = 0; i <= n; i++) {
      const lon = u.A[0] + ((u.B[0] - u.A[0]) * i) / n, lat = u.A[1] + ((u.B[1] - u.A[1]) * i) / n
      for (const dy of [-0.025, 0, 0.025]) for (const dx of [-0.04, 0, 0.04]) tiles.add(tileKey(lon + dx, lat + dy))
    }
    console.log(`${u.line}: ${u.a} -> ${u.b} (${Math.round(u.D)} m): ${tiles.size} rail tile(s)`)
    const elements = []
    for (const j of await fetchTiles([...tiles].sort(), CACHE, isFresh)) for (const e of j.elements) elements.push(e)
    const G = buildGraph(elements)
    const sa = G.nearestNode(u.A), sb = G.nearestNode(u.B)
    if (!sa.id || !sb.id || sa.d > 400 || sb.d > 400) { failures.push({ ...u, why: `no rail node near stations (${Math.round(sa.d)} m / ${Math.round(sb.d)} m)` }); continue }
    const p = G.route(sa.id, sb.id)
    if (!p || p.length < 2) { failures.push({ ...u, why: 'no rail path' }); continue }
    const L = polyLen(p)
    if (L > 1.8 * u.D + 1000) { failures.push({ ...u, why: `rail path implausible (${Math.round(L)} m for ${Math.round(u.D)} m)` }); continue }
    const dist = idxOf.get(u.line)
    const cov = p.map((c) => dist(c) <= COVER_M)
    // maximal uncovered runs, padded into the covered part
    const runs = []
    for (let i = 0; i < p.length; i++) {
      if (cov[i]) continue
      let j = i; while (j + 1 < p.length && !cov[j + 1]) j++
      let s = i, e = j, acc = 0
      while (s > 0 && acc < PAD_M) { acc += M(p[s - 1], p[s]); s-- }
      acc = 0
      while (e < p.length - 1 && acc < PAD_M) { acc += M(p[e], p[e + 1]); e++ }
      runs.push([s, e]); i = j
    }
    // merge overlapping runs
    const merged = []
    for (const r of runs) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice()) }
    const feat = (seg) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: seg.map((c) => [Math.round(c[0] * 1e7) / 1e7, Math.round(c[1] * 1e7) / 1e7]) }, properties: { line: u.line, color: colorOf[u.line] || '#888888', order: ORDER[u.line] ?? 99, offset: 0, src: 'graph-routed' } })
    let pieces = merged.map(([s, e]) => p.slice(s, e + 1)).filter((seg) => polyLen(seg) >= MIN_NEW_M)
    // If the pieces still don't connect A to B along the line (its "covered"
    // stretches belong to a parallel track of the same line, e.g. the WCML fast
    // lines next to the slow lines), emit the whole routed path instead.
    const cap = 1.6 * u.D + 500
    const L1 = lineGraph([...(polysOf.get(u.line) || []), ...prevAdded, ...pieces], 45).pathLen(u.A, u.B, 300, cap)
    let whole = false
    if (L1 == null || L1 > cap) { pieces = [p]; whole = true }
    let added = 0
    for (const seg of pieces) { added += polyLen(seg); out.push(feat(seg)) }
    routed.push({ line: u.line, service: u.service, a: u.a, b: u.b, why: u.why, routedM: Math.round(L), straightM: Math.round(u.D), newM: Math.round(added), pieces: pieces.length, whole })
    // later pairs on this line see the new geometry as covered
    if (added) idxOf.set(u.line, segIndex([...(polysOf.get(u.line) || []), ...out.filter((f) => f.properties.line === u.line).map((f) => f.geometry.coordinates)]))
  }
  fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features: out }))
  for (const c of coveredLater) console.log(`  covered after earlier fills: ${c}`)
  console.log(`\nrouted ${routed.length} pair(s) -> ${out.length} new LineString(s); ${failures.length} failure(s)`)
  for (const r of routed) console.log(`  routed ${r.line}: ${r.a} -> ${r.b} (${r.why}); rail ${r.routedM} m vs straight ${r.straightM} m; new ${r.newM} m${r.whole ? ' (whole routed path)' : ''}`)
  for (const f of failures) console.log(`  FAILED ${f.line}: ${f.a} -> ${f.b} [${f.service}] — ${f.why}`)
  if (REPORT) fs.writeFileSync(REPORT, JSON.stringify({ pairStats, routed, coveredLater, failures: failures.map(({ A, B, ...r }) => r) }, null, 2))
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1) })
else module.exports = { buildGraph, lineGraph, segIndex }

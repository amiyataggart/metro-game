#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Generalised branch builder — routes line-tagged station chains over the
 * physical OSM rail network (centreline-merged so twin tracks collapse), for
 * branches OSM doesn't map as that operator's route relations. Same technique
 * as build-southern-extra.js but multi-line.
 *
 * Inputs : /tmp/railfull.json /tmp/south.json /tmp/east.json /tmp/railtiles/*
 *          + london features.json (station-coord fallback)
 * Output : /tmp/extra-branches.json { features:[{line,coords}], stations:[{name,coords,line}] }
 */
const fs = require('fs')
const path = require('path')
const M = (a, b) => Math.hypot((a[0] - b[0]) * 69300, (a[1] - b[1]) * 111320)

const rawNodes = new Map(), edges = [], stationNodes = [], railIds = new Set()
function ingest(d) {
  for (const e of d.elements) if (e.type === 'node' && !rawNodes.has(e.id)) rawNodes.set(e.id, [e.lon, e.lat])
  for (const e of d.elements) {
    if (e.type === 'node' && e.tags && e.tags.railway === 'station' && e.tags.name) stationNodes.push(e)
    if (e.type === 'way' && e.nodes && (!e.tags || e.tags.railway === 'rail'))
      for (let i = 1; i < e.nodes.length; i++) { const a = e.nodes[i - 1], b = e.nodes[i]; if (rawNodes.has(a) && rawNodes.has(b)) { edges.push([a, b]); railIds.add(a); railIds.add(b) } }
  }
}
for (const p of ['/tmp/railfull.json', '/tmp/south.json', '/tmp/east.json']) { if (fs.existsSync(p)) ingest(JSON.parse(fs.readFileSync(p, 'utf8'))) }
for (const fn of fs.readdirSync('/tmp/railtiles').filter((f) => f.endsWith('.json'))) ingest(JSON.parse(fs.readFileSync('/tmp/railtiles/' + fn, 'utf8')))

// centreline merge (collapse parallel tracks)
const R_MERGE = 14
const X = (id) => rawNodes.get(id)[0] * 69300, Y = (id) => rawNodes.get(id)[1] * 111320
const parent = new Map(); const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
for (const id of railIds) parent.set(id, id)
const cgrid = new Map(); const ck = (x, y) => `${Math.floor(x / R_MERGE)},${Math.floor(y / R_MERGE)}`
for (const id of railIds) { const k = ck(X(id), Y(id)); if (!cgrid.has(k)) cgrid.set(k, []); cgrid.get(k).push(id) }
for (const id of railIds) { const x = X(id), y = Y(id), cx = Math.floor(x / R_MERGE), cy = Math.floor(y / R_MERGE); for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) { const arr = cgrid.get(`${gx},${gy}`); if (!arr) continue; for (const j of arr) if (j !== id && Math.hypot(X(j) - x, Y(j) - y) <= R_MERGE) parent.set(find(id), find(j)) } }
const acc = new Map(); for (const id of railIds) { const r = find(id), a = acc.get(r) || [0, 0, 0], c = rawNodes.get(id); a[0] += c[0]; a[1] += c[1]; a[2]++; acc.set(r, a) }
const nodes = new Map(); for (const [r, a] of acc) nodes.set(r, [a[0] / a[2], a[1] / a[2]])
const adj = new Map(), seen = new Set()
for (const [a, b] of edges) { const ra = find(a), rb = find(b); if (ra === rb) continue; const key = ra < rb ? ra + ':' + rb : rb + ':' + ra; if (seen.has(key)) continue; seen.add(key); const w = M(nodes.get(ra), nodes.get(rb)); if (!adj.has(ra)) adj.set(ra, []); adj.get(ra).push({ to: rb, w }); if (!adj.has(rb)) adj.set(rb, []); adj.get(rb).push({ to: ra, w }) }
const gids = [...adj.keys()]
console.log(`rail graph: ${railIds.size} raw -> ${nodes.size} merged, ${seen.size} edges; station nodes ${stationNodes.length}`)

// coord lookup: OSM station node nearest to rail, else london features.json
const feats = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data', 'features.json'), 'utf8'))
const featCoord = {}; for (const f of feats.features) if (!featCoord[f.properties.name]) featCoord[f.properties.name] = f.geometry.coordinates
function stationCoord(name) {
  const cs = stationNodes.filter((n) => n.tags.name === name)
  if (cs.length) { let best = null; for (const c of cs) { const p = [c.lon, c.lat]; let nd = Infinity; for (const id of gids) { const d = M(p, nodes.get(id)); if (d < nd) nd = d } if (!best || nd < best.nd) best = { p: [+c.lon.toFixed(6), +c.lat.toFixed(6)], nd } } return best.p }
  return featCoord[name] || null
}
const CELL = 0.003, grid = new Map(); const gk = (lo, la) => `${Math.floor(lo / CELL)},${Math.floor(la / CELL)}`
for (const id of gids) { const [lo, la] = nodes.get(id); const k = gk(lo, la); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id) }
// k nearest graph nodes to p (within ~400m) — lets routing pick a candidate on
// the RIGHT track at multi-line interchanges (e.g. Upminster: District terminus
// vs the c2c through-line) instead of always the geometrically-closest one.
function kNearest(p, k) { const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL); const cand = []; for (let gx = cx - 2; gx <= cx + 2; gx++) for (let gy = cy - 2; gy <= cy + 2; gy++) { const arr = grid.get(`${gx},${gy}`); if (!arr) continue; for (const id of arr) cand.push([M(p, nodes.get(id)), id]) } cand.sort((a, b) => a[0] - b[0]); return cand.slice(0, k).map((x) => x[1]) }
function route(src, dst) { if (src === dst) return [nodes.get(src)]; const dist = new Map([[src, 0]]), prev = new Map(), heap = [[0, src]]; const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }; const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { let a = 2 * i + 1, b = a + 1, m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m } } return t }; while (heap.length) { const [du, u] = pop(); if (u === dst) break; if (du > (dist.get(u) ?? Infinity)) continue; for (const { to, w } of adj.get(u) || []) { const nd = du + w; if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, u); push(nd, to) } } } if (!prev.has(dst)) return null; const pth = [dst]; let c = dst; while (c !== src) { c = prev.get(c); if (c === undefined) return null; pth.push(c) } pth.reverse(); return pth.map((id) => nodes.get(id)) }

const CHAINS = [
  { line: 'Southeastern', stations: ['Herne Hill', 'West Dulwich', 'Sydenham Hill'] },
  { line: 'Southeastern', stations: ['London Victoria', 'Denmark Hill', 'Peckham Rye', 'Nunhead', 'Lewisham'] },
  { line: 'Southeastern', stations: ['New Cross', 'St Johns', 'Lewisham'] },
  { line: 'C2c', stations: ['Upminster', 'Ockendon', 'Chafford Hundred', 'Grays'] },
]
const features = [], stationsOut = []
const seenStation = new Set()
for (const { line, stations } of CHAINS) {
  const coords = stations.map((s) => ({ name: s, c: stationCoord(s) }))
  for (const s of coords) if (s.c && !seenStation.has(s.name + '|' + line)) { seenStation.add(s.name + '|' + line); stationsOut.push({ name: s.name, coords: s.c, line }) }
  for (let i = 0; i < coords.length - 1; i++) {
    const A = coords[i], B = coords[i + 1]
    if (!A.c || !B.c) { console.log(`  [${line}] skip ${A.name}->${B.name} (no coord)`); continue }
    // try the 6 nearest nodes at each end; keep the shortest valid path
    let p = null, plen = Infinity
    for (const a of kNearest(A.c, 6)) for (const b of kNearest(B.c, 6)) { const r = route(a, b); if (!r) continue; const l = r.reduce((s, c, k) => k ? s + M(r[k - 1], c) : 0, 0); if (l < plen) { plen = l; p = r } }
    if (!p) { console.log(`  [${line}] NO ROUTE ${A.name}->${B.name}`); continue }
    const len = plen, straight = M(A.c, B.c), ratio = len / straight
    console.log(`  [${line}] ${A.name} -> ${B.name}: ${p.length}pts ${(len / 1000).toFixed(2)}km ratio ${ratio.toFixed(2)}${ratio > 1.7 ? '  <-- CHECK' : ''}`)
    if (ratio > 3 && straight > 300) { console.log(`     rejected (too indirect)`); continue }
    features.push({ line, coords: p.map((c) => [+c[0].toFixed(6), +c[1].toFixed(6)]) })
  }
}
fs.writeFileSync('/tmp/extra-branches.json', JSON.stringify({ features, stations: stationsOut }))
console.log(`\nWrote ${features.length} polylines + ${stationsOut.length} station entries to /tmp/extra-branches.json`)

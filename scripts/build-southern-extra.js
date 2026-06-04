#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Build the remaining Southern South-London branches that OSM doesn't map as
 * Southern route relations, by routing each user-specified station chain over
 * the physical OSM rail network (same technique as build-southern-branch.js).
 *
 * Inputs : /tmp/railtiles/*.json (Greater London rail) + /tmp/south.json (southern
 *          supplement: rail ways/nodes + station nodes for Caterham/Tattenham etc.)
 * Output : /tmp/southern-extra.json  { geometry:[...], stations:[{name,coords}] }
 */
const fs = require('fs')
const M = (a, b) => Math.hypot((a[0] - b[0]) * 69300, (a[1] - b[1]) * 111320)

// ---- load rail graph from railtiles + south supplement ----
const rawNodes = new Map()
const edges = []
const stationNodes = []
const railIds = new Set()
function ingest(d) {
  for (const e of d.elements) if (e.type === 'node' && !rawNodes.has(e.id)) rawNodes.set(e.id, [e.lon, e.lat])
  for (const e of d.elements) {
    if (e.type === 'node' && e.tags && e.tags.railway === 'station' && e.tags.name) stationNodes.push(e)
    if (e.type === 'way' && e.nodes && (!e.tags || e.tags.railway === 'rail')) {
      for (let i = 1; i < e.nodes.length; i++) { const a = e.nodes[i - 1], b = e.nodes[i]; if (rawNodes.has(a) && rawNodes.has(b)) { edges.push([a, b]); railIds.add(a); railIds.add(b) } }
    }
  }
}
ingest(JSON.parse(fs.readFileSync('/tmp/railfull.json', 'utf8')))   // complete rail for all branches
ingest(JSON.parse(fs.readFileSync('/tmp/south.json', 'utf8')))      // station nodes (+ rail)
for (const fn of fs.readdirSync('/tmp/railtiles').filter((f) => f.endsWith('.json'))) ingest(JSON.parse(fs.readFileSync('/tmp/railtiles/' + fn, 'utf8'))) // London Bridge / north end

// ---- CENTRELINE MERGE: collapse parallel up/down tracks (~3-15m apart) into one
// centreline so adjacent stations on a twin-track line don't snap to opposite
// tracks (which forces routing via a far crossover). Union-find within R_MERGE.
const R_MERGE = 14
const X = (id) => rawNodes.get(id)[0] * 69300, Y = (id) => rawNodes.get(id)[1] * 111320
const parent = new Map(); const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
for (const id of railIds) parent.set(id, id)
const cgrid = new Map(); const ck = (x, y) => `${Math.floor(x / R_MERGE)},${Math.floor(y / R_MERGE)}`
for (const id of railIds) { const k = ck(X(id), Y(id)); if (!cgrid.has(k)) cgrid.set(k, []); cgrid.get(k).push(id) }
for (const id of railIds) { const x = X(id), y = Y(id), cx = Math.floor(x / R_MERGE), cy = Math.floor(y / R_MERGE)
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) { const arr = cgrid.get(`${gx},${gy}`); if (!arr) continue; for (const j of arr) if (j !== id && Math.hypot(X(j) - x, Y(j) - y) <= R_MERGE) parent.set(find(id), find(j)) } }
const acc = new Map()
for (const id of railIds) { const r = find(id); const a = acc.get(r) || [0, 0, 0]; const c = rawNodes.get(id); a[0] += c[0]; a[1] += c[1]; a[2]++; acc.set(r, a) }
const nodes = new Map() // mergedId -> [lon,lat]
for (const [r, a] of acc) nodes.set(r, [a[0] / a[2], a[1] / a[2]])
const adj = new Map(); const seen = new Set()
for (const [a, b] of edges) { const ra = find(a), rb = find(b); if (ra === rb) continue; const key = ra < rb ? ra + ':' + rb : rb + ':' + ra; if (seen.has(key)) continue; seen.add(key); const w = M(nodes.get(ra), nodes.get(rb)); if (!adj.has(ra)) adj.set(ra, []); adj.get(ra).push({ to: rb, w }); if (!adj.has(rb)) adj.set(rb, []); adj.get(rb).push({ to: ra, w }) }
const gids = [...adj.keys()]
console.log(`rail graph: ${railIds.size} raw -> ${nodes.size} merged centreline nodes, ${seen.size} edges; station nodes ${stationNodes.length}`)

// ---- station coords (prefer node nearest to rail) ----
function stationCoord(name) {
  const cs = stationNodes.filter((n) => n.tags.name === name)
  if (!cs.length) return null
  let best = null
  for (const c of cs) { const p = [c.lon, c.lat]; let nd = Infinity; for (const id of gids) { const d = M(p, nodes.get(id)); if (d < nd) nd = d } if (!best || nd < best.nd) best = { p: [+c.lon.toFixed(6), +c.lat.toFixed(6)], nd } }
  return best.p
}
// spatial grid for nearest graph node
const CELL = 0.003, grid = new Map()
const gk = (lon, lat) => `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`
for (const id of gids) { const [lo, la] = nodes.get(id); const k = gk(lo, la); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id) }
function nearestNode(p) { const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL); let best = null, bd = Infinity; for (let r = 0; r <= 5 && best === null; r++) { for (let gx = cx - r; gx <= cx + r; gx++) for (let gy = cy - r; gy <= cy + r; gy++) { const arr = grid.get(`${gx},${gy}`); if (!arr) continue; for (const id of arr) { const d = M(p, nodes.get(id)); if (d < bd) { bd = d; best = id } } } } return best }

// ---- Dijkstra (binary heap) ----
function route(src, dst) {
  if (src === dst) return [nodes.get(src)]
  const dist = new Map([[src, 0]]), prev = new Map(), heap = [[0, src]]
  const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { let a = 2 * i + 1, b = a + 1, m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m } } return t }
  while (heap.length) { const [du, u] = pop(); if (u === dst) break; if (du > (dist.get(u) ?? Infinity)) continue; for (const { to, w } of adj.get(u) || []) { const nd = du + w; if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, u); push(nd, to) } } }
  if (!prev.has(dst)) return null
  const path = [dst]; let c = dst; while (c !== src) { c = prev.get(c); if (c === undefined) return null; path.push(c) } path.reverse()
  return path.map((id) => nodes.get(id))
}

// ---- the chains the user specified ----
const CHAINS = [
  // Forest Hill / Sydenham line + Croydon
  ['London Bridge', 'New Cross Gate', 'Brockley', 'Honor Oak Park', 'Forest Hill', 'Sydenham', 'Penge West', 'Anerley', 'Norwood Junction', 'Selhurst', 'East Croydon'],
  ['Norwood Junction', 'West Croydon'],
  ['Sydenham', 'Crystal Palace'],
  // Tulse Hill -> West Norwood -> Gipsy Hill -> Crystal Palace, then the 3 spurs
  ['Tulse Hill', 'West Norwood', 'Gipsy Hill', 'Crystal Palace'],
  ['Crystal Palace', 'Birkbeck', 'Beckenham Junction'],
  ['Crystal Palace', 'Norwood Junction'],
  // Caterham branch (off the main line at Purley)
  ['Purley', 'Kenley', 'Whyteleafe', 'Whyteleafe South', 'Caterham'],
  // Tattenham Corner branch (off at Purley via Reedham)
  ['Purley', 'Reedham', 'Coulsdon Town', 'Woodmansterne', 'Chipstead', 'Kingswood', 'Tadworth', 'Tattenham Corner'],
]
const STATIONS = [...new Set(CHAINS.flat())]
const coords = {}
for (const s of STATIONS) coords[s] = stationCoord(s)
const missing = STATIONS.filter((s) => !coords[s])
if (missing.length) console.log('WARN missing station node:', missing.join(', '))

const geometry = []
for (const chain of CHAINS) {
  for (let i = 0; i < chain.length - 1; i++) {
    const A = chain[i], B = chain[i + 1]
    if (!coords[A] || !coords[B]) { console.log(`  skip ${A}->${B} (no coord)`); continue }
    const p = route(nearestNode(coords[A]), nearestNode(coords[B]))
    if (!p) { console.log(`  NO ROUTE ${A}->${B}`); continue }
    const len = p.reduce((s, c, k) => k ? s + M(p[k - 1], c) : 0, 0), straight = M(coords[A], coords[B])
    const ratio = len / straight
    console.log(`  ${A} -> ${B}: ${p.length}pts ${(len / 1000).toFixed(2)}km ratio ${ratio.toFixed(2)}${ratio > 1.6 ? '  <-- CHECK' : ''}`)
    if (ratio > 3 && straight > 300) { console.log(`     rejected (too indirect)`); continue }
    geometry.push(p.map((c) => [+c[0].toFixed(6), +c[1].toFixed(6)]))
  }
}
const stations = STATIONS.filter((s) => coords[s]).map((s) => ({ name: s, coords: coords[s], line: 'Southern' }))
fs.writeFileSync('/tmp/southern-extra.json', JSON.stringify({ geometry, stations }))
console.log(`\nWrote ${geometry.length} polylines + ${stations.length} stations to /tmp/southern-extra.json`)

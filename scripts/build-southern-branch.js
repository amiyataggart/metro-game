#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Build the Southern South-London metro branch (London Bridge–Tulse Hill and its
 * Streatham Hill/Balham, Streatham/Streatham Common/Mitcham Eastfields and
 * West Norwood/Gipsy Hill sub-branches) that OSM does NOT map as Southern route
 * relations. Routes along the physical OSM rail network (railway=rail ways) so
 * the lines follow the real tracks, and emits the stations with real coords.
 *
 * Input : /tmp/q-corridor.json  (way[railway=rail] + nodes + node[railway=station])
 * Output: /tmp/southern-branch.json  { geometry:[LineString coords...], stations:[{name,coords}] }
 */
const fs = require('fs')
const d = JSON.parse(fs.readFileSync('/tmp/q-corridor.json', 'utf8'))

const nodes = new Map() // id -> [lon,lat]
for (const e of d.elements) if (e.type === 'node') nodes.set(e.id, [e.lon, e.lat])
const stationNodes = d.elements.filter((e) => e.type === 'node' && e.tags && e.tags.railway === 'station')

// ---- rail graph: adjacency id -> [{to, w(meters)}] ----
const M = (a, b) => Math.hypot((a[0] - b[0]) * 69300, (a[1] - b[1]) * 111320)
const adj = new Map()
const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, w: M(nodes.get(a), nodes.get(b)) }) }
for (const e of d.elements) {
  if (e.type !== 'way' || !e.nodes || (e.tags && e.tags.railway !== 'rail')) continue
  for (let i = 1; i < e.nodes.length; i++) {
    const a = e.nodes[i - 1], b = e.nodes[i]
    if (!nodes.has(a) || !nodes.has(b)) continue
    link(a, b); link(b, a)
  }
}
const graphNodeIds = [...adj.keys()]

// ---- station name -> nearest graph node ----
function stationCoord(name) {
  const cands = stationNodes.filter((n) => n.tags.name === name)
  if (!cands.length) return null
  // prefer the one closest to any rail node
  let best = null
  for (const c of cands) {
    const p = [c.lon, c.lat]
    let nd = Infinity
    for (const id of graphNodeIds) { const dd = M(p, nodes.get(id)); if (dd < nd) nd = dd }
    if (!best || nd < best.nd) best = { p: [+c.lon.toFixed(6), +c.lat.toFixed(6)], nd }
  }
  return best ? best.p : null
}
function nearestGraphNode(p) {
  let best = null, bd = Infinity
  for (const id of graphNodeIds) { const dd = M(p, nodes.get(id)); if (dd < bd) { bd = dd; best = id } }
  return best
}

// ---- Dijkstra between two graph nodes ----
function route(srcId, dstId) {
  const dist = new Map([[srcId, 0]]); const prev = new Map()
  const pq = [[0, srcId]]
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0])
    const [du, u] = pq.shift()
    if (u === dstId) break
    if (du > (dist.get(u) ?? Infinity)) continue
    for (const { to, w } of adj.get(u) || []) {
      const nd = du + w
      if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, u); pq.push([nd, to]) }
    }
  }
  if (!prev.has(dstId) && srcId !== dstId) return null
  const path = [dstId]; let c = dstId
  while (c !== srcId) { c = prev.get(c); if (c === undefined) return null; path.push(c) }
  path.reverse()
  return path.map((id) => nodes.get(id))
}

// ---- the branch topology (ordered segments) ----
const SEGMENTS = [
  ['London Bridge', 'South Bermondsey'],
  ['South Bermondsey', 'Queens Road Peckham'],
  ['Queens Road Peckham', 'East Dulwich'],
  ['East Dulwich', 'North Dulwich'],
  ['North Dulwich', 'Tulse Hill'],
  ['Tulse Hill', 'Streatham Hill'],
  ['Streatham Hill', 'Balham'],
  ['Tulse Hill', 'Streatham'],
  ['Streatham', 'Streatham Common'],
  ['Streatham', 'Mitcham Eastfields'],
  ['Tulse Hill', 'West Norwood'],
  ['West Norwood', 'Gipsy Hill'],
]
const STATIONS = [...new Set(SEGMENTS.flat())]

const coords = {}
for (const s of STATIONS) coords[s] = stationCoord(s)
const missing = STATIONS.filter((s) => !coords[s])
if (missing.length) console.log('WARN no station node for:', missing.join(', '))

const geometry = []
for (const [a, b] of SEGMENTS) {
  if (!coords[a] || !coords[b]) { console.log(`skip ${a}->${b} (missing coord)`); continue }
  const path = route(nearestGraphNode(coords[a]), nearestGraphNode(coords[b]))
  if (!path) { console.log(`NO ROUTE ${a}->${b}`); continue }
  const len = path.reduce((s, c, i) => i ? s + M(path[i - 1], c) : 0, 0)
  const straight = M(coords[a], coords[b])
  console.log(`${a} -> ${b}: ${path.length} pts, ${(len/1000).toFixed(2)}km (straight ${(straight/1000).toFixed(2)}km, ratio ${(len/straight).toFixed(2)})`)
  geometry.push(path.map((c) => [+c[0].toFixed(6), +c[1].toFixed(6)]))
}

const stations = STATIONS.filter((s) => coords[s]).map((s) => ({ name: s, coords: coords[s], line: 'Southern' }))
fs.writeFileSync('/tmp/southern-branch.json', JSON.stringify({ geometry, stations }))
console.log(`\nWrote ${geometry.length} polyline(s) + ${stations.length} station(s) to /tmp/southern-branch.json`)

#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * LAB (track-geometry experiments, /lab/* pages) — fetch the physical OSM track
 * network around the scoped London network: railway=rail|subway|light_rail
 * ways (no sidings/yards), in 0.1° tiles covering every committed route within
 * ~500 m. Raw tiles are cached in scripts/lab/.cache (gitignored); the compact
 * merged track file the lab builder reads is written to scripts/lab/data/
 * tracks.json.gz (committed, so lab builds run offline).
 *
 *   node scripts/lab/fetch-lab-tracks.js            # Overpass (slow: ~1 tile/min)
 *   node scripts/lab/fetch-lab-tracks.js --opl FILE [--osm-base TIMESTAMP] # local OSM extract, e.g.
 *     Geofabrik county .osm.pbf files ->
 *     osmium tags-filter -o rail-X.pbf X.osm.pbf w/railway=rail,subway,light_rail
 *     osmium merge -o all-rail.pbf rail-*.pbf
 *     osmium cat -f opl,add_metadata=false -o all-rail.opl all-rail.pbf
 *   Either way the same tile set and filters apply.
 *
 * Data © OpenStreetMap contributors, ODbL.
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const ROOT = path.join(__dirname, '..', '..')
const ROUTES = path.join(ROOT, 'src', 'app', '(game)', 'london', 'data', 'routes.json')
const CACHE = path.join(__dirname, '.cache')
const OUT = path.join(__dirname, 'data', 'tracks.json.gz')
const TILE = 0.1
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const { isFresh } = require('../fetch-osm-routes.js')
const fresh = (j) => isFresh(j.osm3s)

function tiles() {
  const R = JSON.parse(fs.readFileSync(ROUTES, 'utf8'))
  const s = new Set()
  for (const f of R.features) {
    if (['Tramlink', 'CableCar'].includes(f.properties.line)) continue
    for (const c of f.geometry.coordinates)
      for (const dy of [-0.005, 0.005]) for (const dx of [-0.008, 0.008])
        s.add(`${Math.floor((c[1] + dy) / TILE)}_${Math.floor((c[0] + dx) / TILE)}`)
  }
  return [...s].sort()
}

async function fetchBox(box, name, depth, home = 0) {
  const file = path.join(CACHE, `t_${name}.json`)
  if (fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (j.osm3s) return [j] // cached tiles are reused regardless of age (lab)
  }
  const bb = box.map((v) => v.toFixed(4)).join(',')
  const q = `[out:json][timeout:${depth ? 90 : 180}];way["railway"~"^(rail|subway|light_rail)$"]["service"!~"^(siding|yard)$"](${bb});out body;>;out skel qt;`
  let lastErr
  for (let attempt = 0; attempt < (depth < 2 ? 8 : 20); attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 3000))
    // each worker has a home mirror; rotate to the others on retries
    const url = MIRRORS[(home + attempt) % MIRRORS.length]
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(200000),
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'tube-memory-dev/0.1 (offline build)', Accept: '*/*' },
        body: 'data=' + encodeURIComponent(q),
      })
      if (!res.ok) { lastErr = new Error(`${url} ${res.status}`); continue }
      const j = await res.json()
      if (!fresh(j)) { lastErr = new Error(`${url} stale`); continue }
      fs.writeFileSync(file, JSON.stringify(j))
      return [j]
    } catch (e) { lastErr = e }
  }
  if (depth >= 2) throw new Error(`${name}: ${lastErr && lastErr.message}`)
  console.log(`  ${name}: ${lastErr && lastErr.message} -> quartering`)
  const [s, w, n, e] = box, my = (s + n) / 2, mx = (w + e) / 2
  const out = []
  const quads = [[s, w, my, mx], [s, mx, my, e], [my, w, n, mx], [my, mx, n, e]]
  for (let i = 0; i < 4; i++) out.push(...(await fetchBox(quads[i], `${name}q${i}`, depth + 1, home)))
  return out
}

// Parse an OPL dump (osmium cat -f opl,add_metadata=false) into Overpass-like elements.
function readOpl(file) {
  const dec = (v) => v.replace(/%([0-9a-f]+)%/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  const elements = []
  for (const row of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!row) continue
    const parts = row.split(' ')
    const id = +parts[0].slice(1)
    const f = {}
    for (const p of parts.slice(1)) f[p[0]] = p.slice(1)
    if (row[0] === 'n') elements.push({ type: 'node', id, lon: +f.x, lat: +f.y })
    else if (row[0] === 'w') {
      const tags = {}
      for (const kv of (f.T || '').split(',')) { if (!kv) continue; const i = kv.indexOf('='); tags[dec(kv.slice(0, i))] = dec(kv.slice(i + 1)) }
      elements.push({ type: 'way', id, tags, nodes: (f.N || '').split(',').filter(Boolean).map((n) => +n.slice(1)) })
    }
  }
  return elements
}

async function main() {
  const oplAt = process.argv.indexOf('--opl')
  if (oplAt >= 0) return writeCompact([{ osm3s: { timestamp_osm_base: process.argv[process.argv.indexOf('--osm-base') + 1] && process.argv.includes('--osm-base') ? process.argv[process.argv.indexOf('--osm-base') + 1] : 'local extract' }, elements: filterOpl(readOpl(process.argv[oplAt + 1])) }])
  fs.mkdirSync(CACHE, { recursive: true })
  const keys = tiles()
  console.log(`${keys.length} tiles`)
  const results = []
  let next = 0, done = 0
  const worker = async (home) => {
    while (next < keys.length) {
      const k = keys[next++]
      const [ty, tx] = k.split('_').map(Number)
      results.push(...(await fetchBox([ty * TILE, tx * TILE, (ty + 1) * TILE, (tx + 1) * TILE], k, 0, home)))
      if (++done % 10 === 0) console.log(`  ${done}/${keys.length}`)
    }
  }
  // four workers on the main instance (its rate limit is 4 slots); retries rotate to mirrors
  await Promise.all([0, 0, 0, 0].map((h) => worker(h)))
  writeCompact(results)
}

// Same selection as the Overpass query: rail/subway/light_rail ways (not
// sidings/yards) with at least one node inside the needed tiles.
function filterOpl(elements) {
  const keys = new Set(tiles())
  const nodes = new Map()
  for (const e of elements) if (e.type === 'node') nodes.set(e.id, e)
  const keep = new Set()
  const out = []
  for (const e of elements) {
    if (e.type !== 'way' || !/^(rail|subway|light_rail)$/.test(e.tags.railway || '') || /^(siding|yard)$/.test(e.tags.service || '')) continue
    const inside = e.nodes.some((n) => { const c = nodes.get(n); return c && keys.has(`${Math.floor(c.lat / TILE)}_${Math.floor(c.lon / TILE)}`) })
    if (!inside) continue
    out.push(e)
    for (const n of e.nodes) keep.add(n)
  }
  for (const id of keep) if (nodes.has(id)) out.push(nodes.get(id))
  return out
}

function writeCompact(results) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  // compact: nodes [id, lon, lat] (6dp) + ways [railway-type, ...nodeIds]
  const nodes = new Map(), ways = new Map()
  for (const j of results) for (const e of j.elements) {
    if (e.type === 'node') nodes.set(e.id, [Math.round(e.lon * 1e6) / 1e6, Math.round(e.lat * 1e6) / 1e6])
    else if (e.type === 'way' && e.nodes) ways.set(e.id, { t: e.tags.railway, tunnel: e.tags.tunnel === 'yes' ? 1 : 0, svc: e.tags.service || '', n: e.nodes })
  }
  const used = new Set()
  for (const w of ways.values()) for (const n of w.n) used.add(n)
  const out = {
    attribution: 'Data © OpenStreetMap contributors, ODbL',
    osmBase: results.map((r) => r.osm3s.timestamp_osm_base).sort().at(-1),
    nodes: [...used].filter((id) => nodes.has(id)).sort((a, b) => a - b).map((id) => [id, ...nodes.get(id)]),
    ways: [...ways.entries()].sort((a, b) => a[0] - b[0]).map(([id, w]) => [id, w.t, w.tunnel, w.svc, w.n]),
  }
  fs.writeFileSync(OUT, zlib.gzipSync(JSON.stringify(out), { level: 9 }))
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${out.nodes.length} nodes, ${out.ways.length} ways, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB gz`)
}
main().catch((e) => { console.error(e); process.exit(1) })

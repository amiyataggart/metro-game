#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * build-stations.js — rebuild features.json (one Point per station × line) from
 * the curated service tables (src/app/(game)/london/services/*.ts). The tables
 * are the source of truth for line membership; this script supersedes
 * transform-data.js for features.json.
 *
 *  • A (name, line) pair that already exists keeps its feature as is (id,
 *    coordinates, alternate_names, src) — players' found-progress is keyed by id.
 *  • User-approved renames / merges are applied first (RENAMES below). A merge
 *    keeps the feature with the lower id.
 *  • A new pair gets its id from the append-only id ledger
 *    (data/station-ids.json): a pair seen before (e.g. dropped by an earlier
 *    scope and now back) gets its old id back; a never-seen pair gets
 *    highWater+1, +2, … — so a retired id is never handed to another station.
 *    The ledger records every pair ever assigned and is rewritten (appended
 *    to) on every non-dry run. The new pair takes its coordinates (and
 *    alternate_names) from an existing feature of the same name — preferring a
 *    National Rail line, then Overground / Elizabeth, then anything, lowest id
 *    first. Failing that, from the OSM station node (railway=station, or
 *    aerialway=station for the Cable Car) inside the scope bbox. The script
 *    aborts with a list if any station can't be placed.
 *  • Pairs that no service calls at are dropped.
 *
 * Overpass responses older than 24 h (osm3s.timestamp_osm_base) are rejected,
 * as in fetch-osm-routes.js. The station-node response is cached at
 * --osm-cache (default: a temp file) and reused while it is fresh.
 *
 * Usage: node scripts/build-stations.js [--osm-cache FILE] [--dry-run]
 * Data © OpenStreetMap contributors, ODbL.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const ts = require('typescript')
const { isFresh } = require('./fetch-osm-routes.js')

const ROOT = path.join(__dirname, '..')
const LONDON = path.join(ROOT, 'src', 'app', '(game)', 'london')
const FEATURES = path.join(LONDON, 'data', 'features.json')
const LEDGER = path.join(LONDON, 'data', 'station-ids.json')

// Id ledger: { highWater, pairs: { "name|line": [ids] } }, one pair per line.
function readLedger() {
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
}
function writeLedger(ledger) {
  const keys = Object.keys(ledger.pairs).sort()
  const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(ledger.pairs[k])}`).join(',\n')
  fs.writeFileSync(LEDGER, `{\n "highWater": ${ledger.highWater},\n "pairs": {\n${body}\n }\n}\n`)
}
function recordInLedger(ledger, features) {
  for (const f of features) {
    const k = `${f.properties.name}|${f.properties.line}`
    const ids = ledger.pairs[k] || (ledger.pairs[k] = [])
    if (!ids.includes(f.properties.id)) ids.push(f.properties.id)
    ids.sort((a, b) => a - b)
    ledger.highWater = Math.max(ledger.highWater, f.properties.id)
  }
}

// Minimal TS loader (as in report-service-diff.js): transpile .ts on require.
require.extensions['.ts'] = (module, filename) => {
  const src = fs.readFileSync(filename, 'utf8')
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
    fileName: filename,
  }).outputText
  module._compile(out, filename)
}
const { SERVICES } = require(path.join(LONDON, 'services', 'index.ts'))
const { FULL_LINES } = require(path.join(LONDON, 'scope.ts'))

const arg = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null }
const OSM_CACHE = arg('--osm-cache') || path.join(os.tmpdir(), 'build-stations-osm.json')
const DRY = process.argv.includes('--dry-run')

// User-approved renames (service-diff notes items 7, 10, 11). Several sources
// mapping to one target on a line are a merge (lower id kept). `alias: true`
// keeps the old name as an alternate name.
const RENAMES = [
  { line: 'Southern', from: 'Dorking Main', to: 'Dorking', alias: true },
  { line: 'SouthWesternRailway', from: 'St Margarets', to: 'St Margarets (London)' },
  { line: 'GreaterAnglia', from: 'St Margarets', to: 'St Margarets (Herts)' },
  { line: 'SouthWesternRailway', from: 'Ashford Platform 1', to: 'Ashford (Surrey)' },
  { line: 'SouthWesternRailway', from: 'Ashford Platform 2', to: 'Ashford (Surrey)' },
  { line: 'SoutheasternHighSpeed', from: 'Ebbsfleet International (domestic)', to: 'Ebbsfleet International' },
]

// Coordinate-source preference for a new pair: National Rail first.
const OVERGROUND = new Set(['Liberty', 'Lioness', 'Mildmay', 'Suffragette', 'Weaver', 'Windrush', 'ElizabethLine'])
const NR_IN_FULL = new Set(['C2c', 'HeathrowExpress'])
const tier = (line) => (!FULL_LINES.has(line) || NR_IN_FULL.has(line) ? 0 : OVERGROUND.has(line) ? 1 : 2)

// OSM station lookup: scope bbox (S, W, N, E) — Brighton .. Cambridge North, Reading .. Southend.
const BBOX = [50.7, -1.2, 52.35, 0.9]
// Table name -> OSM `name` where they differ.
const OSM_NAME = {
  'Garston (Herts)': 'Garston',
}
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const norm = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[’'`.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

async function osmStations() {
  if (fs.existsSync(OSM_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(OSM_CACHE, 'utf8'))
    if (isFresh(cached.osm3s)) { console.log(`OSM stations: cached ${OSM_CACHE}`); return cached }
  }
  const [s, w, n, e] = BBOX
  const q = `[out:json][timeout:120];(nwr["railway"="station"](${s},${w},${n},${e});nwr["aerialway"="station"](${s},${w},${n},${e}););out center tags;`
  let lastErr
  for (const url of OVERPASS_MIRRORS) {
    try {
      console.log(`OSM stations: fetching ${url}`)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'tube-memory-dev/0.1 (offline build)' },
        body: 'data=' + encodeURIComponent(q),
      })
      if (!res.ok) { lastErr = new Error(`Overpass ${res.status}`); continue }
      const json = await res.json()
      if (!isFresh(json.osm3s)) { lastErr = new Error(`stale osm3s ${json.osm3s && json.osm3s.timestamp_osm_base}`); continue }
      fs.writeFileSync(OSM_CACHE, JSON.stringify(json))
      return json
    } catch (err) { lastErr = err }
  }
  throw lastErr || new Error('all Overpass mirrors failed')
}

const M = (a, b) => Math.hypot((a[0] - b[0]) * 69300, (a[1] - b[1]) * 111320)
const r6 = (x) => Math.round(x * 1e6) / 1e6

async function main() {
  const fc = JSON.parse(fs.readFileSync(FEATURES, 'utf8'))
  const key = (name, line) => `${name}|${line}`
  const report = { renamed: [], merged: [], kept: 0, dropped: [], added: [] }

  // 1. renames / merges
  for (const r of RENAMES) {
    for (const f of fc.features) {
      if (f.properties.line !== r.line || f.properties.name !== r.from) continue
      f.properties.name = r.to
      if (r.alias) f.properties.alternate_names = [...new Set([...(f.properties.alternate_names || []), r.from])]
      report.renamed.push(`${r.from} -> ${r.to} (${r.line}, id ${f.properties.id})`)
    }
  }
  const byPair = new Map()
  for (const f of fc.features) {
    const k = key(f.properties.name, f.properties.line)
    if (!byPair.has(k)) byPair.set(k, [])
    byPair.get(k).push(f)
  }
  const mergeTargets = new Set(RENAMES.map((r) => key(r.to, r.line)))
  for (const k of mergeTargets) {
    const fs_ = byPair.get(k)
    if (!fs_ || fs_.length < 2) continue
    fs_.sort((a, b) => a.properties.id - b.properties.id)
    report.merged.push(`${k}: kept id ${fs_[0].properties.id}, dropped ${fs_.slice(1).map((f) => f.properties.id).join(', ')}`)
    byPair.set(k, [fs_[0]])
  }

  // 2. pairs the services need. An existing pair keeps all its features (the
  // Circle has two Paddington platforms); a new pair gets one.
  const need = new Map() // key -> { name, line, services }
  for (const s of SERVICES) {
    for (const n of new Set(s.stops)) {
      const k = key(n, s.line)
      const cur = need.get(k) || { name: n, line: s.line, services: [] }
      cur.services.push(s)
      need.set(k, cur)
    }
  }

  // 3. coordinate sources by name (after renames, before dropping)
  const byName = new Map()
  for (const fs_ of byPair.values()) for (const f of fs_) {
    const n = f.properties.name
    if (!byName.has(n)) byName.set(n, [])
    byName.get(n).push(f)
  }
  for (const arr of byName.values())
    arr.sort((a, b) => tier(a.properties.line) - tier(b.properties.line) || a.properties.id - b.properties.id)

  const out = []
  const keptKeys = new Set()
  for (const f of fc.features) { // existing order preserved
    const k = key(f.properties.name, f.properties.line)
    if (!(byPair.get(k) || []).includes(f)) continue // merged away
    if (!need.has(k)) { report.dropped.push(`${f.properties.name} (${f.properties.line}, id ${f.properties.id})`); continue }
    out.push(f)
    keptKeys.add(k)
    report.kept++
  }

  // 4. new pairs. Ids come from the ledger: a pair seen before gets its old
  // id back (if no kept feature uses it); otherwise highWater+1. Never
  // max(current ids)+1, which could reuse a retired id.
  const ledger = readLedger()
  // The input's surviving pairs (after renames; merged-away features keep
  // their pre-merge entry) are recorded, and every input id is reserved.
  recordInLedger(ledger, fc.features.filter((f) => (byPair.get(key(f.properties.name, f.properties.line)) || []).includes(f)))
  ledger.highWater = Math.max(ledger.highWater, ...fc.features.map((f) => f.properties.id))
  const usedIds = new Set(out.map((f) => f.properties.id))
  const idFor = (name, line) => {
    const old = (ledger.pairs[key(name, line)] || []).find((id) => !usedIds.has(id))
    const id = old != null ? old : ++ledger.highWater
    usedIds.add(id)
    return id
  }
  const pending = [...need.values()].filter((v) => !keptKeys.has(key(v.name, v.line)))
  const viaOsm = pending.filter((v) => !byName.has(v.name))
  let osmByName = new Map()
  if (viaOsm.length) {
    const osm = await osmStations()
    for (const el of osm.elements) {
      const t = el.tags || {}
      const c = el.type === 'node' ? [el.lon, el.lat] : el.center && [el.center.lon, el.center.lat]
      if (!c) continue
      for (const nm of new Set([t.name, t['name:en'], t.official_name, t.alt_name].filter(Boolean))) {
        const k = norm(nm)
        if (!osmByName.has(k)) osmByName.set(k, [])
        osmByName.get(k).push({ id: `${el.type}/${el.id}`, c, tags: t })
      }
    }
  }
  // placed coords of any (name) so far, for disambiguating duplicate OSM names
  const placed = (n) => (byName.get(n) || [])[0]?.geometry.coordinates || out.find((f) => f.properties.name === n)?.geometry.coordinates
  const missing = []
  const newByName = new Map()
  for (const v of pending) {
    let coords, alts, source
    const src = (byName.get(v.name) || [])[0]
    if (src) {
      coords = src.geometry.coordinates.slice()
      alts = src.properties.alternate_names
      source = `feature ${src.properties.id} (${src.properties.line})`
    } else if (newByName.has(v.name)) {
      const o = newByName.get(v.name)
      coords = o.coords.slice()
      source = o.source
    } else {
      const cands = osmByName.get(norm(OSM_NAME[v.name] || v.name)) || []
      if (!cands.length) { missing.push(`${v.name} (${v.line})`); continue }
      // nearest to the neighbouring stops of the first service that calls here
      const s = v.services[0], i = s.stops.indexOf(v.name)
      const nb = [s.stops[i - 1], s.stops[i + 1]].map((n) => n && placed(n)).filter(Boolean)
      const score = (c) => (nb.length ? Math.min(...nb.map((p) => M(c.c, p))) : 0)
      const best = cands.slice().sort((a, b) => score(a) - score(b))[0]
      if (nb.length && score(best) > 25000) { missing.push(`${v.name} (${v.line}): nearest OSM match ${best.id} is ${Math.round(score(best))} m from its neighbours`); continue }
      coords = [r6(best.c[0]), r6(best.c[1])]
      source = `OSM ${best.id}${best.id.startsWith('node/') ? '' : ' (centre)'}${cands.length > 1 ? ` (1 of ${cands.length} same-name, nearest to neighbours)` : ''}`
      newByName.set(v.name, { coords, source })
    }
    const id = idFor(v.name, v.line)
    const props = { id, name: v.name, line: v.line }
    if (alts && alts.length) props.alternate_names = alts.slice()
    out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: props, id })
    report.added.push(`${id} ${v.name} (${v.line}) <- ${source}`)
  }
  if (missing.length) {
    console.error(`ABORT: no coordinates for ${missing.length} station(s):\n  ${missing.join('\n  ')}`)
    process.exit(1)
  }

  const stationsPerLine = {}
  for (const f of out) stationsPerLine[f.properties.line] = (stationsPerLine[f.properties.line] || 0) + 1
  const result = { type: 'FeatureCollection', features: out, properties: { totalStations: out.length, stationsPerLine } }

  console.log(`renamed ${report.renamed.length}:\n  ${report.renamed.join('\n  ')}`)
  console.log(`merged ${report.merged.length}:\n  ${report.merged.join('\n  ')}`)
  console.log(`kept ${report.kept}, dropped ${report.dropped.length}, added ${report.added.length} -> ${out.length} features`)
  console.log(`added:\n  ${report.added.join('\n  ')}`)
  if (process.argv.includes('--list-dropped')) console.log(`dropped:\n  ${report.dropped.join('\n  ')}`)
  if (!DRY) {
    fs.writeFileSync(FEATURES, JSON.stringify(result, null, 2))
    console.log(`wrote ${path.relative(process.cwd(), FEATURES)}`)
    recordInLedger(ledger, out)
    writeLedger(ledger)
    console.log(`wrote ${path.relative(process.cwd(), LEDGER)} (highWater ${ledger.highWater})`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

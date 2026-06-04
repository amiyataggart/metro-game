#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Surgical merge of the National Rail TOC services fetched into TEMP files by
 * fetch-osm-routes.js, WITHOUT disturbing any existing reviewed geometry (the
 * documented features.original.json is not in the repo, so we cannot re-run
 * transform-data; this replicates its Pass-3 station merge against the
 * committed features.json instead).
 *
 * For the NEW_LINES only:
 *   1. features.json     — add station Points (id/alias logic mirrors transform-data Pass 3)
 *   2. stations-extras.json — append the new stops (record/future full rebuild)
 *   3. routes.osm.json   — append the new raw LineString geometry
 *   4. emit /tmp/nr-new.osm.json — just the new lines, for build-ribbons
 *
 * Usage:
 *   node scripts/merge-national-rail.js \
 *     --osm /tmp/nr-all.osm.json --stations /tmp/nr-all-stations.json \
 *     --new-osm-out /tmp/nr-new.osm.json
 * Full data (all stops, full-length track) is stored; visibility.ts clips to
 * the display box at render time.
 */
const fs = require('fs')
const path = require('path')

const DATA = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d }
const OSM_IN = arg('--osm', '/tmp/nr-all.osm.json')
const STATIONS_IN = arg('--stations', '/tmp/nr-all-stations.json')
const NEW_OSM_OUT = arg('--new-osm-out', '/tmp/nr-new.osm.json')

const NEW_LINES = new Set([
  'SouthWesternRailway', 'C2c', 'GreaterAnglia', 'Southeastern',
  'SoutheasternHighSpeed', 'Southern', 'GreatNorthern', 'GatwickExpress',
  'Chiltern', 'EastMidlandsRailway', 'GreatWesternRailway', 'HeathrowExpress',
])

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const featuresPath = path.join(DATA, 'features.json')
const extrasPath = path.join(DATA, 'stations-extras.json')
const osmPath = path.join(DATA, 'routes.osm.json')

const features = read(featuresPath)
const extras = read(extrasPath)
const osm = read(osmPath)
const osmNew = read(OSM_IN)
const stationsNew = read(STATIONS_IN)

// ---- 1. features.json: merge new-line station Points (transform-data Pass 3) ----
let nextId = 0
for (const f of features.features) {
  if (typeof f.id === 'number' && f.id >= nextId) nextId = f.id + 1
}
const have = new Set(features.features.map((f) => `${f.properties.name}|${f.properties.line}`))
let addedStations = 0
for (const s of stationsNew) {
  if (!NEW_LINES.has(s.line)) continue
  const key = `${s.name}|${s.line}`
  if (have.has(key)) continue
  have.add(key)
  const id = nextId++
  const props = { id, name: s.name, line: s.line }
  if (Array.isArray(s.alternate_names) && s.alternate_names.length) {
    props.alternate_names = Array.from(new Set(s.alternate_names))
  }
  features.features.push({
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: s.coords },
    properties: props,
  })
  addedStations++
}
// Recompute the summary block transform-data writes.
const stationsPerLine = {}
for (const f of features.features) {
  const l = f.properties.line
  if (l) stationsPerLine[l] = (stationsPerLine[l] || 0) + 1
}
features.properties = { totalStations: features.features.length, stationsPerLine }
fs.writeFileSync(featuresPath, JSON.stringify(features, null, 2))

// ---- 2. stations-extras.json: append new stops ----
const exHave = new Set(extras.map((s) => `${s.name}|${s.line}`))
let addedExtras = 0
for (const s of stationsNew) {
  if (!NEW_LINES.has(s.line)) continue
  const key = `${s.name}|${s.line}`
  if (exHave.has(key)) continue
  exHave.add(key)
  extras.push(s)
  addedExtras++
}
fs.writeFileSync(extrasPath, JSON.stringify(extras, null, 2))

// ---- 3. routes.osm.json: append new raw geometry ----
const newGeom = osmNew.features.filter((f) => NEW_LINES.has(f.properties.line))
osm.features.push(...newGeom)
fs.writeFileSync(osmPath, JSON.stringify(osm))

// ---- 4. emit just the new lines for build-ribbons ----
fs.writeFileSync(NEW_OSM_OUT, JSON.stringify({ type: 'FeatureCollection', features: newGeom }))

console.log(`features.json: +${addedStations} station(s) (total ${features.features.length})`)
console.log(`stations-extras.json: +${addedExtras} stop(s) (total ${extras.length})`)
console.log(`routes.osm.json: +${newGeom.length} LineString feature(s) (total ${osm.features.length})`)
console.log(`Wrote ${newGeom.length} new-line feature(s) to ${NEW_OSM_OUT}`)

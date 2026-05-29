#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * marker-overrides.js — small, hand-curated corrections to station marker
 * positions that the automatic data can't get right, applied to features.json
 * in place. Idempotent.
 *
 * Why: interchange pies are grouped by which markers are co-located (≤30m, see
 * interchanges.ts CLUSTER_M). A `coLocateWith` override moves one line's marker
 * for a station onto another line's marker there, so they share one pie — used
 * where the source data places a platform at the wrong level. (Marker position
 * and pie membership are coupled, so grouping = co-locating.)
 *
 * Run after transform-data.js / rename-stations.js (which build features.json).
 * Usage: node scripts/marker-overrides.js
 */
const fs = require('fs')
const path = require('path')

const DATA = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')

const OVERRIDES = [
  // Farringdon: the Elizabeth line platforms interchange with the mainline
  // (Thameslink) level, not the subsurface Underground — but the source places
  // its point on the Underground node. Group it with Thameslink instead.
  { name: 'Farringdon', line: 'ElizabethLine', coLocateWith: 'Thameslink' },
]

const file = path.join(DATA, 'features.json')
const fc = JSON.parse(fs.readFileSync(file, 'utf8'))
const ptOf = (name, line) =>
  fc.features.find(
    (f) => f.geometry && f.geometry.type === 'Point' && f.properties.name === name && f.properties.line === line,
  )

let applied = 0
for (const o of OVERRIDES) {
  const target = ptOf(o.name, o.line)
  const anchor = ptOf(o.name, o.coLocateWith)
  if (!target || !anchor) {
    console.warn(`  skip ${o.name}/${o.line}: missing ${!target ? o.line : o.coLocateWith}`)
    continue
  }
  const [tx, ty] = target.geometry.coordinates
  const [ax, ay] = anchor.geometry.coordinates
  if (tx === ax && ty === ay) continue // already applied
  target.geometry.coordinates = [ax, ay]
  applied++
  console.log(`  ${o.name}/${o.line} -> co-located with ${o.coLocateWith}`)
}
fs.writeFileSync(file, JSON.stringify(fc))
console.log(`marker-overrides: applied ${applied} override(s).`)

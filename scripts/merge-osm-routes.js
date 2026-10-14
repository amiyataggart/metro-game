#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * merge-osm-routes.js — fold a partial OSM re-fetch (and graph-routed gap
 * fills) into the raw-OSM source routes.osm.json.
 *
 * For every line in --lines that the fresh fetch returned features for:
 *   • its OSM-relation features (no `src` property) are replaced by the fresh
 *     ones, inserted where the first old one was;
 *   • its hand-routed features (`src`: southern-branch, southern-extra,
 *     extra-branches, trams, …) are kept — OSM does not map those branches as
 *     relations of that operator;
 *   • its old graph-routed fills (`src: 'graph-routed'`) are dropped; the
 *     current fills come from --gaps (normally the committed
 *     data/routes.gap-fills.json written by route-over-rail-graph.js).
 * Lines not in --lines are copied byte-for-byte. A line in --lines with no
 * fresh features is left untouched (with a warning). Gap features are
 * appended at the end.
 *
 *   node scripts/merge-osm-routes.js --base routes.osm.json \
 *     --fresh fresh.osm.json --lines A,B,C [--gaps gaps.json ...] --out OUT
 *
 * (--out may equal --base.) Extracted from the Task-8 scratch merge.
 */
const fs = require('fs')

const GRAPH_ROUTED = 'graph-routed'

function mergeOsmRoutes(base, fresh, lines, gapsList) {
  const refetch = new Set(lines)
  const freshBy = new Map()
  for (const f of fresh.features) {
    const l = f.properties.line
    if (!refetch.has(l)) throw new Error(`fresh fetch has features of ${l}, which is not in --lines`)
    if (!freshBy.has(l)) freshBy.set(l, [])
    freshBy.get(l).push(f)
  }
  const warnings = []
  for (const l of Array.from(refetch))
    if (!freshBy.has(l)) warnings.push(`no fresh features for ${l}; its existing features are kept`)
  const replaced = (l) => freshBy.has(l)
  const out = []
  const inserted = new Set()
  const stats = {}
  const st = (l) => (stats[l] = stats[l] || { untouched: 0, oldOsm: 0, keptSrc: 0, droppedFills: 0, fresh: 0, gaps: 0 })
  const insertFresh = (l) => {
    if (inserted.has(l)) return
    inserted.add(l)
    for (const g of freshBy.get(l)) { out.push(g); st(l).fresh++ }
  }
  for (const f of base.features) {
    const l = f.properties.line
    if (!replaced(l)) { out.push(f); st(l).untouched++; continue }
    const src = f.properties.src
    if (src === GRAPH_ROUTED) { st(l).droppedFills++; continue }
    if (src) { out.push(f); st(l).keptSrc++; continue }
    st(l).oldOsm++
    insertFresh(l)
  }
  for (const l of Array.from(freshBy.keys())) insertFresh(l)
  for (const gaps of gapsList)
    for (const f of gaps.features) { out.push(f); st(f.properties.line).gaps++ }
  return { fc: { ...base, features: out }, stats, warnings }
}

function main() {
  const argv = process.argv.slice(2)
  const one = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null }
  const many = (flag) => argv.flatMap((a, i) => (a === flag ? [argv[i + 1]] : []))
  const BASE = one('--base'), FRESH = one('--fresh'), OUT = one('--out')
  const LINES = (one('--lines') || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!BASE || !FRESH || !OUT || !LINES.length) {
    console.error('usage: merge-osm-routes.js --base routes.osm.json --fresh fresh.osm.json --lines A,B [--gaps gaps.json ...] --out OUT')
    process.exit(2)
  }
  const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
  const { fc, stats, warnings } = mergeOsmRoutes(read(BASE), read(FRESH), LINES, many('--gaps').map(read))
  fs.writeFileSync(OUT, JSON.stringify(fc))
  for (const l of Object.keys(stats).filter((k) => !stats[k].untouched || LINES.includes(k)))
    console.log(`  ${l.padEnd(22)} ${JSON.stringify(stats[l])}`)
  for (const w of warnings) console.log(`WARNING: ${w}`)
  console.log(`wrote ${OUT}: ${fc.features.length} features`)
}

if (require.main === module) main()
else module.exports = { mergeOsmRoutes }

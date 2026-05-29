#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * snap-markers.js — Idea B. Move each station marker onto the nearest point of
 * its OWN line's baked geometry, so markers sit ON the ribbons instead of the
 * lines being welded to the markers (which we removed via build-ribbons' de-weld
 * pass). Single-line stations (Angel, Oval, Kennington, Marylebone …) land
 * exactly on their line; an interchange's per-line points each snap to that
 * line's centreline (they cluster at the corridor centre, where the pie sits).
 *
 * Only snaps when the nearest point is within SNAP_MAX (else the line geometry
 * is too far/unreliable and we keep the true station position).
 *
 * Reads routes.json (line geometry) + features.json (station Points), writes
 * features.json in place (backs the original up to features.preribbons.json).
 *
 * Usage: node scripts/snap-markers.js
 */
const fs = require('fs')
const path = require('path')

const DATA = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')
const SNAP_MAX = 60 // m — keep the true position if the line is farther than this

const M_LAT = 111320
const M_LNG = 69300
const X = (c) => c[0] * M_LNG
const Y = (c) => c[1] * M_LAT

const routes = JSON.parse(fs.readFileSync(path.join(DATA, 'routes.json'), 'utf8'))
const byLine = new Map()
for (const f of routes.features) {
  if (!f.geometry || f.geometry.type !== 'LineString') continue
  const l = f.properties.line
  if (!byLine.has(l)) byLine.set(l, [])
  byLine.get(l).push(f.geometry.coordinates)
}

// nearest point on a line's polylines to metric point p -> {ll, d}
function nearestOnLine(p, polys) {
  let best = Infinity
  let ll = null
  for (const c of polys) {
    for (let i = 1; i < c.length; i++) {
      const ax = X(c[i - 1]), ay = Y(c[i - 1]), bx = X(c[i]), by = Y(c[i])
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
      let t = L === 0 ? 0 : ((p[0] - ax) * dx + (p[1] - ay) * dy) / L
      t = Math.max(0, Math.min(1, t))
      const cx = ax + t * dx, cy = ay + t * dy
      const d = Math.hypot(cx - p[0], cy - p[1])
      if (d < best) { best = d; ll = [cx / M_LNG, cy / M_LAT] }
    }
  }
  return { ll, d: best }
}

const features = JSON.parse(fs.readFileSync(path.join(DATA, 'features.json'), 'utf8'))
let snapped = 0, kept = 0, noline = 0
const round = (v) => Math.round(v * 1e6) / 1e6
for (const f of features.features) {
  if (!f.geometry || f.geometry.type !== 'Point') continue
  const line = f.properties.line
  const polys = byLine.get(line)
  if (!polys) { noline++; continue }
  const p = [X(f.geometry.coordinates), Y(f.geometry.coordinates)]
  const nr = nearestOnLine(p, polys)
  if (nr.ll && nr.d <= SNAP_MAX) {
    f.geometry.coordinates = [round(nr.ll[0]), round(nr.ll[1])]
    snapped++
  } else kept++
}

const backup = path.join(DATA, 'features.preribbons.json')
if (!fs.existsSync(backup)) {
  fs.copyFileSync(path.join(DATA, 'features.json'), backup)
  console.log('Backed up original -> ', path.relative(process.cwd(), backup))
}
fs.writeFileSync(path.join(DATA, 'features.json'), JSON.stringify(features))
console.log(`Snapped ${snapped} markers onto their line; kept ${kept} (line >${SNAP_MAX}m); ${noline} with no line geometry.`)

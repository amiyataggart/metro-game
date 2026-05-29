#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * The OSM-derived Thameslink route only reaches Cambridge (~52.19N); the
 * northern Peterborough branch (Arlesey → ... → Peterborough) has stations but
 * no line. Reconstruct that branch from the station coordinates and append it
 * to routes.json, joined to the nearest existing Thameslink-route vertex so it
 * connects. Straight segments between stations (it's a fix for visibility, not
 * a track-faithful trace). Idempotent: skips if the route already reaches it.
 */
const fs = require('fs')
const path = require('path')

const DATA = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')
const ROUTES = path.join(DATA, 'routes.json')
const FEATURES = path.join(DATA, 'features.json')

const BRANCH = ['Arlesey', 'Biggleswade', 'Sandy', 'St Neots', 'Huntingdon', 'Peterborough']
const M_LAT = 111320
const M_LNG = 69300

function main() {
  const routes = JSON.parse(fs.readFileSync(ROUTES, 'utf8'))
  const feats = JSON.parse(fs.readFileSync(FEATURES, 'utf8'))

  const tlRouteFeatures = routes.features.filter((f) => f.properties.line === 'Thameslink')
  const maxLat = Math.max(
    ...tlRouteFeatures.flatMap((f) => f.geometry.coordinates.map((c) => c[1])),
  )
  if (maxLat > 52.4) {
    console.log(`Thameslink route already reaches ${maxLat.toFixed(3)}N — nothing to do.`)
    return
  }

  // station coords by name (Thameslink)
  const coordOf = {}
  for (const f of feats.features) {
    if (f.properties.line === 'Thameslink' && BRANCH.includes(f.properties.name)) {
      coordOf[f.properties.name] = f.geometry.coordinates
    }
  }
  const missing = BRANCH.filter((n) => !coordOf[n])
  if (missing.length) {
    console.warn('  (warn) missing station coords for:', missing.join(', '))
  }
  const branchCoords = BRANCH.filter((n) => coordOf[n]).map((n) => coordOf[n])

  // connect the southern end to the nearest existing Thameslink-route vertex
  const all = tlRouteFeatures.flatMap((f) => f.geometry.coordinates)
  const first = branchCoords[0]
  let best = null
  let bestD = Infinity
  for (const c of all) {
    const d = Math.hypot((c[0] - first[0]) * M_LNG, (c[1] - first[1]) * M_LAT)
    if (d < bestD) { bestD = d; best = c }
  }
  const coords = best ? [best.slice(), ...branchCoords] : branchCoords
  console.log(`Connecting Peterborough branch to route vertex ${best.map((v) => v.toFixed(4))} (${(bestD / 1000).toFixed(1)}km).`)

  const template = tlRouteFeatures[0]
  routes.features.push({
    type: 'Feature',
    properties: {
      line: 'Thameslink',
      color: template.properties.color,
      order: template.properties.order,
      offset: 0,
      branch: 'peterborough',
    },
    geometry: { type: 'LineString', coordinates: coords },
  })

  fs.writeFileSync(ROUTES, JSON.stringify(routes))
  console.log(
    `Added Peterborough branch (${coords.length} pts, to ${branchCoords[branchCoords.length - 1].map((v) => v.toFixed(3))}). routes.json now ${routes.features.length} features.`,
  )
}

main()

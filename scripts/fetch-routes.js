#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Builds routes.json: GeoJSON LineString features for each rail line.
 *
 *   - TfL Unified API for 19 lines (Underground, Overground (six 2024 names),
 *     Elizabeth line, DLR). Endpoint /Line/{id}/Route/Sequence/{dir} returns a
 *     `lineStrings` array of JSON-encoded MultiLineString coordinate sets.
 *   - Thameslink isn't on TfL — we draw straight LineStrings between
 *     consecutive stations of each branch, using coords from features.json.
 *
 * Output: src/app/(game)/london/data/routes.json
 */

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')
const FEATURES = path.join(DATA_DIR, 'features.json')
const DST = path.join(DATA_DIR, 'routes.json')

const LINE_COLORS = {
  Bakerloo: '#b36305',
  Central: '#e32017',
  Circle: '#ffd329',
  District: '#00782a',
  HammersmithAndCity: '#f3a9bb',
  Jubilee: '#a0a5a9',
  Metropolitan: '#9b0056',
  Northern: '#000000',
  Piccadilly: '#003688',
  Victoria: '#0098d4',
  WaterlooAndCity: '#84CAB3',
  ElizabethLine: '#6950A1',
  DLR: '#00afad',
  Lioness: '#FAA61A',
  Mildmay: '#3DB6E1',
  Windrush: '#DA291C',
  Weaver: '#823065',
  Suffragette: '#5BBD72',
  Liberty: '#7C878E',
  Thameslink: '#DD3399',
}

const LINE_ORDER = {
  Bakerloo: 0, Central: 1, Circle: 2, District: 3, HammersmithAndCity: 4,
  Jubilee: 5, Metropolitan: 6, Northern: 7, Piccadilly: 8, Victoria: 9,
  WaterlooAndCity: 10, ElizabethLine: 11, DLR: 12, Lioness: 13, Mildmay: 14,
  Windrush: 15, Weaver: 16, Suffragette: 17, Liberty: 18, Thameslink: 19,
}

const TFL_LINES = {
  bakerloo: 'Bakerloo',
  central: 'Central',
  circle: 'Circle',
  district: 'District',
  'hammersmith-city': 'HammersmithAndCity',
  jubilee: 'Jubilee',
  metropolitan: 'Metropolitan',
  northern: 'Northern',
  piccadilly: 'Piccadilly',
  victoria: 'Victoria',
  'waterloo-city': 'WaterlooAndCity',
  elizabeth: 'ElizabethLine',
  dlr: 'DLR',
  lioness: 'Lioness',
  mildmay: 'Mildmay',
  windrush: 'Windrush',
  weaver: 'Weaver',
  suffragette: 'Suffragette',
  liberty: 'Liberty',
}

// Ordered station sequences for Thameslink branches.
// Each entry yields one LineString from concatenated station coords.
const THAMESLINK_BRANCHES = [
  // Bedford → London Bridge (core spine)
  [
    'Bedford',
    'Flitwick',
    'Harlington',
    'Leagrave',
    'Luton',
    'Luton Airport Parkway',
    'Harpenden',
    'St Albans City',
    'Radlett',
    'Elstree & Borehamwood',
    'Mill Hill Broadway',
    'Hendon',
    'Cricklewood',
    'West Hampstead Thameslink',
    'Kentish Town',
    'St Pancras International',
    'Farringdon',
    'City Thameslink',
    'London Blackfriars',
    'London Bridge',
  ],
  // Blackfriars → Elephant & Castle → south branches
  [
    'London Blackfriars',
    'Elephant & Castle',
    'Loughborough Junction',
    'Herne Hill',
    'Tulse Hill',
    'Streatham',
  ],
  // Wimbledon Loop (Sutton via Wimbledon)
  [
    'Streatham',
    'Tooting',
    'Haydons Road',
    'Wimbledon',
    'Sutton',
    'West Sutton',
    'Sutton Common',
    'St Helier',
    'Morden South',
  ],
  // Sutton via Mitcham
  [
    'Streatham',
    'Mitcham Eastfields',
    'Mitcham Junction',
    'Hackbridge',
    'Carshalton',
    'Sutton',
  ],
  // Catford Loop: London Bridge → ... → Bromley South → Orpington
  [
    'London Bridge',
    'Nunhead',
    'Crofton Park',
    'Catford',
    'Bellingham',
    'Beckenham Hill',
    'Ravensbourne',
    'Shortlands',
    'Bromley South',
  ],
  // Penge / Kent House spur off the Catford Loop (rejoins near Beckenham)
  [
    'Loughborough Junction',
    'Penge East',
    'Kent House',
    'Beckenham Hill',
  ],
  // Bromley South → Orpington
  [
    'Bromley South',
    'Bickley',
    'Petts Wood',
    'Orpington',
  ],
  // Brighton main line — South of London Bridge to East Croydon
  [
    'London Bridge',
    'East Croydon',
  ],
]

async function fetchTflLine(tflId, lineKey) {
  const dirs = ['inbound', 'outbound']
  const featuresOut = []
  const seen = new Set()
  for (const dir of dirs) {
    const url = `https://api.tfl.gov.uk/Line/${tflId}/Route/Sequence/${dir}`
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`  ${tflId} ${dir}: HTTP ${res.status}`)
      continue
    }
    const data = await res.json()
    const lineStrings = data.lineStrings || []
    for (const raw of lineStrings) {
      const parsed = JSON.parse(raw)
      // parsed is an array of LineString coord arrays (i.e. MultiLineString coords).
      for (const coords of parsed) {
        if (!Array.isArray(coords) || coords.length < 2) continue
        // De-dup by start+end signature so inbound and outbound don't double up.
        const sig = `${coords[0]}_${coords[coords.length - 1]}_${coords.length}`
        if (seen.has(sig)) continue
        seen.add(sig)
        featuresOut.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {
            line: lineKey,
            color: LINE_COLORS[lineKey],
            order: LINE_ORDER[lineKey],
          },
        })
      }
    }
  }
  return featuresOut
}

function buildThameslinkFeatures(featuresJson) {
  const coordsByName = {}
  for (const f of featuresJson.features) {
    if (f.geometry?.type !== 'Point') continue
    // Prefer the Thameslink-tagged feature's coords; fall back to any other line.
    const name = f.properties.name
    if (!coordsByName[name] || f.properties.line === 'Thameslink') {
      coordsByName[name] = f.geometry.coordinates
    }
  }

  const features = []
  for (const branch of THAMESLINK_BRANCHES) {
    const coords = []
    for (const name of branch) {
      const c = coordsByName[name]
      if (!c) {
        console.error(`  Thameslink branch missing station: ${name}`)
        continue
      }
      coords.push(c)
    }
    if (coords.length < 2) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        line: 'Thameslink',
        color: LINE_COLORS.Thameslink,
        order: LINE_ORDER.Thameslink,
      },
    })
  }
  return features
}

async function main() {
  const featuresJson = JSON.parse(fs.readFileSync(FEATURES, 'utf8'))
  const out = []

  console.log('Fetching from TfL Unified API...')
  for (const [tflId, lineKey] of Object.entries(TFL_LINES)) {
    process.stdout.write(`  ${tflId.padEnd(18)} -> ${lineKey.padEnd(20)} `)
    try {
      const features = await fetchTflLine(tflId, lineKey)
      out.push(...features)
      console.log(`${features.length} segment(s)`)
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
    }
  }

  console.log('\nBuilding Thameslink LineStrings from station sequences...')
  const tl = buildThameslinkFeatures(featuresJson)
  out.push(...tl)
  console.log(`  Thameslink: ${tl.length} segment(s)`)

  const fc = { type: 'FeatureCollection', features: out }
  fs.writeFileSync(DST, JSON.stringify(fc))
  console.log(`\nWrote ${out.length} LineString feature(s) to ${path.relative(process.cwd(), DST)}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

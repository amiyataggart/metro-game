#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Builds the final features.json:
 *   1. Splits the original metro-memory "Overground" line into the six 2024
 *      Overground line names (Lioness, Mildmay, Windrush, Weaver, Suffragette,
 *      Liberty).
 *   2. Merges in National Rail TOC stations from stations-extras.json
 *      (produced by fetch-osm-routes.js): Thameslink, Great Northern, Gatwick
 *      Express, Southern.
 *
 * Input:
 *   src/app/(game)/london/data/features.original.json
 *   src/app/(game)/london/data/stations-extras.json   (optional)
 * Output:
 *   src/app/(game)/london/data/features.json
 */

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')
const SRC = path.join(DATA_DIR, 'features.original.json')
const EXTRAS = path.join(DATA_DIR, 'stations-extras.json')
const DST = path.join(DATA_DIR, 'features.json')

// Lines for which features.original.json is authoritative — we ignore the
// matching entries in stations-extras.json so we don't double-add stations
// that already exist with their canonical names/coords from upstream.
const ORIGINAL_LINES = new Set([
  'Bakerloo','Central','Circle','District','HammersmithAndCity','Jubilee',
  'Metropolitan','Northern','Piccadilly','Victoria','WaterlooAndCity',
  'ElizabethLine','DLR',
  'Lioness','Mildmay','Windrush','Weaver','Suffragette','Liberty',
])

// Mapping for splitting upstream `line: "Overground"` features.
const OVERGROUND_LINES = {
  Lioness: ['Euston','South Hampstead','Kilburn High Road',"Queen's Park",'Kensal Green','Willesden Junction','Harlesden','Stonebridge Park','Wembley Central','North Wembley','South Kenton','Kenton','Harrow & Wealdstone','Headstone Lane','Hatch End','Carpenders Park','Bushey','Watford High Street','Watford Junction'],
  Mildmay: ['Stratford','Hackney Wick','Homerton','Hackney Central','Dalston Kingsland','Canonbury','Highbury & Islington','Caledonian Road & Barnsbury','Camden Road','Kentish Town West','Gospel Oak','Hampstead Heath','Finchley Road & Frognal','West Hampstead','Brondesbury','Brondesbury Park','Kensal Rise','Willesden Junction','Acton Central','South Acton','Gunnersbury','Kew Gardens','Richmond',"Shepherd's Bush",'Kensington (Olympia)','West Brompton','Imperial Wharf','Clapham Junction'],
  Windrush: ['Highbury & Islington','Canonbury','Dalston Junction','Haggerston','Hoxton','Shoreditch High Street','Whitechapel','Shadwell','Wapping','Rotherhithe','Canada Water','Surrey Quays','New Cross','New Cross Gate','Brockley','Honor Oak Park','Forest Hill','Sydenham','Crystal Palace','Penge West','Anerley','Norwood Junction','West Croydon','Queens Road Peckham','Peckham Rye','Denmark Hill','Clapham High Street','Wandsworth Road','Clapham Junction'],
  Weaver: ['Liverpool Street','Bethnal Green','Cambridge Heath','London Fields','Hackney Downs','Clapton','St James Street','Walthamstow Central','Wood Street','Highams Park','Chingford','Rectory Road','Stoke Newington','Stamford Hill','Seven Sisters','Bruce Grove','White Hart Lane','Silver Street','Edmonton Green','Bush Hill Park','Enfield Town','Southbury','Turkey Street','Theobalds Grove','Cheshunt'],
  Suffragette: ['Gospel Oak','Upper Holloway','Crouch Hill','Harringay Green Lanes','South Tottenham','Blackhorse Road',"Walthamstow Queen's Road",'Leyton Midland Road','Leytonstone High Road','Wanstead Park','Woodgrange Park','Barking','Barking Riverside'],
  Liberty: ['Romford','Emerson Park','Upminster'],
}

const stationToLines = {}
for (const [k, stations] of Object.entries(OVERGROUND_LINES)) {
  for (const name of stations) {
    if (!stationToLines[name]) stationToLines[name] = []
    stationToLines[name].push(k)
  }
}

// Common alternate names — applied to ALL features sharing the station name.
// Helps the fuzzy matcher accept reasonable variants the upstream data /
// OSM tagging don't include (e.g. "St Pauls" without apostrophe is handled
// by the normalizer, but "Kings Cross" without "St Pancras" needs an alt).
const NAME_ALIASES = {
  // St Pancras International is the Thameslink/Eurostar station — kept
  // distinct from the Tube station 'King's Cross St Pancras'. Only short
  // forms of its own name go here; do NOT add 'Kings Cross' variants or
  // typing them will match the wrong station.
  'St Pancras International': ['St Pancras', 'St Pancras Intl', 'London St Pancras'],
  'London Blackfriars': ['Blackfriars'],
  'London Bridge': [],
  'Elephant & Castle': ['Elephant and Castle', 'Elephant'],
  'Elstree & Borehamwood': ['Elstree', 'Borehamwood', 'Elstree and Borehamwood'],
  'St Albans City': ['St Albans', 'Saint Albans'],
  'Harrow & Wealdstone': ['Harrow and Wealdstone'],
  'Highbury & Islington': ['Highbury and Islington'],
}

// ---------- load ----------
const original = JSON.parse(fs.readFileSync(SRC, 'utf8'))
const extras = fs.existsSync(EXTRAS) ? JSON.parse(fs.readFileSync(EXTRAS, 'utf8')) : []

let nextId = 0
for (const f of original.features) {
  if (typeof f.id === 'number' && f.id >= nextId) nextId = f.id + 1
}

const out = []
const missing = new Set()

// ---------- Pass 1: split Overground ----------
for (const f of original.features) {
  if (f.properties.line !== 'Overground') {
    out.push(f)
    continue
  }
  const name = f.properties.name
  const lines = stationToLines[name]
  if (!lines || lines.length === 0) {
    missing.add(name)
    continue
  }
  const [primary, ...rest] = lines
  out.push({ ...f, properties: { ...f.properties, line: primary } })
  for (const lineKey of rest) {
    const id = nextId++
    out.push({
      ...f,
      id,
      properties: { ...f.properties, line: lineKey, id },
    })
  }
}

// ---------- Pass 2: apply aliases ----------
for (const f of out) {
  const name = f.properties.name
  const aliases = NAME_ALIASES[name]
  if (!aliases || aliases.length === 0) continue
  const existing = Array.isArray(f.properties.alternate_names) ? f.properties.alternate_names : []
  f.properties.alternate_names = Array.from(new Set([...existing, ...aliases]))
}

// ---------- Pass 3: merge in stations-extras (new TOCs only) ----------
const have = new Set(out.map((f) => `${f.properties.name}|${f.properties.line}`))
let addedExtras = 0
for (const s of extras) {
  if (ORIGINAL_LINES.has(s.line)) continue // upstream data wins for these lines
  const key = `${s.name}|${s.line}`
  if (have.has(key)) continue
  have.add(key)

  const id = nextId++
  const props = { id, name: s.name, line: s.line }
  const aliases = []
  if (Array.isArray(s.alternate_names)) aliases.push(...s.alternate_names)
  if (NAME_ALIASES[s.name]) aliases.push(...NAME_ALIASES[s.name])
  if (aliases.length) props.alternate_names = Array.from(new Set(aliases))

  out.push({
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: s.coords },
    properties: props,
  })
  addedExtras++
}

// ---------- summary ----------
const stationsPerLine = {}
for (const f of out) {
  const l = f.properties.line
  if (!l) continue
  stationsPerLine[l] = (stationsPerLine[l] || 0) + 1
}

fs.writeFileSync(
  DST,
  JSON.stringify({
    type: 'FeatureCollection',
    features: out,
    properties: { totalStations: out.length, stationsPerLine },
  }, null, 2),
)

console.log(`Wrote ${out.length} feature(s) to ${path.relative(process.cwd(), DST)}.`)
console.log(`Added ${addedExtras} new-TOC station(s) from ${path.relative(process.cwd(), EXTRAS)}.`)
console.log('Stations per line:')
for (const [k, n] of Object.entries(stationsPerLine).sort()) {
  console.log(`  ${k.padEnd(22)} ${n}`)
}
if (missing.size > 0) {
  console.error(`\nWARNING: ${missing.size} Overground station(s) not mapped:`)
  for (const m of [...missing].sort()) console.error(`  - ${m}`)
}

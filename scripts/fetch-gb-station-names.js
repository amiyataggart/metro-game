#!/usr/bin/env node
/* eslint-disable no-console */
// Fetch every railway station/halt name in Great Britain from OSM. Used as
// matcher decoys so a typo never maps a real (out-of-game) station onto a
// game station. Data © OpenStreetMap contributors, ODbL.
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data', 'gb-station-names.json')
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const QUERY = `[out:json][timeout:240];
area["ISO3166-1"="GB"][admin_level=2]->.gb;
nwr["railway"~"^(station|halt)$"]["name"](area.gb);
out tags;`

async function main() {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'tube-memory-dev/0.1 (offline build)',
          Accept: '*/*',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'data=' + encodeURIComponent(QUERY),
      })
      const text = await res.text()
      if (!text.trimStart().startsWith('{')) throw new Error(`non-JSON from ${url}`)
      const names = new Set()
      for (const el of JSON.parse(text).elements) {
        const t = el.tags || {}
        if (/disused|abandoned|razed|proposed|construction/.test(Object.keys(t).join(' '))) continue
        names.add(t.name)
      }
      const sorted = [...names].sort((a, b) => a.localeCompare(b))
      fs.writeFileSync(OUT, JSON.stringify(sorted, null, 0) + '\n')
      console.log(`wrote ${sorted.length} names -> ${OUT}`)
      return
    } catch (e) {
      console.warn(String(e))
    }
  }
  process.exit(1)
}
main()

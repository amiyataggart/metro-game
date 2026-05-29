#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Drop the redundant "London " prefix from National-Rail station names so they
 * match the Tube naming (and group as one interchange), keeping the old name as
 * a search alias. Genuine names (London Bridge, London City Airport, London
 * Fields, London Road (Brighton)) are left untouched. Idempotent.
 */
const fs = require('fs')
const path = require('path')

const P = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data', 'features.json')

// exact-match renames
const RENAMES = {
  'London Blackfriars': 'Blackfriars',
  'London Victoria': 'Victoria',
  'London St Pancras': 'St Pancras International',
}
// King's Cross uses a curly apostrophe in the data ("King’s Cross St Pancras")
const KINGS_CROSS_RE = /^London King.s Cross$/

function resolve(name) {
  if (RENAMES[name]) return RENAMES[name]
  if (KINGS_CROSS_RE.test(name)) return 'King’s Cross'
  return null
}

function main() {
  const d = JSON.parse(fs.readFileSync(P, 'utf8'))
  let n = 0
  for (const f of d.features) {
    const nm = f.properties.name
    const target = resolve(nm)
    if (!target || target === nm) continue
    const alts = new Set(f.properties.alternate_names || [])
    alts.add(nm)
    f.properties.alternate_names = [...alts]
    f.properties.name = target
    n++
  }
  fs.writeFileSync(P, JSON.stringify(d))
  console.log(`Renamed ${n} feature(s).`)
  const names = [...new Set(d.features.map((f) => f.properties.name))]
  for (const x of ['Blackfriars', 'Victoria', 'St Pancras International', 'King’s Cross']) {
    console.log(`  has "${x}": ${names.includes(x)}`)
  }
  console.log('  remaining "London " names:', names.filter((x) => /^London /.test(x)).join(', '))
}

main()

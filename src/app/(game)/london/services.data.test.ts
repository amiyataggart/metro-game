import { describe, expect, it } from 'vitest'
import features from './data/features.json'
import idLedger from './data/station-ids.json'
import { SERVICES } from './services'

type F = { id: number; properties: { id: number; name: string; line: string; alternate_names?: string[] } }
const all = (features as unknown as { features: F[] }).features
const key = (name: string, line: string) => `${name}|${line}`

describe('features.json matches the service tables', () => {
  const pairs = new Set(all.map((f) => key(f.properties.name, f.properties.line)))
  it('every service stop exists on its line', () => {
    const missing = SERVICES.flatMap((s) =>
      s.stops.filter((n) => !pairs.has(key(n, s.line))).map((n) => `${s.line}: ${n} (${s.name})`),
    )
    expect(missing).toEqual([])
  })
  it('every (station, line) pair is called at by some service of that line', () => {
    const served = new Set(SERVICES.flatMap((s) => s.stops.map((n) => key(n, s.line))))
    expect(Array.from(pairs).filter((p) => !served.has(p))).toEqual([])
  })
  it('one feature per (station, line) pair, unless a service calls twice (Circle at Paddington)', () => {
    const count = new Map<string, number>()
    for (const f of all) count.set(key(f.properties.name, f.properties.line), (count.get(key(f.properties.name, f.properties.line)) ?? 0) + 1)
    const calls = (k: string) =>
      Math.max(...SERVICES.map((s) => s.stops.filter((n) => key(n, s.line) === k).length))
    expect(Array.from(count).filter(([k, n]) => n > 1 && calls(k) < n)).toEqual([])
  })
  it('Southeastern runs the Blackheath – Charlton spur (OSM relation 452776)', () => {
    const runs = SERVICES.some(
      (s) => s.line === 'Southeastern' && s.stops.some((n, i) => n === 'Blackheath' && s.stops[i + 1] === 'Charlton'),
    )
    expect(runs).toBe(true)
  })
  it('no platform-numbered station names', () => {
    expect(all.map((f) => f.properties.name).filter((n) => /platform \d/i.test(n))).toEqual([])
  })
  it('ids are unique and mirrored on the feature', () => {
    expect(new Set(all.map((f) => f.properties.id)).size).toBe(all.length)
    expect(all.filter((f) => f.id !== f.properties.id)).toEqual([])
  })
})

// Players' found-progress is keyed by feature id, so a (name, line) pair must
// keep its id across rebuilds and an id, once used, must never be handed to a
// different station. data/station-ids.json is the append-only id ledger
// (every pair ever assigned, including retired ones, and the id high-water
// mark), seeded from the pre-Task-8 features.json and maintained by
// scripts/build-stations.js. User-approved renames map an old pair onto its
// new name; a merge keeps the lower of the merged ids.
const RENAMES: Record<string, string> = {
  [key('Dorking Main', 'Southern')]: 'Dorking',
  [key('St Margarets', 'SouthWesternRailway')]: 'St Margarets (London)',
  [key('St Margarets', 'GreaterAnglia')]: 'St Margarets (Herts)',
  [key('Ashford Platform 1', 'SouthWesternRailway')]: 'Ashford (Surrey)',
  [key('Ashford Platform 2', 'SouthWesternRailway')]: 'Ashford (Surrey)',
  [key('Ebbsfleet International (domestic)', 'SoutheasternHighSpeed')]: 'Ebbsfleet International',
}

describe('station ids are preserved (id ledger)', () => {
  const ledger = idLedger as { highWater: number; pairs: Record<string, number[]> }
  const now = new Map<string, number[]>()
  for (const f of all) {
    const k = key(f.properties.name, f.properties.line)
    now.set(k, [...(now.get(k) ?? []), f.properties.id].sort((a, b) => a - b))
  }
  it('every current (name, line) pair carries exactly its ledger ids', () => {
    const bad = Array.from(now)
      .filter(([k, ids]) => (ledger.pairs[k] ?? []).join() !== ids.join())
      .map(([k, ids]) => `${k}: ${ids} (ledger ${ledger.pairs[k]})`)
    expect(bad).toEqual([])
  })
  it('no id is shared with another (retired) pair, except an approved rename/merge', () => {
    const owners = new Map<number, string[]>()
    for (const [k, ids] of Object.entries(ledger.pairs))
      for (const id of ids) owners.set(id, [...(owners.get(id) ?? []), k])
    const bad: string[] = []
    for (const [k, ids] of Array.from(now))
      for (const id of ids)
        for (const o of owners.get(id) ?? [])
          if (o !== k && key(RENAMES[o] ?? '', o.split('|')[1]) !== k) bad.push(`${id}: ${k} vs ${o}`)
    expect(bad).toEqual([])
  })
  it('every id is at or below the high-water mark', () => {
    const ledgerMax = Math.max(...Object.values(ledger.pairs).flat())
    expect(ledger.highWater).toBeGreaterThanOrEqual(ledgerMax)
    expect(all.filter((f) => f.properties.id > ledger.highWater).map((f) => f.properties.id)).toEqual([])
  })
  it('the ledger records the pre-Task-8 network (retired pairs keep their ids reserved)', () => {
    expect(ledger.pairs[key('Dorking Main', 'Southern')]).toEqual(ledger.pairs[key('Dorking', 'Southern')])
    expect(ledger.pairs[key('Ashford Platform 2', 'SouthWesternRailway')]).toEqual([1436])
    // e.g. Peterborough (Thameslink) was dropped by the scope in Task 8
    expect(ledger.pairs[key('Peterborough', 'Thameslink')]?.length).toBe(1)
    expect(Object.keys(ledger.pairs).length).toBeGreaterThanOrEqual(1630)
  })
  it('renamed stations keep their old name as an alternate (Dorking Main)', () => {
    const dorking = all.find((f) => f.properties.name === 'Dorking' && f.properties.line === 'Southern')
    expect(dorking?.properties.alternate_names ?? []).toContain('Dorking Main')
  })
})

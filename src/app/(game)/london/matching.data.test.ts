import { describe, expect, it } from 'vitest'
import features from './data/features.json'
import stationNames from './data/gb-station-names.json'
import { LONDON_ALIASES, EXTRA_DECOYS } from './data/aliases'
import { createMatcher, normalize, osaWithin1, restrictToEnabled, stripLondonPrefix, MIN_TYPO_LENGTH, StationRecord } from '@/lib/matching'
import { defaultEnabledLines } from '@/lib/defaultEnabledLines'
import { LINES } from './config'

type F = { properties: { id: number | null; name: string; line?: string; alternate_names?: string[] } }
const allFeatures = (features as unknown as { features: F[] }).features
const toRecord = (f: F): StationRecord => ({
  id: Number(f.properties.id), name: f.properties.name, alternate_names: f.properties.alternate_names,
})
const stations: StationRecord[] = allFeatures.map(toRecord)
// Mirrors MATCHING.decoyNames in config.ts.
const decoys: string[] = [...(stationNames as string[]), ...EXTRA_DECOYS]
const m = createMatcher(stations, LONDON_ALIASES, decoys)
const namesOf = (q: string) => { const r = m(q); return r.kind === 'match' ? r.names : r.kind }
const idsOf = (q: string) => { const r = m(q); return r.kind === 'match' ? r.ids : [] }
const uniqueNames = Array.from(new Set(stations.map((s) => s.name)))

describe('reachability', () => {
  it('every station id is reachable by its own name', () => {
    const missing = stations.filter((s) => !idsOf(s.name).includes(s.id)).map((s) => s.name)
    expect(missing).toEqual([])
  })
  it('every alternate name reaches its station', () => {
    const bad = stations.flatMap((s) => (s.alternate_names ?? []).filter((a) => !idsOf(a).includes(s.id)).map((a) => `${s.name} <- ${a}`))
    expect(bad).toEqual([])
  })
  it('no ambiguous entry shadows an exact station name', () => {
    const exact = new Set(uniqueNames.map(normalize))
    expect(LONDON_ALIASES.ambiguous.filter((a) => exact.has(normalize(a)))).toEqual([])
  })
})

describe('no false positives', () => {
  it('an exact name only lights stations of its own group', () => {
    const bad: string[] = []
    for (const n of uniqueNames) {
      const r = m(n)
      if (r.kind !== 'match') { bad.push(`${n}: ${r.kind}`); continue }
      for (const other of r.names) {
        if (other === n) continue
        const sameCanon = normalize(other.replace(/^London /, '')) === normalize(n.replace(/^London /, ''))
        const curated = LONDON_ALIASES.groups.some((g) => g.includes(n) && g.includes(other))
        if (!sameCanon && !curated) bad.push(`${n} -> ${other}`)
      }
    }
    expect(bad).toEqual([])
  })
})

describe('decoys', () => {
  it('no exact decoy key lights a wrong station (none, or ambiguous for game prefixes)', () => {
    const gameKeys = new Set(stations.map((x) => normalize(x.name)))
    // A curated alias (e.g. 'st margarets' -> both St Margarets) is a deliberate match.
    const aliasKeys = new Set(Object.entries(LONDON_ALIASES.aliases)
      .filter(([, target]) => stations.some((s) => s.name === target)).map(([a]) => normalize(a)))
    const bad: string[] = []
    for (const d of decoys) {
      const k = normalize(d)
      if (!k || gameKeys.has(k) || aliasKeys.has(k)) continue
      const r = m(d)
      if (r.kind === 'none') continue
      // Legitimate non-none outcomes: the decoy is a game-prefix partial (ambiguous), or it is a
      // game station spelled with a leading "London " / trailing "Station" (match of that station).
      if (r.kind === 'ambiguous') continue
      const reduced = normalize((stripLondonPrefix(d.replace(/\s+(station|stn)\s*$/i, '')) ?? d.replace(/\s+(station|stn)\s*$/i, '')))
      const own = r.names.some((n) => normalize(n) === reduced || normalize(stripLondonPrefix(n) ?? n) === reduced)
      if (!own) bad.push(`${d}: ${r.kind} ${r.names.join('|')}`)
    }
    expect(bad).toEqual([])
  })
})

describe('golden queries', () => {
  const same = (q: string, want: string[]) => expect(new Set(namesOf(q) as string[])).toEqual(new Set(want))
  it('London-prefixed termini light together', () => {
    same('victoria', ['Victoria', 'London Victoria'])
    same('london victoria', ['Victoria', 'London Victoria'])
    same('charing cross', ['Charing Cross', 'London Charing Cross'])
    same('waterloo', ['Waterloo', 'London Waterloo'])
    same('liverpool street', ['Liverpool Street', 'London Liverpool Street'])
    same('paddington', ['Paddington', 'London Paddington'])
  })
  it("King's Cross / St Pancras group", () => {
    const want = ["King's Cross St Pancras", "London King's Cross", 'St Pancras International', 'London St Pancras']
    for (const q of ['kx', 'kings cross', 'st pancras', "king's cross st pancras"]) same(q, want)
  })
  it('distinct names stay separate', () => {
    same('waterloo east', ['Waterloo East'])
    same('barking', ['Barking'])
  })
  it('partial / prefix names never light a different station', () => {
    for (const q of ['harlow', 'chadwell', 'turnham', 'highams', 'malden', 'cobham', 'tunbridge', 'letchworth', 'tilbury', 'wood', 'bridge', 'park'])
      expect(namesOf(q), q).toMatch(/^(none|ambiguous)$/)
    for (const q of ['windsor', 'london road', 'harlow', 'chadwell', 'wood'])
      expect(namesOf(q), q).toBe('ambiguous')
  })
  it('typos of ambiguous partials are none', () => {
    for (const q of ['coydon', 'wemble', 'lcton']) expect(namesOf(q), q).toBe('none')
  })
  it('query-side London prefix and trailing station', () => {
    same('london euston', ['Euston'])
    same('victoria station', ['Victoria', 'London Victoria'])
  })
  it('KX group still joins up with the tube stations disabled', () => {
    const tube = new Set(['Bakerloo', 'Central', 'Circle', 'District', 'HammersmithAndCity', 'Jubilee',
      'Metropolitan', 'Northern', 'Piccadilly', 'Victoria', 'WaterlooAndCity'])
    const rest = allFeatures.filter((f) => !tube.has(f.properties.line ?? '')).map(toRecord)
    const m2 = createMatcher(rest, LONDON_ALIASES, decoys)
    const want = rest.filter((x) => /king.?s cross|pancras/i.test(x.name)).map((x) => x.id).sort((a, b) => a - b)
    expect(want.length).toBeGreaterThan(1)
    for (const q of ['kx', 'kings cross', 'st pancras', 'london st pancras']) {
      const r = m2(q)
      expect(r.kind, q).toBe('match')
      expect(r.kind === 'match' ? Array.from(new Set(r.ids)).sort((a, b) => a - b) : []).toEqual(Array.from(new Set(want)))
    }
  })
  it('real towns one typo from a station stay none; real typos still match', () => {
    for (const q of ['brackley', 'faringdon', 'hornsea', 'stretford']) expect(namesOf(q), q).toBe('none')
    // stations trimmed out of scope (spec §3) are decoys now, not matches
    for (const q of ['upwey', 'peterborough', 'colchester', 'basingstoke']) expect(namesOf(q), q).toBe('none')
    // an exact real (GB) station name not in the game is never accepted, even
    // one edit from a game station (user decision 2026-10-13: no "London wins")
    for (const q of ['barming', 'nottingham', 'sheffield', 'st james park', 'hamstead']) expect(namesOf(q), q).toBe('none')
  })
  it('junction abbreviations (jn / jct / junc)', () => {
    for (const q of ['watford jn', 'watford jct', 'watford junc']) same(q, ['Watford Junction'])
    for (const q of ['clapham jct', 'clapham jn']) same(q, ['Clapham Junction'])
    same('brockly', ['Brockley'])
    same('padington', ['Paddington', 'London Paddington'])
  })
  it('stripped-form prefixes and town-name aliases', () => {
    expect(namesOf('fenchurch')).toBe('ambiguous')
    same('fenchurch st', ['London Fenchurch Street'])
    same('st albans', ['St Albans City'])
    same('leigh on sea', ['Leigh-on-Sea'])
    same('borehamwood', ['Elstree & Borehamwood'])
  })
  it('typos', () => {
    expect(namesOf('barling')).toBe('none')
    expect(namesOf('maor park')).toBe('none')
    same('cambridge south', ['Cambridge South'])
    same('marlyebone', ['Marylebone', 'London Marylebone'])
    same('wimbeldon', ['Wimbledon'])
    same('clapham juntcion', ['Clapham Junction'])
    expect(namesOf('heathrow')).toBe('ambiguous')
    same('dorking', ['Dorking'])
    same('dorking main', ['Dorking'])
    same('st margarets', ['St Margarets (London)', 'St Margarets (Herts)'])
  })
})

// Exhaustive: every one-edit variant of every station name must resolve
// exactly as a brute-force oracle says.
describe('typo exhaustive', () => {
  const gameKeys = new Map<string, string>() // key -> any station name in that key's group
  for (const s of stations) gameKeys.set(normalize(s.name), s.name)
  // Every key the matcher treats as exact: names, optional-"London" forms,
  // alternate names, live aliases — plus decoys. Must mirror createMatcher.
  const keepers = new Set(LONDON_ALIASES.prefixKeepers.map(normalize))
  const gameTexts = stations.flatMap((s) => {
    const st = stripLondonPrefix(s.name)
    return [s.name, ...(st && !keepers.has(normalize(s.name)) ? [st] : []), ...(s.alternate_names ?? [])]
  })
  const aliasTexts = Object.entries(LONDON_ALIASES.aliases)
    .filter(([, target]) => stations.some((s) => s.name === target))
    .map(([alias]) => alias)
  const exactTexts = [...gameTexts, ...aliasTexts].map(normalize).filter(Boolean)
  const exactSet = new Set(exactTexts)
  const ambiguousSet = new Set(LONDON_ALIASES.ambiguous.map(normalize))
  // Leading-word prefixes of game + decoy names, minus exact keys and "london".
  const prefixSet = new Set<string>()
  for (const n of [...stations.map((s) => s.name), ...decoys]) {
    const st = stripLondonPrefix(n)
    for (const form of st && !keepers.has(normalize(n)) ? [n, st] : [n]) {
      const words = form.split(/\s+/).filter(Boolean)
      for (let i = 1; i < words.length; i++) {
        const p = normalize(words.slice(0, i).join(' '))
        if (p && p !== 'london' && !exactSet.has(p)) prefixSet.add(p)
      }
    }
  }
  // Candidate keys: exact keys, decoys, ambiguous keys, prefix keys (the last
  // three are their own pseudo-groups). Must mirror createMatcher.
  const allKeys = Array.from(new Set([...exactTexts, ...decoys.map(normalize), ...Array.from(ambiguousSet), ...Array.from(prefixSet)])).filter(Boolean)
  const byLen = new Map<number, string[]>()
  for (const k of allKeys) { if (!byLen.has(k.length)) byLen.set(k.length, []); byLen.get(k.length)!.push(k) }
  const groupOfKey = (k: string): string => { const r = m(k); return r.kind === 'match' ? r.names.slice().sort().join('|') : 'decoy:' + k }
  const keyGroupCache = new Map<string, string>()
  const kg = (k: string) => { let g = keyGroupCache.get(k); if (!g) { g = groupOfKey(k); keyGroupCache.set(k, g) } return g }
  const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const variants = (k: string): string[] => {
    const out = new Set<string>()
    for (let i = 0; i < k.length; i++) out.add(k.slice(0, i) + k.slice(i + 1))
    for (let i = 0; i + 1 < k.length; i++) out.add(k.slice(0, i) + k[i + 1] + k[i] + k.slice(i + 2))
    for (let i = 0; i <= k.length; i++) for (const c of ALPHA) {
      out.add(k.slice(0, i) + c + k.slice(i))
      if (i < k.length) out.add(k.slice(0, i) + c + k.slice(i + 1))
    }
    out.delete(k)
    return Array.from(out)
  }
  const skipKeys = new Set(allKeys) // exact / ambiguous / prefix / decoy keys: exact path, covered by goldens

  it('matches the brute-force oracle for every one-edit variant', () => {
    const failures: string[] = []
    outer: for (const key of Array.from(gameKeys.keys())) {
      for (const v of variants(key)) {
        if (skipKeys.has(v)) continue
        const got = m(v)
        let want: string | null = null
        if (v.length >= MIN_TYPO_LENGTH) {
          const groups = new Set<string>()
          for (const len of [v.length - 1, v.length, v.length + 1])
            for (const k of byLen.get(len) ?? []) if (osaWithin1(v, k)) groups.add(kg(k))
          if (groups.size === 1) { const g = Array.from(groups)[0]; if (!g.startsWith('decoy:')) want = g }
        }
        const gotG = got.kind === 'match' ? got.names.slice().sort().join('|') : null
        if (gotG !== want) failures.push(`${v}: got ${gotG} want ${want}`)
        if (failures.length > 50) break outer
      }
    }
    expect(failures).toEqual([])
  })
})

// GamePage builds ONE matcher over every station (all lines) and restricts each
// result to the enabled stations (restrictToEnabled), so curated groups and
// aliases work whatever the line selection.
describe('line selection (matcher over all stations, results restricted to enabled lines)', () => {
  const gameMatcher = createMatcher(stations, LONDON_ALIASES, [...decoys, ...uniqueNames])
  const lineOf = new Map(allFeatures.map((f) => [Number(f.properties.id), f.properties.line ?? '']))
  const enabledMap = (lines: Set<string>) =>
    new Map(stations.filter((s) => lines.has(lineOf.get(s.id)!)).map((s) => [s.id, s.name] as [number, string]))
  const under = (lines: Set<string>) => {
    const en = enabledMap(lines)
    return (q: string) => restrictToEnabled(gameMatcher(q), en)
  }
  const defaults = defaultEnabledLines(LINES)
  const tflDefault = new Set(Object.keys(defaults).filter((k) => defaults[k]))
  const kxIdsOf = (lines: Set<string>) =>
    stations.filter((s) => lines.has(lineOf.get(s.id)!) && /king.?s cross|pancras/i.test(s.name)).map((s) => s.id).sort((a, b) => a - b)
  const idsUnder = (lines: Set<string>, q: string) => {
    const r = under(lines)(q)
    return r.kind === 'match' ? Array.from(new Set(r.ids)).sort((a, b) => a - b) : r.kind
  }

  it('the default selection is TfL (Underground, Overground, Elizabeth, DLR) + Thameslink + Cable Car', () => {
    expect(tflDefault.has('Victoria') && tflDefault.has('Mildmay') && tflDefault.has('DLR')).toBe(true)
    expect(tflDefault.has('Thameslink') && tflDefault.has('CableCar')).toBe(true)
    expect(tflDefault.has('GreaterAnglia') || tflDefault.has('Tramlink')).toBe(false)
  })
  it('default selection: KX / St Pancras names light the King\'s Cross St Pancras tube + Thameslink features', () => {
    const want = kxIdsOf(tflDefault)
    expect(want.length).toBeGreaterThan(1)
    for (const q of ['st pancras', 'st pancras international', 'kings cross', "London King's Cross"])
      expect(idsUnder(tflDefault, q), q).toEqual(want)
  })
  it("only Thameslink enabled: King's Cross St Pancras lights Thameslink's St Pancras", () => {
    const tl = new Set(['Thameslink'])
    const want = kxIdsOf(tl)
    expect(want.length).toBe(1)
    expect(idsUnder(tl, "King's Cross St Pancras")).toEqual(want)
  })
  it('only Greater Anglia enabled: St Margarets (London) lights St Margarets (Herts)', () => {
    const ga = new Set(['GreaterAnglia'])
    const want = stations.filter((s) => s.name === 'St Margarets (Herts)').map((s) => s.id)
    expect(idsUnder(ga, 'St Margarets (London)')).toEqual(want)
  })
  it('zero false positives under all-on, the TfL default and each line alone', () => {
    const allLines = new Set(Array.from(lineOf.values()))
    const subsets = [allLines, tflDefault, ...Array.from(allLines).map((l) => new Set([l]))]
    const queries = Array.from(new Set([
      ...uniqueNames,
      ...stations.flatMap((s) => s.alternate_names ?? []),
      ...Object.keys(LONDON_ALIASES.aliases),
    ]))
    const allOn = new Map(queries.map((q) => [q, gameMatcher(q)]))
    const bad: string[] = []
    for (const sub of subsets) {
      const en = enabledMap(sub)
      for (const q of queries) {
        const full = allOn.get(q)!
        const r = restrictToEnabled(full, en)
        if (r.kind !== 'match') continue
        const ok = full.kind === 'match' && r.ids.every((id) => en.has(id) && full.ids.includes(id))
        if (!ok) bad.push(`${q} [${Array.from(sub).slice(0, 2).join(',')}]`)
      }
    }
    expect(bad).toEqual([])
  })
})

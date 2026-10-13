# Network Coverage & Guess Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every station on the London map is enterable, no guess lights a wrong station, and each line's stations match reality within a per-line London scope.

**Architecture:** A pure, deterministic matcher (`src/lib/matching/`) replaces Fuse.js: normalised exact match → curated groups/aliases → one-edit typo fallback that is only accepted when unambiguous against both game stations and all real GB station names. Data work moves station membership to curated per-line service tables and per-line end stations, generated at build time by scripts.

**Tech Stack:** Next.js 14 (static export), TypeScript 5.1, React 18, Vitest (new), Node scripts (CommonJS) for the data pipeline, OSM Overpass.

**Spec:** `docs/superpowers/specs/2026-10-12-network-coverage-and-matching-design.md`

## Global Constraints

- Repo root: `/Users/canbury/Documents/other/metro-game/metro-game`. All paths below are relative to it.
- **Do not `git commit`, `git push`, or create branches.** The user has not authorised commits; leave changes in the working tree and list changed files in your report.
- Do not touch untracked user work: `scripts/build-newtracks*.js`, `src/app/(game)/newtracks*/` (read/reuse only).
- Never run `npm run build` while `npm run dev` is running (shared `.next/`).
- Typo rule (verbatim from spec): one edit (OSA: adjacent swap, insert, delete, substitute), query ≥4 chars, only when exactly one group is within distance 1 — counting all real GB station names as decoys.
- Grouping rule: "London X" ≡ "X" (except prefix keepers: London Bridge, London Fields, London Road (…), London City Airport); one curated King's Cross–St Pancras group; distinct names (Waterloo East, Monument, Euston Square, Tower Gateway, Woolwich Arsenal) are NOT grouped.
- Shorthand: curated unambiguous aliases only; ambiguous partials (`heathrow`, `walthamstow`, `bromley`, …) resolve to `ambiguous` ("be more specific").
- Operators excluded: Avanti, LNER, Lumo, Grand Central, Hull Trains, CrossCountry, Caledonian Sleeper.
- Overpass: use `https://overpass-api.de/api/interpreter` with headers `User-Agent: tube-memory-dev/0.1 (offline build)` and `Accept: */*` (without them it returns 406). Mirrors: `overpass.kumi.systems`, `overpass.private.coffee`.
- Station data: `src/app/(game)/london/data/features.json` — one Point feature per (station, line) pair; `properties: { id, name, line, alternate_names? }`.

## Review Focus

1. Curly apostrophes / dots / extra spaces ("King’s Cross", "St. Pancras", "  victoria ") must match like the plain form → test in Task 1.
2. Group partly found (Victoria tube found, then "london victoria") must light only the remaining stations with no error; fully-found group shows "Already found" → logic in Task 5, unit-tested via `selectNewIds` in Task 5.
3. Exact name of a station whose lines are all disabled must be rejected, never typo-matched to an enabled station → test in Task 2 (decoy) and wiring in Task 5.
4. Empty / whitespace / punctuation-only input must be a no-op (`none`), no crash → test in Task 2.
5. Short typos: 4-char typo of a unique station accepted ("bnak"→Bank), 3-char query never typo-matched → test in Task 2.

---

# Phase A — Matcher & tests (no dependency on the pending scope review)

### Task 1: Vitest setup + `normalize`

**Files:**
- Modify: `package.json` (devDependency `vitest@2.1.9`, scripts `test`, `test:watch`)
- Create: `vitest.config.ts`
- Create: `src/lib/matching/normalize.ts`
- Test: `src/lib/matching/normalize.test.ts`

**Interfaces:**
- Produces: `normalize(input: string): string`, `stripLondonPrefix(name: string): string | null`

- [ ] **Step 1: Install Vitest and add config**

Run: `npm install --save-dev vitest@2.1.9`

`package.json` scripts gain:
```json
"test": "vitest run",
"test:watch": "vitest"
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'], testTimeout: 120_000 },
})
```

- [ ] **Step 2: Write the failing test**

`src/lib/matching/normalize.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { normalize, stripLondonPrefix } from './normalize'

describe('normalize', () => {
  it.each([
    ['Victoria', 'victoria'],
    ["King's Cross St Pancras", 'kingscrossstpancras'],
    ['King’s Cross St. Pancras', 'kingscrossstpancras'],
    ['kings cross saint pancras', 'kingscrossstpancras'],
    ['Liverpool Street', 'liverpoolst'],
    ['liverpool st', 'liverpoolst'],
    ['Harrow & Wealdstone', 'harrowwealdstone'],
    ['harrow and wealdstone', 'harrowwealdstone'],
    ['Kensington (Olympia)', 'kensingtonolympia'],
    ['Tottenham Court Road', 'tottenhamcourtrd'],
    ['Heathrow Terminals 2 & 3', 'heathrowterminals23'],
    ['  victoria  ', 'victoria'],
    ['Wood Lane', 'woodlane'],
    ['Bromley-by-Bow', 'bromleybybow'],
    ['', ''],
    ['  ...  ', ''],
  ])('%s -> %s', (input, expected) => {
    expect(normalize(input)).toBe(expected)
  })
})

describe('stripLondonPrefix', () => {
  it('strips a leading "London "', () => {
    expect(stripLondonPrefix('London Victoria')).toBe('Victoria')
    expect(stripLondonPrefix("London King's Cross")).toBe("King's Cross")
  })
  it('returns null when there is no prefix', () => {
    expect(stripLondonPrefix('Victoria')).toBeNull()
    expect(stripLondonPrefix('Londonderry')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/normalize.test.ts`
Expected: FAIL — cannot resolve `./normalize`.

- [ ] **Step 4: Implement**

`src/lib/matching/normalize.ts`:
```ts
// Canonical form used for every station-name comparison: case, accents,
// apostrophes, punctuation and spacing are ignored; & / and are dropped;
// saint/street -> st, road -> rd so either spelling matches.
export function normalize(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\broad\b/g, 'rd')
    .replace(/\band\b/g, ' ')
    .replace(/\s+/g, '')
}

export function stripLondonPrefix(name: string): string | null {
  const m = /^london\s+(.+)$/i.exec(name.trim())
  return m ? m[1] : null
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/matching/normalize.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Checkpoint** — no commit; note changed files.

---

### Task 2: OSA helpers + `createMatcher`

**Files:**
- Create: `src/lib/matching/osa.ts`
- Create: `src/lib/matching/matcher.ts`
- Create: `src/lib/matching/index.ts`
- Test: `src/lib/matching/osa.test.ts`, `src/lib/matching/matcher.test.ts`

**Interfaces:**
- Consumes: `normalize`, `stripLondonPrefix` (Task 1)
- Produces:
```ts
export function osaWithin1(a: string, b: string): boolean
export function deletions(s: string): string[]          // s itself + every 1-char deletion
export interface StationRecord { id: number; name: string; alternate_names?: string[] }
export interface AliasConfig {
  groups: string[][]               // station names that light together
  aliases: Record<string, string>  // alias text -> station name
  ambiguous: string[]              // inputs that resolve to 'ambiguous'
  prefixKeepers: string[]          // "London …" names whose prefix is NOT optional
}
export type Resolution =
  | { kind: 'match'; ids: number[]; names: string[] }
  | { kind: 'ambiguous' }
  | { kind: 'none' }
export const MIN_TYPO_LENGTH = 4
export const EMPTY_ALIASES: AliasConfig
export function createMatcher(stations: StationRecord[], config: AliasConfig, decoyNames?: string[]): (query: string) => Resolution
```

- [ ] **Step 1: Write the failing OSA test** (reference full-DP OSA as oracle)

`src/lib/matching/osa.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { deletions, osaWithin1 } from './osa'

function osaRef(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => {
    const r = new Array(b.length + 1).fill(0); r[0] = i; return r
  })
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}

describe('osaWithin1', () => {
  it.each([
    ['barking', 'barming', true], ['barking', 'barking', true],
    ['juntcion', 'junction', true], ['maorpark', 'moorpark', true],
    ['maorpark', 'manorpark', true], ['eastcroydon', 'westcroydon', false],
    ['abc', 'abcd', true], ['abc', 'abdc', true], ['abc', 'cab', false],
  ])('%s vs %s -> %s', (a, b, want) => expect(osaWithin1(a, b)).toBe(want))

  it('agrees with the reference DP on random strings', () => {
    let seed = 1
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const word = () => Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => 'abc'[Math.floor(rnd() * 3)]).join('')
    for (let i = 0; i < 20000; i++) {
      const a = word(), b = word()
      expect(osaWithin1(a, b)).toBe(osaRef(a, b) <= 1)
    }
  })
})

describe('deletions', () => {
  it('returns the string and every single deletion', () => {
    expect(deletions('abc').sort()).toEqual(['ab', 'abc', 'ac', 'bc'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/matching/osa.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `osa.ts`**
```ts
// True when a and b are within optimal-string-alignment distance 1:
// equal, or one substitution, insertion, deletion or adjacent transposition.
export function osaWithin1(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  if (la === lb) {
    let i = 0
    while (i < la && a[i] === b[i]) i++
    if (a.slice(i + 1) === b.slice(i + 1)) return true
    return (
      i + 1 < la &&
      a[i] === b[i + 1] &&
      a[i + 1] === b[i] &&
      a.slice(i + 2) === b.slice(i + 2)
    )
  }
  const [s, l] = la < lb ? [a, b] : [b, a]
  let i = 0
  while (i < s.length && s[i] === l[i]) i++
  return s.slice(i) === l.slice(i + 1)
}

// Deletion neighbourhood: any two strings within OSA distance 1 share at
// least one entry, so this indexes typo candidates without a full scan.
export function deletions(s: string): string[] {
  const out = [s]
  for (let i = 0; i < s.length; i++) out.push(s.slice(0, i) + s.slice(i + 1))
  return out
}
```

- [ ] **Step 4: Run OSA test** — Expected: PASS.

- [ ] **Step 5: Write the failing matcher test**

`src/lib/matching/matcher.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createMatcher, AliasConfig, StationRecord } from './matcher'

const S = (id: number, name: string, alternate_names?: string[]): StationRecord => ({ id, name, alternate_names })
const stations: StationRecord[] = [
  S(1, 'Victoria'), S(2, 'Victoria'), S(3, 'London Victoria'),
  S(4, "King's Cross St Pancras"), S(5, "London King's Cross"), S(6, 'St Pancras International'),
  S(7, 'Barking'), S(8, 'Barming'), S(9, 'Moor Park'), S(10, 'Manor Park'),
  S(11, 'London Bridge'), S(12, 'Bank'), S(13, 'Heathrow Terminal 4'), S(14, 'Heathrow Terminal 5'),
  S(15, 'Waterloo'), S(16, 'Waterloo East'), S(17, 'London Waterloo'), S(18, 'Upney'),
  S(19, 'London Marylebone'), S(20, 'Cambridge North'), S(21, 'Bow'),
]
const aliases: AliasConfig = {
  groups: [["King's Cross St Pancras", "London King's Cross", 'St Pancras International']],
  aliases: { kx: "King's Cross St Pancras", t5: 'Heathrow Terminal 5', ghost: 'Not A Station' },
  ambiguous: ['heathrow'],
  prefixKeepers: ['London Bridge'],
}
const m = createMatcher(stations, aliases, ['Upwey', 'Cambridge South', 'Bridge'])
const ids = (q: string) => { const r = m(q); return r.kind === 'match' ? [...r.ids].sort((a, b) => a - b) : r.kind }

describe('createMatcher', () => {
  it('groups London-prefixed variants', () => {
    expect(ids('victoria')).toEqual([1, 2, 3])
    expect(ids('London Victoria')).toEqual([1, 2, 3])
    expect(ids('waterloo')).toEqual([15, 17])
  })
  it('keeps distinct names separate', () => expect(ids('waterloo east')).toEqual([16]))
  it('applies curated groups and aliases', () => {
    for (const q of ['kx', 'kings cross', 'st pancras international', "king's cross st pancras"])
      expect(ids(q)).toEqual([4, 5, 6])
    expect(ids('t5')).toEqual([14])
  })
  it('ignores aliases that point at missing stations', () => expect(ids('ghost')).toBe('none'))
  it('respects prefix keepers', () => {
    expect(ids('london bridge')).toEqual([11])
    expect(ids('bridge')).toBe('none')
  })
  it('returns ambiguous for curated partials', () => expect(ids('heathrow')).toBe('ambiguous'))
  it('exact match never typo-spills', () => {
    expect(ids('barking')).toEqual([7])
    expect(ids('barming')).toEqual([8])
  })
  it('rejects typos equidistant from two stations', () => {
    expect(ids('barling')).toBe('none')
    expect(ids('maor park')).toBe('none')
    expect(ids('heathrow terminal 6')).toBe('none')
  })
  it('accepts unique one-edit typos incl. swaps', () => {
    expect(ids('marlyebone')).toEqual([19])
    expect(ids('victoira')).toEqual([1, 2, 3])
    expect(ids('bnak')).toEqual([12])
  })
  it('never typo-matches a real station that is not in the game', () => {
    expect(ids('upwey')).toBe('none')
    expect(ids('cambridge south')).toBe('none')
  })
  it('rejects typos when a decoy is also within one edit', () => {
    expect(ids('upnex')).toEqual([18])      // only Upney within 1
    expect(ids('upwey')).toBe('none')       // decoy exact
  })
  it('does not typo-match queries shorter than 4 chars', () => {
    expect(ids('bow')).toEqual([21])
    expect(ids('bnk')).toBe('none')
  })
  it('handles empty and punctuation-only input', () => {
    expect(ids('')).toBe('none')
    expect(ids('   ')).toBe('none')
    expect(ids('...')).toBe('none')
  })
})
```

- [ ] **Step 6: Run** `npx vitest run src/lib/matching/matcher.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 7: Implement `matcher.ts` and `index.ts`**

`src/lib/matching/matcher.ts`:
```ts
import { normalize, stripLondonPrefix } from './normalize'
import { deletions, osaWithin1 } from './osa'

export interface StationRecord { id: number; name: string; alternate_names?: string[] }
export interface AliasConfig {
  groups: string[][]
  aliases: Record<string, string>
  ambiguous: string[]
  prefixKeepers: string[]
}
export type Resolution =
  | { kind: 'match'; ids: number[]; names: string[] }
  | { kind: 'ambiguous' }
  | { kind: 'none' }

export const MIN_TYPO_LENGTH = 4
export const EMPTY_ALIASES: AliasConfig = { groups: [], aliases: {}, ambiguous: [], prefixKeepers: [] }

const NONE: Resolution = { kind: 'none' }
const AMBIGUOUS: Resolution = { kind: 'ambiguous' }
const DECOY = '\u0000decoy:'

export function createMatcher(
  stations: StationRecord[],
  config: AliasConfig,
  decoyNames: string[] = [],
): (query: string) => Resolution {
  // Union-find over station names: one group per real-world place.
  const parent = new Map<string, string>()
  for (const s of stations) parent.set(s.name, s.name)
  const find = (n: string): string => {
    let r = n
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(n, r)
    return r
  }
  const union = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  const keepers = new Set(config.prefixKeepers.map(normalize))
  const optionalPrefix = (name: string): string | null => {
    const stripped = stripLondonPrefix(name)
    return stripped && !keepers.has(normalize(name)) ? stripped : null
  }

  const byCanon = new Map<string, string>()
  for (const name of Array.from(parent.keys())) {
    const canon = normalize(optionalPrefix(name) ?? name)
    const prev = byCanon.get(canon)
    if (prev) union(prev, name)
    else byCanon.set(canon, name)
  }
  for (const g of config.groups) for (let i = 1; i < g.length; i++) union(g[0], g[i])

  const groupIds = new Map<string, number[]>()
  const groupNames = new Map<string, Set<string>>()
  for (const s of stations) {
    const g = find(s.name)
    if (!groupIds.has(g)) { groupIds.set(g, []); groupNames.set(g, new Set()) }
    groupIds.get(g)!.push(s.id)
    groupNames.get(g)!.add(s.name)
  }

  // Normalised key -> groups it names (more than one = ambiguous).
  const keyGroups = new Map<string, Set<string>>()
  const addKey = (text: string, group: string) => {
    const k = normalize(text)
    if (!k) return
    if (!keyGroups.has(k)) keyGroups.set(k, new Set())
    keyGroups.get(k)!.add(group)
  }
  for (const s of stations) {
    const g = find(s.name)
    addKey(s.name, g)
    const stripped = optionalPrefix(s.name)
    if (stripped) addKey(stripped, g)
    for (const a of s.alternate_names ?? []) addKey(a, g)
  }
  for (const [alias, target] of Object.entries(config.aliases))
    if (parent.has(target)) addKey(alias, find(target))
  const ambiguousKeys = new Set(config.ambiguous.map(normalize))

  // Typo candidates: game keys plus decoys (real stations not in the game),
  // each decoy its own pseudo-group so it can make a typo ambiguous.
  const typoGroups = new Map<string, Set<string>>(keyGroups)
  for (const d of decoyNames) {
    const k = normalize(d)
    if (k && !typoGroups.has(k)) typoGroups.set(k, new Set([DECOY + k]))
  }
  const delIndex = new Map<string, string[]>()
  for (const k of Array.from(typoGroups.keys()))
    for (const v of deletions(k)) {
      const list = delIndex.get(v)
      if (list) list.push(k)
      else delIndex.set(v, [k])
    }

  const matchGroup = (g: string): Resolution => ({
    kind: 'match',
    ids: groupIds.get(g)!,
    names: Array.from(groupNames.get(g)!),
  })

  return (query: string): Resolution => {
    const q = normalize(query)
    if (!q) return NONE
    if (ambiguousKeys.has(q)) return AMBIGUOUS
    const exact = keyGroups.get(q)
    if (exact) return exact.size === 1 ? matchGroup(Array.from(exact)[0]) : AMBIGUOUS
    if (typoGroups.has(q)) return NONE // a real station that isn't in the game
    if (q.length < MIN_TYPO_LENGTH) return NONE

    const groups = new Set<string>()
    const seen = new Set<string>()
    for (const v of deletions(q))
      for (const k of delIndex.get(v) ?? []) {
        if (seen.has(k)) continue
        seen.add(k)
        if (osaWithin1(q, k)) typoGroups.get(k)!.forEach((g) => groups.add(g))
      }
    if (groups.size !== 1) return NONE
    const g = Array.from(groups)[0]
    return g.startsWith(DECOY) ? NONE : matchGroup(g)
  }
}
```

`src/lib/matching/index.ts`:
```ts
export * from './normalize'
export * from './osa'
export * from './matcher'
```

- [ ] **Step 8: Run** `npx vitest run src/lib/matching` — Expected: PASS.
- [ ] **Step 9: Checkpoint** — no commit.

---

### Task 3: GB decoy station names

**Files:**
- Create: `scripts/fetch-gb-station-names.js`
- Create (generated): `src/app/(game)/london/data/gb-station-names.json` (sorted unique array of strings)

**Interfaces:**
- Produces: JSON `string[]` of every `railway=station|halt` `name` in Great Britain from OSM (expect roughly 2,500–4,500 names).

- [ ] **Step 1: Write the script**
```js
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
```

- [ ] **Step 2: Run it** — `node scripts/fetch-gb-station-names.js`. Expected: `wrote N names` with N between 2,500 and 4,500; file contains `"Upwey"`, `"Barming"`, `"Moor Park"`. If `"Cambridge South"` is absent, report that (the golden test in Task 4 then still passes via distance 2, but note it).
- [ ] **Step 3: Checkpoint** — no commit.

---

### Task 4: London alias config + data-driven tests

**Files:**
- Create: `src/app/(game)/london/data/aliases.ts`
- Test: `src/app/(game)/london/matching.data.test.ts`

**Interfaces:**
- Consumes: `createMatcher`, `AliasConfig`, `normalize`, `osaWithin1` (Task 2), `gb-station-names.json` (Task 3)
- Produces: `export const LONDON_ALIASES: AliasConfig` and `export function londonMatcher(features?: Feature[]): (q: string) => Resolution` (helper in the test file only; GamePage builds its own in Task 5).

- [ ] **Step 1: Write `aliases.ts`**
```ts
import type { AliasConfig } from '@/lib/matching'

// Curated matching config for the London game. Aliases whose target station
// isn't on the map are ignored, so entries may name stations a later data
// phase adds (e.g. 'Ashford (Surrey)', 'London Cable Car' stations).
export const LONDON_ALIASES: AliasConfig = {
  groups: [
    [
      "King's Cross St Pancras",
      "London King's Cross",
      'St Pancras International',
      'London St Pancras',
    ],
  ],
  aliases: {
    kx: "King's Cross St Pancras",
    'kings x': "King's Cross St Pancras",
    t4: 'Heathrow Terminal 4',
    'heathrow t4': 'Heathrow Terminal 4',
    t5: 'Heathrow Terminal 5',
    'heathrow t5': 'Heathrow Terminal 5',
    t2: 'Heathrow Terminals 2 & 3',
    t3: 'Heathrow Terminals 2 & 3',
    'heathrow t2': 'Heathrow Terminals 2 & 3',
    'heathrow t3': 'Heathrow Terminals 2 & 3',
    'heathrow terminal 2': 'Heathrow Terminals 2 & 3',
    'heathrow terminal 3': 'Heathrow Terminals 2 & 3',
    olympia: 'Kensington (Olympia)',
    dorking: 'Dorking Main',
    'ashford surrey': 'Ashford (Surrey)',
    'city airport': 'London City Airport',
  },
  ambiguous: [
    'heathrow', 'walthamstow', 'bromley', 'croydon', 'ealing', 'harrow',
    'wembley', 'acton', 'battersea', 'finchley', 'clapham', 'dulwich',
    'stratford international dlr',
  ],
  prefixKeepers: [
    'London Bridge',
    'London Fields',
    'London Road (Brighton)',
    'London Road (Guildford)',
    'London City Airport',
  ],
}
```
Before saving, verify each `aliases` target and `prefixKeepers` entry against the current `features.json` names (`node -e` one-liner); drop the `ambiguous` entry `stratford international dlr` if it is an exact name. Any ambiguous entry that is itself an exact station name must be removed (it would shadow the station) — the test in Step 2 enforces this.

- [ ] **Step 2: Write the data test**

`src/app/(game)/london/matching.data.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import features from './data/features.json'
import decoys from './data/gb-station-names.json'
import { LONDON_ALIASES } from './data/aliases'
import { createMatcher, normalize, osaWithin1, stripLondonPrefix, MIN_TYPO_LENGTH, StationRecord } from '@/lib/matching'

type F = { properties: { id: number | null; name: string; alternate_names?: string[] } }
const stations: StationRecord[] = (features as unknown as { features: F[] }).features.map((f) => ({
  id: Number(f.properties.id), name: f.properties.name, alternate_names: f.properties.alternate_names,
}))
const m = createMatcher(stations, LONDON_ALIASES, decoys as string[])
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
  it('typos', () => {
    expect(namesOf('barling')).toBe('none')
    expect(namesOf('maor park')).toBe('none')
    expect(namesOf('cambridge south')).toBe('none')
    same('marlyebone', ['Marylebone', 'London Marylebone'])
    same('wimbeldon', ['Wimbledon'])
    same('clapham juntcion', ['Clapham Junction'])
    expect(namesOf('heathrow')).toBe('ambiguous')
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
  const allKeys = Array.from(new Set([...gameTexts, ...aliasTexts, ...(decoys as string[])].map(normalize))).filter(Boolean)
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
  const exactKeys = new Set(allKeys)

  it('matches the brute-force oracle for every one-edit variant', () => {
    const failures: string[] = []
    for (const key of Array.from(gameKeys.keys())) {
      for (const v of variants(key)) {
        const got = m(v)
        if (exactKeys.has(v) || LONDON_ALIASES.ambiguous.map(normalize).includes(v)) continue // exact path, covered elsewhere
        let want: string | null = null
        if (v.length >= MIN_TYPO_LENGTH) {
          const groups = new Set<string>()
          for (const len of [v.length - 1, v.length, v.length + 1])
            for (const k of byLen.get(len) ?? []) if (osaWithin1(v, k)) groups.add(kg(k))
          if (groups.size === 1) { const g = Array.from(groups)[0]; if (!g.startsWith('decoy:')) want = g }
        }
        const gotG = got.kind === 'match' ? got.names.slice().sort().join('|') : null
        if (gotG !== want) failures.push(`${v}: got ${gotG} want ${want}`)
        if (failures.length > 50) break
      }
    }
    expect(failures).toEqual([])
  })
})
```

- [ ] **Step 3: Run** `npx vitest run 'src/app/(game)/london'` — Expected: PASS. Note the runtime of the exhaustive test; if it exceeds 90 s, gate that `describe` behind `process.env.EXHAUSTIVE` *and* add an `npm run test:exhaustive` script (`EXHAUSTIVE=1 vitest run`), run it once, and report the timing. Any reachability/false-positive failure is a real data problem: report the list (do not paper over it with aliases unless the alias is a genuine common name).
- [ ] **Step 4: Checkpoint** — no commit.

---

### Task 5: Wire the matcher into the game

**Files:**
- Modify: `src/lib/types.ts` (Config gains `MATCHING?`)
- Modify: `src/app/(game)/london/config.ts` (export `MATCHING`)
- Modify: `src/components/GamePage.tsx:196-218` (replace Fuse), `:979-987` (Input props)
- Modify: `src/components/Input.tsx`
- Create: `src/lib/matching/selectNewIds.ts` + test `src/lib/matching/selectNewIds.test.ts`
- Modify: `src/lib/i18n.tsx` (add `beMoreSpecific` to every locale block)
- Modify: `package.json` (remove `fuse.js` if no remaining imports — `grep -rn "fuse.js" src`)

**Interfaces:**
- Consumes: `createMatcher`, `Resolution`, `AliasConfig`, `EMPTY_ALIASES`, `LONDON_ALIASES`, decoy JSON
- Produces: `Config.MATCHING?: { aliases: AliasConfig; decoyNames: string[] }`; `selectNewIds(ids: number[], found: number[]): { fresh: number[]; allFound: boolean }`; Input prop `matcher: (q: string) => Resolution` replaces `fuse`.

- [ ] **Step 1: Failing test for `selectNewIds`**
```ts
import { describe, expect, it } from 'vitest'
import { selectNewIds } from './selectNewIds'

describe('selectNewIds', () => {
  it('returns only ids not yet found', () => expect(selectNewIds([1, 2, 3], [2])).toEqual({ fresh: [1, 3], allFound: false }))
  it('flags a fully found group', () => expect(selectNewIds([1, 2], [1, 2, 9])).toEqual({ fresh: [], allFound: true }))
  it('tolerates a null/empty found list', () => expect(selectNewIds([4], [])).toEqual({ fresh: [4], allFound: false }))
})
```
Run: `npx vitest run src/lib/matching/selectNewIds.test.ts` — FAIL.

- [ ] **Step 2: Implement**
```ts
export function selectNewIds(ids: number[], found: number[]): { fresh: number[]; allFound: boolean } {
  const seen = new Set(found || [])
  const fresh = ids.filter((id) => !seen.has(id))
  return { fresh, allFound: ids.length > 0 && fresh.length === 0 }
}
```
Add `export * from './selectNewIds'` to `src/lib/matching/index.ts`. Run test — PASS.

- [ ] **Step 3: Config type + London config**

In `src/lib/types.ts`, add to the `Config` interface:
```ts
  MATCHING?: { aliases: import('@/lib/matching').AliasConfig; decoyNames: string[] }
```
In `src/app/(game)/london/config.ts`, import and export inside the default config object:
```ts
import { LONDON_ALIASES } from './data/aliases'
import GB_STATION_NAMES from './data/gb-station-names.json'
// ...
export const MATCHING = { aliases: LONDON_ALIASES, decoyNames: GB_STATION_NAMES as string[] }
```
and include `MATCHING` in the exported config object (follow how `CITY_NAME`, `MAP_CONFIG` etc. are collected at the bottom of the file). `newtracks*/config.ts` spread London's config, so they inherit it.

- [ ] **Step 4: Replace Fuse in GamePage**

Replace the `fuse` `useMemo` (lines ~196-218) with:
```ts
  // Every station name on the map (all lines, enabled or not) is a decoy, so
  // a station on a disabled line is never typo-matched onto an enabled one.
  const allStationNames = useMemo(
    () => Array.from(new Set(fc.features.map((f) => f.properties.name))),
    [fc],
  )
  const matcher = useMemo(
    () =>
      createMatcher(
        enabledFeatures.map((f) => ({
          id: Number(f.properties.id),
          name: f.properties.name,
          alternate_names: f.properties.alternate_names,
        })),
        MATCHING?.aliases ?? EMPTY_ALIASES,
        [...(MATCHING?.decoyNames ?? []), ...allStationNames],
      ),
    [enabledFeatures, MATCHING, allStationNames],
  )
```
(`MATCHING` comes from `useConfig()` alongside the other config values already destructured in GamePage; import `createMatcher, EMPTY_ALIASES` from `@/lib/matching`; remove the `Fuse` import and the now-unused `normalizeString` usage if nothing else uses it.) Pass `matcher={matcher}` instead of `fuse={fuse}` to `<Input>`.

- [ ] **Step 5: Rewrite the Enter handler in Input.tsx**

Props: replace `fuse: Fuse<DataFeature>` with `matcher: (q: string) => Resolution`; remove `Fuse` and `useNormalizeString` imports. Add state `const [ambiguous, setAmbiguous] = useState(false)`. Handler body after `e.preventDefault()`:
```ts
      const result = matcher(search)
      if (result.kind === 'ambiguous') {
        setAmbiguous(true)
        setTimeout(() => setAmbiguous(false), 1500)
        return
      }
      if (result.kind === 'none') {
        setWrong(true)
        setTimeout(() => setWrong(false), 500)
        return
      }
      const { fresh, allFound } = selectNewIds(result.ids, found || [])
      if (allFound) {
        setAlreadyFound(true)
        setTimeout(() => setAlreadyFound(false), 1200)
        setSearch('')
        return
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 250)
      if (map) {
        ;(map.getSource('hovered') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: fresh.map((id) => idMap.get(id)!).filter(Boolean),
        })
        setTimeout(() => {
          ;(map.getSource('hovered') as maplibregl.GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: [],
          })
        }, 1500)
      }
      zoomToStation(fresh[0])
      setFound([...fresh, ...(found || [])])
      setIsNewPlayer(false)
      setSearch('')
      pushEvent(fresh)
```
Update the `useCallback` deps (`matcher` instead of `fuse`/`normalizeString`). Add a second `<Transition show={ambiguous}>` cloned from the `alreadyFound` one, with amber colours (`border-amber-400 bg-amber-100 text-amber-800`) and text `{t('beMoreSpecific')}`.

- [ ] **Step 6: i18n** — add `beMoreSpecific` to every locale block in `src/lib/i18n.tsx` next to `alreadyFound`: en `'Be more specific'`, fr `'Soyez plus précis'`, es `'Sé más específico'`, ca `'Sigues més específic'`, de `'Bitte genauer'`; any other locale present gets the English string.

- [ ] **Step 7: Verify**

Run: `npm test` → PASS. `npx tsc --noEmit` → no errors. `npm run lint` → no new errors. Ensure no dev server is running, then `npm run build` → succeeds. If `grep -rn "from 'fuse.js'" src` is empty, `npm uninstall fuse.js` and rebuild.

- [ ] **Step 8: Manual check** (dev server `npm run dev`, http://localhost:3000/london): type `victoria` → both Victorias light; `barling` → shake; `heathrow` → "Be more specific"; `kx` → four stations; re-type `victoria` → "Already found". Stop the dev server afterwards.
- [ ] **Step 9: Checkpoint** — no commit.

---

# Phase B — Network data (starts only after the user signs off spec §3)

### Task 6: Draft scope + service tables for user review (data only, no wiring)

**Files:**
- Create: `src/app/(game)/london/scope.ts`
- Create: `src/app/(game)/london/services/<LineKey>.ts` for every line in `config.ts` `LINES` plus new keys `LondonNorthwestern`, `Eurostar`, `CableCar`; `src/app/(game)/london/services/index.ts`
- Create: `scripts/report-service-diff.js`

**Interfaces:**
- Produces:
```ts
// services/types.ts
export interface Service { line: string; name: string; stops: string[] } // ordered, inner -> outer; exact station names as in features.json (new stations: official NR name)
export const SERVICES: Service[]            // services/index.ts
// scope.ts
export const FULL_LINES: Set<string>       // kept in full
export const END_STATIONS: Record<string, string[]> // line -> outermost kept stations (spec §3, as signed off)
```

- [ ] **Step 1:** Encode spec §3 (as signed off by the user) in `scope.ts`.
- [ ] **Step 2:** For each line, write the in-scope all-stations calling patterns as `Service` entries (current timetable). Every service must end at or before an `END_STATIONS` entry. Use existing features.json names; for stations not yet in the data use the official National Rail name. Must include: Southern West London Line (Watford Junction … Shepherd's Bush, Kensington (Olympia), West Brompton, Imperial Wharf, Clapham Junction … East Croydon), Southern South London Line, Southern via Mitcham Junction/Hackbridge, Southeastern Greenwich/North Kent line, Sidcup/Bexleyheath lines (incl. Lee, Mottingham, Albany Park, Falconwood), Orpington–Sevenoaks stoppers (Chelsfield, Knockholt, Dunton Green), SWR Hampton Court/Chessington/New Guildford/Epsom–Dorking/Woking stoppers, Thameslink Rainham service (Woolwich Dockyard, Belvedere, Erith), GA Great Eastern to Chelmsford + Southend Victoria, LNWR Euston–Tring + St Albans Abbey branch, Chiltern incl. Sudbury & Harrow Road, EMR to Bedford (incl. Luton), Cable Car (Royal Docks, Greenwich Peninsula), Eurostar (St Pancras International).
- [ ] **Step 3:** `scripts/report-service-diff.js` prints, per line: stations in the tables but not in features.json (to add) and in features.json but not in the tables (to remove/out of scope). Run it and save output to `docs/superpowers/specs/2026-10-12-service-diff.md`.
- [ ] **Step 4: STOP — user review gate.** Report the diff file path. Do not modify features.json/routes.json until the user approves the tables.

### Task 7: Pipeline matchers + new lines config

**Files:** Modify `scripts/fetch-osm-routes.js` (RELATION_MATCHERS, LINE_COLORS, LINE_ORDER), `src/app/(game)/london/config.ts` (LINES), `src/components/LinePicker.tsx` (GROUPS), `src/components/GamePage.tsx` (enabled-lines key `-v5` → `-v6`).

- [ ] Write a Vitest test `scripts/fetch-osm-routes.test.ts` that requires the matcher table (export `RELATION_MATCHERS` and `tagsToLineKey` via `module.exports` guarded by `require.main !== module`) and asserts: `{route:'train',operator:'Abellio Greater Anglia',name:'London Liverpool Street => Ipswich'}` → `GreaterAnglia`; `{route:'train',operator:'Govia Thameslink Railway',name:'SN: London Victoria => Littlehampton'}` → `Southern`; `{route:'train',operator:'Govia Thameslink Railway',name:'Train Southern SN4: London Victoria → East Grinstead'}` → `Southern`; `{route:'train',operator:'South Eastern',name:'Sheerness Line'}` → `Southeastern`; `{route:'train',operator:'West Midlands Trains',name:'LNWR: London Euston → Tring'}` → `LondonNorthwestern`; `{route:'train',operator:'Eurostar International Ltd',name:'Eurostar: London → Paris'}` → `Eurostar`; `{route:'aerialway',network:'London Cable Car'}` → `CableCar`; `{route:'train',operator:'Avanti West Coast'}` → `null`; `{route:'train',operator:'London North Eastern Railway'}` → `null`; existing: Thameslink/GatwickExpress/GreatNorthern name prefixes still map as before. Run → FAIL; implement matchers; → PASS.
- [ ] Add `LINES` entries: `LondonNorthwestern` (name 'London Northwestern', colour `#00BF6F`), `Eurostar` (`#FFDE2A`, textColor dark), `CableCar` (name 'London Cable Car', `#E21836`), orders after `Southern` (33, 34, 35); add to `LINE_COLORS`/`LINE_ORDER`; picker: LNWR + Eurostar in 'National Rail' (alphabetical), new group 'London Cable Car' after 'London Trams'. Bump enabled-lines key to `-v6`.
- [ ] `npx tsc --noEmit`, `npm test` → PASS.

### Task 8: Build stations + geometry from the service tables

**Files:** Create `scripts/build-stations.js`; modify `src/app/(game)/london/data/features.json`, `routes.osm.json`, `routes.json`; create `scripts/route-over-rail-graph.js` (extract graph routing from `scripts/build-newtracks.js`, read-only reuse).

- [ ] Add data test `src/app/(game)/london/services.data.test.ts`: for every `Service`, every stop exists in features.json with `line === service.line`; for every features.json (station, line) pair, the station appears in some `Service` of that line; no station name matches `/platform \d/i`. Run → FAIL (expected, data not yet built).
- [ ] `build-stations.js`: from `SERVICES`, emit features.json — keep existing feature `id`s for existing (name, line) pairs; new pairs get ids starting at `max(id)+1`; coordinates from an existing feature of the same name, else the OSM station node (Overpass `node["railway"="station"]["name"="<name>"]` within the London scope bbox; abort with a list if not found); carry over `alternate_names`. Rename `Ashford Platform 1/2` → `Ashford (Surrey)` (single station, keep the lower id).
- [ ] Re-fetch OSM relations with fixed matchers into `routes.osm.json` (`node scripts/fetch-osm-routes.js --out … --stations-out …` per README). For each `Service` whose consecutive stops are not covered by fetched geometry, route between them with `route-over-rail-graph.js` and append LineStrings to `routes.osm.json`.
- [ ] `node scripts/build-ribbons.js --in …routes.osm.json --out …routes.json`; then `node scripts/rename-stations.js`, `node scripts/marker-overrides.js` (per README order; `transform-data.js` is superseded by build-stations — do not run it).
- [ ] `node scripts/qa-ribbons.js` (no new crossings/regressions vs before), `node scripts/qa-ribbons-render.js`; add probe corridors for WLL (Willesden Jn–Clapham Jn), Greenwich line (London Bridge–Charlton), LNWR (Watford Jn–Tring) and inspect renders in `qa/out/`.
- [ ] `npm test` (services + matching data tests) → PASS.

### Task 9: Trim to scope, saved progress, docs

**Files:** Modify `src/app/(game)/london/visibility.ts` (remove `DISPLAY_BOUNDS` clip + `THAMESLINK_TRIM`; keep `HIDDEN_LINES`), `config.ts` (`maxBounds` refit to scoped network + ~10% margin; `DISPLAY_BOUNDS` removed), `scripts/build-stations.js` + a geometry clip at end stations, `src/components/GamePage.tsx` (found-id filter), `README.md`, `STATUS.md`, `CLAUDE.md`.

- [ ] Data test: no station of a line in `END_STATIONS` lies beyond its end stations (station must appear in a scoped `Service`); routes.json coordinates all within new `maxBounds`. Run → FAIL; implement trim in build-stations + clip route geometry at the end-station coordinate; rebuild; → PASS. Re-run matching data tests (golden `upwey` → none now that it's a decoy).
- [ ] Saved progress: in GamePage, filter the stored `found` list to ids present in `fc` before use (`useMemo`); unit-test the filter as a pure helper `filterKnownIds(found: number[], known: Set<number>): number[]` in `src/lib/matching/selectNewIds.ts`.
- [ ] Docs: README (lines, scope, `npm test`, pipeline incl. build-stations/services), STATUS (latest changes), CLAUDE.md (test command; matcher in `src/lib/matching`; services/scope as source of truth).
- [ ] Final: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all green; report.

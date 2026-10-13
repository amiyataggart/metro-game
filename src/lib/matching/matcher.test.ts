import { describe, expect, it } from 'vitest'
import { createMatcher, restrictToEnabled, AliasConfig, EMPTY_ALIASES, StationRecord } from './matcher'

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

describe('leading-word prefixes', () => {
  const st = [S(1, 'Harlow Town'), S(2, 'Harlow Mill'), S(3, 'Chadwell Heath'), S(4, 'London Road (Brighton)'),
    S(5, 'London Bridge'), S(6, 'Upney')]
  const cfg: AliasConfig = { groups: [], aliases: {}, ambiguous: ['croydon'], prefixKeepers: ['London Bridge', 'London Road (Brighton)'] }
  const pm = createMatcher(st, cfg, ['Tilbury Town', 'Tilbury Riverside', 'Harlow Green', 'Roydon'])
  const kind = (q: string) => pm(q).kind
  it('game-name prefixes are ambiguous', () => {
    expect(kind('harlow')).toBe('ambiguous')
    expect(kind('chadwell')).toBe('ambiguous')
    expect(kind('london road')).toBe('ambiguous')
    expect(kind('harlow town')).toBe('match')
  })
  it('decoy-only prefixes resolve to none', () => expect(kind('tilbury')).toBe('none'))
  it('london itself is never an ambiguous partial', () => expect(kind('london')).toBe('none'))
  it('typos near a prefix are never unique', () => {
    expect(kind('harlo')).toBe('none')
    expect(kind('chadwel')).toBe('none')
    expect(kind('tilburry')).toBe('none')
  })
})

describe('ambiguous keys as typo candidates', () => {
  const am = createMatcher([S(1, 'Roydon'), S(2, 'Kemble'), S(3, 'Luton')],
    { ...EMPTY_ALIASES, ambiguous: ['croydon', 'wembley', 'acton'] })
  it('typos of ambiguous keys never light a real neighbour', () => {
    for (const q of ['coydon', 'rcoydon', 'xroydon', 'wemble', 'lcton']) expect(am(q).kind).toBe('none')
    expect(am('croydon').kind).toBe('ambiguous')
    expect(am('roydon').kind).toBe('match')
  })
})

describe('curated groups with absent members', () => {
  const gm = createMatcher(
    [S(1, "London King's Cross"), S(2, 'St Pancras International', ['London St Pancras']), S(3, 'London St Pancras')],
    { groups: [["King's Cross St Pancras", "London King's Cross", 'St Pancras International', 'London St Pancras']],
      aliases: { kx: "King's Cross St Pancras" }, ambiguous: [], prefixKeepers: [] })
  const all = (q: string) => { const r = gm(q); return r.kind === 'match' ? [...r.ids].sort() : r.kind }
  it('unions all present members and resolves aliases via them', () => {
    for (const q of ['kx', 'kings cross', 'st pancras', 'london st pancras']) expect(all(q)).toEqual([1, 2, 3])
  })
})

describe('query-side London prefix and trailing station', () => {
  it('retries without a typed London prefix', () => {
    expect(ids('London Bank')).toEqual([12])
    expect(ids('london upney')).toEqual([18])
    expect(ids('London St. Pancras International')).toEqual([4, 5, 6])
  })
  it('never strips a prefix keeper', () => {
    expect(ids('london bridge')).toEqual([11])
    expect(ids('bridge')).toBe('none')
  })
  it('strips a trailing station / stn word', () => {
    expect(ids('victoria station')).toEqual([1, 2, 3])
    expect(ids('Bank STN')).toEqual([12])
    expect(ids('station')).toBe('none')
  })
})

describe('prefixes of the London-stripped name', () => {
  const fm = createMatcher([S(1, 'London Fenchurch Street'), S(2, 'Upney')], EMPTY_ALIASES)
  it('bare leading word of a stripped name is ambiguous', () => {
    expect(fm('fenchurch').kind).toBe('ambiguous')
    expect(fm('london').kind).toBe('none')
  })
  it('full stripped name still matches', () => {
    for (const q of ['fenchurch street', 'fenchurch st']) expect(fm(q).kind, q).toBe('match')
  })
})

describe('trailing "station" with a typo', () => {
  const m3 = createMatcher([S(1, 'Battersea Power Station'), S(2, 'Battersea Park')], EMPTY_ALIASES, [])
  it('a typo of a name ending in "station" still resolves', () => {
    const r = m3('batersea power station')
    expect(r.kind === 'match' ? r.ids : r.kind).toEqual([1])
  })
  it('the exact name and the trimmed form still resolve', () => {
    expect(m3('battersea power station').kind).toBe('match')
    expect(m3('battersea park station').kind).toBe('match')
  })
})

describe('restrictToEnabled', () => {
  const enabled = new Map<number, string>([[1, 'Victoria'], [3, 'London Victoria']])
  it('keeps only enabled ids (and their names)', () =>
    expect(restrictToEnabled({ kind: 'match', ids: [1, 2, 3], names: ['Victoria', 'London Victoria'] }, enabled)).toEqual({
      kind: 'match', ids: [1, 3], names: ['Victoria', 'London Victoria'],
    }))
  it('a match with no enabled station is none', () =>
    expect(restrictToEnabled({ kind: 'match', ids: [2], names: ['Victoria'] }, new Map())).toEqual({ kind: 'none' }))
  it('ambiguous and none pass through', () => {
    expect(restrictToEnabled({ kind: 'ambiguous' }, enabled)).toEqual({ kind: 'ambiguous' })
    expect(restrictToEnabled({ kind: 'none' }, enabled)).toEqual({ kind: 'none' })
  })
})


import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const req = createRequire(import.meta.url)
const { tagsToLineKey, isFresh, parseLines } = req('./fetch-osm-routes.js')

describe('tagsToLineKey', () => {
  const cases: [Record<string, string>, string | null][] = [
    [{ route: 'train', operator: 'Abellio Greater Anglia', name: 'London Liverpool Street => Ipswich' }, 'GreaterAnglia'],
    [{ route: 'train', operator: 'Greater Anglia', name: 'x' }, 'GreaterAnglia'],
    [{ route: 'train', operator: 'Govia Thameslink Railway', name: 'SN: London Victoria => Littlehampton' }, 'Southern'],
    [{ route: 'train', operator: 'Govia Thameslink Railway', name: 'Train Southern SN4: London Victoria → East Grinstead' }, 'Southern'],
    [{ route: 'train', operator: 'Greater Thameslink Railway', name: 'Southern: London Bridge → Clapham Junction' }, 'Southern'],
    [{ route: 'train', operator: 'South Eastern', name: 'Sheerness Line' }, 'Southeastern'],
    [{ route: 'train', operator: 'West Midlands Trains', name: 'LNWR: London Euston → Tring' }, 'LondonNorthwestern'],
    [{ route: 'train', operator: 'Eurostar International Ltd', name: 'Eurostar: London → Paris' }, null],
    [{ route: 'aerialway', network: 'London Cable Car' }, 'CableCar'],
    [{ route: 'train', operator: 'Avanti West Coast' }, null],
    [{ route: 'train', operator: 'London North Eastern Railway' }, null],
    [{ route: 'train', operator: 'Southeastern', name: 'Southeastern: Hayes => London' }, 'Southeastern'],
    [{ route: 'train', operator: 'Southeastern', name: 'Southeastern High Speed: x' }, 'SoutheasternHighSpeed'],
    [{ route: 'train', operator: 'Southeastern Railway', name: 'x' }, 'Southeastern'],
    [{ route: 'train', operator: 'Southeastern Railways', name: 'x' }, 'Southeastern'],
    [{ route: 'train', name: 'High Speed One: Faversham - London St. Pancras International' }, 'SoutheasternHighSpeed'],
    [{ route: 'train', operator: 'Lumo' }, null],
    [{ route: 'train', operator: 'Grand Central' }, null],
    [{ route: 'train', operator: 'Hull Trains' }, null],
    [{ route: 'train', operator: 'CrossCountry' }, null],
    [{ route: 'train', operator: 'Cross Country' }, null],
    [{ route: 'train', operator: 'Arriva CrossCountry' }, null],
    [{ route: 'train', operator: 'Caledonian Sleeper' }, null],
    [{ route: 'train', name: 'Thameslink: Bedford → Brighton' }, 'Thameslink'],
    [{ route: 'train', operator: 'Govia Thameslink Railway', name: 'Gatwick Express: London Victoria → Gatwick' }, 'GatwickExpress'],
    [{ route: 'train', operator: 'Govia Thameslink Railway', name: 'Great Northern: Moorgate → Welwyn' }, 'GreatNorthern'],
  ]
  for (const [tags, want] of cases) {
    it(`${JSON.stringify(tags)} -> ${want}`, () => {
      expect(tagsToLineKey(tags)).toBe(want)
    })
  }
})

describe('isFresh', () => {
  const now = new Date('2026-10-12T12:00:00Z')
  it('accepts a recent timestamp', () => {
    expect(isFresh({ timestamp_osm_base: '2026-10-12T11:00:00Z' }, now)).toBe(true)
  })
  it('rejects a stale timestamp', () => {
    expect(isFresh({ timestamp_osm_base: '2026-10-10T11:00:00Z' }, now)).toBe(false)
  })
  it('rejects missing/invalid', () => {
    expect(isFresh(undefined, now)).toBe(false)
    expect(isFresh({}, now)).toBe(false)
    expect(isFresh({ timestamp_osm_base: 'garbage' }, now)).toBe(false)
  })
})

describe('parseLines (--lines filter)', () => {
  it('splits a comma list into a set of line keys', () => {
    expect(Array.from(parseLines('Southern, Chiltern,,CableCar'))).toEqual(['Southern', 'Chiltern', 'CableCar'])
  })
  it('no flag means no filter', () => {
    expect(parseLines(null)).toBeNull()
    expect(parseLines(undefined)).toBeNull()
  })
})

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

describe('junction abbreviations', () => {
  it.each([
    ['Watford Jn', 'watfordjunction'],
    ['clapham jct', 'claphamjunction'],
    ['Clapham Junc.', 'claphamjunction'],
    ['Watford Junction', 'watfordjunction'],
  ])('%s -> %s', (a, b) => expect(normalize(a)).toBe(b))
  it('only whole words are expanded', () => {
    expect(normalize('Jnx')).toBe('jnx')
    expect(normalize('Junction Road')).toBe('junctionrd')
  })
})

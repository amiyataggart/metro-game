import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { defaultEnabledLines } from './defaultEnabledLines'
import { LINES } from '@/app/(game)/london/config'

describe('defaultEnabledLines', () => {
  const d = defaultEnabledLines(LINES)
  const on = Object.keys(d).filter((k) => d[k]).sort()
  it('is all TfL (Underground, Overground, Elizabeth, DLR) plus Thameslink and the Cable Car', () => {
    const tfl = Object.keys(LINES).filter((k) => (LINES[k].order ?? 99) <= 18)
    expect(on).toEqual([...tfl, 'Thameslink', 'CableCar'].sort())
  })
  it('keeps Trams and the other National Rail lines off', () => {
    for (const k of ['Tramlink', 'GreaterAnglia', 'Southern', 'Southeastern', 'HeathrowExpress', 'C2c', 'LondonNorthwestern'])
      expect(d[k], k).toBe(false)
  })
  it('covers every line key', () => expect(Object.keys(d).sort()).toEqual(Object.keys(LINES).sort()))
})

describe('enabled-lines storage key', () => {
  it('is bumped to v7 for the Thameslink + Cable Car default (2026-10-13)', () => {
    const src = readFileSync(path.join(__dirname, '..', 'components', 'GamePage.tsx'), 'utf8')
    expect(src).toContain('`${CITY_NAME}-enabled-lines-v7`')
    expect(src).not.toMatch(/enabled-lines-v[0-6]\b/)
  })
})

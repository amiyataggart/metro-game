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

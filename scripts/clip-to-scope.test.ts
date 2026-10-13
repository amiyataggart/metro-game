import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const req = createRequire(import.meta.url)
const { clipLine } = req('./clip-to-scope.js')

// Fixture in metres east/north of a London origin, converted to [lng, lat].
const O = [-0.1, 51.5]
const P = (x: number, y: number) => [O[0] + x / 69300, O[1] + y / 111320]
const line = (pts: [number, number][], tag: string) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: pts.map(([x, y]) => P(x, y)) },
  properties: { line: 'Test', tag },
})
const xOf = (c: number[]) => (c[0] - O[0]) * 69300
const yOf = (c: number[]) => (c[1] - O[1]) * 111320
type Feat = { geometry: { coordinates: number[][] }; properties: { tag: string } }
const span = (fs: Feat[], tag: string) => {
  const xs = fs.filter((f) => f.properties.tag === tag).flatMap((f) => f.geometry.coordinates.map(xOf))
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null
}
const len = (fs: Feat[], tag: string) =>
  fs
    .filter((f) => f.properties.tag === tag)
    .reduce((s, f) => {
      const c = f.geometry.coordinates
      for (let i = 1; i < c.length; i++) s += Math.hypot(xOf(c[i]) - xOf(c[i - 1]), yOf(c[i]) - yOf(c[i - 1]))
      return s
    }, 0)

describe('clipLine', () => {
  // main line 0..20 km along y=0; stations at 4, 8 and 12 km; services 4-8-12.
  const main = line([[0, 0], [5000, 0], [10000, 0], [20000, 0]], 'main')
  const stations = [P(4000, 0), P(8000, 0), P(12000, 0)]
  const pairs = [[stations[0], stations[1]], [stations[1], stations[2]]]

  it('cuts the line at its end stations', () => {
    const { features } = clipLine([main], stations, pairs)
    const [a, b] = span(features, 'main')!
    expect(a).toBeGreaterThan(3850)
    expect(a).toBeLessThan(4000)
    expect(b).toBeGreaterThan(12000)
    expect(b).toBeLessThan(12150)
  })

  it('keeps a parallel track of the same line and drops a branch that leads nowhere in scope', () => {
    const parallel = line([[0, 20], [20000, 20]], 'parallel')
    const branch = line([[9000, 0], [9500, 3000], [9800, 9000]], 'branch')
    const { features } = clipLine([main, parallel, branch], stations, pairs)
    const [a, b] = span(features, 'parallel')!
    expect(a).toBeLessThan(4100)
    expect(b).toBeGreaterThan(11900)
    expect(b).toBeLessThan(12150)
    expect(len(features, 'branch')).toBeLessThan(150)
  })

  it('keeps a diverging bypass that rejoins the line between two stops', () => {
    const bypass = line([[5000, 0], [6000, 400], [7000, 400], [7600, 0]], 'bypass')
    const { features } = clipLine([main, bypass], stations, pairs)
    expect(len(features, 'bypass')).toBeGreaterThan(2500)
  })

  it('drops a long loop between two end stations that no service runs', () => {
    // leaves after 12 km and comes back before 4 km via a 40 km detour south
    const loop = line([[12000, 0], [14000, -10000], [2000, -12000], [2000, 0]], 'loop')
    const { features } = clipLine([main, loop], stations, pairs)
    expect(len(features, 'loop')).toBeLessThan(300)
  })

  it('drops disconnected geometry far from every stop', () => {
    const far = line([[100000, 50000], [120000, 50000]], 'far')
    const { features } = clipLine([main, far], stations, pairs)
    expect(span(features, 'far')).toBeNull()
  })

  it('returns a feature that is entirely in scope unchanged (same object)', () => {
    const inner = line([[4000, 0], [12000, 0]], 'inner')
    const { features } = clipLine([inner], stations, pairs)
    expect(features).toHaveLength(1)
    expect(features[0]).toBe(inner)
  })
})

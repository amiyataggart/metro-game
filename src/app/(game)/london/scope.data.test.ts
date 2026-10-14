import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import features from './data/features.json'
import routes from './data/routes.json'
import * as config from './config'
import * as visibility from './visibility'
import { DRAWN_TO, END_STATIONS } from './scope'
import { SERVICES } from './services'

type Pos = number[]
type F = { properties: { name: string; line: string }; geometry: { coordinates: Pos } }
type R = { properties: { line: string }; geometry: { type: string; coordinates: Pos[] } }
const stations = (features as unknown as { features: F[] }).features
const lines = (routes as unknown as { features: R[] }).features
const M = (a: Pos, b: Pos) => Math.hypot((a[0] - b[0]) * 69300, (a[1] - b[1]) * 111320)

// A point of a trimmed line is "in scope" if it lies near the stretch between
// two consecutive stops of one of the line's services (an ellipse with foci at
// the two stations), or close to one of the line's stations. Geometry running
// on past an end station fails both.
const ELLIPSE_FACTOR = 1.3
const ELLIPSE_SLACK_M = 1000
const NEAR_STATION_M = 600

describe('network trimmed to scope (spec §3)', () => {
  const coordOf = new Map<string, Pos>()
  for (const f of stations) {
    const byLine = `${f.properties.name}|${f.properties.line}`
    if (!coordOf.has(byLine)) coordOf.set(byLine, f.geometry.coordinates)
    if (!coordOf.has(f.properties.name)) coordOf.set(f.properties.name, f.geometry.coordinates)
  }

  it('stations of trimmed lines all appear in a scoped service of that line', () => {
    const bad: string[] = []
    for (const line of Object.keys(END_STATIONS)) {
      const served = new Set(SERVICES.filter((s) => s.line === line).flatMap((s) => s.stops))
      for (const f of stations)
        if (f.properties.line === line && !served.has(f.properties.name)) bad.push(`${line}: ${f.properties.name}`)
    }
    expect(bad).toEqual([])
  })

  it('route geometry of trimmed lines does not run on beyond their end stations', () => {
    const bad: string[] = []
    for (const line of Object.keys(END_STATIONS)) {
      const pairs: [Pos, Pos][] = []
      for (const s of SERVICES.filter((x) => x.line === line))
        for (let i = 1; i < s.stops.length; i++)
          pairs.push([coordOf.get(`${s.stops[i - 1]}|${line}`)!, coordOf.get(`${s.stops[i]}|${line}`)!])
      const own = stations.filter((f) => f.properties.line === line).map((f) => f.geometry.coordinates)
      for (const to of DRAWN_TO[line] ?? []) for (const a of own) pairs.push([a, coordOf.get(to)!])
      const pts = [...own, ...(DRAWN_TO[line] ?? []).map((n) => coordOf.get(n)!)]
      let worst = 0
      let worstAt: Pos | null = null
      let n = 0
      for (const f of lines) {
        if (f.properties.line !== line) continue
        for (const c of f.geometry.coordinates) {
          if (pts.some((p) => M(p, c) <= NEAR_STATION_M)) continue
          const excess = Math.min(
            ...pairs.map(([a, b]) => M(a, c) + M(c, b) - (ELLIPSE_FACTOR * M(a, b) + ELLIPSE_SLACK_M)),
          )
          if (excess > 0) {
            n++
            if (excess > worst) { worst = excess; worstAt = c }
          }
        }
      }
      if (n) bad.push(`${line}: ${n} vertices out of scope, worst ${Math.round(worst)} m at ${worstAt}`)
    }
    expect(bad).toEqual([])
  })

  // Chiltern's Wembley Stadium branch starts at Neasden; its first piece must
  // join the rest of the line (raw OSM leaves a 64 m junction gap there, closed
  // by a graph-routed fill in data/routes.gap-fills.json).
  it('Chiltern joins up at Neasden (piece ends within 30 m of another Chiltern piece)', () => {
    const P = [-0.25381, 51.55482]
    const pieces = lines.filter((f) => f.properties.line === 'Chiltern').map((f) => f.geometry.coordinates)
    const ends = pieces.flatMap((c, i) => [c[0], c[c.length - 1]].map((e) => [e, i] as const)).filter(([e]) => M(e, P) < 300)
    expect(ends.length).toBeGreaterThan(0)
    const gaps = ends.map(([e, i]) =>
      Math.min(...pieces.flatMap((c, j) => (j === i ? [] : c.map((p) => M(p, e))))),
    )
    expect(Math.round(Math.max(...gaps))).toBeLessThanOrEqual(30)
  })

  it('every route coordinate and station lies within MAP_CONFIG.maxBounds', () => {
    const [[w, s], [e, n]] = config.MAP_CONFIG.maxBounds as [[number, number], [number, number]]
    const inside = (c: Pos) => c[0] >= w && c[0] <= e && c[1] >= s && c[1] <= n
    const out = [
      ...lines.flatMap((f) => f.geometry.coordinates.filter((c) => !inside(c)).map((c) => `${f.properties.line} ${c}`)),
      ...stations.filter((f) => !inside(f.geometry.coordinates)).map((f) => `${f.properties.name} (${f.properties.line})`),
    ]
    expect(out.slice(0, 10)).toEqual([])
  })

  it('maxBounds is fitted to the scoped network with a ~10% margin', () => {
    const all = [...stations.map((f) => f.geometry.coordinates), ...lines.flatMap((f) => f.geometry.coordinates)]
    const xs = all.map((c) => c[0])
    const ys = all.map((c) => c[1])
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const [[w, s], [e, n]] = config.MAP_CONFIG.maxBounds as [[number, number], [number, number]]
    const mx = (maxX - minX) * 0.15
    const my = (maxY - minY) * 0.15
    expect(minX - w).toBeLessThanOrEqual(mx)
    expect(e - maxX).toBeLessThanOrEqual(mx)
    expect(minY - s).toBeLessThanOrEqual(my)
    expect(n - maxY).toBeLessThanOrEqual(my)
  })

  const far = {
    type: 'Feature',
    properties: { line: 'Thameslink' },
    geometry: { type: 'LineString', coordinates: [[-0.1, 51.5], [-0.2, 52.0], [-0.25, 52.58], [-0.3, 52.7]] },
  }
  const farStation = { type: 'Feature', properties: { line: 'Thameslink' }, geometry: { type: 'Point', coordinates: [-0.25, 52.69] } }

  it('/london filters hidden lines only — no render-time clip (scope is trimmed at build time)', () => {
    expect(visibility.scopedRouteFeatures([far as never])).toEqual([far])
    expect(visibility.scopedStationFeatures([farStation as never])).toEqual([farStation])
  })

  // /london now redirects to /play (Oct 2026); its previous page is /old2 and
  // the map before that is /old1. /play and /old2 share /london's data setup.
  it('/play and /old2 use londonConfig (scoped bounds) and the scoped filters, never the legacy ones', () => {
    expect(config.londonConfig.MAP_CONFIG.maxBounds).toEqual(config.MAP_CONFIG.maxBounds)
    expect(config.londonConfig.MAP_CONFIG.maxBounds).not.toEqual(config.DISPLAY_BOUNDS)
    for (const route of ['play', 'old2']) {
      const page = readFileSync(path.join(__dirname, '..', route, 'page.tsx'), 'utf8')
      expect(page, route).toMatch(/import \{[^}]*\blondonConfig\b[^}]*\} from '\.\.\/london\/config'/)
      expect(page, route).toMatch(/\bscopedStationFeatures\(/)
      expect(page, route).not.toMatch(/\bvisible(Station|Route)Features\b/)
      expect(page, route).not.toMatch(/import config\b/)
      // Route geometry: either filtered here, or the promoted lab geometry
      // served as static files from public/london-data/, which can't be
      // filtered per line, so no line may be hidden while that's the case.
      if (/\/london-data\//.test(page)) expect(visibility.HIDDEN_LINES.size).toBe(0)
      else expect(page, route).toMatch(/\bscopedRouteFeatures\(/)
    }
    // the map before that (/old1) keeps the scoped route filter
    const old = readFileSync(path.join(__dirname, '..', 'old1', 'page.tsx'), 'utf8')
    expect(old).toMatch(/\bscopedRouteFeatures\(/)
  })

  // /newtracks and /newtracks2 (untracked experiments, not to be edited) import
  // the default config and visibleStationFeatures / visibleRouteFeatures from
  // here; they keep their pre-Task-9 behaviour: the old camera box and the
  // render-time clip to it (their routes.json is not clipped to scope).
  it('legacy exports keep the pre-Task-9 display-bounds behaviour for /newtracks', () => {
    expect(config.DISPLAY_BOUNDS).toEqual([[-1.1, 50.75], [0.73, 52.66]])
    expect(config.default.MAP_CONFIG.maxBounds).toEqual(config.DISPLAY_BOUNDS)
    // a run is kept up to and including the first vertex outside the box
    const beyond = { ...far, geometry: { ...far.geometry, coordinates: [...far.geometry.coordinates, [-0.35, 52.9]] } }
    const clipped = visibility.visibleRouteFeatures([beyond as never]) as unknown as (typeof far)[]
    expect(clipped).toHaveLength(1)
    expect(clipped[0].geometry.coordinates).toEqual(far.geometry.coordinates)
    expect(visibility.visibleStationFeatures([farStation as never])).toEqual([])
  })
})

// A graph-routed gap fill once sent London Northwestern from South Hampstead up
// the Metropolitan/Chiltern tracks (Finchley Road, Wembley Park) instead of the
// West Coast Main Line via Wembley Central (dev feedback, 2026-10-13).
describe('London Northwestern runs on the WCML, not the Met corridor', () => {
  it('never passes Finchley Road or Wembley Park', () => {
    const at = (name: string) => stations.find((f) => f.properties.name === name)!.geometry.coordinates
    const lnwr = lines.filter((f) => f.properties.line === 'LondonNorthwestern').flatMap((f) => f.geometry.coordinates)
    expect(lnwr.length).toBeGreaterThan(0)
    for (const name of ['Finchley Road', 'Wembley Park']) {
      const nearest = Math.min(...lnwr.map((c) => M(at(name), c)))
      expect(nearest, name).toBeGreaterThan(500)
    }
  })
})

// Server-side: everything the client needs, as plain JSON props.
// Adapted from ../lines/vertical/data.ts: lines carry the full config `Line`
// (so the Key's roundel can draw them) plus each line's stations in the game.
import features from '../../london/data/features.json'
import type { Line } from '@/lib/types'
import { LINES, SERVICES, LINES_AT, FEATURE_ID } from '../lines/lineData'
import type { Coord } from '../lines/vertical/graph'
import { buildDiagram, type DStation } from '../lines/branches/graphLayout'
import { distinctRoutes } from './routes'

export type LineInfo = Line & { key: string }

export interface LearnData {
  lines: LineInfo[]
  services: Record<string, { name: string; stops: string[] }[]>
  linesAt: Record<string, string[]>
  featureId: Record<string, number>
  coords: Record<string, Coord>
  /** line key -> its stations in the game, as [name, feature id] */
  stations: Record<string, [string, number][]>
  /** line key -> indices of its services that are distinct routes (not a reversal or a run of another) */
  routes: Record<string, number[]>
  /** lines with branches only: the whole line, every branch, laid out by ../lines/branches */
  branches: Record<string, Branches>
}

/** the horizontal all-branches layout of one line (../lines/branches/graphLayout), as shipped */
export type Branches = {
  width: number
  height: number
  stations: Pick<DStation, 'name' | 'key' | 'x' | 'y' | 'side' | 'lean' | 'others' | 'terminus' | 'ghost' | 'via' | 'lw'>[]
  edges: string[]
}

export function learnData(): LearnData {
  const coords: Record<string, Coord> = {}
  const stations: LearnData['stations'] = {}
  type F = { id?: number; properties: { name: string; line: string }; geometry: { coordinates: number[] } }
  for (const f of (features as unknown as { features: F[] }).features) {
    const c = f.geometry.coordinates
    const { name, line } = f.properties
    if (!coords[name]) coords[name] = [+c[0].toFixed(4), +c[1].toFixed(4)]
    if (!SERVICES[line]?.length || typeof f.id !== 'number') continue
    const list = (stations[line] ||= [])
    if (!list.some(([n]) => n === name)) list.push([name, f.id])
  }
  const lines: LineInfo[] = Object.entries(LINES)
    .filter(([k]) => SERVICES[k]?.length)
    .map(([key, l]) => ({ ...JSON.parse(JSON.stringify(l)), key }))
    .sort((a, b) => a.order - b.order)
  const services: LearnData['services'] = {}
  for (const l of lines) services[l.key] = SERVICES[l.key].map((s) => ({ name: s.name, stops: s.stops }))
  const routes: LearnData['routes'] = {}
  const branches: LearnData['branches'] = {}
  for (const l of lines) {
    routes[l.key] = distinctRoutes(services[l.key])
    if (routes[l.key].length < 2) continue
    const dg = buildDiagram(l.key)
    const b = dg.layouts[dg.auto]
    // several routes over one unbranched track (stopping patterns) are not branches
    if (b.stats.rows < 2 && b.stats.loops === 0) continue
    branches[l.key] = {
      width: b.width,
      height: b.height,
      stations: b.stations.map(({ name, key, x, y, side, lean, others, terminus, ghost, via, lw }) =>
        ({ name, key, x, y, side, lean, others, terminus, ghost, via, lw })),
      edges: b.edges.map((e) => e.d),
    }
  }
  return { lines, services, linesAt: LINES_AT, featureId: FEATURE_ID, coords, stations, routes, branches }
}

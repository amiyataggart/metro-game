// Server-side: everything the client needs, as plain JSON props.
// Adapted from ../lines/vertical/data.ts: lines carry the full config `Line`
// (so the Key's roundel can draw them) plus each line's stations in the game.
import features from '../../london/data/features.json'
import type { Line } from '@/lib/types'
import { LINES, SERVICES, LINES_AT, FEATURE_ID } from '../lines/lineData'
import type { Coord } from '../lines/vertical/graph'

export type LineInfo = Line & { key: string }

export interface LearnData {
  lines: LineInfo[]
  services: Record<string, { name: string; stops: string[] }[]>
  linesAt: Record<string, string[]>
  featureId: Record<string, number>
  coords: Record<string, Coord>
  /** line key -> its stations in the game, as [name, feature id] */
  stations: Record<string, [string, number][]>
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
  return { lines, services, linesAt: LINES_AT, featureId: FEATURE_ID, coords, stations }
}

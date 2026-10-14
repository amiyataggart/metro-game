// Server-side: everything the client needs, as plain JSON props.
import features from '../../../london/data/features.json'
import { LINES, SERVICES, LINES_AT, FEATURE_ID } from '../lineData'
import type { Coord } from './graph'

export interface LineInfo {
  key: string
  name: string
  color: string
  textColor: string
  stripe?: 'solid' | 'dashed' | 'triple'
  stripeColor?: string
  order: number
}
export interface VerticalData {
  lines: LineInfo[]
  services: Record<string, { name: string; stops: string[] }[]>
  linesAt: Record<string, string[]>
  featureId: Record<string, number>
  coords: Record<string, Coord>
}

export function verticalData(): VerticalData {
  const coords: Record<string, Coord> = {}
  type F = { properties: { name: string }; geometry: { coordinates: number[] } }
  for (const f of (features as unknown as { features: F[] }).features) {
    const c = f.geometry.coordinates
    if (!coords[f.properties.name]) coords[f.properties.name] = [+c[0].toFixed(4), +c[1].toFixed(4)]
  }
  const lines = Object.entries(LINES)
    .filter(([k]) => SERVICES[k]?.length)
    .map(([key, l]) => ({
      key,
      name: l.name,
      color: l.color,
      textColor: l.textColor,
      order: l.order,
      ...(l.stripe ? { stripe: l.stripe } : {}),
      ...(l.stripeColor ? { stripeColor: l.stripeColor } : {}),
    }))
    .sort((a, b) => a.order - b.order)
  const services: VerticalData['services'] = {}
  for (const l of lines) services[l.key] = SERVICES[l.key].map((s) => ({ name: s.name, stops: s.stops }))
  return { lines, services, linesAt: LINES_AT, featureId: FEATURE_ID, coords }
}

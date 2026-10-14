import type { Line } from '@/lib/types'

// Line grouping for the Dock layout: every line lives in exactly one place
// (pill / row = legend + progress + in-play toggle), grouped by mode.
export type ModeId = 'tube' | 'overground' | 'light' | 'rail'

export const MODES: { id: ModeId; name: string; short: string }[] = [
  { id: 'tube', name: 'Underground', short: 'Tube' },
  { id: 'overground', name: 'Overground', short: 'Overground' },
  { id: 'light', name: 'Elizabeth & light rail', short: 'Eliz · Light' },
  { id: 'rail', name: 'National Rail', short: 'National Rail' },
]

const LIGHT = new Set(['ElizabethLine', 'DLR', 'Tramlink', 'CableCar'])

export function modeOf(key: string, line: Line): ModeId {
  if (LIGHT.has(key)) return 'light'
  if (line.order <= 10) return 'tube'
  if (line.order <= 16) return 'overground'
  return 'rail'
}

// Short labels for the pills and toast chips (the sheet uses full names).
const SHORT: Record<string, string> = {
  HammersmithAndCity: 'H&C',
  WaterlooAndCity: 'W&C',
  ElizabethLine: 'Elizabeth',
  Tramlink: 'Trams',
  CableCar: 'Cable Car',
  C2c: 'c2c',
  Chiltern: 'Chiltern',
  EastMidlandsRailway: 'EMR',
  GatwickExpress: 'Gatwick Exp',
  GreatNorthern: 'Gt Northern',
  GreatWesternRailway: 'GWR',
  GreaterAnglia: 'Gtr Anglia',
  HeathrowExpress: 'Heathrow Exp',
  SouthWesternRailway: 'SWR',
  SoutheasternHighSpeed: 'SE High Speed',
  LondonNorthwestern: 'LNWR',
}

export function shortName(key: string, line: Line): string {
  return SHORT[key] ?? line.name
}

export type LineGroup = { mode: (typeof MODES)[number]; keys: string[] }

export function groupLines(LINES: Record<string, Line>): LineGroup[] {
  const keys = Object.keys(LINES).sort((a, b) => LINES[a].order - LINES[b].order)
  return MODES.map((mode) => ({
    mode,
    keys: keys.filter((k) => modeOf(k, LINES[k]) === mode.id),
  })).filter((g) => g.keys.length > 0)
}

// The UI is dark: a near-black line (Northern) would vanish on it, so bars and
// fills use a light grey for it, and its swatch gets an outline.
export function isDarkColor(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length !== 6) return false
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.12
}
export function uiColor(line: Line): string {
  return isDarkColor(line.color) ? '#d4d4d8' : line.color
}

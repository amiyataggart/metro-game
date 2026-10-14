import type { Line } from '@/lib/types'
import data from '../../../../london/data/features.json'

// Modes, in the order the Index lists them. Membership is by line key; anything
// not named here (Thameslink, c2c, the operators) is National Rail.
export type Mode = { id: string; title: string; keys: string[] }

const OVERGROUND = new Set(['Liberty', 'Lioness', 'Mildmay', 'Suffragette', 'Weaver', 'Windrush'])
const LIGHT = new Set(['ElizabethLine', 'DLR', 'Tramlink', 'CableCar'])

export function modeOf(key: string, line: Line): string {
  if (OVERGROUND.has(key)) return 'overground'
  if (LIGHT.has(key)) return 'light'
  if (line.order <= 10) return 'underground'
  return 'rail'
}

export function groupLines(LINES: { [k: string]: Line }): Mode[] {
  const modes: Mode[] = [
    { id: 'underground', title: 'Underground', keys: [] },
    { id: 'overground', title: 'Overground', keys: [] },
    { id: 'light', title: 'Elizabeth & light rail', keys: [] },
    { id: 'rail', title: 'National Rail', keys: [] },
  ]
  const keys = Object.keys(LINES).sort((a, b) => LINES[a].order - LINES[b].order)
  for (const k of keys) modes.find((m) => m.id === modeOf(k, LINES[k]))!.keys.push(k)
  return modes.filter((m) => m.keys.length > 0)
}

// GamePage only hands us enabled stations; the Index also shows progress on
// lines that are out of play, so count every station per line here.
type F = { id?: number | string | null; properties: { line?: string } }
const all = (data as unknown as { features: F[] }).features
export const LINE_OF = new Map<number, string>()
export const TOTAL_PER_LINE: Record<string, number> = {}
for (let i = 0; i < all.length; i++) {
  const f = all[i]
  const l = f.properties.line
  if (!l || f.id == null) continue
  LINE_OF.set(Number(f.id), l)
  TOTAL_PER_LINE[l] = (TOTAL_PER_LINE[l] || 0) + 1
}

export function foundPerLine(ids: number[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (let i = 0; i < ids.length; i++) {
    const l = LINE_OF.get(ids[i])
    if (l) r[l] = (r[l] || 0) + 1
  }
  return r
}

export const fmtInt = (n: number) => n.toLocaleString('en-GB')

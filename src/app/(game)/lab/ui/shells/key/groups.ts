import type { Line } from '@/lib/types'

export type GroupId = 'ug' | 'og' | 'light' | 'nr'

export type KeyGroup = { id: GroupId; name: string; short: string; keys: string[] }

const OVERGROUND = ['Liberty', 'Lioness', 'Mildmay', 'Suffragette', 'Weaver', 'Windrush']
const LIGHT = ['ElizabethLine', 'DLR', 'Tramlink', 'CableCar']

/** Mode of a line, from its key (Underground = config order 0–10). */
export function modeOf(key: string, line: Line): GroupId {
  if (OVERGROUND.includes(key)) return 'og'
  if (LIGHT.includes(key)) return 'light'
  if ((line.order ?? 99) <= 10) return 'ug'
  return 'nr'
}

/** The four mode groups, each sorted by config `order` (Elizabeth/light rail in the fixed size order). */
export function buildGroups(LINES: Record<string, Line>): KeyGroup[] {
  const groups: KeyGroup[] = [
    { id: 'ug', name: 'Underground', short: 'Tube', keys: [] },
    { id: 'og', name: 'Overground', short: 'Overground', keys: [] },
    { id: 'light', name: 'Elizabeth & light rail', short: 'Light', keys: [] },
    { id: 'nr', name: 'National Rail', short: 'Rail', keys: [] },
  ]
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]))
  Object.keys(LINES)
    .sort((a, b) => (LINES[a].order ?? 99) - (LINES[b].order ?? 99))
    .forEach((k) => byId[modeOf(k, LINES[k])].keys.push(k))
  const light = byId.light.keys
  light.sort((a, b) => LIGHT.indexOf(a) - LIGHT.indexOf(b))
  return groups.filter((g) => g.keys.length)
}

/** Short label for feedback pips. */
export function shortName(line: Line): string {
  return line.name
    .replace(/ line$/i, '')
    .replace(/^London /, '')
    .replace(/ Railways?$/, '')
    .replace('Hammersmith & City', 'H&C')
    .replace('Waterloo & City', 'W&C')
}

import type { Line } from '@/lib/types'

export type GroupId = 'ug' | 'og' | 'more' | 'nr'

export type KeyGroup = { id: GroupId; name: string; short: string; keys: string[] }

// The owner's line grouping (also used by the /lab/lines strip + vertical
// pickers). Underground = config order 0–10; the next two groups have a fixed
// membership and order; National Rail = every other line, by config order.
const OVERGROUND = ['Liberty', 'Lioness', 'Mildmay', 'Suffragette', 'Weaver', 'Windrush']
const MORE = ['Thameslink', 'ElizabethLine', 'DLR', 'Tramlink', 'CableCar']

export const LINE_GROUPS: { id: GroupId; name: string; short: string }[] = [
  { id: 'ug', name: 'Underground', short: 'Tube' },
  { id: 'og', name: 'Overground', short: 'Overground' },
  { id: 'more', name: 'Thameslink, Elizabeth & More', short: 'More' },
  { id: 'nr', name: 'National Rail', short: 'Rail' },
]

/** Group of a line, from its key and config `order`. */
export function groupIdOf(key: string, order: number | undefined): GroupId {
  if (OVERGROUND.includes(key)) return 'og'
  if (MORE.includes(key)) return 'more'
  if ((order ?? 99) <= 10) return 'ug'
  return 'nr'
}

/** Index of a line's group in LINE_GROUPS (0..3). */
export function groupIndexOf(key: string, order: number | undefined): number {
  const id = groupIdOf(key, order)
  return LINE_GROUPS.findIndex((g) => g.id === id)
}

/** Group title of a line. */
export function groupNameOf(key: string, order: number | undefined): string {
  return LINE_GROUPS[groupIndexOf(key, order)].name
}

/** Sort comparator: by group, then the fixed order inside "Thameslink, Elizabeth & More", else config order. */
export function compareLines(a: { key: string; order?: number }, b: { key: string; order?: number }): number {
  const ga = groupIndexOf(a.key, a.order)
  const gb = groupIndexOf(b.key, b.order)
  if (ga !== gb) return ga - gb
  const ma = MORE.indexOf(a.key)
  const mb = MORE.indexOf(b.key)
  if (ma >= 0 && mb >= 0) return ma - mb
  return (a.order ?? 99) - (b.order ?? 99)
}

/** The four groups, each in its display order. */
export function buildGroups(LINES: Record<string, Line>): KeyGroup[] {
  const groups: KeyGroup[] = LINE_GROUPS.map((g) => ({ ...g, keys: [] }))
  Object.keys(LINES)
    .map((key) => ({ key, order: LINES[key].order }))
    .sort(compareLines)
    .forEach((l) => groups[groupIndexOf(l.key, l.order)].keys.push(l.key))
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

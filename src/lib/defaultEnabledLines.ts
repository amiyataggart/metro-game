import type { Line } from '@/lib/types'

// Lines on by default besides the TfL rail lines (user decision 2026-10-13).
export const DEFAULT_ON_EXTRA = new Set<string>(['Thameslink', 'CableCar'])

// Default line selection: all TfL rail (Underground, Overground, Elizabeth,
// DLR = config order <= 18) plus Thameslink and the Cable Car. Trams and the
// other National Rail operators start off and are toggled on via the picker.
// Changing this needs a bump of the `${CITY_NAME}-enabled-lines-vN` key.
export function defaultEnabledLines(lines: { [k: string]: Line }): Record<string, boolean> {
  const o: Record<string, boolean> = {}
  for (const k of Object.keys(lines)) o[k] = (lines[k]?.order ?? 99) < 19 || DEFAULT_ON_EXTRA.has(k)
  return o
}

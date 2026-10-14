// Shared data for the /lab/lines/* line-diagram demos (server or client).
import features from '../../london/data/features.json'
import { londonConfig } from '../../london/config'
import { visibleLines } from '../../london/visibility'
import { SERVICES_BY_LINE } from '../../london/services'
import type { Service } from '../../london/services'

export type { Service }
export const LINES = visibleLines(londonConfig.LINES)
/** line key -> curated calling patterns (ordered from the London end outward) */
export const SERVICES: Record<string, Service[]> = Object.fromEntries(
  Object.entries(SERVICES_BY_LINE).filter(([line]) => !!LINES[line]),
)
type F = { id?: number; properties: { name: string; line: string }; geometry: { coordinates: number[] } }
const feats = (features as unknown as { features: F[] }).features
/** station name -> line keys serving it (for interchange markers) */
export const LINES_AT: Record<string, string[]> = {}
/** `${name}|${line}` -> feature id (to show progress from the real game's save) */
export const FEATURE_ID: Record<string, number> = {}
for (const f of feats) {
  if (!LINES[f.properties.line]) continue
  ;(LINES_AT[f.properties.name] ||= []).includes(f.properties.line) || LINES_AT[f.properties.name].push(f.properties.line)
  if (typeof f.id === 'number') FEATURE_ID[`${f.properties.name}|${f.properties.line}`] = f.id
}
/** localStorage key of the real /london game's found ids (read-only here) */
export const LONDON_FOUND_KEY = 'london-stations'

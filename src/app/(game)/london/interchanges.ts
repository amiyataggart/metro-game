/*
 * Interchange classification — shared by the interchange-presentation variants.
 *
 * A physical station appears in features.json as one Point per (station, line)
 * pair, all sharing the same `name`. A station is a multi-line INTERCHANGE if
 * its name is served by >= 2 distinct lines; otherwise it's a single-line stop.
 *
 * annotateInterchanges() stamps every feature with:
 *   - lineCount:   number of distinct lines serving that station name
 *   - interchange: lineCount >= 2
 * so MapLibre paint/layout can branch on ['get','lineCount'] / ['get','interchange'].
 */
import type { DataFeatureCollection } from '@/lib/types'

export function buildLineCountByName(
  fc: DataFeatureCollection,
): Map<string, number> {
  const linesByName = new Map<string, Set<string>>()
  for (const f of fc.features) {
    if (f.geometry.type !== 'Point') continue
    const name = f.properties.name
    const line = f.properties.line
    if (!name || !line) continue
    if (!linesByName.has(name)) linesByName.set(name, new Set())
    linesByName.get(name)!.add(line)
  }
  const out = new Map<string, number>()
  for (const [name, set] of linesByName) out.set(name, set.size)
  return out
}

export function annotateInterchanges(
  fc: DataFeatureCollection,
): DataFeatureCollection {
  const countByName = buildLineCountByName(fc)
  return {
    ...fc,
    features: fc.features.map((f) => {
      const name = f.properties.name
      const lineCount = name ? countByName.get(name) ?? 1 : 1
      return {
        ...f,
        properties: {
          ...f.properties,
          lineCount,
          interchange: lineCount >= 2,
        } as any,
      }
    }),
  }
}

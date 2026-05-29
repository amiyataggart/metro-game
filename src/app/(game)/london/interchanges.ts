/*
 * Interchange classification — shared by the interchange presentation.
 *
 * A physical station appears in features.json as one Point per (station, line)
 * pair. Services are grouped by NAME and then sub-clustered by LOCATION (so a
 * renamed station whose services sit at genuinely different places — e.g.
 * Blackfriars Tube vs the Thameslink platforms ~300m south — yields one cluster
 * per location rather than one merged blob). Each cluster of >= 2 lines is an
 * INTERCHANGE drawn as a segmented pie of its lines' colours.
 *
 * annotateInterchanges() stamps every feature with:
 *   - lineCount:   distinct lines in this feature's (name, location) cluster
 *   - interchange: lineCount >= 2
 *   - pieColors:   that cluster's line colours, ordered by line order
 *   - pieKey:      joined colours, used to register/look up the pie icon
 */
import type { DataFeatureCollection, Line } from '@/lib/types'

type LineMap = { [k: string]: Line }

const M_LAT = 111320
const M_LNG = 69300 // ~51.5N
// Services within this distance (same name) count as the same physical
// interchange (one segmented pie); farther apart they're separate markers, so a
// multi-platform station (Finsbury Park, Wimbledon, Farringdon, …) shows a pie
// only over the lines actually sharing a platform and a plain dot for the
// others — instead of one combined pie duplicated at every platform. Same-
// platform lines are coincident (~0 m) in the data; different platforms are
// 34 m+ apart, so 30 m cleanly separates them (see the distance histogram).
const CLUSTER_M = 30

export function annotateInterchanges(
  fc: DataFeatureCollection,
  lines: LineMap,
): DataFeatureCollection {
  // group point features (by name) -> their indices/coords/lines
  const byName = new Map<string, { i: number; coord: number[]; line: string }[]>()
  fc.features.forEach((f, i) => {
    if (f.geometry.type !== 'Point') return
    const name = f.properties.name
    const line = f.properties.line
    if (!name || !line) return
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name)!.push({ i, coord: f.geometry.coordinates, line })
  })

  // feature index -> { colors, key, count } for its location cluster
  const info = new Map<number, { colors: string[]; key: string; count: number }>()
  for (const items of byName.values()) {
    // union-find clustering by distance within the name
    const parent = items.map((_, k) => k)
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]]
        x = parent[x]
      }
      return x
    }
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const dx = (items[a].coord[0] - items[b].coord[0]) * M_LNG
        const dy = (items[a].coord[1] - items[b].coord[1]) * M_LAT
        if (dx * dx + dy * dy <= CLUSTER_M * CLUSTER_M) parent[find(a)] = find(b)
      }
    }
    const clusterLines = new Map<number, Set<string>>()
    items.forEach((it, k) => {
      const r = find(k)
      if (!clusterLines.has(r)) clusterLines.set(r, new Set())
      clusterLines.get(r)!.add(it.line)
    })
    const clusterInfo = new Map<number, { colors: string[]; key: string; count: number }>()
    for (const [r, set] of clusterLines) {
      const ordered = [...set]
        .filter((l) => lines[l])
        .sort((a, b) => (lines[a].order ?? 99) - (lines[b].order ?? 99))
      const colors = ordered.map((l) => lines[l].color)
      clusterInfo.set(r, { colors, key: colors.join('|'), count: ordered.length })
    }
    items.forEach((it, k) => info.set(it.i, clusterInfo.get(find(k))!))
  }

  return {
    ...fc,
    features: fc.features.map((f, i) => {
      const ci = info.get(i)
      const lineCount = ci ? ci.count : 1
      return {
        ...f,
        properties: {
          ...f.properties,
          lineCount,
          interchange: lineCount >= 2,
          pieColors: ci ? ci.colors : [],
          pieKey: ci ? ci.key : '',
        } as any,
      }
    }),
  }
}

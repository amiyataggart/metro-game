import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const req = createRequire(import.meta.url)
const { mergeOsmRoutes } = req('./merge-osm-routes.js')

const ls = (line: string, tag: string, src?: string) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  properties: { line, tag, ...(src ? { src } : {}) },
})
const tags = (fc: { features: { properties: { tag: string } }[] }) => fc.features.map((f) => f.properties.tag)

describe('mergeOsmRoutes', () => {
  const base = {
    type: 'FeatureCollection',
    features: [
      ls('Victoria', 'vic'),
      ls('Southern', 'sn-old-1'),
      ls('Southern', 'sn-branch', 'southern-branch'),
      ls('Southern', 'sn-old-2'),
      ls('Southern', 'sn-fill-old', 'graph-routed'),
      ls('Central', 'cen'),
    ],
  }
  const fresh = { type: 'FeatureCollection', features: [ls('Southern', 'sn-new-1'), ls('Southern', 'sn-new-2')] }

  it('replaces the OSM-relation features of refetched lines in place, keeps hand-routed `src` features and other lines', () => {
    const { fc } = mergeOsmRoutes(base, fresh, ['Southern'], [])
    expect(tags(fc)).toEqual(['vic', 'sn-new-1', 'sn-new-2', 'sn-branch', 'cen'])
  })
  it('drops old graph-routed fills of refetched lines and appends the given gap fills', () => {
    const gaps = { type: 'FeatureCollection', features: [ls('Southern', 'sn-fill-new', 'graph-routed')] }
    const { fc } = mergeOsmRoutes(base, fresh, ['Southern'], [gaps])
    expect(tags(fc)).toEqual(['vic', 'sn-new-1', 'sn-new-2', 'sn-branch', 'cen', 'sn-fill-new'])
  })
  it('appends fresh features of a line that is new to the base', () => {
    const extra = { type: 'FeatureCollection', features: [ls('Eurostar', 'es')] }
    const { fc } = mergeOsmRoutes(base, extra, ['Eurostar'], [])
    expect(tags(fc)).toEqual([...tags(base), 'es'])
  })
  it('rejects fresh features of a line outside the refetched set', () => {
    expect(() => mergeOsmRoutes(base, fresh, ['Chiltern'], [])).toThrow(/Southern/)
  })
  it('leaves a refetched line untouched when the fetch returned nothing for it (with a warning)', () => {
    const { fc, warnings } = mergeOsmRoutes(base, { type: 'FeatureCollection', features: [] }, ['Southern'], [])
    expect(tags(fc)).toEqual(tags(base))
    expect(warnings.join()).toMatch(/Southern/)
  })
})

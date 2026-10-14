import type { Service } from './types'

// CableCar — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 3018433, 10088710
  {
    line: 'CableCar',
    name: 'London Cable Car',
    stops: [
      'Greenwich Peninsula',
      'Royal Docks',
    ],
  },
]

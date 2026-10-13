import type { Service } from './types'

// HeathrowExpress — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 917523, 9917743
  {
    line: 'HeathrowExpress',
    name: 'Paddington → Heathrow Terminal 5',
    stops: [
      'London Paddington',
      'Heathrow Terminals 2 & 3',
      'Heathrow Terminal 5',
    ],
  },
]

import type { Service } from './types'

// WaterlooAndCity — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 102762, 7672074
  {
    line: 'WaterlooAndCity',
    name: 'Waterloo → Bank',
    stops: [
      'Waterloo',
      'Bank',
    ],
  },
]

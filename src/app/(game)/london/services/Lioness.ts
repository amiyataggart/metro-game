import type { Service } from './types'

// Lioness — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 9752359, 1242272
  // from features.json membership (OSM relation omits them): Watford High Street
  {
    line: 'Lioness',
    name: 'Watford Junction → Euston',
    stops: [
      'Watford Junction',
      'Watford High Street',
      'Bushey',
      'Carpenders Park',
      'Hatch End',
      'Headstone Lane',
      'Harrow & Wealdstone',
      'Kenton',
      'South Kenton',
      'North Wembley',
      'Wembley Central',
      'Stonebridge Park',
      'Harlesden',
      'Willesden Junction',
      'Kensal Green',
      'Queen\'s Park',
      'Kilburn High Road',
      'South Hampstead',
      'Euston',
    ],
  },
]

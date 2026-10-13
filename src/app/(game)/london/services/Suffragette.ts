import type { Service } from './types'

// Suffragette — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 419512, 9683819
  // from features.json membership (OSM relation omits them): Upper Holloway
  {
    line: 'Suffragette',
    name: 'Gospel Oak → Barking Riverside',
    stops: [
      'Gospel Oak',
      'Upper Holloway',
      'Crouch Hill',
      'Harringay Green Lanes',
      'South Tottenham',
      'Blackhorse Road',
      'Walthamstow Queen\'s Road',
      'Leyton Midland Road',
      'Leytonstone High Road',
      'Wanstead Park',
      'Woodgrange Park',
      'Barking',
      'Barking Riverside',
    ],
  },
]

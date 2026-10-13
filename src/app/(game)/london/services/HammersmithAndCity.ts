import type { Service } from './types'

// HammersmithAndCity — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 102787, 7666924
  {
    line: 'HammersmithAndCity',
    name: 'Hammersmith → Barking',
    stops: [
      'Hammersmith',
      'Goldhawk Road',
      'Shepherd\'s Bush Market',
      'Wood Lane',
      'Latimer Road',
      'Ladbroke Grove',
      'Westbourne Park',
      'Royal Oak',
      'Paddington',
      'Edgware Road',
      'Baker Street',
      'Great Portland Street',
      'Euston Square',
      'King\'s Cross St Pancras',
      'Farringdon',
      'Barbican',
      'Moorgate',
      'Liverpool Street',
      'Aldgate East',
      'Whitechapel',
      'Stepney Green',
      'Mile End',
      'Bow Road',
      'Bromley-by-Bow',
      'West Ham',
      'Plaistow',
      'Upton Park',
      'East Ham',
      'Barking',
    ],
  },
]

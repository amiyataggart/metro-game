import type { Service } from './types'

// Bakerloo — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 102771, 7666697, 18528748, 18528749
  {
    line: 'Bakerloo',
    name: 'Harrow & Wealdstone → Elephant & Castle',
    stops: [
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
      'Kilburn Park',
      'Maida Vale',
      'Warwick Avenue',
      'Paddington',
      'Edgware Road',
      'Marylebone',
      'Baker Street',
      'Regent\'s Park',
      'Oxford Circus',
      'Piccadilly Circus',
      'Charing Cross',
      'Embankment',
      'Waterloo',
      'Lambeth North',
      'Elephant & Castle',
    ],
  },
]

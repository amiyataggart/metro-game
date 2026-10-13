import type { Service } from './types'

// Victoria — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 6354920, 6354921, 7672072, 7672073
  {
    line: 'Victoria',
    name: 'Brixton → Walthamstow Central',
    stops: [
      'Brixton',
      'Stockwell',
      'Vauxhall',
      'Pimlico',
      'Victoria',
      'Green Park',
      'Oxford Circus',
      'Warren Street',
      'Euston',
      'King\'s Cross St Pancras',
      'Highbury & Islington',
      'Finsbury Park',
      'Seven Sisters',
      'Tottenham Hale',
      'Blackhorse Road',
      'Walthamstow Central',
    ],
  },
]

import type { Service } from './types'

// Mildmay — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 6413186, 6413187
  {
    line: 'Mildmay',
    name: 'Stratford → Richmond',
    stops: [
      'Stratford',
      'Hackney Wick',
      'Homerton',
      'Hackney Central',
      'Dalston Kingsland',
      'Canonbury',
      'Highbury & Islington',
      'Caledonian Road & Barnsbury',
      'Camden Road',
      'Kentish Town West',
      'Gospel Oak',
      'Hampstead Heath',
      'Finchley Road & Frognal',
      'West Hampstead',
      'Brondesbury',
      'Brondesbury Park',
      'Kensal Rise',
      'Willesden Junction',
      'Acton Central',
      'South Acton',
      'Gunnersbury',
      'Kew Gardens',
      'Richmond',
    ],
  },
  // source: osm relation 9674325, 9674326
  {
    line: 'Mildmay',
    name: 'Clapham Junction → Stratford',
    stops: [
      'Clapham Junction',
      'Imperial Wharf',
      'West Brompton',
      'Kensington (Olympia)',
      'Shepherd\'s Bush',
      'Willesden Junction',
      'Kensal Rise',
      'Brondesbury Park',
      'Brondesbury',
      'West Hampstead',
      'Finchley Road & Frognal',
      'Hampstead Heath',
      'Gospel Oak',
      'Kentish Town West',
      'Camden Road',
      'Caledonian Road & Barnsbury',
      'Highbury & Islington',
      'Canonbury',
      'Dalston Kingsland',
      'Hackney Central',
      'Homerton',
      'Hackney Wick',
      'Stratford',
    ],
  },
]

import type { Service } from './types'

// Jubilee — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 102773, 7673325, 18284772, 18529114, 18529115, 18529117, 18529116, 18529118, 18529119
  {
    line: 'Jubilee',
    name: 'Stratford → Stanmore',
    stops: [
      'Stratford',
      'West Ham',
      'Canning Town',
      'North Greenwich',
      'Canary Wharf',
      'Canada Water',
      'Bermondsey',
      'London Bridge',
      'Southwark',
      'Waterloo',
      'Westminster',
      'Green Park',
      'Bond Street',
      'Baker Street',
      'St John\'s Wood',
      'Swiss Cottage',
      'Finchley Road',
      'West Hampstead',
      'Kilburn',
      'Willesden Green',
      'Dollis Hill',
      'Neasden',
      'Wembley Park',
      'Kingsbury',
      'Queensbury',
      'Canons Park',
      'Stanmore',
    ],
  },
]

import type { Service } from './types'

// Circle — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 102769, 7671006
  {
    line: 'Circle',
    name: 'Hammersmith → Edgware Road',
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
      'Aldgate',
      'Tower Hill',
      'Monument',
      'Cannon Street',
      'Mansion House',
      'Blackfriars',
      'Temple',
      'Embankment',
      'Westminster',
      'St James\'s Park',
      'Victoria',
      'Sloane Square',
      'South Kensington',
      'Gloucester Road',
      'High Street Kensington',
      'Notting Hill Gate',
      'Bayswater',
      'Paddington',
      'Edgware Road',
    ],
  },
]

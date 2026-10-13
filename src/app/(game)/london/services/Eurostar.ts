import type { Service } from './types'

// Eurostar — in-scope all-stations calling patterns (current timetable), trimmed
// at the END_STATIONS in ../scope.ts. Order: from the London terminus outward
// (cross-London services: one end to the other).
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 2905896, 8214799, 2905886
  {
    line: 'Eurostar',
    name: 'St Pancras International (international services; line drawn to Ebbsfleet)',
    stops: [
      'St Pancras International',
    ],
  },
]

import type { Service } from './types'

// EastMidlandsRailway — in-scope all-stations calling patterns (current timetable), trimmed
// at the END_STATIONS in ../scope.ts. Order: from the London terminus outward
// (cross-London services: one end to the other).
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 21471664, 21471663
  {
    line: 'EastMidlandsRailway',
    name: 'St Pancras – Bedford (Corby service, cut at Bedford)',
    stops: [
      'London St Pancras',
      'Luton Airport Parkway',
      'Luton',
      'Bedford',
    ],
  },
  // source: osm relation 6397710, 6397711
  {
    line: 'EastMidlandsRailway',
    name: 'St Pancras – Bedford (Nottingham service, cut at Bedford)',
    stops: [
      'London St Pancras',
      'Luton Airport Parkway',
      'Bedford',
    ],
  },
]

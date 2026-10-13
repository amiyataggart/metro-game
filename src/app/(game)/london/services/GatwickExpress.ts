import type { Service } from './types'

// GatwickExpress — in-scope all-stations calling patterns (current timetable), trimmed
// at the END_STATIONS in ../scope.ts. Order: from the London terminus outward
// (cross-London services: one end to the other).
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 20659567, 20659568
  {
    line: 'GatwickExpress',
    name: 'Victoria – Brighton (peak, stopping)',
    stops: [
      'London Victoria',
      'Gatwick Airport',
      'Haywards Heath',
      'Burgess Hill',
      'Hassocks',
      'Preston Park',
      'Brighton',
    ],
  },
  // source: osm relation 12412729, 6677198
  {
    line: 'GatwickExpress',
    name: 'Victoria – Brighton',
    stops: [
      'London Victoria',
      'Gatwick Airport',
      'Haywards Heath',
      'Brighton',
    ],
  },
  // source: osm relation 6677199, 20659569
  {
    line: 'GatwickExpress',
    name: 'Victoria – Gatwick Airport',
    stops: [
      'London Victoria',
      'Gatwick Airport',
    ],
  },
]

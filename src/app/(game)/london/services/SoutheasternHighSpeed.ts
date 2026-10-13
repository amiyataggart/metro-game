import type { Service } from './types'

// SoutheasternHighSpeed — in-scope all-stations calling patterns (current timetable), trimmed
// at the END_STATIONS in ../scope.ts. Order: from the London terminus outward
// (cross-London services: one end to the other).
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 452775, 3906308
  {
    line: 'SoutheasternHighSpeed',
    name: 'St Pancras – Gravesend (North Kent high speed, cut at Gravesend)',
    stops: [
      'London St Pancras',
      'Stratford International',
      'Ebbsfleet International',
      'Gravesend',
    ],
  },
  // source: osm relation 13110981, 12648799, 452778, 9894316
  {
    line: 'SoutheasternHighSpeed',
    name: 'St Pancras – Ebbsfleet International (HS1 via Ashford, cut at Ebbsfleet)',
    stops: [
      'London St Pancras',
      'Stratford International',
      'Ebbsfleet International',
    ],
  },
]

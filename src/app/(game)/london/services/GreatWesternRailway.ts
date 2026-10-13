import type { Service } from './types'

// GreatWesternRailway — in-scope all-stations calling patterns (current timetable), trimmed
// at the END_STATIONS in ../scope.ts. Order: from the London terminus outward
// (cross-London services: one end to the other).
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 16657383, 16657382
  {
    line: 'GreatWesternRailway',
    name: 'Paddington – Reading (Didcot stopping service, cut at Reading)',
    stops: [
      'London Paddington',
      'Slough',
      'Maidenhead',
      'Twyford',
      'Reading',
    ],
  },
  // source: osm relation 183757, 9773637
  {
    line: 'GreatWesternRailway',
    name: 'Paddington – Reading (fast; Bristol service, cut at Reading)',
    stops: [
      'London Paddington',
      'Reading',
    ],
  },
  // source: osm relation 173259, 11579252
  {
    line: 'GreatWesternRailway',
    name: 'Slough – Windsor & Eton Central',
    stops: [
      'Slough',
      'Windsor and Eton Central',
    ],
  },
  // source: osm relation 17891215, 17891221
  {
    line: 'GreatWesternRailway',
    name: 'Maidenhead – Marlow',
    stops: [
      'Maidenhead',
      'Furze Platt',
      'Cookham',
      'Bourne End',
      'Marlow',
    ],
  },
  // source: osm relation 11579248, 917536
  {
    line: 'GreatWesternRailway',
    name: 'Twyford – Henley-on-Thames',
    stops: [
      'Twyford',
      'Wargrave',
      'Shiplake',
      'Henley-on-Thames',
    ],
  },
  // source: osm relation 17891198, 17891199
  {
    line: 'GreatWesternRailway',
    name: 'West Ealing – Greenford',
    stops: [
      'West Ealing',
      'Drayton Green',
      'Castle Bar Park',
      'South Greenford',
      'Greenford',
    ],
  },
]

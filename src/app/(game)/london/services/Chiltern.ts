import type { Service } from './types'

// Chiltern — in-scope all-stations calling patterns (current timetable), trimmed
// at the END_STATIONS in ../scope.ts. Order: from the London terminus outward
// (cross-London services: one end to the other).
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 20656530, 20656529
  {
    line: 'Chiltern',
    name: 'Marylebone – High Wycombe (via West Ruislip)',
    stops: [
      'London Marylebone',
      'Wembley Stadium',
      'Sudbury Hill Harrow',
      'Northolt Park',
      'South Ruislip',
      'West Ruislip',
      'Denham',
      'Gerrards Cross',
      'Seer Green and Jordans',
      'Beaconsfield',
      'High Wycombe',
    ],
  },
  // source: osm relation 20656528, 20656527
  {
    line: 'Chiltern',
    name: 'Marylebone – High Wycombe (via Denham Golf Club)',
    stops: [
      'London Marylebone',
      'Wembley Stadium',
      'Sudbury Hill Harrow',
      'Northolt Park',
      'South Ruislip',
      'Denham',
      'Denham Golf Club',
      'Gerrards Cross',
      'Seer Green and Jordans',
      'Beaconsfield',
      'High Wycombe',
    ],
  },
  // source: osm relation 20656530
  // knowledge-only stops: Sudbury & Harrow Road
  {
    line: 'Chiltern',
    name: 'Marylebone – High Wycombe (peak, via Sudbury & Harrow Road)',
    stops: [
      'London Marylebone',
      'Wembley Stadium',
      'Sudbury & Harrow Road',
      'Sudbury Hill Harrow',
      'Northolt Park',
      'South Ruislip',
      'West Ruislip',
      'Denham',
      'Gerrards Cross',
      'Seer Green and Jordans',
      'Beaconsfield',
      'High Wycombe',
    ],
  },
  // source: osm relation 20656435, 571753
  {
    line: 'Chiltern',
    name: 'Marylebone – High Wycombe (Aylesbury via Princes Risborough service, cut at High Wycombe)',
    stops: [
      'London Marylebone',
      'Wembley Stadium',
      'Northolt Park',
      'West Ruislip',
      'Denham',
      'Gerrards Cross',
      'High Wycombe',
    ],
  },
  // source: osm relation 20657967, 20657966
  {
    line: 'Chiltern',
    name: 'Marylebone – High Wycombe (Oxford stopping service, cut at High Wycombe)',
    stops: [
      'London Marylebone',
      'Wembley Stadium',
      'Denham',
      'Gerrards Cross',
      'Seer Green and Jordans',
      'Beaconsfield',
      'High Wycombe',
    ],
  },
  // source: osm relation 17887866, 17887867
  {
    line: 'Chiltern',
    name: 'Marylebone – Aylesbury (via Amersham)',
    stops: [
      'London Marylebone',
      'Harrow-on-the-Hill',
      'Rickmansworth',
      'Chorleywood',
      'Chalfont & Latimer',
      'Amersham',
      'Great Missenden',
      'Wendover',
      'Stoke Mandeville',
      'Aylesbury',
    ],
  },
]

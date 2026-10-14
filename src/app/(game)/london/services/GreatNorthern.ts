import type { Service } from './types'

// GreatNorthern — in-scope all-stations calling patterns (current timetable), trimmed
// at the END_STATIONS in ../scope.ts. Order: from the London terminus outward
// (cross-London services: one end to the other).
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 6343225, 6336420
  {
    line: 'GreatNorthern',
    name: 'Moorgate – Welwyn Garden City',
    stops: [
      'Moorgate',
      'Old Street',
      'Essex Road',
      'Highbury & Islington',
      'Drayton Park',
      'Finsbury Park',
      'Harringay',
      'Hornsey',
      'Alexandra Palace',
      'New Southgate',
      'Oakleigh Park',
      'New Barnet',
      'Hadley Wood',
      'Potters Bar',
      'Brookmans Park',
      'Welham Green',
      'Hatfield',
      'Welwyn Garden City',
    ],
  },
  // source: osm relation 16179486, 16179485
  {
    line: 'GreatNorthern',
    name: 'Moorgate – Stevenage (via Hertford North)',
    stops: [
      'Moorgate',
      'Old Street',
      'Essex Road',
      'Highbury & Islington',
      'Drayton Park',
      'Finsbury Park',
      'Harringay',
      'Hornsey',
      'Alexandra Palace',
      'Bowes Park',
      'Palmers Green',
      'Winchmore Hill',
      'Grange Park',
      'Enfield Chase',
      'Gordon Hill',
      'Crews Hill',
      'Cuffley',
      'Bayford',
      'Hertford North',
      'Watton-at-Stone',
      'Stevenage',
    ],
  },
  // source: osm relation 9343757, 6375681
  {
    line: 'GreatNorthern',
    name: 'Moorgate – Hertford North',
    stops: [
      'Moorgate',
      'Old Street',
      'Essex Road',
      'Highbury & Islington',
      'Drayton Park',
      'Finsbury Park',
      'Harringay',
      'Hornsey',
      'Alexandra Palace',
      'Bowes Park',
      'Palmers Green',
      'Winchmore Hill',
      'Grange Park',
      'Enfield Chase',
      'Gordon Hill',
      'Crews Hill',
      'Cuffley',
      'Bayford',
      'Hertford North',
    ],
  },
  // source: osm relation 6369579, 6368113
  {
    line: 'GreatNorthern',
    name: 'King\'s Cross – Stevenage (fast; Peterborough service, cut before Hitchin)',
    stops: [
      'London King\'s Cross',
      'Stevenage',
    ],
  },
  // source: osm relation 6370445, 6370443
  // knowledge-only stops: Cambridge South
  {
    line: 'GreatNorthern',
    name: 'King\'s Cross – Cambridge (stopping)',
    stops: [
      'London King\'s Cross',
      'Finsbury Park',
      'Alexandra Palace',
      'Potters Bar',
      'Hatfield',
      'Welwyn Garden City',
      'Welwyn North',
      'Knebworth',
      'Stevenage',
      'Hitchin',
      'Letchworth Garden City',
      'Baldock',
      'Royston',
      'Meldreth',
      'Shepreth',
      'Foxton',
      'Cambridge South',
      'Cambridge',
    ],
  },
  // source: osm relation 6370444, 16179432
  // knowledge-only stops: Cambridge South
  {
    line: 'GreatNorthern',
    name: 'King\'s Cross – Cambridge (King\'s Lynn service, cut at Cambridge)',
    stops: [
      'London King\'s Cross',
      'Cambridge South',
      'Cambridge',
    ],
  },
]

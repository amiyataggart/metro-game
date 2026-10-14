import type { Service } from './types'

// LondonNorthwestern — in-scope all-stations calling patterns (current timetable), trimmed
// at the END_STATIONS in ../scope.ts. Order: from the London terminus outward
// (cross-London services: one end to the other).
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 20686445, 20686453, 20686446, 20686454
  {
    line: 'LondonNorthwestern',
    name: 'Euston – Tring (Milton Keynes stopping service, cut at Tring)',
    stops: [
      'Euston',
      'Harrow & Wealdstone',
      'Bushey',
      'Watford Junction',
      'Kings Langley',
      'Apsley',
      'Hemel Hempstead',
      'Berkhamsted',
      'Tring',
    ],
  },
  // source: osm relation 20686446, 20686454
  {
    line: 'LondonNorthwestern',
    name: 'Euston – Tring (semi-fast)',
    stops: [
      'Euston',
      'Harrow & Wealdstone',
      'Watford Junction',
      'Hemel Hempstead',
      'Berkhamsted',
      'Tring',
    ],
  },
  // source: osm relation 11568083, 11568082
  {
    line: 'LondonNorthwestern',
    name: 'Watford Junction – St Albans Abbey',
    stops: [
      'Watford Junction',
      'Watford North',
      'Garston (Herts)',
      'Bricket Wood',
      'How Wood',
      'Park Street',
      'St Albans Abbey',
    ],
  },
]

import type { Service } from './types'

// Windrush — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 10114893, 10114892, 660462, 9942198, 9942536, 9942537, 10735352, 10114722
  {
    line: 'Windrush',
    name: 'Highbury & Islington → West Croydon',
    stops: [
      'Highbury & Islington',
      'Canonbury',
      'Dalston Junction',
      'Haggerston',
      'Hoxton',
      'Shoreditch High Street',
      'Whitechapel',
      'Shadwell',
      'Wapping',
      'Rotherhithe',
      'Canada Water',
      'Surrey Quays',
      'New Cross Gate',
      'Brockley',
      'Honor Oak Park',
      'Forest Hill',
      'Sydenham',
      'Penge West',
      'Anerley',
      'Norwood Junction',
      'West Croydon',
    ],
  },
  // source: osm relation 959677, 9683128, 10111208, 10111207
  {
    line: 'Windrush',
    name: 'Highbury & Islington → Crystal Palace',
    stops: [
      'Highbury & Islington',
      'Canonbury',
      'Dalston Junction',
      'Haggerston',
      'Hoxton',
      'Shoreditch High Street',
      'Whitechapel',
      'Shadwell',
      'Wapping',
      'Rotherhithe',
      'Canada Water',
      'Surrey Quays',
      'New Cross Gate',
      'Brockley',
      'Honor Oak Park',
      'Forest Hill',
      'Sydenham',
      'Crystal Palace',
    ],
  },
  // source: osm relation 10107561, 10107560, 2755611, 10106423, 9683129, 10028997, 10028998
  {
    line: 'Windrush',
    name: 'Highbury & Islington → Clapham Junction',
    stops: [
      'Highbury & Islington',
      'Canonbury',
      'Dalston Junction',
      'Haggerston',
      'Hoxton',
      'Shoreditch High Street',
      'Whitechapel',
      'Shadwell',
      'Wapping',
      'Rotherhithe',
      'Canada Water',
      'Surrey Quays',
      'Queens Road Peckham',
      'Peckham Rye',
      'Denmark Hill',
      'Clapham High Street',
      'Wandsworth Road',
      'Clapham Junction',
    ],
  },
  // source: osm relation 10972594, 9942534, 9942535
  {
    line: 'Windrush',
    name: 'New Cross → Highbury & Islington',
    stops: [
      'New Cross',
      'Surrey Quays',
      'Canada Water',
      'Rotherhithe',
      'Wapping',
      'Whitechapel',
      'Shoreditch High Street',
      'Hoxton',
      'Haggerston',
      'Dalston Junction',
      'Canonbury',
      'Highbury & Islington',
    ],
  },
  // source: osm relation 660463, 9942533
  {
    line: 'Windrush',
    name: 'Dalston Junction → New Cross',
    stops: [
      'Dalston Junction',
      'Haggerston',
      'Hoxton',
      'Shoreditch High Street',
      'Whitechapel',
      'Shadwell',
      'Wapping',
      'Rotherhithe',
      'Canada Water',
      'Surrey Quays',
      'New Cross',
    ],
  },
]

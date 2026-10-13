import type { Service } from './types'

// Weaver — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 9105026, 9105027
  {
    line: 'Weaver',
    name: 'Cheshunt → Liverpool Street',
    stops: [
      'Cheshunt',
      'Theobalds Grove',
      'Turkey Street',
      'Southbury',
      'Edmonton Green',
      'Silver Street',
      'White Hart Lane',
      'Bruce Grove',
      'Seven Sisters',
      'Stamford Hill',
      'Stoke Newington',
      'Rectory Road',
      'Hackney Downs',
      'London Fields',
      'Cambridge Heath',
      'Bethnal Green',
      'Liverpool Street',
    ],
  },
  // source: osm relation 9105025, 9105028
  {
    line: 'Weaver',
    name: 'Enfield Town → Liverpool Street',
    stops: [
      'Enfield Town',
      'Bush Hill Park',
      'Edmonton Green',
      'Silver Street',
      'White Hart Lane',
      'Bruce Grove',
      'Seven Sisters',
      'Stamford Hill',
      'Stoke Newington',
      'Rectory Road',
      'Hackney Downs',
      'London Fields',
      'Cambridge Heath',
      'Bethnal Green',
      'Liverpool Street',
    ],
  },
  // source: osm relation 9683722, 9683729
  {
    line: 'Weaver',
    name: 'Chingford → Liverpool Street',
    stops: [
      'Chingford',
      'Highams Park',
      'Wood Street',
      'Walthamstow Central',
      'St James Street',
      'Clapton',
      'Hackney Downs',
      'Bethnal Green',
      'Liverpool Street',
    ],
  },
]

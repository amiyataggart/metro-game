import type { Service } from './types'

// C2c — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 21468044, 21468037, 9953358, 9953359
  {
    line: 'C2c',
    name: 'Shoeburyness → London Fenchurch Street',
    stops: [
      'Shoeburyness',
      'Thorpe Bay',
      'Southend East',
      'Southend Central',
      'Westcliff',
      'Chalkwell',
      'Leigh-on-Sea',
      'Benfleet',
      'Pitsea',
      'Stanford-le-Hope',
      'East Tilbury',
      'Tilbury Town',
      'Grays',
      'Purfleet',
      'Rainham',
      'Dagenham Dock',
      'Barking',
      'West Ham',
      'Limehouse',
      'London Fenchurch Street',
    ],
  },
  // source: osm relation 21468045, 9953200, 9953201, 21468043
  {
    line: 'C2c',
    name: 'Thorpe Bay → London Fenchurch Street',
    stops: [
      'Thorpe Bay',
      'Southend East',
      'Southend Central',
      'Westcliff',
      'Chalkwell',
      'Leigh-on-Sea',
      'Benfleet',
      'Pitsea',
      'Stanford-le-Hope',
      'East Tilbury',
      'Tilbury Town',
      'Grays',
      'Chafford Hundred',
      'Ockendon',
      'Upminster',
      'Barking',
      'West Ham',
      'Limehouse',
      'London Fenchurch Street',
    ],
  },
  // source: osm relation 9950697, 9950698, 21468038, 21468041, 9953202, 9953203, 21468035, 21468042, 21468036, 21468040, 21468039, 21468034
  {
    line: 'C2c',
    name: 'Shoeburyness → London Fenchurch Street',
    stops: [
      'Shoeburyness',
      'Thorpe Bay',
      'Southend East',
      'Southend Central',
      'Westcliff',
      'Chalkwell',
      'Leigh-on-Sea',
      'Benfleet',
      'Pitsea',
      'Basildon',
      'Laindon',
      'West Horndon',
      'Upminster',
      'Barking',
      'West Ham',
      'Limehouse',
      'London Fenchurch Street',
    ],
  },
]

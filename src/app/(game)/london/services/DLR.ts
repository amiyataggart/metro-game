import type { Service } from './types'

// DLR — kept in full (spec §3). Calling patterns are the maximal stop lists of
// the line's OSM route relations (ordering only); membership was audited complete
// against features.json earlier, so no further OSM cross-check beyond a count.
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 7772553, 7772554, 7772549, 7772550
  {
    line: 'DLR',
    name: 'Lewisham → Stratford',
    stops: [
      'Lewisham',
      'Elverson Road',
      'Deptford Bridge',
      'Greenwich',
      'Cutty Sark',
      'Island Gardens',
      'Mudchute',
      'Crossharbour',
      'South Quay',
      'Heron Quays',
      'Canary Wharf',
      'West India Quay',
      'Poplar',
      'All Saints',
      'Langdon Park',
      'Devons Road',
      'Bow Church',
      'Pudding Mill Lane',
      'Stratford',
    ],
  },
  // source: osm relation 7772555, 7772556
  {
    line: 'DLR',
    name: 'Lewisham → Bank',
    stops: [
      'Lewisham',
      'Elverson Road',
      'Deptford Bridge',
      'Greenwich',
      'Cutty Sark',
      'Island Gardens',
      'Mudchute',
      'Crossharbour',
      'South Quay',
      'Heron Quays',
      'Canary Wharf',
      'West India Quay',
      'Westferry',
      'Limehouse',
      'Shadwell',
      'Bank',
    ],
  },
  // source: osm relation 7772559, 7772560
  {
    line: 'DLR',
    name: 'Beckton → Tower Gateway',
    stops: [
      'Beckton',
      'Gallions Reach',
      'Cyprus',
      'Beckton Park',
      'Royal Albert',
      'Prince Regent',
      'Custom House',
      'Royal Victoria',
      'Canning Town',
      'East India',
      'Blackwall',
      'Poplar',
      'Westferry',
      'Limehouse',
      'Shadwell',
      'Tower Gateway',
    ],
  },
  // source: osm relation 7772557, 7772558
  // from features.json membership (OSM relation omits them): Woolwich Arsenal
  {
    line: 'DLR',
    name: 'Woolwich Arsenal → Bank',
    stops: [
      'Woolwich Arsenal',
      'King George V',
      'London City Airport',
      'Pontoon Dock',
      'West Silvertown',
      'Canning Town',
      'East India',
      'Blackwall',
      'Poplar',
      'Westferry',
      'Limehouse',
      'Shadwell',
      'Bank',
    ],
  },
  // source: osm relation 7772551, 7772552
  {
    line: 'DLR',
    name: 'Woolwich Arsenal → Stratford International',
    stops: [
      'King George V',
      'London City Airport',
      'Pontoon Dock',
      'West Silvertown',
      'Canning Town',
      'Star Lane',
      'West Ham',
      'Abbey Road',
      'Stratford High Street',
      'Stratford',
      'Stratford International',
    ],
  },
]

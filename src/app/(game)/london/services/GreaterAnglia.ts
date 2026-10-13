import type { Service } from './types'

// GreaterAnglia — in-scope all-stations calling patterns (current timetable), trimmed
// at the END_STATIONS in ../scope.ts. Order: from the London terminus outward
// (cross-London services: one end to the other).
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 5776936
  {
    line: 'GreaterAnglia',
    name: 'Liverpool Street – Chelmsford (Braintree service, cut at Chelmsford)',
    stops: [
      'London Liverpool Street',
      'Stratford',
      'Romford',
      'Shenfield',
      'Ingatestone',
      'Chelmsford',
    ],
  },
  // source: knowledge (no OSM relation)
  {
    line: 'GreaterAnglia',
    name: 'Liverpool Street – Southend Victoria',
    stops: [
      'London Liverpool Street',
      'Stratford',
      'Shenfield',
      'Billericay',
      'Wickford',
      'Rayleigh',
      'Hockley',
      'Rochford',
      'Southend Airport',
      'Prittlewell',
      'Southend Victoria',
    ],
  },
  // source: osm relation 9107254, 20220901
  {
    line: 'GreaterAnglia',
    name: 'Liverpool Street – Hertford East',
    stops: [
      'London Liverpool Street',
      'Hackney Downs',
      'Tottenham Hale',
      'Ponders End',
      'Brimsdown',
      'Enfield Lock',
      'Waltham Cross',
      'Cheshunt',
      'Broxbourne',
      'Rye House',
      'St Margarets (Herts)',
      'Ware',
      'Hertford East',
    ],
  },
  // source: osm relation 9940826, 9940825
  {
    line: 'GreaterAnglia',
    name: 'Stratford – Bishop\'s Stortford (stopping)',
    stops: [
      'Stratford',
      'Lea Bridge',
      'Tottenham Hale',
      'Northumberland Park',
      'Enfield Lock',
      'Cheshunt',
      'Broxbourne',
      'Roydon',
      'Harlow Town',
      'Harlow Mill',
      'Sawbridgeworth',
      'Bishop\'s Stortford',
    ],
  },
  // source: osm relation 9940823, 9940824
  {
    line: 'GreaterAnglia',
    name: 'Stratford – Bishop\'s Stortford (semi-fast)',
    stops: [
      'Stratford',
      'Lea Bridge',
      'Tottenham Hale',
      'Waltham Cross',
      'Cheshunt',
      'Broxbourne',
      'Harlow Town',
      'Sawbridgeworth',
      'Bishop\'s Stortford',
    ],
  },
  // source: osm relation 10046699, 10046700
  {
    line: 'GreaterAnglia',
    name: 'Stratford – Meridian Water',
    stops: [
      'Stratford',
      'Lea Bridge',
      'Tottenham Hale',
      'Northumberland Park',
      'Meridian Water',
    ],
  },
  // source: osm relation 9107255
  // knowledge-only stops: Cambridge South
  {
    line: 'GreaterAnglia',
    name: 'Liverpool Street – Cambridge (stopping; Ely service, cut at Cambridge)',
    stops: [
      'London Liverpool Street',
      'Tottenham Hale',
      'Cheshunt',
      'Broxbourne',
      'Roydon',
      'Harlow Town',
      'Harlow Mill',
      'Sawbridgeworth',
      'Bishop\'s Stortford',
      'Stansted Mountfitchet',
      'Elsenham',
      'Newport',
      'Audley End',
      'Great Chesterford',
      'Whittlesford Parkway',
      'Shelford',
      'Cambridge South',
      'Cambridge',
    ],
  },
  // source: osm relation 9107260
  {
    line: 'GreaterAnglia',
    name: 'Liverpool Street – Cambridge (semi-fast Ely service, cut at Cambridge)',
    stops: [
      'London Liverpool Street',
      'Tottenham Hale',
      'Cheshunt',
      'Broxbourne',
      'Harlow Town',
      'Bishop\'s Stortford',
      'Audley End',
      'Whittlesford Parkway',
      'Cambridge',
    ],
  },
  // source: osm relation 20158036, 20158039
  {
    line: 'GreaterAnglia',
    name: 'Stansted Express (via Stansted Mountfitchet)',
    stops: [
      'London Liverpool Street',
      'Tottenham Hale',
      'Bishop\'s Stortford',
      'Stansted Mountfitchet',
      'Stansted Airport',
    ],
  },
  // source: osm relation 9107186, 9107185
  {
    line: 'GreaterAnglia',
    name: 'Stansted Express (via Harlow Town)',
    stops: [
      'London Liverpool Street',
      'Tottenham Hale',
      'Harlow Town',
      'Stansted Airport',
    ],
  },
]

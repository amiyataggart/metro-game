import type { AliasConfig } from '@/lib/matching'

// Curated matching config for the London game. Aliases whose target station
// isn't on the map are ignored, so entries may name stations a later data
// phase adds (e.g. 'Ashford (Surrey)', 'London Cable Car' stations).
export const LONDON_ALIASES: AliasConfig = {
  groups: [
    [
      "King's Cross St Pancras",
      "London King's Cross",
      'St Pancras International',
      'London St Pancras',
    ],
    // Two distinct stations, one guess lights both (dormant until Task 8
    // renames them in features.json).
    ['St Margarets (London)', 'St Margarets (Herts)'],
  ],
  aliases: {
    kx: "King's Cross St Pancras",
    'kings x': "King's Cross St Pancras",
    t4: 'Heathrow Terminal 4',
    'heathrow t4': 'Heathrow Terminal 4',
    t5: 'Heathrow Terminal 5',
    'heathrow t5': 'Heathrow Terminal 5',
    t2: 'Heathrow Terminals 2 & 3',
    t3: 'Heathrow Terminals 2 & 3',
    'heathrow t2': 'Heathrow Terminals 2 & 3',
    'heathrow t3': 'Heathrow Terminals 2 & 3',
    'heathrow terminal 2': 'Heathrow Terminals 2 & 3',
    'heathrow terminal 3': 'Heathrow Terminals 2 & 3',
    olympia: 'Kensington (Olympia)',
    'ashford surrey': 'Ashford (Surrey)',
    'city airport': 'London City Airport',
    'st margarets': 'St Margarets (London)',
  },
  ambiguous: [
    'heathrow', 'walthamstow', 'bromley', 'croydon', 'ealing', 'harrow',
    'wembley', 'acton', 'battersea', 'finchley', 'clapham', 'dulwich',
  ],
  prefixKeepers: [
    'London Bridge',
    'London Fields',
    'London Road (Brighton)',
    'London Road (Guildford)',
    'London City Airport',
  ],
}

// Real places (not stations on the map) that are one typo from a game
// station and would otherwise light it — e.g. Brackley (town, station
// closed) vs Brockley. Used as matcher decoys only.
export const EXTRA_DECOYS: string[] = [
  'Axbridge', 'Bollington', 'Brackley', 'Cambourne', 'Eckington', 'Faringdon',
  'Felpham', 'Hawes', 'Hemsworth', 'Hornsea', 'Kington', 'Langport', 'Lerwick',
  'Otley', 'Plympton', 'Ramsey', 'Reepham', 'Salcombe', 'Shefford', 'Somerton',
  'Stanley', 'Stretford', 'Tidworth',
]

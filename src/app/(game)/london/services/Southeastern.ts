import type { Service } from './types'

// Southeastern — in-scope all-stations calling patterns (current timetable), trimmed
// at the END_STATIONS in ../scope.ts. Order: from the London terminus outward
// (cross-London services: one end to the other).
// OSM relation stop lists cached in the Task 6 scratch dir (raw-relations.json).

export const services: Service[] = [
  // source: osm relation 8648634, 8648633, 8648175
  {
    line: 'Southeastern',
    name: 'Cannon Street – Hayes',
    stops: [
      'Cannon Street',
      'London Bridge',
      'New Cross',
      'St Johns',
      'Lewisham',
      'Ladywell',
      'Catford Bridge',
      'Lower Sydenham',
      'New Beckenham',
      'Clock House',
      'Elmers End',
      'Eden Park',
      'West Wickham',
      'Hayes',
    ],
  },
  // source: osm relation 8648175, 8648176
  {
    line: 'Southeastern',
    name: 'Charing Cross – Hayes',
    stops: [
      'London Charing Cross',
      'London Bridge',
      'Ladywell',
      'Catford Bridge',
      'Lower Sydenham',
      'New Beckenham',
      'Clock House',
      'Elmers End',
      'Eden Park',
      'West Wickham',
      'Hayes',
    ],
  },
  // source: osm relation 8649475, 8649474
  {
    line: 'Southeastern',
    name: 'Cannon Street – Orpington (via Grove Park)',
    stops: [
      'Cannon Street',
      'London Bridge',
      'New Cross',
      'St Johns',
      'Lewisham',
      'Hither Green',
      'Grove Park',
      'Elmstead Woods',
      'Chislehurst',
      'Petts Wood',
      'Orpington',
    ],
  },
  // source: osm relation 6490906, 8649475
  // knowledge-only stops: Waterloo East, Chelsfield, Knockholt, Dunton Green
  {
    line: 'Southeastern',
    name: 'Charing Cross – Sevenoaks (stopping via Orpington)',
    stops: [
      'London Charing Cross',
      'Waterloo East',
      'London Bridge',
      'Hither Green',
      'Grove Park',
      'Elmstead Woods',
      'Chislehurst',
      'Petts Wood',
      'Orpington',
      'Chelsfield',
      'Knockholt',
      'Dunton Green',
      'Sevenoaks',
    ],
  },
  // source: osm relation 9890976, 6490906
  {
    line: 'Southeastern',
    name: 'Charing Cross – Sevenoaks (fast; Dover/Hastings services, cut at Sevenoaks)',
    stops: [
      'London Charing Cross',
      'Waterloo East',
      'London Bridge',
      'Sevenoaks',
    ],
  },
  // source: osm relation 6490906, 6490907
  {
    line: 'Southeastern',
    name: 'Charing Cross – Sevenoaks (via Orpington; Hastings service, cut at Sevenoaks)',
    stops: [
      'London Charing Cross',
      'Orpington',
      'Sevenoaks',
    ],
  },
  // source: osm relation 452777, 10013355
  // knowledge-only stops: Hither Green, Lee, Mottingham, Albany Park
  {
    line: 'Southeastern',
    name: 'Charing Cross – Gravesend (via Sidcup)',
    stops: [
      'London Charing Cross',
      'Waterloo East',
      'London Bridge',
      'Hither Green',
      'Lee',
      'Mottingham',
      'New Eltham',
      'Sidcup',
      'Albany Park',
      'Bexley',
      'Crayford',
      'Dartford',
      'Stone Crossing',
      'Greenhithe',
      'Swanscombe',
      'Northfleet',
      'Gravesend',
    ],
  },
  // source: osm relation 10013354, 10013353
  // knowledge-only stops: Falconwood
  {
    line: 'Southeastern',
    name: 'Charing Cross – Dartford (via Bexleyheath)',
    stops: [
      'London Charing Cross',
      'Waterloo East',
      'London Bridge',
      'Lewisham',
      'Blackheath',
      'Kidbrooke',
      'Eltham',
      'Falconwood',
      'Welling',
      'Bexleyheath',
      'Barnehurst',
      'Dartford',
    ],
  },
  // source: osm relation 10013394, 10013395
  // knowledge-only stops: Deptford, Greenwich, Maze Hill, Westcombe Park, Charlton, Woolwich Dockyard, Woolwich Arsenal, Plumstead, Abbey Wood, Belvedere, Erith, Slade Green
  {
    line: 'Southeastern',
    name: 'Cannon Street – Dartford (via Greenwich & Woolwich)',
    stops: [
      'Cannon Street',
      'London Bridge',
      'Deptford',
      'Greenwich',
      'Maze Hill',
      'Westcombe Park',
      'Charlton',
      'Woolwich Dockyard',
      'Woolwich Arsenal',
      'Plumstead',
      'Abbey Wood',
      'Belvedere',
      'Erith',
      'Slade Green',
      'Dartford',
    ],
  },
  // source: osm relation 452776 ("South Eastern Metro Semifast Charing Cross - Gillingham";
  // its ways run Lewisham – Blackheath – Charlton (Blackheath to Charlton Line,
  // ways 22716004/22716005) – Woolwich; checked on Overpass, osm3s 2026-10-12T19:17Z).
  // The relation has no stop members: every stop below is knowledge-only. Medway
  // section cut at Gravesend.
  {
    line: 'Southeastern',
    name: 'Charing Cross – Gravesend (via Blackheath & Woolwich, cut at Gravesend)',
    stops: [
      'London Charing Cross',
      'Waterloo East',
      'London Bridge',
      'Lewisham',
      'Blackheath',
      'Charlton',
      'Woolwich Arsenal',
      'Abbey Wood',
      'Dartford',
      'Greenhithe',
      'Gravesend',
    ],
  },
  // source: knowledge (no OSM relation)
  {
    line: 'Southeastern',
    name: 'Victoria – Dartford (via Peckham Rye, Lewisham & Bexleyheath)',
    stops: [
      'London Victoria',
      'Denmark Hill',
      'Peckham Rye',
      'Nunhead',
      'Lewisham',
      'Blackheath',
      'Kidbrooke',
      'Eltham',
      'Falconwood',
      'Welling',
      'Bexleyheath',
      'Barnehurst',
      'Dartford',
    ],
  },
  // source: osm relation 9897352, 9897351
  // knowledge-only stops: London Victoria, Brixton, West Dulwich
  {
    line: 'Southeastern',
    name: 'Victoria – Orpington (via Herne Hill & Beckenham Junction)',
    stops: [
      'London Victoria',
      'Brixton',
      'Herne Hill',
      'West Dulwich',
      'Sydenham Hill',
      'Penge East',
      'Kent House',
      'Beckenham Junction',
      'Shortlands',
      'Bromley South',
      'Bickley',
      'Petts Wood',
      'Orpington',
    ],
  },
  // source: osm relation 21624892, 21624893, 9892127, 9897219
  {
    line: 'Southeastern',
    name: 'Victoria – Otford (Ashford via Maidstone East service, cut at Otford)',
    stops: [
      'London Victoria',
      'Bromley South',
      'St Mary Cray',
      'Swanley',
      'Otford',
    ],
  },
  // source: osm relation 21622606, 21622607
  {
    line: 'Southeastern',
    name: 'Victoria – Swanley (Gillingham service via Catford loop, cut at Swanley)',
    stops: [
      'London Victoria',
      'Denmark Hill',
      'Crofton Park',
      'Bellingham',
      'Bromley South',
      'St Mary Cray',
      'Swanley',
    ],
  },
  // source: osm relation 19348550, 19348549
  {
    line: 'Southeastern',
    name: 'Grove Park – Bromley North',
    stops: [
      'Grove Park',
      'Sundridge Park',
      'Bromley North',
    ],
  },
  // Blackfriars services (weekday peaks only), via Elephant & Castle.
  // source: Realtime Trains WTT, Mon–Fri 15 Oct 2026 (2D81–2D89 up 0700–0900
  // half-hourly from Beckenham Jn; 2M83/2M87 down 1728/1828). Holborn Viaduct –
  // Herne Hill line via Loughborough Jn, then the Chatham main line.
  {
    line: 'Southeastern',
    name: 'Blackfriars – Beckenham Junction (via Herne Hill; weekday peaks)',
    stops: [
      'Blackfriars',
      'Elephant & Castle',
      'Loughborough Junction',
      'Herne Hill',
      'West Dulwich',
      'Sydenham Hill',
      'Penge East',
      'Kent House',
      'Beckenham Junction',
    ],
  },
  // source: Realtime Trains WTT 15 Oct 2026 (1F91 0649 Maidstone East – Blackfriars,
  // 1F97 1744 back); fast Elephant & Castle – Bromley South over the Catford loop.
  // Cut at Otford. One train each way, weekdays.
  {
    line: 'Southeastern',
    name: 'Blackfriars – Otford (Maidstone East peak service via Catford loop, cut at Otford)',
    stops: ['Blackfriars', 'Elephant & Castle', 'Bromley South', 'St Mary Cray', 'Swanley', 'Otford'],
  },
  // source: Realtime Trains WTT 15 Oct 2026 (2K93 0730 Gillingham – Blackfriars,
  // 2K95 1710 Blackfriars – Rochester). Same route; cut at Swanley.
  {
    line: 'Southeastern',
    name: 'Blackfriars – Swanley (Gillingham/Rochester peak service via Catford loop, cut at Swanley)',
    stops: ['Blackfriars', 'Elephant & Castle', 'Bromley South', 'St Mary Cray', 'Swanley'],
  },
  // source: Realtime Trains WTT 15 Oct 2026 (2Y95 0847 Crayford – Blackfriars,
  // Mon–Fri, up only) via Sidcup, Lewisham, Nunhead, Peckham Rye, Denmark Hill.
  {
    line: 'Southeastern',
    name: 'Blackfriars – Crayford (via Denmark Hill, Lewisham & Sidcup; one morning train)',
    stops: [
      'Blackfriars',
      'Elephant & Castle',
      'Denmark Hill',
      'Peckham Rye',
      'Nunhead',
      'Lewisham',
      'Hither Green',
      'Lee',
      'Mottingham',
      'New Eltham',
      'Sidcup',
      'Albany Park',
      'Bexley',
      'Crayford',
    ],
  },
]

/*
 * Network scope (spec §3, APPROVED by the user 2026-10-12).
 *
 * Rule: Greater London plus selected commuter destinations. Explicitly OUT
 * (user): Basingstoke, Medway towns, Milton Keynes, Colchester, Tunbridge
 * Wells / Tonbridge. Peterborough branch cut at Hitchin; Cambridge, Cambridge
 * South and Cambridge North are IN.
 *
 * Used at build time: scripts/build-stations.js (stations come only from the
 * scoped service tables) and scripts/clip-to-scope.js (route geometry of the
 * END_STATIONS lines is clipped to the stretches between their stops, run from
 * build-ribbons.js). There is no render-time clipping.
 * Station names follow features.json where the station exists; new stations
 * use the official National Rail name. User-decided display renames (applied to
 * features.json in Task 8): "Dorking Main" -> "Dorking", "St Margarets" ->
 * "St Margarets (London)" (SWR) / "St Margarets (Herts)" (Greater Anglia).
 */

/** Lines kept in full — every station on the line is in scope. */
export const FULL_LINES = new Set<string>([
  // London Underground
  'Bakerloo', 'Central', 'Circle', 'District', 'HammersmithAndCity', 'Jubilee',
  'Metropolitan', 'Northern', 'Piccadilly', 'Victoria', 'WaterlooAndCity',
  // London Overground
  'Liberty', 'Lioness', 'Mildmay', 'Suffragette', 'Weaver', 'Windrush',
  // Others kept in full
  'ElizabethLine', 'DLR', 'Tramlink', 'HeathrowExpress', 'C2c', 'CableCar',
])

/**
 * Line -> outermost kept stations (inclusive), as listed in spec §3. Services
 * in services/<Line>.ts stop at or before these. Notes on interpretation:
 *  - "Sutton loop" (Thameslink) / "Dartford loops" (Southeastern) are listed by
 *    their turning station.
 *  - SWR "Chertsey loop" has no end station; Weybridge (where it rejoins) is listed.
 *  - Southeastern "Sevenoaks (both routes)": Southeastern trains on the Otford
 *    route continue to Maidstone East, so they are cut at Otford; the Chatham
 *    main line (Victoria – Gillingham) is cut at Swanley.
 *  - Eurostar keeps St Pancras International only (line drawn to Ebbsfleet).
 */
export const END_STATIONS: Record<string, string[]> = {
  Thameslink: [
    'Bedford', 'Luton', 'Cambridge', 'Hitchin', 'Brighton', 'Horsham', 'East Grinstead',
    'Sevenoaks', 'Orpington', 'Gravesend', 'Sutton',
  ],
  GreatNorthern: ['Welwyn Garden City', 'Hitchin', 'Stevenage', 'Cambridge North'],
  Southern: [
    'Brighton', 'Horsham', 'East Grinstead', 'Hurst Green', 'Redhill', 'Reigate',
    'Epsom Downs', 'Tattenham Corner', 'Caterham', 'Watford Junction',
  ],
  GatwickExpress: ['Brighton'],
  SouthWesternRailway: [
    'Reading', 'Windsor and Eton Riverside', 'Woking', 'Guildford', 'Dorking',
    'Shepperton', 'Hampton Court', 'Chessington South', 'Weybridge',
  ],
  GreatWesternRailway: ['Reading', 'Windsor and Eton Central', 'Marlow', 'Henley-on-Thames', 'Greenford'],
  Chiltern: ['High Wycombe', 'Aylesbury'],
  LondonNorthwestern: ['Tring', 'St Albans Abbey'],
  EastMidlandsRailway: ['Bedford'],
  GreaterAnglia: ['Chelmsford', 'Southend Victoria', 'Hertford East', 'Stansted Airport', 'Cambridge North'],
  Southeastern: ['Sevenoaks', 'Otford', 'Swanley', 'Gravesend', 'Dartford', 'Hayes', 'Bromley North', 'Orpington'],
  SoutheasternHighSpeed: ['Ebbsfleet International', 'Gravesend'],
  Eurostar: ['St Pancras International'],
}

/**
 * Line -> stations (of other lines) its geometry is drawn on to although it is
 * not playable there. The clip keeps the track between the line's own stations
 * and these. Eurostar is playable at St Pancras International only but drawn
 * to Ebbsfleet International (spec §3).
 */
export const DRAWN_TO: Record<string, string[]> = {
  Eurostar: ['Ebbsfleet International'],
}

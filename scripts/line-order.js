/*
 * Line cross-track ordering key — mirrors `order` in
 * src/app/(game)/london/config.ts (the same value drives `line-sort-key`).
 * build-ribbons.js packs corridor lanes by this key, so cross-track order
 * equals draw order. Keep in sync with config.ts if the order ever changes.
 */
module.exports = {
  Bakerloo: 0,
  Central: 1,
  Circle: 2,
  District: 3,
  HammersmithAndCity: 4,
  Jubilee: 5,
  Metropolitan: 6,
  Northern: 7,
  Piccadilly: 8,
  Victoria: 9,
  WaterlooAndCity: 10,
  Liberty: 11,
  Lioness: 12,
  Mildmay: 13,
  Suffragette: 14,
  Weaver: 15,
  Windrush: 16,
  ElizabethLine: 17,
  DLR: 18,
  Thameslink: 19,
  Tramlink: 20,
  C2c: 21,
  Chiltern: 22,
  EastMidlandsRailway: 23,
  GatwickExpress: 24,
  GreatNorthern: 25,
  GreatWesternRailway: 26,
  GreaterAnglia: 27,
  HeathrowExpress: 28,
  SouthWesternRailway: 29,
  Southeastern: 30,
  SoutheasternHighSpeed: 31,
  Southern: 32,
}

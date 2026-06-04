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
  ElizabethLine: 11,
  DLR: 12,
  Lioness: 13,
  Mildmay: 14,
  Windrush: 15,
  Weaver: 16,
  Suffragette: 17,
  Liberty: 18,
  Thameslink: 19,
  SouthWesternRailway: 20,
  C2c: 21,
  GreaterAnglia: 22,
  Southeastern: 23,
  SoutheasternHighSpeed: 24,
  Southern: 25,
  GreatNorthern: 26,
  GatwickExpress: 27,
  Chiltern: 28,
  EastMidlandsRailway: 29,
  GreatWesternRailway: 30,
  HeathrowExpress: 31,
}

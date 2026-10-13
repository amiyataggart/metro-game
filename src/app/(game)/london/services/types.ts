/**
 * A curated calling pattern. `stops` is ordered from the London terminus
 * outward (cross-London services: one end to the other). Station names equal
 * features.json names where the station exists; stations not yet in the data
 * use their official National Rail name.
 */
export interface Service {
  /** Line key, as in config.ts LINES (plus LondonNorthwestern, Eurostar, CableCar). */
  line: string
  /** Human-readable service description. */
  name: string
  /** Ordered stop names. */
  stops: string[]
}

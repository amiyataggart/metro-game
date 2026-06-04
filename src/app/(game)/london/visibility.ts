/*
 * Visibility filters — HIDE (do not delete) certain services/stops from the
 * rendered map. Applied in page.tsx when building the GeoJSON passed to the
 * client, so hidden features never reach MapLibre (they don't render and don't
 * consume runtime memory). Fully reversible: empty HIDDEN_LINES and/or set
 * THAMESLINK_TRIM = false to bring everything back. The underlying
 * routes.json / features.json data is left intact.
 */
import type { LineString, MultiLineString, Point, Position } from 'geojson'
import type { Line } from '@/lib/types'
import { DISPLAY_BOUNDS } from './config'

// 0. Display-bounds clip. Lines + stations are stored in full (National Rail
//    routes run far past London); only the portion inside DISPLAY_BOUNDS is
//    shown and playable. Driven entirely by the bounds, so widening the box
//    later reveals more of the stored network with no re-fetch.
const [[MIN_LNG, MIN_LAT], [MAX_LNG, MAX_LAT]] = DISPLAY_BOUNDS
function inDisplayBounds(c: Position): boolean {
  return c[0] >= MIN_LNG && c[0] <= MAX_LNG && c[1] >= MIN_LAT && c[1] <= MAX_LAT
}
// Clip a coordinate sequence to maximal runs that lie inside the box, keeping
// the first out-of-bounds vertex on each side so the line reaches the edge
// rather than stopping short of it.
function clipRunsToBounds(coords: Position[]): Position[][] {
  const runs: Position[][] = []
  let run: Position[] = []
  for (let i = 0; i < coords.length; i++) {
    if (inDisplayBounds(coords[i])) {
      if (run.length === 0 && i > 0) run.push(coords[i - 1]) // lead-in vertex
      run.push(coords[i])
    } else if (run.length) {
      run.push(coords[i]) // trailing vertex so the line exits the frame
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)
  return runs.filter((r) => r.length >= 2)
}

// 1. Whole services hard-hidden from the map, legend, settings, picker and
//    score. Currently none — add a line key here to hide it from the game.
export const HIDDEN_LINES = new Set<string>([])

// 2. Thameslink: keep only the core network, trimming each branch at the named
//    boundary station. "Beyond" = farther from central London, along that
//    branch's bearing, than the boundary station.
export const THAMESLINK_TRIM = false
const THAMESLINK = 'Thameslink'

// Central reference (Farringdon-ish) and a flat-earth km metric (fine at city scale).
const C: Position = [-0.1247, 51.5203]
const KM_LAT = 111.32
const KM_LNG = 69.3 // at ~51.5N
const dkm = (p: Position) =>
  Math.hypot((p[0] - C[0]) * KM_LNG, (p[1] - C[1]) * KM_LAT)
const brg = (p: Position) =>
  (Math.atan2((p[0] - C[0]) * KM_LNG, (p[1] - C[1]) * KM_LAT) * 180) / Math.PI

// The five boundary stations (keep up to and including these).
const BOUNDARY_COORDS: Position[] = [
  [-0.396, 51.873], // Luton Airport Parkway
  [-0.203, 51.801], // Welwyn Garden City
  [-0.161, 51.155], // Gatwick Airport
  [0.368, 51.441], // Gravesend
  [0.182, 51.277], // Sevenoaks
]
const BOUNDS = BOUNDARY_COORDS.map((c) => ({ d: dkm(c), b: brg(c) }))
const angDiff = (a: number, b: number) => {
  const x = Math.abs(a - b) % 360
  return x > 180 ? 360 - x : x
}
// Keep a Thameslink coordinate if it's no farther out than the boundary station
// on the most-similar bearing (3% margin so the boundary station itself stays).
function thameslinkInExtent(coord: Position): boolean {
  const d = dkm(coord)
  const b = brg(coord)
  let best = BOUNDS[0]
  for (const x of BOUNDS) if (angDiff(b, x.b) < angDiff(b, best.b)) best = x
  return d <= best.d * 1.03
}

// ---- station (Point) features ----
export function visibleStationFeatures<
  T extends { properties: { line?: string }; geometry: Point },
>(features: T[]): T[] {
  return features.filter((f) => {
    const line = f.properties.line
    if (!line || HIDDEN_LINES.has(line)) return false
    if (!inDisplayBounds(f.geometry.coordinates)) return false
    if (THAMESLINK_TRIM && line === THAMESLINK) {
      return thameslinkInExtent(f.geometry.coordinates)
    }
    return true
  })
}

// ---- route (LineString) features: drop hidden lines, clip Thameslink tails ----
export function visibleRouteFeatures<
  T extends { properties: { line?: string }; geometry: LineString | MultiLineString },
>(features: T[]): T[] {
  const out: T[] = []
  for (const f of features) {
    const line = f.properties.line
    if (line && HIDDEN_LINES.has(line)) continue

    // Flatten to one or more coordinate sequences (LineString → 1, MLS → N).
    const seqs: Position[][] =
      f.geometry.type === 'MultiLineString'
        ? (f.geometry.coordinates as Position[][])
        : [f.geometry.coordinates as Position[]]

    // Optional Thameslink bearing/distance trim (off by default): split each
    // sequence into maximal in-extent runs before the bounds clip.
    const trimmed: Position[][] =
      THAMESLINK_TRIM && line === THAMESLINK
        ? seqs.flatMap((seq) => splitRunsBy(seq, thameslinkInExtent))
        : seqs

    // Clip every line to the display box. Lines fully inside (all existing
    // ones) come back as a single unchanged run.
    for (const seq of trimmed) {
      for (const run of clipRunsToBounds(seq)) out.push(makeRun(f, run))
    }
  }
  return out
}

// Split a coordinate sequence into maximal runs where pred holds.
function splitRunsBy(coords: Position[], pred: (c: Position) => boolean): Position[][] {
  const runs: Position[][] = []
  let run: Position[] = []
  for (const c of coords) {
    if (pred(c)) run.push(c)
    else if (run.length) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)
  return runs
}

function makeRun<T extends { geometry: LineString | MultiLineString }>(
  f: T,
  coords: Position[],
): T {
  return { ...f, geometry: { type: 'LineString', coordinates: coords } } as T
}

// ---- line config: drop hidden lines from legend / settings / colour match ----
export function visibleLines(lines: { [k: string]: Line }): { [k: string]: Line } {
  const out: { [k: string]: Line } = {}
  for (const k of Object.keys(lines)) if (!HIDDEN_LINES.has(k)) out[k] = lines[k]
  return out
}

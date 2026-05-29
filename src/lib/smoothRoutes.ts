// Render-time line smoothing — EXPLORATORY / NON-DESTRUCTIVE.
//
// Goal: make ribbons read as smooth curves around bends instead of a chain of
// straight segments meeting at hard angles, WITHOUT moving any data. This runs
// purely on the GeoJSON handed to the map source; `routes.json`, station
// markers, and each segment's `laneOff` are never touched. Every original
// vertex stays exactly where it is — we only INSERT interpolated points between
// existing ones, and only around corners sharper than a threshold.
//
// Method: centripetal Catmull-Rom (alpha = 0.5). Two properties make it the
// right tool here:
//   1. The curve passes THROUGH every control point — so original vertices
//      (and therefore route positions / ribbon points) are preserved exactly.
//      This is the difference from Chaikin/corner-cutting, which moves points
//      (that build-time experiment corrupted the Circle loop — see README).
//   2. Centripetal parameterisation provably never forms cusps or self-loops,
//      so even hairpins round cleanly instead of overshooting.
// Collinear control points interpolate to a straight line, so long straight
// runs stay straight and only genuine bends gain curvature.
//
// Because co-running lines share a centreline and are separated at render time
// by `line-offset` (along the normal), smoothing the shared centreline keeps
// them parallel — the offset is applied AFTER this, to the smoothed path.

import type { Feature, LineString, MultiLineString, Position } from 'geojson'
import type { RoutesFeatureCollection } from './types'

type Pt = [number, number]

export interface SmoothOptions {
  /** Only round a vertex whose turn (deviation from straight) exceeds this. */
  angleThresholdDeg?: number
  /** Interpolated points inserted per subdivided segment (higher = smoother). */
  samplesPerSegment?: number
  /**
   * Don't subdivide segments already shorter than this (metres). Where OSM
   * sampled a curve densely the polyline is already smooth — subdividing it
   * just bloats the payload for no visual gain. Jaggedness only shows on LONG
   * segments meeting at an angle, so we focus the work there.
   */
  minSegmentMeters?: number
  /** Treat a line whose ends coincide (e.g. the Circle loop) as a closed ring. */
  closeRings?: boolean
}

const DEFAULTS: Required<SmoothOptions> = {
  // Cranked up for testing: round almost every visible bend (was 18° — that
  // only caught the sharp free-running corners on long lines), at high
  // resolution, but only on segments long enough to actually look angular.
  angleThresholdDeg: 4,
  samplesPerSegment: 24,
  minSegmentMeters: 30,
  closeRings: true,
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])

// Approx ground distance in metres at London latitude (equirectangular — fine
// for the short, local spans we gate on).
const M_PER_DEG_LAT = 111_320
const M_PER_DEG_LNG = 111_320 * Math.cos((51.5 * Math.PI) / 180)
const metres = (a: Pt, b: Pt) =>
  Math.hypot((b[0] - a[0]) * M_PER_DEG_LNG, (b[1] - a[1]) * M_PER_DEG_LAT)

/** Turn angle in degrees at b for the path a->b->c (0 = straight, 180 = U-turn). */
function turnDeg(a: Pt, b: Pt, c: Pt): number {
  const v1x = b[0] - a[0],
    v1y = b[1] - a[1]
  const v2x = c[0] - b[0],
    v2y = c[1] - b[1]
  const m1 = Math.hypot(v1x, v1y),
    m2 = Math.hypot(v2x, v2y)
  if (m1 === 0 || m2 === 0) return 0
  const cos = (v1x * v2x + v1y * v2y) / (m1 * m2)
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

/**
 * One centripetal Catmull-Rom sample at parameter u in [0,1] on the segment
 * p1->p2, using p0 and p3 as the surrounding tangent context.
 */
function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt {
  const alpha = 0.5
  const t0 = 0
  const t1 = t0 + Math.pow(dist(p0, p1), alpha)
  const t2 = t1 + Math.pow(dist(p1, p2), alpha)
  const t3 = t2 + Math.pow(dist(p2, p3), alpha)
  // Degenerate (coincident) knots — fall back to a straight lerp.
  if (t1 === t0 || t2 === t1 || t3 === t2) {
    return [p1[0] + (p2[0] - p1[0]) * u, p1[1] + (p2[1] - p1[1]) * u]
  }
  const t = t1 + (t2 - t1) * u
  const lerp = (a: Pt, b: Pt, ta: number, tb: number): Pt => {
    const w = (tb - t) / (tb - ta)
    return [a[0] * w + b[0] * (1 - w), a[1] * w + b[1] * (1 - w)]
  }
  const A1 = lerp(p0, p1, t0, t1)
  const A2 = lerp(p1, p2, t1, t2)
  const A3 = lerp(p2, p3, t2, t3)
  const B1 = lerp(A1, A2, t0, t2)
  const B2 = lerp(A2, A3, t1, t3)
  return lerp(B1, B2, t1, t2)
}

/** Smooth a single ring/line of positions, preserving every input vertex. */
function smoothLine(coords: Position[], opts: Required<SmoothOptions>): Position[] {
  const n = coords.length
  if (n < 3) return coords
  const pts = coords.map((c) => [c[0], c[1]] as Pt)

  const closed =
    opts.closeRings &&
    pts[0][0] === pts[n - 1][0] &&
    pts[0][1] === pts[n - 1][1]

  // Working ring of unique vertices (drop the duplicated closing point).
  const ring = closed ? pts.slice(0, -1) : pts
  const m = ring.length
  const at = (i: number): Pt =>
    closed ? ring[((i % m) + m) % m] : ring[Math.max(0, Math.min(m - 1, i))]

  // Flag each vertex whose turn exceeds the threshold — only segments touching
  // such a vertex get subdivided, so straight runs stay as single segments.
  const harsh = new Array(m).fill(false)
  for (let i = 0; i < m; i++) {
    if (!closed && (i === 0 || i === m - 1)) continue
    if (turnDeg(at(i - 1), at(i), at(i + 1)) > opts.angleThresholdDeg) {
      harsh[i] = true
    }
  }

  const out: Position[] = [ring[0]]
  const segCount = closed ? m : m - 1
  for (let i = 0; i < segCount; i++) {
    const a = i
    const b = closed ? (i + 1) % m : i + 1
    // Round this segment only if it touches a harsh corner AND is long enough
    // to read as jagged — dense, already-smooth segments are left untouched.
    const subdivide =
      (harsh[a] || harsh[b]) && metres(at(a), at(b)) >= opts.minSegmentMeters
    if (subdivide) {
      const p0 = at(a - 1)
      const p1 = at(a)
      const p2 = at(b)
      const p3 = at(b + 1)
      for (let s = 1; s < opts.samplesPerSegment; s++) {
        out.push(catmullRom(p0, p1, p2, p3, s / opts.samplesPerSegment))
      }
    }
    out.push(ring[b] ?? ring[0])
  }
  if (closed) out.push(ring[0]) // re-close the ring
  return out
}

/**
 * Return a new FeatureCollection with each LineString / MultiLineString
 * smoothed. The input is not mutated. Properties (incl. `laneOff`, `line`,
 * `color`, `order`) are carried through untouched.
 */
export function smoothRoutes(
  fc: RoutesFeatureCollection,
  options: SmoothOptions = {},
): RoutesFeatureCollection {
  const opts = { ...DEFAULTS, ...options }
  const features = fc.features.map((f): Feature<LineString | MultiLineString, any> => {
    const g = f.geometry
    if (g.type === 'LineString') {
      return {
        ...f,
        geometry: { type: 'LineString', coordinates: smoothLine(g.coordinates, opts) },
      }
    }
    if (g.type === 'MultiLineString') {
      return {
        ...f,
        geometry: {
          type: 'MultiLineString',
          coordinates: g.coordinates.map((line) => smoothLine(line, opts)),
        },
      }
    }
    return f
  })
  return { ...fc, features } as RoutesFeatureCollection
}

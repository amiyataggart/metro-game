#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * LAB v2 — /lab/graph2 and /lab/graph3. Same idea as /lab/graph (build-lab-tracks.js),
 * with the problems found reviewing it fixed:
 *
 *  - HYBRID SOURCE. Only surface lines (National Rail, Overground, Elizabeth,
 *    Thameslink) are routed over the OSM track graph — that is where the graph
 *    wins (shared track, e.g. Thameslink/EMR). Tube + DLR keep their single raw
 *    OSM centreline (as /london): the graph has one tunnel per direction and the
 *    router zig-zagged between them (Piccadilly, Kennington).
 *  - STRATA. Every piece is tagged surface / main-line tunnel / tube tunnel /
 *    light-rail tunnel from the OSM tracks under it; lines only bundle within
 *    the same stratum (the deep Jubilee no longer snaps onto the Waterloo East
 *    viaduct, Great Northern no longer onto the Piccadilly at King's Cross).
 *  - HAND RULES ON. NO_SNAP etc. stay enabled (West Hampstead, St Pancras,
 *    Warren St); NO_SNAP zones are also frozen during mean-shift bundling.
 *  - TERMINI reach the station: end cost weighted 3x (Cannon Street stopped
 *    mid-bridge), and each service's end is extended along the track into the
 *    platforms where the raw geometry stops short (HS1 at St Pancras).
 *  - TAPERS. A line's laneOff ramps smoothly across feature boundaries (forks,
 *    corridor hand-overs), instead of jumping a lane in one step.
 *
 * graph2: mean-shift bundling (d = 35 m) then tight ribbon snap (as /lab/graph).
 * graph3: no mean-shift; the /london ribbon builder (D 34 m, D2 130 m) bundles
 *         the routed tracks directly: corridor membership is all-or-nothing, so no
 *         partial pulls / wobbles.
 *
 *   node scripts/lab/build-lab-v2.js [--only graph2,graph3]
 *
 * Track data © OpenStreetMap contributors, ODbL.
 */
const fs = require('fs')
const path = require('path')
const L1 = require('./build-lab-tracks.js')
const { toXY, toLL, dist, resample, tangentsOf, PASSTHROUGH } = L1

const ROOT = path.join(__dirname, '..', '..')
const LDATA = path.join(ROOT, 'src', 'app', '(game)', 'london', 'data')
const OUTDIR = path.join(ROOT, 'src', 'app', '(game)', 'lab', 'data')

const TUBE = new Set([
  'Bakerloo', 'Central', 'Circle', 'District', 'HammersmithAndCity', 'Jubilee',
  'Metropolitan', 'Northern', 'Piccadilly', 'Victoria', 'WaterlooAndCity', 'DLR',
])
// graph4 = graph2 + network-wide lane order. graph5 = everything, for map-scale
// sizing (line width fixed in METRES, MAP_W ~43 m): corridors only where tracks
// are within one line width (D = MAP_W), network lane order, and lane offsets
// BAKED into the geometry as continuous curves (no stepped pieces, laneOff 0).
const { MAP_W } = require('./score.js')
const VARIANTS = [
  { id: 'graph2', d: 35, ribbon: { D: 35 / 3, D2: 70 / 3 } },
  { id: 'graph3', d: 0, ribbon: {} },
  { id: 'graph4', d: 35, ribbon: { D: 35 / 3, D2: 70 / 3, GLOBAL_ORDER: 4 } },
  { id: 'graph5', d: MAP_W, sameLine: true, ribbon: { D: MAP_W, D2: 130, GLOBAL_ORDER: 4 }, bake: true },
]
// Thameslink's 5 km NO_SNAP north of King's Cross keeps it off the Piccadilly /
// Victoria at Finsbury Park; with strata those tunnels can't bundle with it
// anyway, and the rule split Thameslink from Great Northern on shared track.
const NO_SNAP_DROP = [{ line: 'Thameslink', radius: 5000 }]
const END_K = 3
const STRATUM_MIN_RUN = 150 // m: shorter tunnel/surface flips are noise
const TAPER_M = 160 // m: total length of a laneOff ramp across a feature boundary
const TAPER_STEP = 10 // m: ramp piece length (laneOff steps of ~1/16 lane)

// NO_SNAP is defined once, in build-ribbons.js (which runs main() on require),
// so read the table from its source.
function loadNoSnap() {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'build-ribbons.js'), 'utf8')
  const m = src.match(/const NO_SNAP = (\[[\s\S]*?\n\])/)
  return Function(`return ${m[1]}`)()
    .filter((o) => !NO_SNAP_DROP.some((d) => d.line === o.line && d.radius === o.radius))
    .map((o) => ({ ...o, atXY: toXY(o.at) }))
}

// ---------------------------------------------------------------- strata
// Per track-graph node: tunnel (every way through it is a tunnel) and type bits.
function nodeInfo(G) {
  const T = L1.readTracks()
  const idx = new Map(T.nodes.map(([id], i) => [id, i]))
  const n = T.nodes.length
  const tun = new Uint8Array(n).fill(1), seen = new Uint8Array(n), type = new Uint8Array(n)
  const BIT = { rail: 1, subway: 2, light_rail: 4 }
  for (const [, t, tunnel, , ns] of T.ways) for (const id of ns) {
    const i = idx.get(id)
    if (i == null) continue
    seen[i] = 1; type[i] |= BIT[t] || 1
    if (!tunnel) tun[i] = 0
  }
  for (let i = 0; i < n; i++) if (!seen[i]) tun[i] = 0
  if (n !== G.X.length) throw new Error('track graph / node info mismatch')
  return { tun, type }
}
// Stratum per point: the nearest track node (preferring `prefer` type bits)
// within R decides; runs shorter than STRATUM_MIN_RUN take their neighbours'.
function strataOf(G, info, xy, R, prefer) {
  const raw = xy.map((p) => {
    let best = -1, bd = Infinity, bestP = -1, bdP = Infinity
    for (const j of G.near(p, R)) {
      const d = Math.hypot(G.X[j] - p[0], G.Y[j] - p[1])
      if (d < bd) { bd = d; best = j }
      if (prefer && info.type[j] & prefer && d < bdP) { bdP = d; bestP = j }
    }
    const j = bestP >= 0 ? bestP : best
    // tunnels by kind: a deep tube tunnel and a main-line tunnel (Gasworks /
    // Copenhagen, under King's Cross) are different strata too
    if (j < 0 || !info.tun[j]) return 'surface'
    return info.type[j] & 2 ? 'tunnel-subway' : info.type[j] & 4 ? 'tunnel-light' : 'tunnel-rail'
  })
  const cum = [0]
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + dist(xy[i - 1], xy[i]))
  for (let pass = 0; pass < 3; pass++) {
    const runs = []
    let s = 0
    for (let i = 1; i <= raw.length; i++) if (i === raw.length || raw[i] !== raw[s]) { runs.push([s, i - 1]); s = i }
    if (runs.length < 2) break
    let changed = false
    for (let k = 0; k < runs.length; k++) {
      const [lo, hi] = runs[k]
      if (cum[hi] - cum[lo] >= STRATUM_MIN_RUN) continue
      const nb = runs[k > 0 ? k - 1 : k + 1]
      const v = raw[nb[0]]
      if (v !== raw[lo]) { for (let i = lo; i <= hi; i++) raw[i] = v; changed = true }
    }
    if (!changed) break
  }
  return raw
}
// Split a polyline where its stratum changes (the split vertex is shared).
function splitByStratum(poly, st) {
  const out = []
  let s = 0
  for (let i = 1; i <= poly.xy.length; i++)
    if (i === poly.xy.length || st[i] !== st[s]) {
      const xy = poly.xy.slice(s, Math.min(poly.xy.length, i + 1))
      if (xy.length >= 2) out.push({ ...poly, xy, st: st[s] })
      s = i
    }
  return out
}

// ---------------------------------------------------------------- bundling
// build-lab-tracks bundle(), plus: only same-stratum points attract, and points
// inside a NO_SNAP zone for their own line neither move nor attract.
// sameLine: only a line's own parallel copies attract (a line routed over the
// fast AND slow tracks becomes one line), never two different lines.
function bundle2(polys, d, noSnap, sameLine = false) {
  const STEP = 10
  const P = polys.map((p) => {
    const xy = resample(p.xy, STEP)
    const frozen = xy.map((q) => noSnap.some((o) => o.line === p.line && dist(q, o.atXY) < o.radius))
    return { ...p, xy, frozen }
  })
  if (d <= STEP) return P
  const COS = Math.cos((35 * Math.PI) / 180)
  const kernel = (r) => (1 - (r / d) ** 2) ** 2
  for (let it = 0; it < 10; it++) {
    const tans = P.map((p) => tangentsOf(p.xy))
    const grid = new Map()
    P.forEach((p, pi) => p.xy.forEach((q, i) => {
      if (p.frozen[i]) return
      const k = Math.floor(q[0] / d) + ',' + Math.floor(q[1] / d)
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k).push([pi, i])
    }))
    const next = P.map((p, pi) => {
      const disp = p.xy.map((q, i) => {
        if (p.frozen[i]) return [0, 0]
        const t = tans[pi][i], nx = -t[1], ny = t[0]
        const cx = Math.floor(q[0] / d), cy = Math.floor(q[1] / d)
        let sw = 1, so = 0
        for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++)
          for (const [pj, j] of grid.get(gx + ',' + gy) || []) {
            if (pj === pi || P[pj].st !== p.st || (sameLine && P[pj].line !== p.line)) continue
            const o = P[pj].xy[j]
            const r = Math.hypot(o[0] - q[0], o[1] - q[1])
            if (r >= d) continue
            const tj = tans[pj][j]
            if (Math.abs(t[0] * tj[0] + t[1] * tj[1]) < COS) continue
            const w = kernel(r)
            sw += w; so += w * ((o[0] - q[0]) * nx + (o[1] - q[1]) * ny)
          }
        const off = so / sw
        return [off * nx, off * ny]
      })
      const half = Math.max(1, Math.round(d / (2 * STEP)))
      return p.xy.map((q, i) => {
        if (i === 0 || i === p.xy.length - 1) return q // keep pieces joined
        let sx = 0, sy = 0, c = 0
        for (let k = Math.max(0, i - half); k <= Math.min(p.xy.length - 1, i + half); k++) { sx += disp[k][0]; sy += disp[k][1]; c++ }
        return [q[0] + sx / c, q[1] + sy / c]
      })
    })
    P.forEach((p, pi) => (p.xy = next[pi]))
  }
  return P
}

// ---------------------------------------------------------------- tapers
// line-offset is one value per feature, so build-ribbons ramps laneOff only
// inside a feature; where a line passes from one feature to the next (a fork,
// a stratum split, a corridor hand-over) the offset jumped a whole lane. Here,
// per line, features meeting at a point get their ends re-cut into short
// pieces whose laneOff eases (smoothstep) from the shared value at the joint to
// the feature's own value. At a fork the trunk keeps its value; branches ease
// out of it.
// opts.geoW (metres, map-scale sizing only): a branch leaving a corridor onto
// its own track keeps its lane until its true track has moved out past that
// lane, then hands over (smooth max of lane offset and true separation), so
// it never swings back towards the corridor before peeling off (no S-bend).
function taper(fc, opts = {}) {
  const byLine = new Map()
  fc.features.forEach((f, fi) => {
    const l = f.properties.line
    if (PASSTHROUGH.has(l) || f.properties.laneOff == null) return
    if (!byLine.has(l)) byLine.set(l, [])
    byLine.get(l).push(fi)
  })
  const ramps = new Map() // fi -> {start: {L, m}, end: {L, m}} (m in feature frame)
  const geo = new Map() // fi -> {xy, cum}
  const G = (fi) => {
    if (!geo.has(fi)) {
      const xy = fc.features[fi].geometry.coordinates.map(toXY)
      const cum = [0]
      for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + dist(xy[i - 1], xy[i]))
      geo.set(fi, { xy, cum })
    }
    return geo.get(fi)
  }
  const outTan = (fi, atStart) => {
    const { xy, cum } = G(fi)
    const L = cum.at(-1), want = Math.min(40, L / 2)
    let a, b
    if (atStart) { a = xy[0]; b = xy.find((_, i) => cum[i] >= want) || xy.at(-1) } else { a = xy.at(-1); b = [...xy].reverse().find((_, i) => L - cum[xy.length - 1 - i] >= want) || xy[0] }
    const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1
    return [dx / n, dy / n]
  }
  let joints = 0
  for (const fis of byLine.values()) {
    const CELL = 3
    const nodes = []
    const grid = new Map()
    const ends = []
    for (const fi of fis) for (const atStart of [true, false]) {
      const { xy } = G(fi)
      const p = atStart ? xy[0] : xy.at(-1)
      const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL)
      let node = -1
      for (let gx = cx - 1; gx <= cx + 1 && node < 0; gx++) for (let gy = cy - 1; gy <= cy + 1 && node < 0; gy++)
        for (const k of grid.get(gx + ',' + gy) || []) if (dist(nodes[k].p, p) < 2) { node = k; break }
      if (node < 0) {
        node = nodes.length
        nodes.push({ p, inc: [] })
        const key = cx + ',' + cy
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key).push(node)
      }
      nodes[node].inc.push({ fi, atStart })
      ends.push(node)
    }
    for (const nd of nodes) {
      if (nd.inc.length < 2) continue
      // outward-frame offsets: + = right of the direction leaving the joint
      const inc = nd.inc.map((e) => {
        const lo = fc.features[e.fi].properties.laneOff || 0
        return { ...e, o: e.atStart ? lo : -lo, t: outTan(e.fi, e.atStart), len: G(e.fi).cum.at(-1) }
      })
      const set = (e, mOut, L, geoRamp = false) => {
        if (Math.abs(mOut - e.o) < 1e-6 || L < TAPER_STEP) return
        if (!ramps.has(e.fi)) ramps.set(e.fi, {})
        ramps.get(e.fi)[e.atStart ? 'start' : 'end'] = { L, m: e.atStart ? mOut : -mOut, ...(geoRamp ? { geo: { J: nd.p, t: e.t, mOut, atStart: e.atStart } } : {}) }
        joints++
      }
      const solo = (e) => Math.abs(e.o) < 1e-6
      if (opts.geoW && inc.length === 2 && solo(inc[0]) !== solo(inc[1])) {
        const [cor, own] = solo(inc[0]) ? [inc[1], inc[0]] : [inc[0], inc[1]]
        set(own, -cor.o, Math.min(400, 0.9 * own.len), true)
      } else if (inc.length === 2) {
        const [a, b] = inc
        const mB = (b.o - a.o) / 2 // joint value in b's outward frame
        set(a, -mB, Math.min(TAPER_M / 2, 0.45 * a.len))
        set(b, mB, Math.min(TAPER_M / 2, 0.45 * b.len))
      } else {
        // trunk: the end pointing away from the others
        let trunk = inc[0], best = Infinity
        for (const e of inc) {
          let s = 0
          for (const o of inc) if (o !== e) s += e.t[0] * o.t[0] + e.t[1] * o.t[1]
          if (s < best) { best = s; trunk = e }
        }
        for (const e of inc) if (e !== trunk) set(e, -trunk.o, opts.geoW && solo(e) ? Math.min(400, 0.9 * e.len) : Math.min(TAPER_M, 0.45 * e.len), !!opts.geoW && solo(e))
      }
    }
  }
  const ease = (x) => x * x * (3 - 2 * x)
  const out = []
  fc.features.forEach((f, fi) => {
    const r = ramps.get(fi)
    if (!r) { out.push(f); return }
    const { xy, cum } = G(fi)
    const L = cum.at(-1)
    const lo = f.properties.laneOff || 0
    const W = opts.geoW
    // geo ramp: outward-frame lane offset that keeps the line at
    // smoothmax(lane position, its true lateral distance from the joint)
    const geoVal = (g, s, Lr, p) => {
      const rn = [g.t[1], -g.t[0]] // right of the outward direction
      const d = (p[0] - g.J[0]) * rn[0] + (p[1] - g.J[1]) * rn[1]
      const sg = Math.sign(g.mOut), a = Math.abs(g.mOut) * W, b = Math.max(0, d * sg), k = W / 2
      const smax = (a + b + Math.sqrt((a - b) ** 2 + k * k)) / 2 - (Math.sqrt(a * a + k * k) - a) / 2
      const fade = s < 0.7 * Lr ? 1 : 1 - ease((s - 0.7 * Lr) / (0.3 * Lr))
      const v = ((sg * smax - d) / W) * fade
      return g.atStart ? v : -v
    }
    // geo ramps are precomputed outward from the joint every 10 m and made
    // one-way: once the line has left its lane it never drifts back (a
    // curving track would otherwise pull the offset in and out again).
    const pointAt = (s) => {
      let k = 1
      while (k < cum.length - 1 && cum[k] < s) k++
      const t = (s - cum[k - 1]) / (cum[k] - cum[k - 1] || 1)
      return [xy[k - 1][0] + (xy[k][0] - xy[k - 1][0]) * t, xy[k - 1][1] + (xy[k][1] - xy[k - 1][1]) * t]
    }
    const profiles = {}
    for (const side of ['start', 'end']) {
      const rr = r[side]
      if (!rr || !rr.geo) continue
      const prof = []
      let lim = Infinity
      for (let u = 0; u <= rr.L + 1e-6; u += 10) {
        const v = geoVal(rr.geo, u, rr.L, pointAt(side === 'start' ? u : L - u))
        const sg = Math.sign(rr.m) || 1
        lim = Math.min(lim, Math.max(0, v * sg))
        prof.push(sg * lim)
      }
      profiles[side] = prof
    }
    const look = (prof, u) => { const k = Math.min(prof.length - 1, Math.max(0, u / 10)); const a = Math.floor(k), b = Math.min(prof.length - 1, a + 1); return prof[a] + (prof[b] - prof[a]) * (k - a) }
    const val = (s) => {
      if (r.start && s < r.start.L) return profiles.start ? look(profiles.start, s) : r.start.m + (lo - r.start.m) * ease(s / r.start.L)
      if (r.end && L - s < r.end.L) return profiles.end ? look(profiles.end, L - s) : r.end.m + (lo - r.end.m) * ease((L - s) / r.end.L)
      return lo
    }
    // densify inside the ramps, keep original vertices elsewhere
    const pts = [], arc = []
    for (let i = 0; i < xy.length; i++) {
      if (i) {
        const a = xy[i - 1], b = xy[i], s0 = cum[i - 1], seg = cum[i] - s0
        const inRamp = (s) => (r.start && s < r.start.L) || (r.end && L - s < r.end.L)
        const k = Math.ceil(seg / TAPER_STEP)
        if (k > 1 && (inRamp(s0) || inRamp(cum[i]) || inRamp(s0 + seg / 2)))
          for (let q = 1; q < k; q++) { const t = q / k; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); arc.push(s0 + seg * t) }
      }
      pts.push(xy[i]); arc.push(cum[i])
    }
    const q = (v) => Math.round(v * 20) / 20
    let s = 0
    for (let i = 1; i < pts.length; i++) {
      const vi = q(val((arc[i - 1] + arc[i]) / 2))
      const last = i === pts.length - 1
      const vn = last ? null : q(val((arc[i] + arc[i + 1]) / 2))
      if (last || vn !== vi) {
        out.push({ ...f, properties: { ...f.properties, laneOff: vi }, geometry: { type: 'LineString', coordinates: pts.slice(s, i + 1).map(toLL) } })
        s = i
      }
    }
  })
  return { fc: { ...fc, features: out }, joints }
}

// ---------------------------------------------------------------- bake
// For map-scale sizing only (a line is W metres wide at every zoom): per line,
// chain the (tapered) pieces end to end, give every vertex its laneOff, smooth
// that along the chain, and move the vertex laneOff * W metres to the right of
// the chain's smoothed direction (MapLibre's +offset side). One continuous
// curve per chain; output laneOff 0.
function bake(fc, W) {
  const out = [], byLine = new Map()
  for (const f of fc.features) {
    if (PASSTHROUGH.has(f.properties.line) || f.geometry.type !== 'LineString') { out.push(f); continue }
    if (!byLine.has(f.properties.line)) byLine.set(f.properties.line, [])
    byLine.get(f.properties.line).push(f)
  }
  const key = (p) => Math.round(p[0]) + ',' + Math.round(p[1])
  for (const [line, fs_] of byLine) {
    const P = fs_.map((f) => ({ xy: f.geometry.coordinates.map(toXY), lo: f.properties.laneOff || 0, props: f.properties }))
    const ends = new Map()
    P.forEach((p, i) => { for (const [k, atStart] of [[key(p.xy[0]), true], [key(p.xy.at(-1)), false]]) { if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ i, atStart }) } })
    const used = new Uint8Array(P.length)
    const take = (i, reverse) => { used[i] = 1; const p = P[i]; return reverse ? { xy: [...p.xy].reverse(), lo: -p.lo } : { xy: p.xy, lo: p.lo } }
    const extend = (chain, endPt) => {
      for (;;) {
        const at = ends.get(key(endPt)) || []
        if (at.length !== 2) return
        const nx = at.find((e) => !used[e.i])
        if (!nx) return
        const piece = take(nx.i, !nx.atStart)
        chain.push(piece); endPt = piece.xy.at(-1)
      }
    }
    // start chains at non-degree-2 ends first, then whatever is left (loops)
    const order = P.map((p, i) => i).sort((a, b) => ((ends.get(key(P[a].xy[0])) || []).length === 2) - ((ends.get(key(P[b].xy[0])) || []).length === 2))
    for (const i of order) {
      if (used[i]) continue
      const chain = [take(i, false)]
      extend(chain, chain[0].xy.at(-1))
      // grow backwards too
      const back = []
      const rev = (c) => ({ xy: [...c.xy].reverse(), lo: -c.lo })
      const tmp = [rev(chain[0])]
      extend(tmp, tmp[0].xy.at(-1))
      for (let k = tmp.length - 1; k >= 1; k--) back.push(rev(tmp[k]))
      const all = [...back, ...chain]
      // concatenate, per-vertex offset
      const xy = [], off = []
      for (const c of all) c.xy.forEach((q, k) => { if (xy.length && k === 0) return; xy.push(q); off.push(c.lo) })
      if (xy.length < 2) continue
      const R = resample(xy, 10)
      // carry offsets onto the resampled points by arc length
      const cum = [0]; for (let k = 1; k < xy.length; k++) cum.push(cum[k - 1] + dist(xy[k - 1], xy[k]))
      const rc = [0]; for (let k = 1; k < R.length; k++) rc.push(rc[k - 1] + dist(R[k - 1], R[k]))
      let j = 0
      const ro = rc.map((s) => { while (j < cum.length - 2 && cum[j + 1] < s) j++; return off[Math.min(off.length - 1, j + 1)] })
      const sm = ro.map((_, k) => { let a = 0, c = 0; for (let q = Math.max(0, k - 3); q <= Math.min(ro.length - 1, k + 3); q++) { a += ro[q]; c++ } return a / c })
      const tan = tangentsOf(R, 2)
      const baked = R.map((q, k) => [q[0] + sm[k] * W * tan[k][1], q[1] - sm[k] * W * tan[k][0]])
      out.push({ type: 'Feature', properties: { ...fs_[i].properties, laneOff: 0 }, geometry: { type: 'LineString', coordinates: L1.simplify(baked, 1.5).map(toLL) } })
    }
  }
  return { ...fc, features: out }
}

// ---------------------------------------------------------------- main
function main() {
  const t0 = Date.now()
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null
  const services = L1.loadServices()
  const stationsFC = JSON.parse(fs.readFileSync(path.join(LDATA, 'features.json'), 'utf8'))
  const coordOf = new Map()
  for (const f of stationsFC.features) { const k = `${f.properties.name}|${f.properties.line}`; if (!coordOf.has(k)) coordOf.set(k, f.geometry.coordinates) }
  const raw = JSON.parse(fs.readFileSync(path.join(LDATA, 'routes.osm.json'), 'utf8'))
  const ownPolys = new Map(), colorOf = {}
  for (const f of raw.features) {
    if (f.geometry.type !== 'LineString') continue
    const l = f.properties.line
    if (!ownPolys.has(l)) ownPolys.set(l, [])
    ownPolys.get(l).push(f.geometry.coordinates.map(toXY))
    colorOf[l] = f.properties.color
  }
  const orderOf = require('../line-order.js')
  const ownGrid = new Map([...ownPolys].map(([l, p]) => [l, L1.segGrid(p)]))
  const london = JSON.parse(fs.readFileSync(path.join(LDATA, 'routes.json'), 'utf8'))
  const passthrough = london.features.filter((f) => PASSTHROUGH.has(f.properties.line))
  const noSnap = loadNoSnap()

  const G = L1.loadGraph()
  const info = nodeInfo(G)
  const surface = new Set(services.map((s) => s.line).filter((l) => !TUBE.has(l) && !PASSTHROUGH.has(l)))
  const { edgesOf, failures, fallbacks, extraPolys } = L1.routeLines(G, services, coordOf, ownGrid, ownPolys, { endK: END_K, extendEnds: true, lines: surface })
  console.log(`routed ${edgesOf.size} surface lines; ${fallbacks.length} fallback pair(s), ${failures.length} failed`)
  for (const f of fallbacks) console.log('  fallback ' + f)
  for (const f of failures) console.log('  FAILED ' + f)

  const base = []
  for (const line of [...edgesOf.keys()].sort()) {
    for (const xy of L1.chains(G, edgesOf.get(line), true)) {
      const st = strataOf(G, info, xy, 2, 0)
      base.push(...splitByStratum({ line, xy }, st))
    }
    for (const xy of extraPolys.get(line) || []) {
      const st = strataOf(G, info, xy, 25, 0)
      base.push(...splitByStratum({ line, xy }, st))
    }
  }
  // tube + DLR: raw OSM centrelines, clipped to scope like /london
  const { clipToScope, loadScope } = require('../clip-to-scope.js')
  const tubeFC = { ...raw, features: raw.features.filter((f) => TUBE.has(f.properties.line) && f.geometry.type === 'LineString') }
  const clipped = clipToScope(tubeFC, stationsFC, loadScope()).fc
  for (const f of clipped.features) {
    const xy = resample(f.geometry.coordinates.map(toXY), 10)
    const prefer = f.properties.line === 'DLR' ? 4 : 2
    base.push(...splitByStratum({ line: f.properties.line, xy }, strataOf(G, info, xy, 25, prefer)))
  }
  const km = (st) => (base.filter((p) => p.st === st).reduce((s, p) => s + p.xy.reduce((a, q, i) => (i ? a + dist(p.xy[i - 1], q) : 0), 0), 0) / 1000).toFixed(0)
  console.log(`${base.length} pieces: ${km('surface')} km surface, ${['tunnel-rail', 'tunnel-subway', 'tunnel-light'].map((t) => `${km(t)} km ${t}`).join(', ')}`)

  const { score } = require('./score.js')
  const scoresPath = path.join(OUTDIR, 'scores.json')
  const cards = JSON.parse(fs.readFileSync(scoresPath, 'utf8'))
  const meta = { fallbacks, failures, variants: {} }
  // baseline for map-scale variants: /london measured at the same fixed width
  cards['london-map'] = score([11, 12, 13, 14, 15], () => london, 'map')
  for (const V of VARIANTS) {
    if (only && !only.includes(V.id)) continue
    const t1 = Date.now()
    const polys = V.d ? bundle2(base, V.d, noSnap, !!V.sameLine) : base
    const cfg = { ...V.ribbon, NO_SNAP_DROP, ORIENT_SPINES: true, EXIT_ORDER: !process.argv.includes("--no-exit"), STRATA: !process.argv.includes('--no-strata') }
    const fcIn = polys.map((p) => ({ ...p, props: { stratum: p.st } }))
    let built = ribbonsWithProps(fcIn, colorOf, orderOf, passthrough, V.id, cfg)
    for (const f of built.features) delete f.properties.stratum
    const tp = process.argv.includes('--no-taper') ? { fc: built, joints: 0 } : taper(built, V.bake ? { geoW: MAP_W } : {})
    built = tp.fc
    if (V.bake) built = bake(built, MAP_W)
    if (!process.argv.includes("--dry")) fs.writeFileSync(path.join(OUTDIR, `routes.${V.id}.json`), JSON.stringify(built))
    cards[V.id] = score([11, 12, 13, 14, 15], () => built, V.bake ? 'map' : 'lane')
    meta.variants[V.id] = { d: V.d, ribbon: cfg, features: built.features.length, taperedEnds: tp.joints }
    console.log(`${V.id}: ${built.features.length} features, ${tp.joints} tapered ends (${((Date.now() - t1) / 1000).toFixed(0)} s)`)
  }
  if (process.argv.includes('--dry')) { for (const V of VARIANTS) if (cards[V.id]) console.log(V.id, JSON.stringify(Object.values(cards[V.id]).map((c) => [+c.overlapKm.toFixed(1), c.twists]))); return }
  fs.writeFileSync(scoresPath, JSON.stringify(cards, null, 2))
  fs.writeFileSync(path.join(OUTDIR, 'v2.json'), JSON.stringify(meta, null, 2))
  console.log('\nscorecard: overlap km / parallel crossings, by zoom')
  for (const [k, c] of Object.entries(cards)) console.log(k.padEnd(12) + [11, 12, 13, 14, 15].map((z) => `${c[z].overlapKm.toFixed(1)} / ${c[z].twists}`.padStart(12)).join(''))
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}

// build-lab-tracks ribbons(), but carrying each piece's `stratum` property.
function ribbonsWithProps(polys, colorOf, orderOf, passthrough, level, cfg) {
  const { execFileSync } = require('child_process')
  const dir = path.join(L1.WORK, level)
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(path.join(LDATA, 'features.json'), path.join(dir, 'features.json'))
  const fc = {
    type: 'FeatureCollection',
    features: polys.filter((p) => p.xy.length >= 2).map((p) => ({
      type: 'Feature',
      properties: { line: p.line, color: colorOf[p.line], order: orderOf[p.line], offset: 0, ...p.props },
      geometry: { type: 'LineString', coordinates: p.xy.map(toLL) },
    })),
  }
  fs.writeFileSync(path.join(dir, 'in.json'), JSON.stringify(fc))
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-ribbons.js'), '--no-clip', '--in', path.join(dir, 'in.json'), '--out', path.join(dir, 'out.json'), '--config', JSON.stringify(cfg)], { stdio: ['ignore', 'ignore', 'inherit'] })
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8'))
  out.features.push(...passthrough)
  return out
}

if (require.main === module) main()
module.exports = { taper, strataOf, bundle2 }

// Stopping-pattern model: turns a set of calling patterns into one ordered list
// of station rows plus one column per service (or per monotone piece of one).
//
// 1. Split each service where it revisits a station (loops: Circle, Tramlink).
// 2. Orient every piece so it agrees with the pieces already placed (longest
//    first) and add its consecutive stops as edges of a DAG (an edge that would
//    close a cycle is skipped).
// 3. Order the rows with Kahn's algorithm, always continuing the chain just
//    placed (so a branch stays one contiguous block) and, when a chain ends,
//    jumping to the branch whose junction was placed most recently.
// 4. Expand each pair of consecutive stops into the stations the train runs
//    through without stopping, using the longest other pattern that calls at
//    both (recursively), so a fast train shows where it passes.
// 5. Cut each column into monotone runs (a loop becomes two columns) and rate
//    it by stop density: fast / semi-fast / stopping.
import features from '../../../london/data/features.json'
import { LINES, SERVICES } from '../lineData'

export type Track = { key: string; line: string; name: string; path: string[]; stops: Set<string>; ends?: [string, string] }
export type Kind = 'fast' | 'semi' | 'stopping'
export type Col = {
  key: string
  line: string
  name: string
  /** row indices along the run, strictly increasing */
  rows: number[]
  /** parallel to rows: does the train call there? */
  stop: boolean[]
  from: string
  to: string
  /** first / last stop of the whole service lies in this run */
  startsHere: boolean
  endsHere: boolean
  nStops: number
  span: number
  density: number
  kind: Kind
  part?: string
  /** the whole service's first and last stop (corridor view: beyond the window) */
  ends?: [string, string]
  /** number of identical patterns merged into this column */
  dup: number
}
export type Block = { start: number; end: number; from?: string; to?: string }
export type Model = { rows: string[]; cols: Col[]; blocks: Block[]; adjacent: boolean[] }

type F = { geometry: { coordinates: number[] }; properties: { name: string } }
const POS: Record<string, number[]> = {}
for (const f of (features as unknown as { features: F[] }).features) POS[f.properties.name] ??= f.geometry.coordinates
const CENTRE = [-0.1276, 51.5073] // Charing Cross
const dist = (p: number[], q: number[]) => Math.hypot((p[0] - q[0]) * 69.4, (p[1] - q[1]) * 111.2)
const km = (p: number[]) => dist(p, CENTRE)

const LONDON_ENDS = new Set([
  'Moorgate', 'Cannon Street', 'Euston', 'Liverpool Street', 'Marylebone', 'Paddington', 'Waterloo',
  'Victoria', 'King\'s Cross St Pancras', 'Fenchurch Street', 'Charing Cross', 'Blackfriars',
])
// Metro-style lines never run past a station, and their branches use different
// tunnels between the same two stations (Northern: Camden Town - Euston), so
// "passes without stopping" is only inferred for main-line style services.
const NO_PASS = new Set(
  Object.keys(LINES).filter((k) => !LINES[k].stripe || ['DLR', 'Tramlink', 'CableCar'].includes(k)),
)
const isLondonEnd = (s: string) => s.startsWith('London ') || LONDON_ENDS.has(s)

export function build(tracks: Track[], opts: { flip?: boolean; anchor?: string } = {}): Model {
  // ---- 1. pieces ----
  type Piece = { key: string; line: string; name: string; path: string[]; stops: Set<string>; part?: string; first: string; last: string; ends?: [string, string] }
  const pieces: Piece[] = []
  for (const t of tracks) {
    const path = t.path.filter((s, i) => i === 0 || s !== t.path[i - 1])
    const firstStop = path.find((s) => t.stops.has(s)) ?? path[0]
    const lastStop = [...path].reverse().find((s) => t.stops.has(s)) ?? path[path.length - 1]
    const out: string[][] = []
    let cur: string[] = []
    let seen = new Set<string>()
    for (const s of path) {
      if (seen.has(s)) {
        out.push(cur)
        cur = [cur[cur.length - 1]]
        seen = new Set(cur)
      }
      cur.push(s)
      seen.add(s)
    }
    out.push(cur)
    const ok = out.filter((p) => p.length >= 2)
    ok.forEach((p, i) =>
      pieces.push({
        key: `${t.key}#${i}`,
        line: t.line,
        name: t.name,
        path: p,
        stops: t.stops,
        part: ok.length > 1 ? `${i + 1}/${ok.length}` : undefined,
        first: firstStop,
        last: lastStop,
        ends: t.ends,
      }),
    )
  }
  if (!pieces.length) return { rows: [], cols: [], blocks: [], adjacent: [] }

  // ---- 2. orientation + DAG ----
  const succ = new Map<string, Set<string>>()
  const reach = (a: string, b: string) => {
    if (a === b) return true
    const stack = [a]
    const seen = new Set([a])
    while (stack.length) {
      const n = stack.pop()!
      const nx = succ.get(n)
      if (!nx) continue
      for (const m of Array.from(nx)) {
        if (m === b) return true
        if (!seen.has(m)) {
          seen.add(m)
          stack.push(m)
        }
      }
    }
    return false
  }
  // patterns that start at a London terminus run outward and are placed first
  const london = pieces.map((p) => {
    const [f, l] = [p.path[0], p.path[p.path.length - 1]]
    if (isLondonEnd(l) && !isLondonEnd(f)) p.path.reverse()
    return isLondonEnd(p.path[0])
  })
  // loops and V-shapes (end near the start: Kingston loop, Victoria - London
  // Bridge via Crystal Palace) contradict the radial order: place them last
  const straight = pieces.map((p) => {
    const pts = p.path.map((s) => POS[s]).filter(Boolean)
    if (pts.length < 3 || !POS[p.path[0]] || !POS[p.path[p.path.length - 1]]) return 1
    let len = 0
    for (let k = 1; k < pts.length; k++) len += dist(pts[k - 1], pts[k])
    return len ? dist(POS[p.path[0]], POS[p.path[p.path.length - 1]]) / len : 1
  })
  const rank = (i: number) => (straight[i] < 0.4 ? 0 : london[i] ? 2 : 1)
  const order = pieces
    .map((_, i) => i)
    .sort((a, b) => rank(b) - rank(a) || pieces[b].path.length - pieces[a].path.length || a - b)
  const ref = pieces[order[0]]
  if (!london[order[0]]) {
    const f = ref.path[0]
    const l = ref.path[ref.path.length - 1]
    let rev = false
    if (POS[f] && POS[l]) {
      const [df, dl] = [km(POS[f]), km(POS[l])]
      // radial line: central London end at the top; cross-London: north at the top
      if (Math.min(df, dl) / Math.max(df, dl) < 0.35) rev = dl < df
      else rev = POS[f][1] < POS[l][1]
    }
    if (rev) ref.path.reverse()
  }
  const edges: [string, string][] = []
  for (const i of order) {
    const p = pieces[i]
    if (p !== ref && !london[i]) {
      let fwd = 0
      let rev = 0
      for (let k = 0; k + 1 < p.path.length; k++) {
        if (reach(p.path[k + 1], p.path[k])) fwd++
        if (reach(p.path[k], p.path[k + 1])) rev++
      }
      if (rev < fwd) p.path.reverse()
    }
    for (let k = 0; k + 1 < p.path.length; k++) {
      const [a, b] = [p.path[k], p.path[k + 1]]
      if (succ.get(a)?.has(b)) continue
      if (reach(b, a)) continue
      // a London terminus at the end of a pattern never gets an incoming edge:
      // termini stay at the top (a V-shaped service is cut into two columns)
      if (k + 2 === p.path.length && isLondonEnd(b) && !isLondonEnd(a)) continue
      if (!succ.has(a)) succ.set(a, new Set())
      succ.get(a)!.add(b)
      edges.push([a, b])
    }
  }
  if (opts.flip) {
    succ.clear()
    for (const [a, b] of edges) {
      if (!succ.has(b)) succ.set(b, new Set())
      succ.get(b)!.add(a)
    }
    for (const p of pieces) p.path.reverse()
  }

  // ---- 3. row order ----
  const nodes: string[] = []
  const weight = new Map<string, number>()
  for (const i of order)
    for (const s of pieces[i].path) {
      if (!weight.has(s)) nodes.push(s)
      weight.set(s, (weight.get(s) ?? 0) + 1)
    }
  const preds = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const n of nodes) indeg.set(n, 0)
  succ.forEach((bs, a) =>
    bs.forEach((b) => {
      indeg.set(b, (indeg.get(b) ?? 0) + 1)
      ;(preds.get(b) ?? preds.set(b, []).get(b)!).push(a)
    }),
  )
  const placed = new Map<string, number>()
  const rows: string[] = []
  let last: string | undefined
  while (rows.length < nodes.length) {
    const avail = nodes.filter((n) => !placed.has(n) && indeg.get(n) === 0)
    let pick: string | undefined
    if (last) {
      const nx = avail.filter((n) => succ.get(last!)?.has(n))
      if (nx.length) pick = nx.sort((a, b) => weight.get(b)! - weight.get(a)!)[0]
    }
    // stalled at a merge: first place what feeds the waiting successor of the
    // most recently placed station (Cannon Street before London Bridge)
    for (let j = rows.length - 1; !pick && j >= 0 && j >= rows.length - 40; j--) {
      const waiting = Array.from(succ.get(rows[j]) ?? []).filter((x) => !placed.has(x))
      const feeders = avail.filter((n) => waiting.some((x) => reach(n, x)))
      if (feeders.length) pick = feeders.sort((a, b) => weight.get(b)! - weight.get(a)!)[0]
    }
    if (!pick && avail.length) {
      const score = (n: string) => Math.max(-1, ...(preds.get(n) ?? []).map((p) => placed.get(p) ?? -1))
      pick = avail.sort((a, b) => score(b) - score(a) || weight.get(b)! - weight.get(a)!)[0]
    }
    if (!pick) pick = nodes.find((n) => !placed.has(n))! // (cannot happen: graph is acyclic)
    placed.set(pick, rows.length)
    rows.push(pick)
    succ.get(pick)?.forEach((m) => indeg.set(m, indeg.get(m)! - 1))
    last = pick
  }
  const rowOf = placed

  // ---- 4. expansion (stations passed without stopping) ----
  const idx = pieces.map((p) => new Map(p.path.map((s, i) => [s, i] as [string, number])))
  const memo = new Map<string, string[]>()
  const expand = (line: string, a: string, b: string, depth = 0): string[] => {
    const k = `${line}|${a}|${b}`
    if (memo.has(k)) return memo.get(k)!
    memo.set(k, [])
    const ra = rowOf.get(a)!
    const rb = rowOf.get(b)!
    let best: string[] | undefined
    pieces.forEach((q, qi) => {
      if (q.line !== line) return
      const ia = idx[qi].get(a)
      const ib = idx[qi].get(b)
      if (ia === undefined || ib === undefined || ib - ia < 2) return
      const seg = q.path.slice(ia, ib + 1)
      let prev = ra
      for (let j = 1; j < seg.length; j++) {
        const r = rowOf.get(seg[j])!
        if (r <= prev) return
        prev = r
      }
      if (prev !== rb) return
      if (!best || seg.length < best.length) best = seg // most direct route
    })
    let out: string[] = []
    if (best && depth < 12) {
      const seg = best as string[]
      for (let j = 0; j + 1 < seg.length; j++) {
        out = out.concat(expand(line, seg[j], seg[j + 1], depth + 1))
        if (j + 2 < seg.length) out.push(seg[j + 1])
      }
    }
    memo.set(k, out)
    return out
  }

  // ---- 5. columns ----
  let cols: Col[] = []
  for (const p of pieces) {
    const full: string[] = [p.path[0]]
    for (let k = 0; k + 1 < p.path.length; k++) {
      const a = p.path[k]
      const b = p.path[k + 1]
      if (!NO_PASS.has(p.line) && rowOf.get(b)! > rowOf.get(a)!) full.push(...expand(p.line, a, b))
      full.push(b)
    }
    // maximal monotone runs (sharing their boundary station); falling runs are reversed
    const runs: string[][] = []
    let cur: string[] = [full[0]]
    let dir = 0
    for (let k = 1; k < full.length; k++) {
      const d = Math.sign(rowOf.get(full[k])! - rowOf.get(cur[cur.length - 1])!)
      if (d === 0) continue
      if (dir === 0 || d === dir) {
        dir = d
        cur.push(full[k])
      } else {
        const end = cur[cur.length - 1]
        runs.push(dir < 0 ? cur.reverse() : cur)
        cur = [end, full[k]]
        dir = d
      }
    }
    runs.push(dir < 0 ? cur.reverse() : cur)
    const good = runs.filter((r) => r.length >= 2 && r.some((s) => p.stops.has(s)))
    good.forEach((r, ri) => {
      const stop = r.map((s) => p.stops.has(s))
      const nStops = stop.filter(Boolean).length
      const stopsIn = r.filter((s) => p.stops.has(s))
      const density = nStops / r.length
      const part = good.length > 1 ? `${ri + 1}/${good.length}` : p.part
      cols.push({
        key: `${p.key}.${ri}`,
        line: p.line,
        name: p.name,
        rows: r.map((s) => rowOf.get(s)!),
        stop,
        from: stopsIn[0] ?? r[0],
        to: stopsIn[stopsIn.length - 1] ?? r[r.length - 1],
        startsHere: stopsIn.includes(p.first) || stopsIn.includes(p.last),
        endsHere: stopsIn.includes(p.last) || stopsIn.includes(p.first),
        nStops,
        span: r.length,
        density,
        kind: density <= 0.45 ? 'fast' : density < 0.9 ? 'semi' : 'stopping',
        part,
        ends: p.ends,
        dup: 1,
      })
    })
  }
  // merge identical columns (same line, rows and calls)
  const sig = new Map<string, Col>()
  cols = cols.filter((c) => {
    const s = `${c.line}|${c.rows.join(',')}|${c.stop.map(Number).join('')}`
    const prev = sig.get(s)
    if (prev) {
      prev.dup++
      return false
    }
    sig.set(s, c)
    return true
  })

  // ---- 6. blocks (contiguous runs of rows joined by some column) ----
  const adjacent = rows.map(() => false) // adjacent[i]: some column runs row i -> i+1
  const into = new Map<number, number>() // block-start row -> junction row above
  const outOf = new Map<number, number>() // row -> later row it continues to
  for (const c of cols)
    for (let k = 0; k + 1 < c.rows.length; k++) {
      const [a, b] = [c.rows[k], c.rows[k + 1]]
      if (b === a + 1) adjacent[a] = true
    }
  const blocks: Block[] = []
  let start = 0
  for (let i = 0; i < rows.length; i++) {
    if (i === rows.length - 1 || !adjacent[i]) {
      blocks.push({ start, end: i })
      start = i + 1
    }
  }
  for (const c of cols)
    for (let k = 0; k + 1 < c.rows.length; k++) {
      const [a, b] = [c.rows[k], c.rows[k + 1]]
      if (b === a + 1) continue
      into.set(b, Math.max(into.get(b) ?? -1, a))
      outOf.set(a, Math.min(outOf.get(a) ?? Infinity, b))
    }
  for (const bl of blocks) {
    const j = into.get(bl.start)
    if (j !== undefined && j < bl.start) bl.from = rows[j]
    const t = outOf.get(bl.end)
    if (t !== undefined && t > bl.end + 1) bl.to = rows[t]
  }
  return { rows, cols, blocks, adjacent }
}

export function sortCols(cols: Col[], by: 'speed' | 'route', lineOrder?: (l: string) => number) {
  const lo = lineOrder ?? (() => 0)
  return [...cols].sort((a, b) =>
    by === 'speed'
      ? lo(a.line) - lo(b.line) ||
        a.density - b.density ||
        a.nStops - b.nStops ||
        a.rows[a.rows.length - 1] - b.rows[b.rows.length - 1] ||
        a.rows[0] - b.rows[0]
      : lo(a.line) - lo(b.line) ||
        a.rows[a.rows.length - 1] - b.rows[b.rows.length - 1] ||
        a.rows[0] - b.rows[0] ||
        a.density - b.density,
  )
}

const lineCache = new Map<string, Model>()
export function lineTracks(line: string): Track[] {
  return (SERVICES[line] ?? []).map((s, i) => ({
    key: `${line}:${i}`,
    line,
    name: s.name,
    path: s.stops,
    stops: new Set(s.stops),
  }))
}
export function lineModel(line: string, flip = false): Model {
  const k = `${line}|${flip}`
  if (!lineCache.has(k)) lineCache.set(k, build(lineTracks(line), { flip }))
  return lineCache.get(k)!
}

/** Every service (all lines) that calls at or runs through `station`, cut to `reach` stations either side. */
export function corridorTracks(station: string, reach: number): Track[] {
  const out: Track[] = []
  for (const line of Object.keys(LINES)) {
    if (!SERVICES[line]?.length) continue
    const m = lineModel(line)
    for (const c of m.cols) {
      const names = c.rows.map((r) => m.rows[r])
      const at = names.indexOf(station)
      if (at < 0) continue
      const lo = Math.max(0, at - reach)
      const hi = Math.min(names.length - 1, at + reach)
      const path = names.slice(lo, hi + 1)
      const stops = new Set(path.filter((_, i) => c.stop[lo + i]))
      if (path.length < 2) continue
      out.push({ key: c.key, line, name: c.name + (c.part ? ` (part ${c.part})` : ''), path, stops, ends: [c.from, c.to] })
    }
  }
  return out
}

export function allStations(): string[] {
  const s = new Set<string>()
  for (const line of Object.keys(SERVICES)) for (const sv of SERVICES[line]) sv.stops.forEach((x) => s.add(x))
  return Array.from(s).sort((a, b) => a.localeCompare(b))
}

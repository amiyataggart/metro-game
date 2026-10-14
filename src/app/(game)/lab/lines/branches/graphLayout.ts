// Whole-line diagram layout (server side, build time).
//
// 1. Merge a line's services into one graph: stations are nodes, consecutive
//    stops are edges. "Express" edges (a fast train skipping stops that another
//    service calls at, on the same stretch of track) are dropped, so the graph
//    follows the track; each service is then routed over the remaining edges.
// 2. Pick the trunk: the heaviest path (edges weighted by how many services use
//    them) that only makes turns some train makes. It is drawn as the top row.
// 3. Peel off branches greedily, heaviest first: each is a path of unplaced
//    stations hanging off a placed one. It either dead-ends (a branch) or rejoins
//    a placed station (a loop, e.g. the Northern line's Charing Cross branch).
//    Any edge still undrawn (e.g. the Circle closing its loop) becomes a link.
// 4. Every row is horizontal; a branch drops vertically from its fork and turns
//    45 degrees into its own row below. Station x positions come from "at least
//    one pitch apart" constraints solved as longest paths over a DAG; rows are
//    packed into vertical slots so lines, labels and connectors don't collide.
import features from '../../../london/data/features.json'
import { LINES, SERVICES, LINES_AT, FEATURE_ID } from '../lineData'

export const PITCH = 25 // px between neighbouring stations on a row
export const CH = 11 // 45-degree chamfer where a connector turns into a row
const GAP = 30 // vertical gap between slots (line to the next slot's label band)
export const FONT = 12.5
const LINK_GAP = 2 * CH + 10

type P = [number, number]
type F = { properties: { name: string }; geometry: { coordinates: number[] } }
const COORD = new Map<string, P>()
for (const f of (features as unknown as { features: F[] }).features) {
  if (!COORD.has(f.properties.name))
    COORD.set(f.properties.name, [
      f.geometry.coordinates[0],
      f.geometry.coordinates[1],
    ])
}
const CENTRE: P = [-0.1246, 51.5074]
const km = (a: P, b: P) =>
  Math.hypot((a[0] - b[0]) * 69.4, (a[1] - b[1]) * 111.2)

/** Rough Cabin advance widths (em) so labels can be sized on the server. */
export function textWidth(s: string, size = FONT, bold = false) {
  let w = 0
  for (const ch of s) {
    if ("ijlI.,'’!|:;".includes(ch)) w += 0.25
    else if ('frt()- /'.includes(ch)) w += 0.34
    else if ('mwMW'.includes(ch)) w += 0.82
    else if (ch === '&') w += 0.66
    else if (ch >= 'A' && ch <= 'Z') w += 0.62
    else if (ch >= '0' && ch <= '9') w += 0.54
    else w += 0.51
  }
  return w * size * (bold ? 1.05 : 1)
}

const ek = (a: string, b: string) =>
  a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`

export type DStation = {
  name: string
  x: number
  y: number
  /** label above (up) or below (down) the line */
  side: 1 | -1
  /** label leans right (+1) or left (-1) */
  lean: 1 | -1
  id: number | null
  others: string[]
  terminus: boolean
  /** stands for a station drawn on another row (where a branch rejoins) */
  ghost: boolean
  via?: 'to' | 'from'
  key: string
  /** label length incl. interchange chips, px */
  lw: number
  /** estimated name width, px (the client measures the real one) */
  tw: number
}
export type DEdge = { key: string; d: string }
export type DService = { name: string; route: string[]; stops: string[] }
export type Body = {
  width: number
  height: number
  stations: DStation[]
  edges: DEdge[]
  notes: string[]
  stats: { rows: number; loops: number; clash: number }
}
export type Diagram = {
  key: string
  name: string
  color: string
  stripe: string | null
  stripeColor: string | null
  /** joined: loops drawn as loops; rows: every branch its own row, rejoins named */
  layouts: { joined: Body; rows: Body }
  auto: 'joined' | 'rows'
  services: DService[]
  express: number
}

export const base = (n: string) => n.split('\u0002')[0]

// ---------------------------------------------------------------- graph

type Graph = {
  nodes: string[]
  adj: Map<string, Set<string>>
  w: Map<string, number>
}

function buildGraph(services: { stops: string[] }[]) {
  const nodes: string[] = []
  const seen = new Set<string>()
  const raw = new Map<string, [string, string]>()
  for (const s of services) {
    s.stops.forEach((n, i) => {
      if (!seen.has(n)) seen.add(n), nodes.push(n)
      if (i > 0 && s.stops[i - 1] !== n)
        raw.set(ek(s.stops[i - 1], n), [s.stops[i - 1], n])
    })
  }
  const pos = services.map((s) => {
    const m = new Map<string, number[]>()
    s.stops.forEach((n, i) => (m.get(n) || m.set(n, []).get(n)!).push(i))
    return m
  })
  // An edge a-b is express if some service calls at a and b with stops in
  // between, along a stretch about as long as the direct hop (not a loop).
  const express = new Set<string>()
  const viaOf = new Map<string, string[]>() // express edge -> stops in between (oriented a..b by key order)
  Array.from(raw.entries()).forEach(([k, [a, b]]) => {
    for (let si = 0; si < services.length; si++) {
      const pa = pos[si].get(a)
      const pb = pos[si].get(b)
      if (!pa || !pb) continue
      let best: [number, number] | null = null
      for (const i of pa)
        for (const j of pb)
          if (!best || Math.abs(i - j) < Math.abs(best[0] - best[1]))
            best = [i, j]
      const gap = Math.abs(best![0] - best![1])
      if (gap < 2 || gap > 30) continue
      const lo = Math.min(best![0], best![1])
      const via = services[si].stops.slice(lo, lo + gap + 1)
      const cs = via.map((n) => COORD.get(n))
      if (cs.every(Boolean)) {
        let len = 0
        for (let i = 1; i < cs.length; i++) len += km(cs[i - 1]!, cs[i]!)
        if (len > 1.7 * km(cs[0]!, cs[cs.length - 1]!) + 0.8) continue
      }
      express.add(k)
      viaOf.set(k, via[0] < via[via.length - 1] ? via : via.slice().reverse())
      break
    }
  })
  const adj = new Map<string, Set<string>>(
    nodes.map((n) => [n, new Set<string>()]),
  )
  const link = (a: string, b: string) => (
    adj.get(a)!.add(b), adj.get(b)!.add(a)
  )
  Array.from(raw.entries()).forEach(
    ([k, [a, b]]) => !express.has(k) && link(a, b),
  )
  // Restore express edges whose ends would otherwise be disconnected.
  const comp = () => {
    const c = new Map<string, number>()
    let id = 0
    for (const n of nodes) {
      if (c.has(n)) continue
      const st = [n]
      c.set(n, id)
      while (st.length)
        for (const m of Array.from(adj.get(st.pop()!)!))
          if (!c.has(m)) c.set(m, id), st.push(m)
      id++
    }
    return c
  }
  let c = comp()
  Array.from(express).forEach((k) => {
    const [a, b] = raw.get(k)!
    if (c.get(a) !== c.get(b)) express.delete(k), link(a, b), (c = comp())
  })
  // Expand a hop into the stations it passes, following the stopping service
  // that proved it express (not just any shortest path).
  const expand = (a: string, b: string, depth = 0): string[] => {
    const k = ek(a, b)
    if (adj.get(a)!.has(b)) return [a, b]
    const via = viaOf.get(k)
    if (via && depth < 6) {
      const v = a < b ? via : via.slice().reverse()
      const out = [a]
      for (let i = 1; i < v.length; i++)
        out.push(...expand(v[i - 1], v[i], depth + 1).slice(1))
      return out
    }
    return bfsPath(adj, a, b) ?? [a, b]
  }
  return { nodes, adj, express: express.size, expand }
}

function bfsPath(
  adj: Map<string, Set<string>>,
  a: string,
  b: string,
): string[] | null {
  const prev = new Map<string, string>([[a, a]])
  const q = [a]
  while (q.length) {
    const n = q.shift()!
    if (n === b) break
    for (const m of Array.from(adj.get(n)!))
      if (!prev.has(m)) prev.set(m, n), q.push(m)
  }
  if (!prev.has(b)) return null
  const out = [b]
  while (out[0] !== a) out.unshift(prev.get(out[0])!)
  return out
}

// ---------------------------------------------------------------- x solver

type Con = { a: string; b: string; gap: number }

function solve(
  nodes: string[],
  cons: Con[],
  compress: boolean,
): Map<string, number> | null {
  const out = new Map<string, Con[]>()
  const indeg = new Map<string, number>()
  nodes.forEach((n) => (out.set(n, []), indeg.set(n, 0)))
  for (const c of cons) {
    if (!out.has(c.a) || !out.has(c.b)) continue
    out.get(c.a)!.push(c)
    indeg.set(c.b, indeg.get(c.b)! + 1)
  }
  const order: string[] = []
  const q = nodes.filter((n) => indeg.get(n) === 0)
  while (q.length) {
    const n = q.shift()!
    order.push(n)
    for (const c of out.get(n)!) {
      indeg.set(c.b, indeg.get(c.b)! - 1)
      if (indeg.get(c.b) === 0) q.push(c.b)
    }
  }
  if (order.length < nodes.length) return null
  const x = new Map<string, number>(nodes.map((n) => [n, 0]))
  for (const n of order)
    for (const c of out.get(n)!)
      x.set(c.b, Math.max(x.get(c.b)!, x.get(n)! + c.gap))
  if (compress)
    for (let i = order.length - 1; i >= 0; i--) {
      const o = out.get(order[i])!
      if (o.length)
        x.set(order[i], Math.min(...o.map((c) => x.get(c.b)! - c.gap)))
    }
  return x
}

// ---------------------------------------------------------------- rows

type Row = {
  nodes: string[] // in increasing x
  from: string | null // fork at the left end (placed on another row)
  to: string | null // fork at the right end
  dir: 1 | -1 // dead-end branches: which way they run from their fork
  side: 1 | -1
  slot: number
  y: number
  /** drawn without its connector (it would cross other lines): starts at a ghost of its fork */
  detached?: boolean
  /** a ghost-only stub that would have to cross lines: left out */
  hidden?: boolean
}

function layoutComponent(
  comp: string[],
  adj: Map<string, Set<string>>,
  w: Map<string, number>,
  routes: string[][],
  labelOf: (n: string) => number,
  notes: string[],
  breakLoops: boolean,
) {
  // Ghost stops (breakLoops): a branch that rejoins elsewhere ends in a marker
  // naming the station it joins, instead of a long connector back to it.
  const label = (n: string) => labelOf(base(n))
  const inComp = new Set(comp)
  const W = (a: string, b: string) => w.get(ek(a, b)) ?? 1
  const deg = (n: string) => adj.get(n)!.size
  // Turns that some train actually makes (a-b-c in a route), so rows follow trains.
  const T = new Set<string>()
  for (const r of routes)
    for (let i = 1; i + 1 < r.length; i++)
      T.add(`${r[i - 1]}|${r[i]}|${r[i + 1]}`),
        T.add(`${r[i + 1]}|${r[i]}|${r[i - 1]}`)
  // Heaviest simple path from `start` through nodes allowed by `ok`, continuing
  // only where trains run through (which keeps the search small).
  const farthest = (
    start: string,
    ok: (n: string) => boolean,
    prev?: string,
  ) => {
    let best = { path: [start], wt: 0 }
    const st: {
      n: string
      p: string | undefined
      path: string[]
      wt: number
    }[] = [{ n: start, p: prev, path: [start], wt: 0 }]
    let budget = 40000
    while (st.length && budget-- > 0) {
      const { n, p, path, wt } = st.pop()!
      if (
        wt > best.wt + 1e-9 ||
        (Math.abs(wt - best.wt) < 1e-9 && path.length > best.path.length)
      )
        best = { path, wt }
      for (const m of Array.from(adj.get(n)!)) {
        if (!ok(m) || path.includes(m) || (p && !T.has(`${p}|${n}|${m}`)))
          continue
        st.push({ n: m, p: n, path: [...path, m], wt: wt + W(n, m) + 0.01 })
      }
    }
    return best
  }
  const any = () => true
  let trunk: string[] = [comp[0]]
  let trunkW = -1
  const ends = comp.filter((n) => deg(n) !== 2)
  for (const n of ends.length ? ends : comp) {
    const f = farthest(n, any)
    if (f.wt > trunkW + 1e-9) (trunkW = f.wt), (trunk = f.path)
  }
  // Orientation: the central-London end, else west, else north, on the left.
  const known = trunk.filter((n) => COORD.has(n))
  if (known.length >= 2) {
    const a = COORD.get(known[0])!
    const b = COORD.get(known[known.length - 1])!
    const da = km(a, CENTRE)
    const db = km(b, CENTRE)
    let flip: boolean
    if (Math.min(da, db) < 4 && Math.max(da, db) > 3 * Math.min(da, db))
      flip = db < da
    else if (Math.abs(a[0] - b[0]) * 69.4 > 0.8 * Math.abs(a[1] - b[1]) * 111.2)
      flip = b[0] < a[0]
    else flip = b[1] > a[1]
    if (flip) trunk = trunk.slice().reverse()
  }

  const rows: Row[] = [
    { nodes: trunk, from: null, to: null, dir: 1, side: 1, slot: 0, y: 0 },
  ]
  const rowOf = new Map<string, number>()
  trunk.forEach((n) => rowOf.set(n, 0))
  const cons: Con[] = []
  const drawn = new Set<string>()
  for (let i = 1; i < trunk.length; i++)
    cons.push({ a: trunk[i - 1], b: trunk[i], gap: PITCH }),
      drawn.add(ek(trunk[i - 1], trunk[i]))
  const placed = () => Array.from(rowOf.keys())
  let x = solve(placed(), cons, false)!

  // Route neighbours: for votes on which way a branch runs.
  const through = (u: string, v: string) => {
    const res: string[] = []
    for (const r of routes)
      for (let i = 0; i < r.length; i++) {
        if (r[i] !== u) continue
        if (r[i + 1] === v && i > 0) res.push(r[i - 1])
        if (r[i - 1] === v && i + 1 < r.length) res.push(r[i + 1])
      }
    return res
  }

  const real = () => comp.filter((n) => rowOf.has(n)).length
  for (let guard = 0; real() < comp.length && guard < 500; guard++) {
    let best: { u: string; path: string[]; wt: number } | null = null
    for (const row of rows)
      for (const u of row.nodes)
        for (const v of Array.from(adj.get(u) ?? [])) {
          if (rowOf.has(v)) continue
          const f = farthest(v, (n) => !rowOf.has(n), u)
          const wt = f.wt + W(u, v)
          if (!best || wt > best.wt + 1e-9) best = { u, path: f.path, wt }
        }
    if (!best) break
    const { u } = best
    let path = best.path
    let z = path[path.length - 1]
    // Rejoin? the heaviest placed neighbour of the far end (not the fork).
    let joins = Array.from(adj.get(z)!)
      .filter((m) => rowOf.has(m) && m !== u)
      .sort((p, q) => W(z, q) - W(z, p))
    // No train runs on round, but a plain chain of stations links the far end
    // back to the line (the Central's Hainault loop): close the loop anyway.
    if (!breakLoops && !joins.length) {
      const nx = Array.from(adj.get(z)!).filter(
        (m) => !rowOf.has(m) && !path.includes(m),
      )
      const chain: string[] = []
      let prev = z
      let cur = nx.length === 1 ? nx[0] : null
      while (cur && !rowOf.has(cur) && deg(cur) === 2 && !chain.includes(cur)) {
        chain.push(cur)
        const nxt: string = Array.from(adj.get(cur)!).find((m) => m !== prev)!
        prev = cur
        cur = nxt
      }
      if (cur && chain.length && rowOf.has(cur) && cur !== u) {
        path = [...path, ...chain]
        z = path[path.length - 1]
        joins = [cur]
      }
    }
    let done = false
    for (const wj of breakLoops ? [] : joins) {
      const leftToRight = (x.get(u) ?? 0) <= (x.get(wj) ?? 0)
      const nodes = leftToRight ? path : path.slice().reverse()
      const from = leftToRight ? u : wj
      const to = leftToRight ? wj : u
      const extra: Con[] = [
        { a: from, b: nodes[0], gap: PITCH },
        { a: nodes[nodes.length - 1], b: to, gap: PITCH },
      ]
      for (let i = 1; i < nodes.length; i++)
        extra.push({ a: nodes[i - 1], b: nodes[i], gap: PITCH })
      const nx = solve([...placed(), ...nodes], [...cons, ...extra], false)
      if (!nx) continue
      cons.push(...extra)
      rows.push({ nodes, from, to, dir: 1, side: -1, slot: 0, y: 0 })
      nodes.forEach((n) => rowOf.set(n, rows.length - 1))
      drawn.add(ek(u, path[0]))
      drawn.add(ek(z, wj))
      for (let i = 1; i < path.length; i++) drawn.add(ek(path[i - 1], path[i]))
      x = nx
      done = true
      break
    }
    if (done) continue
    // Dead-end branch: run away from where its trains continue.
    let vote = 0
    for (const n of through(u, path[0]))
      if (x.has(n))
        vote += x.get(n)! > x.get(u)! ? -1 : x.get(n)! < x.get(u)! ? 1 : 0
    let dir: 1 | -1
    if (vote) dir = vote > 0 ? 1 : -1
    else {
      // Nobody runs through the fork (e.g. a terminus): fan out alongside.
      const rn = rows[rowOf.get(u)!].nodes
      const i = rn.indexOf(u)
      dir = i === rn.length - 1 && rn.length > 1 ? -1 : i === 0 ? 1 : -1
    }
    const ghostPath = joins.length
      ? [...path, `${joins[0]}\u0002${rows.length}`]
      : path
    if (joins.length) drawn.add(ek(z, joins[0]))
    const nodes = dir === 1 ? ghostPath : ghostPath.slice().reverse()
    const extra: Con[] =
      dir === 1
        ? [{ a: u, b: path[0], gap: PITCH }]
        : [{ a: path[0], b: u, gap: PITCH }]
    for (let i = 1; i < nodes.length; i++)
      extra.push({ a: nodes[i - 1], b: nodes[i], gap: PITCH })
    cons.push(...extra)
    rows.push({
      nodes,
      from: dir === 1 ? u : null,
      to: dir === 1 ? null : u,
      dir,
      side: 1,
      slot: 0,
      y: 0,
    })
    nodes.forEach((n) => rowOf.set(n, rows.length - 1))
    drawn.add(ek(u, path[0]))
    for (let i = 1; i < path.length; i++) drawn.add(ek(path[i - 1], path[i]))
    x = solve(placed(), cons, false)!
  }

  // Links: edges between placed stations not drawn yet.
  type Link = { a: string; b: string; slot: number; y: number }
  const links: Link[] = []
  for (const a of comp)
    for (const b of Array.from(adj.get(a)!)) {
      if (a > b || drawn.has(ek(a, b))) continue
      const [l, r] = (x.get(a) ?? 0) <= (x.get(b) ?? 0) ? [a, b] : [b, a]
      if (breakLoops) {
        const g = `${r}\u0002${rows.length}`
        cons.push({ a: l, b: g, gap: PITCH })
        rows.push({
          nodes: [g],
          from: l,
          to: null,
          dir: 1,
          side: 1,
          slot: 0,
          y: 0,
        })
        rowOf.set(g, rows.length - 1)
        drawn.add(ek(a, b))
        continue
      }
      const c = { a: l, b: r, gap: LINK_GAP }
      if (!solve(placed(), [...cons, c], false)) {
        notes.push(`${a} – ${b} link not drawn`)
        continue
      }
      cons.push(c)
      links.push({ a: l, b: r, slot: 0, y: 0 })
      drawn.add(ek(a, b))
    }

  // Labels hang below a row (clear of the connectors arriving from above),
  // except on rows that other branches drop from.
  const parents = new Set<number>()
  for (const r of rows)
    for (const f of [r.from, r.to]) if (f) parents.add(rowOf.get(f)!)
  rows.forEach((r, i) => i > 0 && !parents.has(i) && (r.side = -1))

  // Final x: tight, compressed, then evenly spaced between anchors.
  x = solve(placed(), cons, true)!
  const anchored = new Set<string>()
  for (const r of rows) {
    if (r.from) anchored.add(r.from), anchored.add(r.nodes[0])
    if (r.to) anchored.add(r.to), anchored.add(r.nodes[r.nodes.length - 1])
  }
  for (const l of links) anchored.add(l.a), anchored.add(l.b)
  for (const r of rows) {
    const ns = r.nodes
    let i = 0
    for (let j = 1; j < ns.length; j++) {
      if (!anchored.has(ns[j]) && j < ns.length - 1) continue
      for (let k = i + 1; k < j; k++)
        x.set(
          ns[k],
          x.get(ns[i])! + ((x.get(ns[j])! - x.get(ns[i])!) * (k - i)) / (j - i),
        )
      i = j
    }
  }

  // ---- slot packing. Each slot has three layers: up labels, line, down labels.
  type Iv = { a: number; b: number; ta?: string; tb?: string; hard: boolean }
  const occ: Iv[][][] = [] // occ[slot][layer 0 up|1 line|2 down]
  const L = (s: number) => (occ[s] ||= [[], [], []])
  const X = (n: string) => x.get(n)!
  const PAD = 7
  const clash = (p: Iv, q: Iv) => {
    if (p.a > q.b + PAD || q.a > p.b + PAD) return false
    if (p.b === q.a && p.tb && p.tb === q.ta) return false
    if (q.b === p.a && q.tb && q.tb === p.ta) return false
    if (p.a === p.b && q.a === q.b && p.a === q.a && p.ta && p.ta === q.ta)
      return false
    return true
  }
  const pt = (n: string): Iv => ({ a: X(n), b: X(n), ta: n, tb: n, hard: true })
  type Item = { put: [number, number, Iv][] } // [slot, layer, iv]
  const labelIv = (r: Row, detached = false): Iv => {
    let a = Infinity
    let b = -Infinity
    for (const n of detached
      ? [...[r.from, r.to].filter((f): f is string => !!f), ...r.nodes]
      : r.nodes) {
      const e = 0.71 * label(n) + 9
      const lean = r.dir
      a = Math.min(a, lean > 0 ? X(n) - 3 : X(n) - e)
      b = Math.max(b, lean > 0 ? X(n) + e : X(n) + 3)
    }
    return { a, b, hard: false }
  }
  const rowItem = (
    r: Row,
    s: number,
    parentSlot: (n: string) => number,
    detached = false,
  ): Item => {
    const put: [number, number, Iv][] = []
    const xs = r.nodes.map(X)
    const a = r.from ? X(r.from) : Math.min(...xs)
    const b = r.to ? X(r.to) : Math.max(...xs)
    put.push([
      s,
      1,
      detached
        ? { a, b, hard: true }
        : { a, b, ta: r.from ?? undefined, tb: r.to ?? undefined, hard: true },
    ])
    put.push([s, r.side > 0 ? 0 : 2, labelIv(r, detached)])
    for (const f of [r.from, r.to]) {
      if (!f || detached) continue
      const ps = parentSlot(f)
      put.push([ps, 2, pt(f)])
      for (let t = ps + 1; t < s; t++)
        for (let l = 0; l < 3; l++) put.push([t, l, pt(f)])
      put.push([s, 0, pt(f)])
    }
    return { put }
  }
  type Pk = { kind: 'row'; r: Row } | { kind: 'link'; l: Link }
  const all: Pk[] = [
    ...rows.slice(1).map((r) => ({ kind: 'row' as const, r })),
    ...links.map((l) => ({ kind: 'link' as const, l })),
  ]
  const forksOf = (pk: Pk) =>
    pk.kind === 'row'
      ? ([pk.r.from, pk.r.to].filter(Boolean) as string[])
      : [pk.l.a, pk.l.b]
  const span = (pk: Pk) => {
    const xs =
      pk.kind === 'row'
        ? [...pk.r.nodes, ...forksOf(pk)].map(X)
        : forksOf(pk).map(X)
    return Math.max(...xs) - Math.min(...xs)
  }
  const itemFor = (pk: Pk, s: number, slotOf: (n: string) => number): Item => {
    if (pk.kind === 'row') return rowItem(pk.r, s, slotOf)
    const it = rowItem(
      { nodes: [], from: pk.l.a, to: pk.l.b, dir: 1, side: 1, slot: s, y: 0 },
      s,
      slotOf,
    )
    it.put = it.put.filter(([, l, iv]) => !(l === 0 && !iv.hard))
    return it
  }
  // Greedy packing in a given priority; a row waits until its fork rows are in.
  const pack = (prio: (pk: Pk) => number) => {
    occ.length = 0
    const slot = new Map<Pk, number>()
    const det = new Set<Pk>()
    const slotOfNode = (n: string) => {
      const r = rowOf.get(n)!
      if (r === 0) return 0
      const pk = all.find((q) => q.kind === 'row' && q.r === rows[r])!
      return slot.get(pk) ?? 0
    }
    const cost = (it: Item) => {
      let c = 0
      for (const [s, l, iv] of it.put)
        for (const o of L(s)[l])
          if (clash(iv, o))
            c += iv.hard && o.hard ? 100 : !iv.hard && !o.hard ? 30 : 15
      return c
    }
    const commit = (it: Item) =>
      it.put.forEach(([s, l, iv]) => L(s)[l].push(iv))
    commit(rowItem(rows[0], 0, () => 0))
    const ready = (pk: Pk) =>
      forksOf(pk).every(
        (f) =>
          rowOf.get(f) === 0 ||
          slot.has(
            all.find((q) => q.kind === 'row' && q.r === rows[rowOf.get(f)!])!,
          ),
      )
    let total = 0
    const left = all.slice()
    while (left.length) {
      const cands = left.filter(ready)
      const pk = (cands.length ? cands : left).reduce((p, q) =>
        prio(q) < prio(p) ? q : p,
      )
      left.splice(left.indexOf(pk), 1)
      const min = Math.max(...forksOf(pk).map(slotOfNode)) + 1
      let bestS = min
      let bestC = Infinity
      for (let s = min; s < min + 16; s++) {
        const c = cost(itemFor(pk, s, slotOfNode)) + (s - min) * 2
        if (c < bestC) (bestC = c), (bestS = s)
        if (c === (s - min) * 2) break
      }
      // Still crossing a line? Cut the connector: the row starts at a ghost of
      // its fork instead (dead-end branches only).
      let detach = false
      const ghostOnly =
        pk.kind === 'row' && pk.r.nodes.every((n) => n !== base(n))
      if (bestC >= 100 && ghostOnly) {
        slot.set(pk, bestS)
        det.add(pk)
        continue
      }
      if (bestC >= 100 && pk.kind === 'row' && !(pk.r.from && pk.r.to)) {
        for (let s = min; s < min + 16; s++) {
          const c =
            cost(rowItem(pk.r, s, slotOfNode, true)) + (s - min) * 2 + 25
          if (c < bestC) (bestC = c), (bestS = s), (detach = true)
        }
      }
      slot.set(pk, bestS)
      if (detach) det.add(pk)
      total += bestC
      commit(
        detach && pk.kind === 'row'
          ? rowItem(pk.r, bestS, slotOfNode, true)
          : itemFor(pk, bestS, slotOfNode),
      )
    }
    const depth = Math.max(0, ...Array.from(slot.values()))
    return { slot, det, score: total + depth * 6 }
  }
  const idx = new Map(all.map((pk, i) => [pk, i]))
  const orders: ((pk: Pk) => number)[] = [
    (pk) => idx.get(pk)!,
    (pk) => span(pk) + idx.get(pk)! * 1e-3,
    (pk) => -span(pk) + idx.get(pk)! * 1e-3,
  ]
  let best: { slot: Map<Pk, number>; det: Set<Pk>; score: number } | null = null
  for (const o of orders) {
    const r = pack(o)
    if (!best || r.score < best.score) best = r
  }
  Array.from(best!.slot.entries()).forEach(([pk, s]) =>
    pk.kind === 'row' ? (pk.r.slot = s) : (pk.l.slot = s),
  )
  Array.from(best!.det).forEach(
    (pk) =>
      pk.kind === 'row' &&
      (pk.r.nodes.every((n) => n !== base(n))
        ? ((pk.r.hidden = true),
          notes.push(
            `${base(pk.r.nodes[0])} – ${pk.r.from ?? pk.r.to} link not drawn`,
          ))
        : (pk.r.detached = true)),
  )
  // Vertical compaction: slots give the stacking order, but each row only
  // clears what earlier slots put within its own footprint (a skyline). Labels
  // count station by station.
  const sky: { a: number; b: number; y: number }[] = []
  const skyAt = (a: number, b: number) => {
    let y = -Infinity
    for (const k of sky) if (k.a < b && a < k.b) y = Math.max(y, k.y)
    return y
  }
  type Placeable = {
    slot: number
    line: [number, number]
    labs: [number, number, number][]
    side: number
    set: (y: number) => void
  }
  const items: Placeable[] = []
  for (const r of rows.filter((q) => !q.hidden)) {
    const xs = [...r.nodes, ...[r.from, r.to].filter(Boolean)].map((n) =>
      X(n as string),
    )
    items.push({
      slot: r.slot,
      line: [Math.min(...xs) - 4, Math.max(...xs) + 4],
      labs: (r.detached
        ? [...[r.from, r.to].filter((f): f is string => !!f), ...r.nodes]
        : r.nodes
      ).map((n) => {
        const e = 0.71 * label(n)
        return r.dir > 0
          ? [X(n) - 2, X(n) + e + 8, e + 12]
          : [X(n) - e - 8, X(n) + 2, e + 12]
      }),
      side: r.side,
      set: (y) => (r.y = y),
    })
  }
  for (const l of links)
    items.push({
      slot: l.slot,
      line: [X(l.a) - 4, X(l.b) + 4],
      labs: [],
      side: 1,
      set: (y) => (l.y = y),
    })
  let bottom = 0
  const maxSlot = Math.max(0, ...items.map((i) => i.slot))
  for (let s = 0; s <= maxSlot; s++) {
    const add: { a: number; b: number; y: number }[] = []
    for (const it of items.filter((i) => i.slot === s)) {
      let y: number
      if (s === 0) y = Math.max(0, ...it.labs.map((l) => l[2]))
      else {
        y = skyAt(it.line[0], it.line[1]) + GAP
        if (it.side > 0)
          for (const [a, b, h] of it.labs) y = Math.max(y, skyAt(a, b) + h + 6)
      }
      it.set(y)
      add.push({ a: it.line[0], b: it.line[1], y: y + 8 })
      if (it.side < 0)
        for (const [a, b, h] of it.labs) add.push({ a, b, y: y + h })
      bottom = Math.max(
        bottom,
        y + 12,
        ...(it.side < 0 ? it.labs.map((l) => y + l[2]) : []),
      )
    }
    sky.push(...add)
  }
  return {
    rows,
    links,
    x,
    rowOf,
    bottom,
    clash: best!.score,
    loops: rows.filter((r) => r.from && r.to).length + links.length,
  }
}

// ---------------------------------------------------------------- diagram

export function buildDiagram(key: string): Diagram {
  const line = LINES[key]
  const services = SERVICES[key] ?? []
  const g = buildGraph(services)
  const routes = services.map((s) => {
    const r: string[] = []
    s.stops.forEach((n, i) => {
      if (i === 0) return r.push(n)
      if (n === s.stops[i - 1]) return
      const p = g.expand(s.stops[i - 1], n)
      r.push(...p.slice(1))
    })
    return r
  })
  const w = new Map<string, number>()
  for (const r of routes) {
    const seen = new Set<string>()
    for (let i = 1; i < r.length; i++) seen.add(ek(r[i - 1], r[i]))
    Array.from(seen).forEach((k) => w.set(k, (w.get(k) ?? 0) + 1))
  }
  const others = (n: string) =>
    (LINES_AT[n] ?? [])
      .filter((l) => l !== key && LINES[l])
      .sort((a, b) => LINES[a].order - LINES[b].order)
  const label = (n: string) =>
    textWidth(n) + (others(n).length ? 6 + others(n).length * 9 : 0) + 4
  // components
  const compOf = new Map<string, number>()
  const comps: string[][] = []
  for (const n of g.nodes) {
    if (compOf.has(n)) continue
    const c = [n]
    compOf.set(n, comps.length)
    for (let i = 0; i < c.length; i++)
      for (const m of Array.from(g.adj.get(c[i])!))
        if (!compOf.has(m)) compOf.set(m, comps.length), c.push(m)
    comps.push(c)
  }
  comps.sort((a, b) => b.length - a.length)
  const render = (breakLoops: boolean): Body => {
    const notes: string[] = []
    const stations: DStation[] = []
    const edges: DEdge[] = []
    let top = 0
    let minX = Infinity
    let maxX = -Infinity
    let nRows = 0
    let loops = 0
    let clash = 0
    for (const comp of comps) {
      const res = layoutComponent(
        comp,
        g.adj,
        w,
        routes,
        label,
        notes,
        breakLoops,
      )
      nRows += res.rows.length
      loops += res.loops
      clash += res.clash
      const X = (n: string) => res.x.get(n)!
      const Y = (n: string) => top + res.rows[res.rowOf.get(n)!].y
      const K = (a: string, b: string) => ek(base(a), base(b))
      for (const r of res.rows.filter((q) => !q.hidden)) {
        const y = top + r.y
        r.nodes.forEach((n) => {
          const name = base(n)
          const ghost = name !== n
          const lw = ghost ? textWidth(`to ${name}`) + 4 : label(n)
          const terminus = !ghost && g.adj.get(n)!.size === 1
          stations.push({
            name,
            key: n,
            x: X(n),
            y,
            side: r.side,
            lean: r.dir,
            id: ghost ? null : FEATURE_ID[`${n}|${key}`] ?? null,
            others: ghost ? [] : others(n),
            terminus,
            ghost,
            via: ghost ? 'to' : undefined,
            lw,
            tw: Math.round(textWidth(ghost ? `to ${name}` : n, FONT, terminus)),
          })
          minX = Math.min(minX, r.dir > 0 ? X(n) - 4 : X(n) - 0.71 * lw - 12)
          maxX = Math.max(maxX, r.dir > 0 ? X(n) + 0.71 * lw + 12 : X(n) + 4)
        })
        for (let i = 1; i < r.nodes.length; i++)
          edges.push({
            key: K(r.nodes[i - 1], r.nodes[i]),
            d: `M${X(r.nodes[i - 1])} ${y}H${X(r.nodes[i])}`,
          })
        const df = r.detached ? r.from ?? r.to : null
        if (df) {
          const f = df
          const near = r.from ? r.nodes[0] : r.nodes[r.nodes.length - 1]
          const lw = textWidth(`from ${base(f)}`) + 4
          stations.push({
            name: base(f),
            key: `${f}\u0003${near}`,
            x: X(f),
            y,
            side: r.side,
            lean: r.dir,
            id: null,
            others: [],
            terminus: false,
            ghost: true,
            via: 'from',
            lw,
            tw: Math.round(textWidth(`from ${base(f)}`)),
          })
          minX = Math.min(minX, X(f) - 0.71 * lw - 12)
          maxX = Math.max(maxX, X(f) + 0.71 * lw + 12)
          edges.push({
            key: K(f, near),
            d: `M${X(f)} ${y}H${X(near)}`,
          })
        } else if (r.from) {
          const f = r.from
          edges.push({
            key: K(f, r.nodes[0]),
            d: `M${X(f)} ${Y(f)}V${y - CH}L${X(f) + CH} ${y}H${X(r.nodes[0])}`,
          })
        }
        if (r.to && !(df && !r.from)) {
          const t = r.to
          const last = r.nodes[r.nodes.length - 1]
          if (r.from)
            edges.push({
              key: K(last, t),
              d: `M${X(last)} ${y}H${X(t) - CH}L${X(t)} ${y - CH}V${Y(t)}`,
            })
          else
            edges.push({
              key: K(last, t),
              d: `M${X(t)} ${Y(t)}V${y - CH}L${X(t) - CH} ${y}H${X(last)}`,
            })
        }
      }
      for (const l of res.links) {
        const y = top + l.y
        edges.push({
          key: K(l.a, l.b),
          d: `M${X(l.a)} ${Y(l.a)}V${y - CH}L${X(l.a) + CH} ${y}H${
            X(l.b) - CH
          }L${X(l.b)} ${y - CH}V${Y(l.b)}`,
        })
      }
      top += res.bottom + 40
    }
    const M = 18
    const dx = M - minX
    const shift = (d: string) =>
      d.replace(
        /([MHL])(-?[\d.]+)/g,
        (_, c, v) => `${c}${+(+v + dx).toFixed(1)}`,
      )
    edges.forEach((e) => (e.d = shift(e.d)))
    stations.forEach(
      (s) => ((s.x = +(s.x + dx).toFixed(1)), (s.y = +s.y.toFixed(1))),
    )
    return {
      width: Math.ceil(maxX - minX + 2 * M),
      height: Math.ceil(top - 40 + 16),
      stations,
      edges,
      notes,
      stats: { rows: nRows, loops, clash },
    }
  }
  const joined = render(false)
  const rows = render(true)
  // Prefer the joined schematic unless its connectors cross lines or labels
  // much more than the separate-rows fallback, or it gets far taller.
  const bad = (b: Body) => b.stats.clash + b.height / 25
  const auto =
    joined.stats.loops === 0 || bad(joined) <= bad(rows) + 8 ? 'joined' : 'rows'
  return {
    key,
    name: line.name,
    color: line.color,
    stripe: line.stripe ?? null,
    stripeColor: line.stripeColor ?? null,
    layouts: { joined, rows },
    auto,
    services: services.map((s, i) => ({
      name: s.name,
      route: routes[i],
      stops: s.stops,
    })),
    express: g.express,
  }
}

export const GROUPS: { title: string; keys: string[] }[] = (() => {
  const keys = Object.keys(LINES).filter((k) => (SERVICES[k] ?? []).length)
  keys.sort((a, b) => LINES[a].order - LINES[b].order)
  const g = (o: number) => (o <= 10 ? 0 : o <= 16 ? 1 : o <= 20 ? 2 : 3)
  const titles = [
    'Underground',
    'Overground',
    'Elizabeth line, DLR, Thameslink, trams',
    'National Rail',
  ]
  return titles
    .map((title, i) => ({
      title,
      keys: keys.filter((k) => g(LINES[k].order) === i),
    }))
    .filter((x) => x.keys.length)
})()

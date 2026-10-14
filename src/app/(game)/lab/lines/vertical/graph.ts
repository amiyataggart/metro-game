// Vertical "next stops" layout: turns a line's services into rows (one station
// per row) and lanes (columns), like a git history graph.
//
// 1. The longest service (cut at its first repeated stop) is the trunk, lane 0,
//    oriented north-at-top (or west-at-top for east-west lines).
// 2. Repeatedly, the longest run of not-yet-placed consecutive stops in any
//    service is added as a segment:
//    - anchored at both ends (an alternative route, e.g. Northern via Charing
//      Cross) -> its rows go just above the lower anchor;
//    - anchored at one end (a branch) -> its rows go just below the anchor if
//      the service runs downwards through the anchor, else just above it (so a
//      branch to the north ends at the top, as on a map).
// 3. Leftover edges between placed stations are drawn as links, unless they
//    are express skips (the drawn route between them is not much longer than
//    the straight line); loops such as the Circle's return to Paddington stay.
// 4. Lanes: each segment occupies a range of half-rows; the lowest free lane
//    wins, so a branch that simply continues past the end of the trunk keeps
//    lane 0 and parallel routes get the next free column.

export type Coord = [number, number] // lng, lat

export interface LRow {
  name: string
  lane: number
}
/** A drawn piece: path through rows on `lane`, optionally curving in from/out to anchor rows. */
export interface LPiece {
  lane: number
  /** row indices, top to bottom, of the stations on this piece (own stations) */
  rows: number[]
  top?: number // anchor row above (curve from its lane into `lane`)
  bottom?: number // anchor row below
}
export interface LineLayout {
  rows: LRow[]
  pieces: LPiece[]
  lanes: number
  /** per row: the highest lane drawn at that row's centre (labels go to its right) */
  busy: number[]
  /** long connections drawn as cross-references: row -> station names it also connects to */
  jumps: Record<number, string[]>
  /** internal: shortest-first moves that turned out not to be shorter */
  wrongMoves?: string[]
}

/** Links spanning more rows than this become cross-reference chips instead of long lanes. */
export const MAX_LINK_SPAN = 3

const K = 0.62 // cos(51.5°): degrees of longitude -> comparable to latitude

function dist(a?: Coord, b?: Coord) {
  if (!a || !b) return NaN
  const dx = (a[0] - b[0]) * K
  const dy = a[1] - b[1]
  return Math.sqrt(dx * dx + dy * dy)
}

function cleanStops(stops: string[]) {
  const out: string[] = []
  for (const s of stops) if (out[out.length - 1] !== s) out.push(s)
  return out
}

/** Longest repeat-free prefix. */
function prefixNoRepeat(stops: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of stops) {
    if (seen.has(s)) break
    seen.add(s)
    out.push(s)
  }
  return out
}

const CENTRE: Coord = [-0.1246, 51.5073] // Charing Cross

/**
 * @param radial for radial (National Rail) lines: put the London end on top when
 *   one end of the trunk is much nearer central London than the other.
 */
export function layoutLine(
  services: string[][],
  coords: Record<string, Coord | undefined>,
  radial = false,
): LineLayout {
  // Splitting the trunk lets a trunk stretch step outward round a loop
  // (Tramlink's Croydon loop) but can zig-zag lines with two parallel routes
  // (c2c via Upminster / via Tilbury): lay out both ways, keep the better one.
  // Shortest-first ordering (below) shortens the lanes trailing past other
  // stations, but on some networks (Southern's tangle of routes) it boxes
  // stations in: try each combination and keep the best scoring layout,
  // shortest-first and unsplit preferred on ties.
  let best: LineLayout | null = null
  let bestScore = Infinity
  for (const shortFirst of [true, false])
    for (const splitTrunk of [false, true]) {
      // a shortest-first move is judged when the branch is placed; branches
      // added later can make the other side the longer one after all (GWR at
      // Maidenhead: Twyford, Reading, then the Henley branch beat Marlow):
      // veto such moves and lay out again
      const veto = new Set<string>()
      let l = layoutLineWith(services, coords, radial, splitTrunk, shortFirst, veto)
      for (let k = 0; k < 6 && l.wrongMoves?.length; k++) {
        l.wrongMoves.forEach((m) => veto.add(m))
        l = layoutLineWith(services, coords, radial, splitTrunk, shortFirst, veto)
      }
      const sc = layoutScore(l)
      if (sc < bestScore) { best = l; bestScore = sc }
    }
  delete best!.wrongMoves
  return best!
}

/** Lower is better: stations with a lane wrongly passing outside them (it runs
 *  past more of their piece's stations than that piece runs past of its own),
 *  plus lanes crossed where pieces curve in from their anchors. */
export function layoutScore(l: LineLayout): number {
  const span = (p: LPiece): [number, number] => [
    p.top !== undefined ? 2 * p.top + 1 : 2 * Math.min(...p.rows),
    p.bottom !== undefined ? 2 * p.bottom - 1 : 2 * Math.max(...p.rows),
  ]
  const passN = (q: LPiece, o: LPiece) => {
    const [a, b] = span(q)
    return o.rows.filter((r) => !q.rows.includes(r) && a <= 2 * r && 2 * r <= b).length
  }
  const owner = new Map<number, LPiece>()
  l.pieces.forEach((p) => p.rows.forEach((r) => owner.set(r, p)))
  let bad = 0
  l.rows.forEach((_, i) => {
    const own = owner.get(i)
    if (!own) return
    if (l.pieces.some((q) => {
      if (q === own || q.lane <= own.lane) return false
      const [a, b] = span(q)
      return a <= 2 * i && 2 * i <= b && passN(q, own) > passN(own, q)
    })) bad++
  })
  // a lane is crossed only by pieces running straight through that half-row
  // (not ones fanning out from, or into, the same junction)
  const occupied = (lane: number, h: number) => l.pieces.some((p) => { const [a, b] = span(p); return p.lane === lane && a < h && h < b })
  let cross = 0
  for (const p of l.pieces) {
    for (const [anchor, h] of [[p.top, span(p)[0]], [p.bottom, span(p)[1]]] as [number | undefined, number][]) {
      if (anchor === undefined) continue
      const al = l.rows[anchor].lane
      for (let x = Math.min(al, p.lane) + 1; x < Math.max(al, p.lane); x++) if (occupied(x, h)) cross++
    }
  }
  return bad + 2 * cross
}

function layoutLineWith(
  services: string[][],
  coords: Record<string, Coord | undefined>,
  radial: boolean,
  splitTrunk: boolean,
  shortFirst = true,
  veto: Set<string> = new Set(),
): LineLayout {
  const svcs = services.map(cleanStops).filter((s) => s.length > 0)
  if (!svcs.length) return { rows: [], pieces: [], lanes: 1, busy: [], jumps: {} }

  // ---- trunk ----
  // the busiest long route: sum over its stops of how many services call there
  const calls = new Map<string, number>()
  for (const s of svcs) new Set(s).forEach((n) => calls.set(n, (calls.get(n) ?? 0) + 1))
  let trunk: string[] = []
  let trunkScore = -1
  for (const s of svcs) {
    const p = prefixNoRepeat(s)
    const score = p.reduce((t, n) => t + (calls.get(n) ?? 0), 0)
    if (score > trunkScore) {
      trunk = p
      trunkScore = score
    }
  }
  const firstC = trunk.map((n) => coords[n]).find(Boolean)
  const lastC = trunk.map((n) => coords[n]).reverse().find(Boolean)
  if (firstC && lastC) {
    const dy = lastC[1] - firstC[1]
    const dx = (lastC[0] - firstC[0]) * K
    let flip = Math.abs(dy) >= Math.abs(dx) ? dy > 0 : dx < 0 // want north (or west) first
    const d0 = dist(firstC, CENTRE)
    const d1 = dist(lastC, CENTRE)
    if (radial && Math.max(d0, d1) > 2.5 * Math.min(d0, d1)) flip = d1 < d0 // London end first
    if (flip) trunk = trunk.slice().reverse()
  }

  const order: string[] = trunk.slice()
  const placed = new Set(order)
  type Seg = { stations: string[]; top?: string; bottom?: string }
  const segs: Seg[] = [{ stations: trunk.slice() }]
  const segOf = new Map<string, number>(trunk.map((n) => [n, 0]))
  // trunk rows where shortest-first put a branch past the trunk's own shorter
  // dead-end rest: the trunk is split there so that rest can step outward
  // while the longer branch carries straight on (Elizabeth line at
  // Whitechapel: Canary Wharf … Abbey Wood beside the line on to Shenfield)
  const splitAfter = new Set<string>()
  const moves: { key: string; X: string; first: string; n: number; down: boolean }[] = []
  const splitBefore = new Set<string>()
  // Shortest first: where a line splits, the shorter continuation's rows come
  // straight after the junction and the longer one after them, so fewer lanes
  // trail past other stations (Thameslink at Bickley: Petts Wood, Orpington,
  // then the seven stops to Sevenoaks; c2c at Barking: via Upminster, then
  // via Tilbury). tailEnd/headStart: the dead-end rest of X's own piece
  // below/above X (anything spliced into it included), or null.
  const tailEnd = (X: string): number | null => {
    const sg = segs[segOf.get(X)!]
    if (sg.bottom !== undefined) return null
    const after = sg.stations.slice(sg.stations.indexOf(X) + 1)
    if (!after.length) return null
    return Math.max(...after.map((n) => idx(n)))
  }
  const headStart = (X: string): number | null => {
    const sg = segs[segOf.get(X)!]
    if (sg.top !== undefined) return null
    const before = sg.stations.slice(0, sg.stations.indexOf(X))
    if (!before.length) return null
    return Math.min(...before.map((n) => idx(n)))
  }
  const drawn = new Set<string>()
  const ek = (a: string, b: string) => (a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`)
  const adj = new Map<string, Set<string>>()
  const addDrawn = (a: string, b: string) => {
    drawn.add(ek(a, b))
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (let i = 1; i < trunk.length; i++) addDrawn(trunk[i - 1], trunk[i])
  const idx = (n: string) => order.indexOf(n)

  // ---- runs of unplaced stops ----
  const anchorCount = (s: string[], i: number, j: number) =>
    (i > 0 && placed.has(s[i - 1]) ? 1 : 0) + (j < s.length - 1 && placed.has(s[j + 1]) ? 1 : 0)
  for (let guard = 0; guard < 500; guard++) {
    let best: { s: string[]; i: number; j: number } | null = null
    for (const s of svcs) {
      let i = 0
      while (i < s.length) {
        if (placed.has(s[i])) {
          i++
          continue
        }
        let j = i
        const seen = new Set<string>([s[i]])
        while (j + 1 < s.length && !placed.has(s[j + 1]) && !seen.has(s[j + 1])) seen.add(s[++j])
        const len = j - i + 1
        const anchors = anchorCount(s, i, j)
        const bl = best ? best.j - best.i + 1 : -1
        const ba = best ? anchorCount(best.s, best.i, best.j) : 0
        if (anchors > 0 && (len > bl || (len === bl && anchors > ba))) best = { s, i, j }
        i = j + 1
      }
    }
    if (!best) break
    const { s, i, j } = best
    let run = s.slice(i, j + 1)
    let A: string | undefined = i > 0 && placed.has(s[i - 1]) ? s[i - 1] : undefined
    let B: string | undefined = j < s.length - 1 && placed.has(s[j + 1]) ? s[j + 1] : undefined
    if (A && B && A === B) B = undefined // returns to where it left: treat as a branch, close with a link
    if (A && B) {
      // alternative route between two placed stations
      if (idx(A) > idx(B)) {
        run = run.reverse()
        ;[A, B] = [B, A]
      }
      // the shorter of the two routes between A and B goes first
      const between = idx(B) - idx(A) - 1
      order.splice(shortFirst && run.length < between ? idx(A) + 1 : idx(B), 0, ...run)
      segs.push({ stations: run, top: A, bottom: B })
      addDrawn(A, run[0])
      for (let k = 1; k < run.length; k++) addDrawn(run[k - 1], run[k])
      addDrawn(run[run.length - 1], B)
    } else {
      // branch hanging off one anchor X; `away` lists stops leaving X
      const X = (A ?? B)!
      const away = A ? run : run.slice().reverse()
      // q: the service's stop on the other side of X
      const xi = A ? i - 1 : j + 1
      const q = A ? s[xi - 1] : s[xi + 1]
      let down: boolean
      if (q && placed.has(q) && q !== X) down = idx(q) < idx(X)
      else {
        // geography: is the far end further "down" the trunk than X?
        const t0 = coords[order[0]]
        const t1 = coords[order[order.length - 1]]
        const end = coords[away[away.length - 1]] ?? coords[away[0]]
        const cx = coords[X]
        if (t0 && t1 && end && cx) {
          const ax = (t1[0] - t0[0]) * K
          const ay = t1[1] - t0[1]
          down = (end[0] - cx[0]) * K * ax + (end[1] - cx[1]) * ay >= 0
        } else down = idx(X) >= order.length / 2
      }
      if (down) {
        const t = tailEnd(X)
        const key = `${X}>${away[0]}`
        const past = shortFirst && !veto.has(key) && t !== null && t - idx(X) < away.length
        if (past) moves.push({ key, X, first: away[0], n: away.length, down: true })
        if (past && segOf.get(X) === 0) splitAfter.add(X)
        order.splice(past ? t! + 1 : idx(X) + 1, 0, ...away)
        segs.push({ stations: away, top: X })
      } else {
        const up = away.slice().reverse()
        const h = headStart(X)
        const key = `${X}<${up[up.length - 1]}`
        const past = shortFirst && !veto.has(key) && h !== null && idx(X) - h < up.length
        if (past) moves.push({ key, X, first: up[up.length - 1], n: up.length, down: false })
        if (past && segOf.get(X) === 0) splitBefore.add(X)
        order.splice(past ? h! : idx(X), 0, ...up)
        segs.push({ stations: up, bottom: X })
      }
      addDrawn(X, away[0])
      for (let k = 1; k < away.length; k++) addDrawn(away[k - 1], away[k])
    }
    run.forEach((n) => placed.add(n))
    run.forEach((n) => segOf.set(n, segs.length - 1))
  }

  // ---- leftover edges (links) ----
  const routeDist = (u: string, v: string): number => {
    // Dijkstra over drawn edges by straight-line distance; hops when coords are missing
    const d = new Map<string, number>([[u, 0]])
    const done = new Set<string>()
    for (let it = 0; it < 2000; it++) {
      let cur: string | null = null
      let cd = Infinity
      d.forEach((val, key) => {
        if (!done.has(key) && val < cd) {
          cd = val
          cur = key
        }
      })
      if (cur === null) return Infinity
      if (cur === v) return cd
      done.add(cur)
      const nb = adj.get(cur)
      if (!nb) continue
      const c: string = cur
      nb.forEach((w) => {
        const step = dist(coords[c], coords[w])
        const nd = cd + (isNaN(step) ? 0.01 : step)
        if (nd < (d.get(w) ?? Infinity)) d.set(w, nd)
      })
    }
    return Infinity
  }
  const links: [string, string][] = []
  for (const s of svcs) {
    for (let k = 1; k < s.length; k++) {
      const u = s[k - 1]
      const v = s[k]
      if (u === v || drawn.has(ek(u, v)) || !placed.has(u) || !placed.has(v)) continue
      const straight = dist(coords[u], coords[v])
      const via = routeDist(u, v)
      const express = isNaN(straight) ? via < 0.2 : via <= straight * 1.6 + 0.012
      if (express) continue
      addDrawn(u, v)
      links.push(idx(u) < idx(v) ? [u, v] : [v, u])
    }
  }

  // shortest-first moves whose skipped side ended up longer than the branch
  const wrongMoves = moves
    .filter((m) => (m.down ? idx(m.first) - idx(m.X) - 1 : idx(m.X) - idx(m.first) - 1) > m.n)
    .map((m) => m.key)

  // ---- rows & lanes ----
  const rowOf = new Map(order.map((n, r) => [n, r]))
  const rows: LRow[] = order.map((name) => ({ name, lane: 0 }))
  const occ: [number, number][][] = [] // per lane: half-row ranges
  const free = (lane: number, a: number, b: number) =>
    !(occ[lane] || []).some(([x, y]) => !(b < x || a > y))
  const take = (lane: number, a: number, b: number) => (occ[lane] ||= []).push([a, b])
  const pieces: LPiece[] = []
  // Pieces to place: segments (with their own station rows) and links (none).
  // Each spans half-rows [a, b]; anchored ends curve in from the anchor row.
  type Item = { rs: number[]; a: number; b: number; anchorRow?: number; top?: number; bottom?: number; trunk?: boolean }
  const items: Item[] = []
  // The trunk is split at its junction stations (rows other pieces join at)
  // into sections that obey the same inside/outside rule as everything else,
  // so a trunk stretch can step outward round a loop that would otherwise
  // pass its stations on the outside (Tramlink's Croydon loop past Reeves
  // Corner, Centrale, West Croydon, Wellesley Road) and step back after it.
  const junction = new Set<number>()
  segs.forEach((seg, si) => {
    if (si === 0) return
    if (seg.top !== undefined) junction.add(rowOf.get(seg.top)!)
    if (seg.bottom !== undefined) junction.add(rowOf.get(seg.bottom)!)
  })
  for (const [u, v] of links) {
    const ru = rowOf.get(u)!, rv = rowOf.get(v)!
    if (rv - ru <= MAX_LINK_SPAN) { junction.add(ru); junction.add(rv) }
  }
  {
    const tr = segs[0].stations.map((n) => rowOf.get(n)!)
    const parts: number[][] = []
    const cutAfter = new Set([...splitAfter].map((n) => rowOf.get(n)!))
    const cutBefore = new Set([...splitBefore].map((n) => rowOf.get(n)!))
    for (const r of tr) {
      const last = parts[parts.length - 1]
      const prev = last ? last[last.length - 1] : undefined
      if (!last) parts.push([r])
      else if (splitTrunk && (junction.has(r) || junction.has(prev!))) parts.push([r])
      else if (cutAfter.has(prev!) || cutBefore.has(r)) parts.push([r])
      else last.push(r)
    }
    parts.forEach((rs, k) => {
      const top = k > 0 ? parts[k - 1][parts[k - 1].length - 1] : undefined
      // joined to the previous section only: the next section curves in from
      // this one's last row, so this one must not claim the lane below it
      // (it kept the Shenfield branch off lane 0 at Whitechapel)
      const a = top !== undefined ? 2 * top + 1 : 2 * rs[0]
      const b = 2 * rs[rs.length - 1]
      items.push({ rs, a, b, anchorRow: top, top, trunk: true })
    })
  }
  segs.forEach((seg, si) => {
    if (si === 0) return
    const rs = seg.stations.map((n) => rowOf.get(n)!)
    let a = 2 * Math.min(...rs)
    let b = 2 * Math.max(...rs)
    if (seg.top) a = 2 * rowOf.get(seg.top)! + 1
    if (seg.bottom) b = 2 * rowOf.get(seg.bottom)! - 1
    const top = seg.top !== undefined ? rowOf.get(seg.top) : undefined
    const bottom = seg.bottom !== undefined ? rowOf.get(seg.bottom) : undefined
    items.push({ rs, a, b, anchorRow: top ?? bottom, top, bottom })
  })
  const jumps: Record<number, string[]> = {}
  for (const [u, v] of links) {
    const ru = rowOf.get(u)!
    const rv = rowOf.get(v)!
    if (rv - ru > MAX_LINK_SPAN) {
      ;(jumps[ru] ||= []).push(v)
      ;(jumps[rv] ||= []).push(u)
      continue
    }
    items.push({ rs: [], a: 2 * ru + 1, b: 2 * rv - 1, anchorRow: ru, top: ru, bottom: rv })
  }
  // Stations sit on the outermost lane of their row, next to their names: a
  // piece that runs past a row without stopping there goes INSIDE (a lower
  // lane than) the piece that has that row's station. Otherwise a through lane
  // (Thameslink West Hampstead -> Kentish Town) boxes in a branch's stations
  // (Cambridge). Place pieces in that order (trunk first; cycles fall back to
  // build order), each on its anchor's lane if allowed, else the lowest free
  // lane right of everything it must be inside of.
  const owner = new Map<number, number>() // row -> item with its station
  items.forEach((it, i) => it.rs.forEach((r) => owner.set(r, i)))
  // passes[o][i] = how many of o's station rows piece i runs past
  const passes: Map<number, number>[] = items.map(() => new Map())
  items.forEach((it, i) => {
    const own = new Set(it.rs)
    for (let r = Math.ceil(it.a / 2); 2 * r <= it.b; r++) {
      const o = owner.get(r)
      if (o !== undefined && o !== i && !own.has(r)) passes[o].set(i, (passes[o].get(i) ?? 0) + 1)
    }
  })
  // two pieces that each run past the other's stations: the side passing more
  // stations goes inside (Thameslink's West Hampstead -> Kentish Town lane runs
  // past the 8 Cambridge-branch stations, which pass only Kentish Town)
  const inside: Set<number>[] = items.map(() => new Set()) // i -> items that must be left of i
  passes.forEach((m, o) =>
    m.forEach((n, i) => {
      const back = passes[i].get(o) ?? 0
      if (n > back || (n === back && i < o)) inside[o].add(i)
    }),
  )
  const laneOf: number[] = items.map(() => -1)
  const isLink = (i: number) => items[i].rs.length === 0
  // segments first, ordered by the inside-of relation among segments
  const done = new Set<number>()
  const ready = (i: number) => [...inside[i]].every((j) => done.has(j) || isLink(j))
  const orderIdx: number[] = []
  const nSeg = items.filter((_, i) => !isLink(i)).length
  for (let guard = 0; orderIdx.length < nSeg && guard < items.length * 4; guard++) {
    // the first trunk section first, then any piece whose inner neighbours are placed
    let next = !done.has(0) ? 0 : items.findIndex((_, i) => !isLink(i) && !done.has(i) && ready(i))
    if (next < 0) {
      // a cycle: place the piece that the unplaced pieces least need to be
      // inside of (fewest of its stations run past by them), build order on ties
      let best = Infinity
      items.forEach((_, i) => {
        if (isLink(i) || done.has(i)) return
        let w = 0
        passes[i].forEach((n, j) => { if (!done.has(j) && !isLink(j)) w += n })
        if (w < best) { best = w; next = i }
      })
    }
    done.add(next)
    orderIdx.push(next)
  }
  for (const i of orderIdx) {
    const it = items[i]
    let min = 0
    inside[i].forEach((j) => { if (laneOf[j] >= 0) min = Math.max(min, laneOf[j] + 1) })
    let lane: number
    if (it.trunk) {
      // trunk sections: straight on (the previous section's lane) or the
      // innermost free lane allowed (back towards lane 0 after a loop),
      // whichever crosses fewer lanes where it steps across; ties go inside
      let low = min
      while (!free(low, it.a, it.b)) low++
      const al = it.anchorRow !== undefined ? rows[it.anchorRow].lane : low
      const straight = al >= min && free(al, it.a, it.b)
      const crossings = (to: number) => {
        if (it.anchorRow === undefined) return 0
        let n = 0
        for (let l = Math.min(al, to) + 1; l < Math.max(al, to); l++) if (!free(l, it.a, it.a)) n++
        return n
      }
      lane = straight && crossings(al) < crossings(low) ? al : low
    } else {
      // the anchor's lane (straight on), else the nearest free lane inside it
      // (down to `min`), else the next free lane outside it
      const al = it.anchorRow !== undefined ? rows[it.anchorRow].lane : 0
      lane = -1
      for (let l = al; l >= min && lane < 0; l--) if (free(l, it.a, it.b)) lane = l
      if (lane < 0) {
        lane = Math.max(al + 1, min)
        while (!free(lane, it.a, it.b)) lane++
      }
    }
    laneOf[i] = lane
    take(lane, it.a, it.b)
    it.rs.forEach((r) => (rows[r].lane = lane))
  }
  // then links (short skips between placed stations): the nearest free lane
  // just inside the stations they run past, so they hug their own route;
  // otherwise the old rule (their stations' lane, else the lowest free one)
  items.forEach((it, i) => {
    if (!isLink(i)) return
    const ru = it.top!, rv = it.bottom!
    const passed: number[] = []
    for (let r = ru + 1; r < rv; r++) passed.push(rows[r].lane)
    const ends = Math.max(rows[ru].lane, rows[rv].lane)
    let lane = -1
    if (passed.length) {
      const cap = Math.min(...passed) - 1
      for (let l = Math.min(cap, ends); l >= 0 && lane < 0; l--) if (free(l, it.a, it.b)) lane = l
    }
    if (lane < 0) {
      lane = rows[ru].lane === rows[rv].lane && free(rows[ru].lane, it.a, it.b) ? rows[ru].lane : 0
      while (!free(lane, it.a, it.b)) lane++
    }
    laneOf[i] = lane
    take(lane, it.a, it.b)
  })
  items.forEach((it, i) => pieces.push({ lane: laneOf[i], rows: it.rs, top: it.top, bottom: it.bottom }))
  const lanes = occ.length || 1
  const busy = rows.map((row, r) => {
    let m = row.lane
    occ.forEach((ranges, lane) => {
      if (ranges.some(([x, y]) => x <= 2 * r && 2 * r <= y)) m = Math.max(m, lane)
    })
    return m
  })
  return { rows, pieces, lanes, busy, jumps, wrongMoves }
}

/** Reverse a layout top-to-bottom. */
export function flipLayout(l: LineLayout): LineLayout {
  const n = l.rows.length
  const f = (r: number) => n - 1 - r
  return {
    rows: l.rows.slice().reverse(),
    pieces: l.pieces.map((p) => ({
      lane: p.lane,
      rows: p.rows.map(f).reverse(),
      top: p.bottom !== undefined ? f(p.bottom) : undefined,
      bottom: p.top !== undefined ? f(p.top) : undefined,
    })),
    lanes: l.lanes,
    busy: l.busy.slice().reverse(),
    jumps: Object.fromEntries(Object.entries(l.jumps).map(([r, v]) => [f(+r), v])),
  }
}

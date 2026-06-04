#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Fetches real rail track geometry from OpenStreetMap via the Overpass API
 * and writes routes.json + a new-TOC stations file.
 *
 *   • Underground (11), DLR, Elizabeth line, 2024 Overground (6) — pulled
 *     from `route=subway / light_rail / train` relations matched by tags.
 *   • National Rail: Thameslink — matched by relation name prefix.
 *
 * Parallel offsets: every OSM way is tracked across the lines that share it.
 * For each (way, line) pair we emit a LineString feature with an `offset`
 * property = stack position relative to the centre of the bundle, so the
 * MapLibre `line-offset` paint property can render shared corridors as
 * parallel ribbons rather than stacking the lines on top of each other.
 *
 * Output:
 *   src/app/(game)/london/data/routes.json
 *   src/app/(game)/london/data/stations-extras.json
 *
 * Data © OpenStreetMap contributors, ODbL.
 */

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')
// Output paths can be overridden so a re-fetch doesn't clobber committed data:
//   node scripts/fetch-osm-routes.js --out FILE --stations-out FILE
const _argOut = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null }
const ROUTES_DST = _argOut('--out') || path.join(DATA_DIR, 'routes.json')
const STATIONS_DST = _argOut('--stations-out') || path.join(DATA_DIR, 'stations-extras.json')

const LINE_COLORS = {
  Bakerloo: '#b36305',
  Central: '#e32017',
  Circle: '#ffd329',
  District: '#00782a',
  HammersmithAndCity: '#f3a9bb',
  Jubilee: '#a0a5a9',
  Metropolitan: '#9b0056',
  Northern: '#000000',
  Piccadilly: '#003688',
  Victoria: '#0098d4',
  WaterlooAndCity: '#84CAB3',
  ElizabethLine: '#6950A1',
  DLR: '#00afad',
  Lioness: '#FAA61A',
  Mildmay: '#3DB6E1',
  Windrush: '#DA291C',
  Weaver: '#823065',
  Suffragette: '#5BBD72',
  Liberty: '#7C878E',
  Thameslink: '#DD3399',
  // National Rail TOCs (colours as on TfL's "London's rail & tube services" map).
  SouthWesternRailway: '#C63834',
  C2c: '#C62F7C',
  GreaterAnglia: '#828795',
  Southeastern: '#2B65A0',
  SoutheasternHighSpeed: '#2B65A0',
  Southern: '#439752',
  GreatNorthern: '#BB9767',
  GatwickExpress: '#1A1919',
  Chiltern: '#A382AA',
  EastMidlandsRailway: '#4F9AB3',
  GreatWesternRailway: '#2A2D74',
  HeathrowExpress: '#75BAB1',
}

// Ascending order roughly groups Underground > Overground/Rail > National Rail
// — used both for legend ordering and for stack ordering in parallel offsets.
const LINE_ORDER = {
  Bakerloo: 0, Central: 1, Circle: 2, District: 3, HammersmithAndCity: 4,
  Jubilee: 5, Metropolitan: 6, Northern: 7, Piccadilly: 8, Victoria: 9,
  WaterlooAndCity: 10, ElizabethLine: 11, DLR: 12, Lioness: 13, Mildmay: 14,
  Windrush: 15, Weaver: 16, Suffragette: 17, Liberty: 18, Thameslink: 19,
  SouthWesternRailway: 20, C2c: 21, GreaterAnglia: 22, Southeastern: 23,
  SoutheasternHighSpeed: 24, Southern: 25, GreatNorthern: 26, GatwickExpress: 27,
  Chiltern: 28, EastMidlandsRailway: 29, GreatWesternRailway: 30, HeathrowExpress: 31,
}

// All matchers run against relation tags. The first match wins.
const RELATION_MATCHERS = [
  // Underground — match by ref directly.
  { lineKey: 'Bakerloo', test: (t) => t.route === 'subway' && t.ref === 'Bakerloo' },
  { lineKey: 'Central', test: (t) => t.route === 'subway' && t.ref === 'Central' },
  { lineKey: 'Circle', test: (t) => t.route === 'subway' && t.ref === 'Circle' },
  { lineKey: 'District', test: (t) => t.route === 'subway' && t.ref === 'District' },
  { lineKey: 'HammersmithAndCity', test: (t) => t.route === 'subway' && (t.ref === 'Hammersmith & City' || t.ref === 'Hammersmith and City') },
  { lineKey: 'Jubilee', test: (t) => t.route === 'subway' && t.ref === 'Jubilee' },
  { lineKey: 'Metropolitan', test: (t) => t.route === 'subway' && t.ref === 'Metropolitan' },
  { lineKey: 'Northern', test: (t) => t.route === 'subway' && t.ref === 'Northern' },
  { lineKey: 'Piccadilly', test: (t) => t.route === 'subway' && t.ref === 'Piccadilly' },
  { lineKey: 'Victoria', test: (t) => t.route === 'subway' && t.ref === 'Victoria' },
  { lineKey: 'WaterlooAndCity', test: (t) => t.route === 'subway' && (t.ref === 'Waterloo & City' || t.ref === 'Waterloo and City') },
  // DLR — light_rail, network mentions Docklands.
  { lineKey: 'DLR', test: (t) => t.route === 'light_rail' && (t.network || '').includes('Docklands') },
  // Elizabeth line.
  { lineKey: 'ElizabethLine', test: (t) => t.route === 'train' && (t.ref === 'Elizabeth' || t.ref === 'Elizabeth line') },
  // 2024 Overground line refs.
  { lineKey: 'Lioness', test: (t) => t.ref === 'Lioness' },
  { lineKey: 'Mildmay', test: (t) => t.ref === 'Mildmay' },
  { lineKey: 'Windrush', test: (t) => t.ref === 'Windrush' },
  { lineKey: 'Weaver', test: (t) => t.ref === 'Weaver' },
  { lineKey: 'Suffragette', test: (t) => t.ref === 'Suffragette' },
  { lineKey: 'Liberty', test: (t) => t.ref === 'Liberty' },
  // National Rail TOCs — match by relation name prefix.
  { lineKey: 'Thameslink', test: (t) => /^Thameslink:/.test(t.name || '') },
  // More National Rail TOCs. Name-prefix matchers first (some share an
  // operator tag with other TOCs — e.g. Great Northern / Gatwick Express both
  // carry operator="Govia Thameslink Railway", so they MUST be split by name,
  // never by operator). Heathrow Express has an EMPTY operator tag in OSM, so
  // it too is name-only.
  { lineKey: 'Southern', test: (t) => t.route === 'train' && /^Southern:/.test(t.name || '') },
  { lineKey: 'GreatNorthern', test: (t) => t.route === 'train' && /^Great Northern:/.test(t.name || '') },
  { lineKey: 'GatwickExpress', test: (t) => t.route === 'train' && /^Gatwick Express:/.test(t.name || '') },
  { lineKey: 'GreatWesternRailway', test: (t) => t.route === 'train' && /^GWR:/.test(t.name || '') },
  { lineKey: 'Chiltern', test: (t) => t.route === 'train' && /^CH:/.test(t.name || '') },
  { lineKey: 'C2c', test: (t) => t.route === 'train' && /^c2c:/.test(t.name || '') },
  { lineKey: 'HeathrowExpress', test: (t) => t.route === 'train' && /^Heathrow Express:/.test(t.name || '') },
  // Southeastern: split the High Speed (HS1) services into their own line.
  { lineKey: 'SoutheasternHighSpeed', test: (t) => t.route === 'train' && t.operator === 'Southeastern' && (/High Speed/i.test(t.name || '') || t.ref === 'HS1') },
  { lineKey: 'Southeastern', test: (t) => t.route === 'train' && t.operator === 'Southeastern' },
  // Operator-tag matchers for the remaining TOCs.
  { lineKey: 'GreaterAnglia', test: (t) => t.route === 'train' && t.operator === 'Greater Anglia' },
  { lineKey: 'SouthWesternRailway', test: (t) => t.route === 'train' && t.operator === 'South Western Railway' },
  { lineKey: 'EastMidlandsRailway', test: (t) => t.route === 'train' && t.operator === 'East Midlands Railway' },
]

function tagsToLineKey(tags) {
  for (const m of RELATION_MATCHERS) if (m.test(tags)) return m.lineKey
  return null
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
// Mirror fallbacks — the public endpoint frequently returns 504 under load.
const OVERPASS_MIRRORS = [
  OVERPASS_URL,
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

// Single query for everything we need.
const OVERPASS_QUERY = `
[out:json][timeout:240];
(
  relation["route"="subway"]["network"="London Underground"];
  relation["route"~"^(train|light_rail)$"]["ref"~"^(Lioness|Mildmay|Windrush|Weaver|Suffragette|Liberty)$"];
  relation["route"="train"]["ref"~"^Elizabeth"];
  relation["route"="light_rail"]["network"~"Docklands"];
  relation["route"="train"]["name"~"^Thameslink:"];
  relation["route"="train"]["name"~"^Southern:"];
  relation["route"="train"]["name"~"^Great Northern:"];
  relation["route"="train"]["name"~"^Gatwick Express:"];
  relation["route"="train"]["name"~"^GWR:"];
  relation["route"="train"]["name"~"^CH:"];
  relation["route"="train"]["name"~"^c2c:"];
  relation["route"="train"]["name"~"^Heathrow Express:"];
  relation["route"="train"]["operator"="Southeastern"];
  relation["route"="train"]["operator"="Greater Anglia"];
  relation["route"="train"]["operator"="South Western Railway"];
  relation["route"="train"]["operator"="East Midlands Railway"];
);
out geom;
>;
out;
`.trim()

async function fetchOverpass() {
  console.log('Fetching from Overpass API (this may take 60-120s)...')
  let lastErr
  for (const url of OVERPASS_MIRRORS) {
    try {
      console.log(`  → ${url}`)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'tube-memory-dev/0.1 (offline build)',
        },
        body: 'data=' + encodeURIComponent(OVERPASS_QUERY),
      })
      if (!res.ok) {
        lastErr = new Error(`Overpass returned ${res.status}`)
        console.warn(`    ${res.status} — trying next mirror`)
        continue
      }
      return await res.json()
    } catch (e) {
      lastErr = e
      console.warn(`    ${e.message} — trying next mirror`)
    }
  }
  throw lastErr || new Error('All Overpass mirrors failed')
}

function main() {
  return fetchOverpass().then((data) => {
    // ----- pass 1: collect node + way tags + node-id sequences -----
    const nodeTags = new Map() // id → tags
    const nodeLatLng = new Map() // id → [lng, lat]
    const wayTags = new Map() // wayId → tags
    const wayNodes = new Map() // wayId → [nodeId, nodeId, ...] (for chain building)
    for (const el of data.elements) {
      if (el.type === 'node') {
        nodeTags.set(el.id, el.tags || {})
        if (typeof el.lat === 'number' && typeof el.lon === 'number') {
          nodeLatLng.set(el.id, [el.lon, el.lat])
        }
      } else if (el.type === 'way') {
        wayTags.set(el.id, el.tags || {})
        if (Array.isArray(el.nodes)) wayNodes.set(el.id, el.nodes)
      }
    }

    // Ways we drop entirely: anything that's not a main passenger rail. These
    // are the source of the "platform loop" wireframes — short curving ways
    // into platforms, crossovers between rails, yard tracks, etc.
    const SKIP_SERVICES = new Set([
      'siding', 'yard', 'spur', 'crossover', 'industrial', 'turning_circle',
    ])
    function isMainRailWay(wayId) {
      const t = wayTags.get(wayId) || {}
      if (t.service && SKIP_SERVICES.has(t.service)) return false
      if (t.railway === 'platform') return false
      if (t.railway === 'switch') return false
      return true
    }

    // ----- pass 2: build (wayId → [lineKey ...]) and (lineKey → stopNodeIds) ---
    const wayToLines = new Map() // wayId → Set<lineKey>
    const wayGeometry = new Map() // wayId → [[lng, lat], ...]
    const lineStations = new Map() // lineKey → Set<nodeId>

    let usedRels = 0
    for (const rel of data.elements) {
      if (rel.type !== 'relation') continue
      const lineKey = tagsToLineKey(rel.tags || {})
      if (!lineKey) continue
      usedRels++
      for (const m of rel.members || []) {
        if (m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length >= 2) {
          if (!isMainRailWay(m.ref)) continue
          if (!wayToLines.has(m.ref)) wayToLines.set(m.ref, new Set())
          wayToLines.get(m.ref).add(lineKey)
          if (!wayGeometry.has(m.ref)) {
            wayGeometry.set(m.ref, m.geometry.map((g) => [g.lon, g.lat]))
          }
        } else if (m.type === 'node' && (m.role === 'stop' || m.role === 'stop_entry_only' || m.role === 'stop_exit_only')) {
          if (!lineStations.has(lineKey)) lineStations.set(lineKey, new Set())
          lineStations.get(lineKey).add(m.ref)
        }
      }
    }

    console.log(`Processed ${usedRels} relevant relation(s), ${wayToLines.size} unique way(s).`)

    // ----- per-line centerline averaging -----
    // OSM models each physical rail as a separate way; the two directions of
    // a double track are usually distinct way ids. We greedily pair each
    // line's ways with their best spatial match (bucket overlap ≥ 0.8) and
    // emit the average of the two polylines as a single centerline feature.
    // Unpaired ways (singletons, branches, or junction stubs) pass through
    // unchanged. This is more faithful than dropping one rail — at stations
    // where the two tracks diverge around platforms, the centerline runs
    // through the middle rather than along one platform face.
    const GRID = 0.0002 // ~14m lon at 51.5°N, ~22m lat
    // Chains can have meaningfully different lengths and bucket coverage
    // because the two rails of a double track use different switches at
    // junctions, producing slightly different geometry.
    const PAIR_JACCARD_THRESHOLD = 0.25
    const PAIR_LENGTH_RATIO = 0.35
    // Endpoint-distance test — pair if both endpoints (in either orientation)
    // are within ~120m. Two parallel rails of a double track always satisfy
    // this even when their Jaccard is low because of vertex-count mismatch.
    const PAIR_ENDPOINT_TOL_SQ = 0.0012 * 0.0012
    const PAIR_ENDPOINT_LEN_RATIO = 0.5

    function bucketsFor(coords) {
      const set = new Set()
      for (const [lng, lat] of coords) {
        set.add(`${Math.round(lng / GRID)},${Math.round(lat / GRID)}`)
      }
      return set
    }
    function wayLengthCheap(coords) {
      let n = 0
      for (let i = 1; i < coords.length; i++) {
        n += Math.abs(coords[i][0] - coords[i - 1][0]) + Math.abs(coords[i][1] - coords[i - 1][1])
      }
      return n
    }

    // Bucket all ways once.
    const wayBuckets = new Map()
    const wayLen = new Map()
    for (const [wayId, coords] of wayGeometry.entries()) {
      wayBuckets.set(wayId, bucketsFor(coords))
      wayLen.set(wayId, wayLengthCheap(coords))
    }

    // ----- cross-line offsets via proximity (not just shared OSM ways) -----
    // Lines that run on geographically-parallel-but-separate tracks (e.g.
    // Thameslink alongside the Met line between Farringdon and St Pancras)
    // each have their own OSM ways, so "shared way" offsetting puts them
    // both at offset 0 → they render on top of each other.
    //
    // Instead, build a bucket → Set<lineKey> index, then for each way
    // compute the set of lines whose ways pass through enough of THIS way's
    // buckets (>=PROXIMITY_THRESHOLD buckets) to count as "parallel".
    // That set becomes the stack for offset purposes.
    const PROXIMITY_BUCKET_THRESHOLD = 5 // ~70m of parallel track

    const bucketToLines = new Map() // bucketKey → Set<lineKey>
    for (const [wayId, linesSet] of wayToLines.entries()) {
      const buckets = wayBuckets.get(wayId)
      if (!buckets) continue
      for (const b of buckets) {
        if (!bucketToLines.has(b)) bucketToLines.set(b, new Set())
        const target = bucketToLines.get(b)
        for (const line of linesSet) target.add(line)
      }
    }

    function proximityLinesFor(buckets) {
      const hits = new Map()
      for (const b of buckets) {
        const set = bucketToLines.get(b)
        if (!set) continue
        for (const l of set) hits.set(l, (hits.get(l) || 0) + 1)
      }
      const out = new Set()
      for (const [line, count] of hits) {
        if (count >= PROXIMITY_BUCKET_THRESHOLD) out.add(line)
      }
      return out
    }

    // Compute offsets per (way, lineKey) using proximity-lines.
    const wayOffsets = new Map() // wayId → Map<lineKey, offset>
    for (const [wayId, linesSet] of wayToLines.entries()) {
      const buckets = wayBuckets.get(wayId)
      const proximity = proximityLinesFor(buckets)
      // Make sure this way's own lines are in the stack even if a way is too
      // short to cross the proximity threshold against itself.
      for (const l of linesSet) proximity.add(l)

      const sorted = [...proximity].sort(
        (a, b) => (LINE_ORDER[a] ?? 99) - (LINE_ORDER[b] ?? 99),
      )
      const offMap = new Map()
      for (let i = 0; i < sorted.length; i++) {
        offMap.set(sorted[i], i - (sorted.length - 1) / 2)
      }
      wayOffsets.set(wayId, offMap)
    }

    // Jaccard index — symmetric, robust to small length differences. A pair
    // of truly parallel rails scores 0.7+ even when one polyline has slightly
    // more vertices than the other; a short stub embedded inside a long way
    // scores < 0.2 (low because the stub's buckets are a tiny fraction of
    // the long way's buckets).
    function bucketJaccard(a, b) {
      let common = 0
      const small = a.size <= b.size ? a : b
      const big = a.size <= b.size ? b : a
      for (const k of small) if (big.has(k)) common++
      const union = a.size + b.size - common
      return union === 0 ? 0 : common / union
    }

    function sampleAtArcLength(coords, n) {
      const segLens = []
      let total = 0
      for (let i = 1; i < coords.length; i++) {
        const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1])
        segLens.push(d)
        total += d
      }
      if (total === 0) return coords.slice()
      const out = []
      for (let i = 0; i < n; i++) {
        const t = (total * i) / (n - 1)
        let accum = 0
        let j = 0
        while (j < segLens.length && accum + segLens[j] < t) {
          accum += segLens[j]
          j++
        }
        if (j >= segLens.length) {
          out.push(coords[coords.length - 1].slice())
        } else {
          const remain = t - accum
          const frac = segLens[j] === 0 ? 0 : remain / segLens[j]
          out.push([
            coords[j][0] + (coords[j + 1][0] - coords[j][0]) * frac,
            coords[j][1] + (coords[j + 1][1] - coords[j][1]) * frac,
          ])
        }
      }
      return out
    }

    function closestPointOnPolyline(coords, px, py) {
      let bestD = Infinity
      let best = coords[0]
      for (let i = 1; i < coords.length; i++) {
        const ax = coords[i - 1][0], ay = coords[i - 1][1]
        const bx = coords[i][0], by = coords[i][1]
        const dx = bx - ax, dy = by - ay
        const denom = dx * dx + dy * dy
        const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denom))
        const x = ax + t * dx
        const y = ay + t * dy
        const d = Math.hypot(x - px, y - py)
        if (d < bestD) { bestD = d; best = [x, y] }
      }
      return [best, bestD]
    }

    function averageTwoWays(c1, c2) {
      const ref = c1.length >= c2.length ? c1 : c2
      const other = ref === c1 ? c2 : c1
      // Sample density ≈ original vertex density of the reference.
      const n = Math.max(10, Math.min(400, ref.length * 2))
      const samples = sampleAtArcLength(ref, n)
      const out = []
      // ~50m max snap distance — beyond that, just take the reference point
      // (the "other" way must have diverged off into a junction).
      const MAX_SNAP = 0.0005
      for (const p of samples) {
        const [cp, d] = closestPointOnPolyline(other, p[0], p[1])
        if (d < MAX_SNAP) {
          out.push([(p[0] + cp[0]) / 2, (p[1] + cp[1]) / 2])
        } else {
          out.push(p)
        }
      }
      return out
    }

    // Group ways per line.
    const perLineWays = {}
    for (const [wayId, lines] of wayToLines.entries()) {
      for (const line of lines) {
        if (!perLineWays[line]) perLineWays[line] = []
        perLineWays[line].push(wayId)
      }
    }

    // ----- chain merging per line -----
    // Each line is a sub-graph of the OSM rail network: nodes = OSM node ids,
    // edges = OSM ways. We walk every maximal chain of degree-2 internal nodes
    // and concatenate the ways into one continuous polyline. Chains break at
    // degree-1 nodes (leaves) and degree-3+ nodes (junctions), so a line that
    // diverges (Aldgate / Aldgate East, the H&C/Met split, etc.) naturally
    // ends up with a chain per branch instead of one tangled blob.
    //
    // Each chain remembers its constituent way ids so we can still inherit
    // the cross-line stack offset from a representative way.
    function buildChains(lineWays) {
      const inSet = new Set(lineWays)
      const adj = new Map() // nodeId → [{wayId, otherEnd}]
      for (const wid of lineWays) {
        const nodes = wayNodes.get(wid)
        if (!nodes || nodes.length < 2) continue
        const a = nodes[0]
        const b = nodes[nodes.length - 1]
        if (!adj.has(a)) adj.set(a, [])
        if (!adj.has(b)) adj.set(b, [])
        adj.get(a).push({ wayId: wid, otherEnd: b })
        adj.get(b).push({ wayId: wid, otherEnd: a })
      }

      const visitedWays = new Set()
      const chains = []

      function walkFrom(startNode, startEdge) {
        if (visitedWays.has(startEdge.wayId)) return null
        const ids = []
        let curNode = startNode
        let curEdge = startEdge
        while (true) {
          if (visitedWays.has(curEdge.wayId)) break
          visitedWays.add(curEdge.wayId)
          const wn = wayNodes.get(curEdge.wayId)
          if (!wn) break
          const reverse = wn[0] !== curNode
          ids.push({ wayId: curEdge.wayId, reverse })
          curNode = curEdge.otherEnd
          const nextEdges = adj.get(curNode) || []
          if (nextEdges.length !== 2) break
          const next = nextEdges.find((e) => e.wayId !== curEdge.wayId && !visitedWays.has(e.wayId))
          if (!next) break
          curEdge = next
        }
        return ids.length ? ids : null
      }

      // First pass: start from non-degree-2 nodes (leaves + junctions).
      for (const [node, edges] of adj) {
        if (edges.length === 2) continue
        for (const edge of edges) {
          if (visitedWays.has(edge.wayId)) continue
          if (!inSet.has(edge.wayId)) continue
          const ch = walkFrom(node, edge)
          if (ch) chains.push(ch)
        }
      }
      // Second pass: pure cycles where every node is degree-2.
      for (const wid of lineWays) {
        if (visitedWays.has(wid)) continue
        const wn = wayNodes.get(wid)
        if (!wn || wn.length < 2) continue
        const ch = walkFrom(wn[0], { wayId: wid, otherEnd: wn[wn.length - 1] })
        if (ch) chains.push(ch)
      }
      return chains
    }

    function chainToCoords(chain) {
      const out = []
      for (let i = 0; i < chain.length; i++) {
        const { wayId, reverse } = chain[i]
        const wc = wayGeometry.get(wayId)
        if (!wc) continue
        const seg = reverse ? [...wc].reverse() : wc
        const startIdx = i === 0 ? 0 : 1
        for (let j = startIdx; j < seg.length; j++) out.push(seg[j])
      }
      return out
    }

    function chainEndpoints(chain) {
      const first = chain[0]
      const wnFirst = wayNodes.get(first.wayId)
      const start = first.reverse ? wnFirst[wnFirst.length - 1] : wnFirst[0]
      const last = chain[chain.length - 1]
      const wnLast = wayNodes.get(last.wayId)
      const end = last.reverse ? wnLast[0] : wnLast[wnLast.length - 1]
      return [start, end]
    }

    function reverseChain(chain) {
      return chain.slice().reverse().map((e) => ({ wayId: e.wayId, reverse: !e.reverse }))
    }

    // ----- junction-merging -----
    // After chain building, each line has chains breaking at every degree-3+
    // junction (Camden Town, Aldgate, etc.). At each junction, multiple chains
    // meet — we greedily merge pairs by smallest angle change (closest to
    // 180° tangent angle = "going straight through"), so a long-running line
    // becomes one continuous polyline through every junction it crosses.
    // The white-stripe overlay's dash phase is therefore continuous too.
    const JUNCTION_MIN_TANGENT_ANGLE = (2 * Math.PI) / 3 // 120° = max 60° deflection

    function tangentAtNode(chain, node) {
      // chain.coords ordered from chain.startNode to chain.endNode
      const coords = chainToCoords(chain)
      const [start, end] = chainEndpoints(chain)
      if (coords.length < 2) return null
      if (node === start) {
        return [coords[1][0] - coords[0][0], coords[1][1] - coords[0][1]]
      }
      if (node === end) {
        const n = coords.length
        return [coords[n - 2][0] - coords[n - 1][0], coords[n - 2][1] - coords[n - 1][1]]
      }
      return null
    }

    function angleBetween(t1, t2) {
      const l1 = Math.hypot(t1[0], t1[1])
      const l2 = Math.hypot(t2[0], t2[1])
      if (l1 === 0 || l2 === 0) return 0
      const cos = (t1[0] * t2[0] + t1[1] * t2[1]) / (l1 * l2)
      return Math.acos(Math.max(-1, Math.min(1, cos)))
    }

    function junctionMerge(chains) {
      let merged = [...chains]
      let changed = true
      while (changed) {
        changed = false
        const nodeToChains = new Map() // nodeId → [chainIndex]
        for (let i = 0; i < merged.length; i++) {
          const [s, e] = chainEndpoints(merged[i])
          if (!nodeToChains.has(s)) nodeToChains.set(s, [])
          if (!nodeToChains.has(e)) nodeToChains.set(e, [])
          nodeToChains.get(s).push(i)
          if (s !== e) nodeToChains.get(e).push(i)
        }

        const toRemove = new Set()
        const toAdd = []
        for (const [node, idxs] of nodeToChains) {
          if (idxs.length < 2) continue
          if (idxs.some((i) => toRemove.has(i))) continue

          // Compute tangents at this node for each candidate chain.
          const candidates = []
          for (const i of idxs) {
            const t = tangentAtNode(merged[i], node)
            if (t) candidates.push({ i, t })
          }
          if (candidates.length < 2) continue

          // Greedy pairing: find the (i, j) maximizing angle (closest to π).
          let bestI = -1, bestJ = -1, bestAng = JUNCTION_MIN_TANGENT_ANGLE
          for (let a = 0; a < candidates.length; a++) {
            for (let b = a + 1; b < candidates.length; b++) {
              const ang = angleBetween(candidates[a].t, candidates[b].t)
              if (ang > bestAng) {
                bestAng = ang
                bestI = candidates[a].i
                bestJ = candidates[b].i
              }
            }
          }
          if (bestI === -1) continue
          if (toRemove.has(bestI) || toRemove.has(bestJ)) continue

          // Merge merged[bestI] and merged[bestJ] at this node.
          let c1 = merged[bestI]
          let c2 = merged[bestJ]
          const [s1, e1] = chainEndpoints(c1)
          const [s2, e2] = chainEndpoints(c2)
          // Orient so c1 ends at `node` and c2 starts at `node`.
          if (e1 !== node) c1 = reverseChain(c1)
          if (s2 !== node) c2 = reverseChain(c2)
          const combined = [...c1, ...c2]

          toRemove.add(bestI)
          toRemove.add(bestJ)
          toAdd.push(combined)
          changed = true
        }

        if (toRemove.size > 0) {
          merged = merged.filter((_, i) => !toRemove.has(i)).concat(toAdd)
        }
      }
      return merged
    }

    const perLineChains = {} // lineKey → [{ wayIds, coords, buckets, len }]
    let totalRawChains = 0
    for (const [line, ways] of Object.entries(perLineWays)) {
      const raw = buildChains(ways)
      totalRawChains += raw.length
      const after = junctionMerge(raw)
      const built = []
      for (const ch of after) {
        const coords = chainToCoords(ch)
        if (coords.length < 2) continue
        built.push({
          wayIds: ch.map((x) => x.wayId),
          coords,
          buckets: bucketsFor(coords),
          len: wayLengthCheap(coords),
        })
      }
      perLineChains[line] = built
    }

    const chainCount = Object.values(perLineChains).reduce((s, c) => s + c.length, 0)
    console.log(
      `Chain merging: ${totalRawChains} → ${chainCount} polyline(s) after junction merging.`,
    )

    // ----- chain-level centerline averaging -----
    // Now that lines are chains (not fragments), pair each chain with its
    // parallel sibling (the other direction's rail). Chains break at junctions,
    // so a single chain never spans a divergence — averaging can't accidentally
    // pull through the wrong branch.
    const features = []
    const perLine = {}
    let pairedCount = 0
    let singletonCount = 0

    for (const [line, chains] of Object.entries(perLineChains)) {
      const sorted = [...chains].sort((a, b) => b.len - a.len)
      const used = new Set()

      function distSq(a, b) {
        const dx = a[0] - b[0]
        const dy = a[1] - b[1]
        return dx * dx + dy * dy
      }
      function endpointsMatch(c1, c2) {
        const s1 = c1.coords[0]
        const e1 = c1.coords[c1.coords.length - 1]
        const s2 = c2.coords[0]
        const e2 = c2.coords[c2.coords.length - 1]
        const sameDir =
          distSq(s1, s2) < PAIR_ENDPOINT_TOL_SQ &&
          distSq(e1, e2) < PAIR_ENDPOINT_TOL_SQ
        const revDir =
          distSq(s1, e2) < PAIR_ENDPOINT_TOL_SQ &&
          distSq(e1, s2) < PAIR_ENDPOINT_TOL_SQ
        return sameDir || revDir
      }

      for (let i = 0; i < sorted.length; i++) {
        if (used.has(i)) continue
        used.add(i)
        const c1 = sorted[i]

        // Try endpoint-distance pairing first — most reliable signal that two
        // chains are the two rails of one double-tracked branch.
        let bestJ = -1
        for (let j = i + 1; j < sorted.length; j++) {
          if (used.has(j)) continue
          const c2 = sorted[j]
          const lenRatio = Math.min(c1.len, c2.len) / Math.max(c1.len, c2.len)
          if (lenRatio < PAIR_ENDPOINT_LEN_RATIO) continue
          if (endpointsMatch(c1, c2)) {
            bestJ = j
            break
          }
        }
        if (bestJ === -1) {
          // Fall back to Jaccard bucket overlap.
          let bestOverlap = 0
          for (let j = i + 1; j < sorted.length; j++) {
            if (used.has(j)) continue
            const c2 = sorted[j]
            const lenRatio = Math.min(c1.len, c2.len) / Math.max(c1.len, c2.len)
            if (lenRatio < PAIR_LENGTH_RATIO) continue
            const ov = bucketJaccard(c1.buckets, c2.buckets)
            if (ov > bestOverlap && ov >= PAIR_JACCARD_THRESHOLD) {
              bestJ = j
              bestOverlap = ov
              if (ov >= 0.95) break
            }
          }
        }

        // Offset is computed below at the LINE level (not chain level) so
        // every chain of the same line uses the same perpendicular position.
        // This is what makes Thameslink-Bedford-Brighton and a Thameslink
        // Sutton branch render on top of each other at any point they share
        // physical track, instead of forking apart into visible doubles.
        const offset = 0 // placeholder, overwritten below

        let coords
        if (bestJ >= 0) {
          used.add(bestJ)
          coords = averageTwoWays(c1.coords, sorted[bestJ].coords)
          pairedCount++
        } else {
          coords = c1.coords
          singletonCount++
        }

        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {
            line,
            color: LINE_COLORS[line],
            order: LINE_ORDER[line],
            offset,
          },
        })
        perLine[line] = (perLine[line] || 0) + 1
      }
    }

    console.log(
      `Chain-level averaging: ${pairedCount} pair(s) averaged, ${singletonCount} chain(s) kept solo.`,
    )

    // ----- within-line Hausdorff containment dedup -----
    // After averaging, some lines (Piccadilly, Thameslink, etc.) still have
    // multiple chains running through the same physical corridor — usually
    // because the OSM relations split a route at platform diversions and
    // the chain-level averaging couldn't pair the resulting near-duplicate
    // chains via endpoint matching or Jaccard.
    //
    // Use a sampled Hausdorff-style test: for each shorter chain c2 of the
    // same line, sample N points along c2 and check what fraction are within
    // CONTAINMENT_DIST_DEG of any longer kept chain's path. If most of c2
    // is "shadowed" by a longer chain, drop c2.
    const CONTAINMENT_SAMPLES = 48
    const CONTAINMENT_DIST_DEG = 0.00045 // ~50m at this latitude
    const CONTAINMENT_FRAC = 0.6 // 60% of c2's samples close to some longer chain

    function sampleAlong(coords, n) {
      if (coords.length <= n) return coords
      const out = []
      const step = (coords.length - 1) / (n - 1)
      for (let i = 0; i < n; i++) out.push(coords[Math.floor(i * step)])
      return out
    }

    function pointToSegmentSq(p, a, b) {
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const lensq = dx * dx + dy * dy
      if (lensq === 0) {
        const px = p[0] - a[0]
        const py = p[1] - a[1]
        return px * px + py * py
      }
      let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lensq
      if (t < 0) t = 0
      else if (t > 1) t = 1
      const cx = a[0] + t * dx - p[0]
      const cy = a[1] + t * dy - p[1]
      return cx * cx + cy * cy
    }

    function pointNearPolyline(p, coords) {
      // Distance to nearest SEGMENT (not just vertex) so sparse vertices
      // don't falsely indicate divergence.
      const tolSq = CONTAINMENT_DIST_DEG * CONTAINMENT_DIST_DEG
      for (let i = 1; i < coords.length; i++) {
        if (pointToSegmentSq(p, coords[i - 1], coords[i]) < tolSq) return true
      }
      return false
    }

    function chainHausdorfContained(c2, c1) {
      // c2 (shorter) contained within c1 (longer) if most c2 samples sit
      // within tolerance of any c1 vertex.
      const samples = sampleAlong(c2, CONTAINMENT_SAMPLES)
      let near = 0
      for (const p of samples) if (pointNearPolyline(p, c1)) near++
      return near / samples.length >= CONTAINMENT_FRAC
    }

    const featuresByLine = {}
    for (const f of features) {
      const l = f.properties.line
      if (!featuresByLine[l]) featuresByLine[l] = []
      featuresByLine[l].push(f)
    }
    const surviving = []
    let droppedByContainment = 0
    for (const [_line, chains] of Object.entries(featuresByLine)) {
      const sorted = chains.slice().sort(
        (a, b) => b.geometry.coordinates.length - a.geometry.coordinates.length,
      )
      const kept = []
      for (const cand of sorted) {
        let contained = false
        for (const k of kept) {
          if (chainHausdorfContained(cand.geometry.coordinates, k.geometry.coordinates)) {
            contained = true
            break
          }
        }
        if (!contained) kept.push(cand)
        else droppedByContainment++
      }
      for (const k of kept) surviving.push(k)
    }
    console.log(
      `Within-line Hausdorff dedup: dropped ${droppedByContainment} chain(s).`,
    )

    // Replace features with the survivors.
    features.length = 0
    features.push(...surviving)
    for (const k of Object.keys(perLine)) delete perLine[k]
    for (const f of features) {
      const l = f.properties.line
      perLine[l] = (perLine[l] || 0) + 1
    }

    // ----- line-wide offsets -----
    // Compute a single offset per LINE based on the union of all its chain
    // buckets. Every chain of that line gets this offset, so same-line chains
    // overlap at shared sections (looking like one line) and split into
    // branches where they diverge — instead of each chain choosing its own
    // local stack and rendering as a separate parallel ribbon.
    const lineCombinedBuckets = new Map()
    for (const f of features) {
      const l = f.properties.line
      if (!lineCombinedBuckets.has(l)) lineCombinedBuckets.set(l, new Set())
      const buckets = bucketsFor(f.geometry.coordinates)
      const combined = lineCombinedBuckets.get(l)
      for (const b of buckets) combined.add(b)
    }

    const lineOffset = new Map()
    for (const [line, combined] of lineCombinedBuckets) {
      // Only count "strongly co-running" lines — require ≥ 30 shared buckets
      // (~420m of parallel running) so brief crossings (e.g. crossing under
      // another line at a single junction) don't expand the stack.
      const hits = new Map()
      for (const b of combined) {
        const set = bucketToLines.get(b)
        if (!set) continue
        for (const l of set) hits.set(l, (hits.get(l) || 0) + 1)
      }
      const proximity = new Set([line])
      for (const [other, count] of hits) {
        if (other !== line && count >= 30) proximity.add(other)
      }
      const sorted = [...proximity].sort(
        (a, b) => (LINE_ORDER[a] ?? 99) - (LINE_ORDER[b] ?? 99),
      )
      const idx = sorted.indexOf(line)
      lineOffset.set(line, idx - (sorted.length - 1) / 2)
    }

    // Apply line-wide offset to every feature.
    for (const f of features) {
      const o = lineOffset.get(f.properties.line) ?? 0
      f.properties.offset = o
    }

    console.log('\nLine-wide offsets:')
    const sortedByOrder = [...lineOffset.entries()].sort(
      (a, b) => (LINE_ORDER[a[0]] ?? 99) - (LINE_ORDER[b[0]] ?? 99),
    )
    for (const [line, off] of sortedByOrder) {
      console.log(`  ${line.padEnd(22)} ${off.toFixed(2)}`)
    }

    console.log('\nLineString feature counts per line:')
    for (const [k, n] of Object.entries(perLine).sort()) {
      console.log(`  ${k.padEnd(22)} ${n}`)
    }

    // ----- collect station info -----
    // Many relations don't have stop nodes; for those we'll backfill names via
    // the station-name index built from nodeTags (any nearby railway=station
    // node with the same id resolves to its name).
    const stationOut = []
    const stationKey = new Set() // dedupe by (name|line)

    for (const [lineKey, nodeIds] of lineStations.entries()) {
      for (const nid of nodeIds) {
        const tags = nodeTags.get(nid) || {}
        const coords = nodeLatLng.get(nid)
        if (!coords) continue
        const name = tags.name || tags['name:en']
        if (!name) continue // unnamed stop
        const k = `${name}|${lineKey}`
        if (stationKey.has(k)) continue
        stationKey.add(k)
        const stop = { name, coords, line: lineKey }
        const alt = []
        if (tags.alt_name) alt.push(tags.alt_name)
        if (tags.official_name && tags.official_name !== name) alt.push(tags.official_name)
        if (tags['name:short']) alt.push(tags['name:short'])
        if (alt.length) stop.alternate_names = alt
        stationOut.push(stop)
      }
    }

    const stationsPerLine = {}
    for (const s of stationOut) {
      stationsPerLine[s.line] = (stationsPerLine[s.line] || 0) + 1
    }
    console.log('\nStation candidates per line (from stop_position members):')
    for (const [k, n] of Object.entries(stationsPerLine).sort()) {
      console.log(`  ${k.padEnd(22)} ${n}`)
    }

    // ----- write outputs -----
    fs.writeFileSync(
      ROUTES_DST,
      JSON.stringify({ type: 'FeatureCollection', features }),
    )
    fs.writeFileSync(STATIONS_DST, JSON.stringify(stationOut, null, 2))

    console.log(
      `\nWrote ${features.length} LineString feature(s) to ${path.relative(process.cwd(), ROUTES_DST)}.`,
    )
    console.log(
      `Wrote ${stationOut.length} new TOC station(s) to ${path.relative(process.cwd(), STATIONS_DST)}.`,
    )
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

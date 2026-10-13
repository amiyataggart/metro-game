#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * LAB — find suspicious spots in a lab variant as drawn at a zoom (default
 * z14.35 with Staging sizing), network-wide, so geometry QA isn't limited to
 * the places someone happened to look at:
 *  - kink: a drawn line turns > KINK_DEG within ~KINK_SPAN m (jogs, hooks,
 *    zig-zags), measured on the offset ribbon as MapLibre draws it;
 *  - loose: a line end (no other piece of the line continues from it) farther
 *    than LOOSE_M from every station of that line (stubs, overshoots, gaps);
 *  - double: the same line drawn twice side by side (two pieces parallel,
 *    0.2–1 line width apart).
 * Writes qa/out/lab/kinks-<variant>.json (ranked) and, with --sheet N, contact
 * sheets of the top N spots (close-up renders, 3x3 per sheet).
 *
 *   node scripts/lab/find-kinks.js graph4 [--zoom 14.35] [--sheet 36]
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { mpp, STAGING } = require('./score.js')

const ROOT = path.join(__dirname, '..', '..')
const LAB = path.join(ROOT, 'src', 'app', '(game)', 'lab', 'data')
const OUT = path.join(ROOT, 'qa', 'out', 'lab')
const MG = 69300, ML = 111320
const KINK_DEG = 45, KINK_SPAN = 20, LOOSE_M = 120
const SKIP = new Set(['Tramlink', 'CableCar'])

const args = process.argv.slice(2)
const variant = args[0] || 'graph4'
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const Z = +opt('--zoom', 14.35)
const SHEET = +opt('--sheet', 0)

const fc = JSON.parse(fs.readFileSync(variant.endsWith('.json') ? variant : path.join(LAB, `routes.${variant}.json`), 'utf8'))
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'app', '(game)', 'london', 'data', 'features.json'), 'utf8')).features
const W = STAGING.width(Z) * mpp(Z) // line width, m
const toXY = (c) => [c[0] * MG, c[1] * ML]
const toLL = (p) => [+(p[0] / MG).toFixed(5), +(p[1] / ML).toFixed(5)]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// drawn (offset) geometry per feature
const feats = []
for (const f of fc.features) {
  if (f.geometry.type !== 'LineString' || SKIP.has(f.properties.line)) continue
  const xy = f.geometry.coordinates.map(toXY)
  const off = (f.properties.laneOff || 0) * W
  const drawn = xy.map((p, i) => {
    const a = xy[Math.max(0, i - 1)], b = xy[Math.min(xy.length - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    return [p[0] + (off * dy) / L, p[1] - (off * dx) / L]
  })
  feats.push({ line: f.properties.line, xy, drawn })
}
const spots = []
// --- kinks: chain each line's drawn pieces end to end, then scan turns
const byLine = new Map()
feats.forEach((f, i) => { if (!byLine.has(f.line)) byLine.set(f.line, []); byLine.get(f.line).push(i) })
const resample = (xy, step) => {
  const out = [xy[0]]
  let carry = 0
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1], b = xy[i], seg = dist(a, b)
    let t = step - carry
    while (t <= seg) { out.push([a[0] + ((b[0] - a[0]) * t) / seg, a[1] + ((b[1] - a[1]) * t) / seg]); t += step }
    carry = seg - (t - step)
  }
  if (dist(out.at(-1), xy.at(-1)) > step / 4) out.push(xy.at(-1))
  return out
}
const turnDeg = (a, b, c) => {
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1]
  const d = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1)
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI
}
for (const [line, ids] of byLine) {
  // endpoint graph on the centreline (pieces share exact endpoints)
  const key = (p) => Math.round(p[0] / 2) + ',' + Math.round(p[1] / 2)
  const ends = new Map()
  ids.forEach((i) => { for (const [p, atStart] of [[feats[i].xy[0], true], [feats[i].xy.at(-1), false]]) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push({ i, atStart }) } })
  // kinks within a piece + across degree-2 joints
  const scan = (pts) => {
    const r = resample(pts, 5)
    const k = Math.max(1, Math.round(KINK_SPAN / 2 / 5))
    for (let j = k; j < r.length - k; j++) {
      const t = turnDeg(r[j - k], r[j], r[j + k])
      if (t > KINK_DEG) spots.push({ type: 'kink', line, at: toLL(r[j]), score: t })
    }
  }
  for (const i of ids) scan(feats[i].drawn)
  for (const list of ends.values()) {
    if (list.length !== 2) continue
    const seg = (e, n) => { const d = feats[e.i].drawn; const s = e.atStart ? d.slice(0, n) : d.slice(-n).reverse(); return s }
    const a = seg(list[0], 4).reverse(), b = seg(list[1], 4)
    scan([...a, ...b.slice(1)])
  }
  // loose ends
  const st = stations.filter((s) => s.properties.line === line).map((s) => toXY(s.geometry.coordinates))
  for (const [k, list] of ends) {
    if (list.length !== 1) continue
    const e = list[0], p = e.atStart ? feats[e.i].xy[0] : feats[e.i].xy.at(-1)
    const dSt = Math.min(Infinity, ...st.map((q) => dist(p, q)))
    if (dSt > LOOSE_M) spots.push({ type: 'loose', line, at: toLL(p), score: Math.min(400, dSt) / 4 })
  }
}
// --- doubles: same line, two different pieces parallel and 0.2–1 W apart
{
  const CELL = 30, grid = new Map()
  const samples = []
  feats.forEach((f, fi) => {
    const r = resample(f.drawn, 15)
    r.forEach((p, j) => {
      const a = r[Math.max(0, j - 1)], b = r[Math.min(r.length - 1, j + 1)], L = dist(a, b) || 1
      const s = { fi, line: f.line, p, t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] }
      samples.push(s)
      const k = Math.floor(p[0] / CELL) + ',' + Math.floor(p[1] / CELL)
      if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s)
    })
  })
  const hit = new Map()
  for (const s of samples) {
    const cx = Math.floor(s.p[0] / CELL), cy = Math.floor(s.p[1] / CELL)
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++)
      for (const o of grid.get(x + ',' + y) || []) {
        if (o.fi <= s.fi || o.line !== s.line) continue
        if (Math.abs(s.t[0] * o.t[0] + s.t[1] * o.t[1]) < 0.9) continue
        const d = dist(s.p, o.p)
        if (d > 0.2 * W && d < W) {
          const k = s.line + '@' + Math.round(s.p[0] / 150) + ',' + Math.round(s.p[1] / 150)
          hit.set(k, { type: 'double', line: s.line, at: toLL(s.p), score: (hit.get(k)?.score || 0) + 15 })
        }
      }
  }
  spots.push(...hit.values())
}
// cluster nearby spots (100 m), keep the strongest per cluster
spots.sort((a, b) => b.score - a.score)
const kept = []
for (const s of spots) {
  const p = toXY(s.at)
  const c = kept.find((k) => dist(toXY(k.at), p) < 100)
  if (c) { c.n = (c.n || 1) + 1; if (!c.types.includes(s.type)) c.types.push(s.type); if (!c.lines.includes(s.line)) c.lines.push(s.line); continue }
  kept.push({ ...s, types: [s.type], lines: [s.line], n: 1 })
}
const rank = (s) => s.score * (1 + Math.log(s.n))
kept.sort((a, b) => rank(b) - rank(a))
fs.mkdirSync(OUT, { recursive: true })
const outFile = path.join(OUT, `kinks-${path.basename(variant, '.json')}.json`)
fs.writeFileSync(outFile, JSON.stringify(kept, null, 1))
const counts = {}
for (const s of kept) for (const t of s.types) counts[t] = (counts[t] || 0) + 1
console.log(`${variant} @ z${Z} (line ${W.toFixed(1)} m): ${kept.length} spots ${JSON.stringify(counts)} -> ${path.relative(ROOT, outFile)}`)
for (const s of kept.slice(0, 25)) console.log(`  ${s.types.join('+').padEnd(12)} ${s.lines.join(',').padEnd(34)} ${s.at.join(',')}  (${Math.round(rank(s))})`)

// contact sheets
if (SHEET > 0) {
  const sharp = require('sharp')
  const top = kept.slice(0, SHEET)
  const tiles = []
  top.forEach((s, i) => {
    const name = `kk${String(i + 1).padStart(2, '0')}`
    execFileSync('node', [path.join(__dirname, 'render.js'), variant, s.at.join(','), '16', name, '420x420'], { env: { ...process.env, SIZE: 'staging', STATIONS: '1' }, stdio: 'ignore' })
    tiles.push({ file: path.join(OUT, `${name}-${variant}-z16.png`), label: `${i + 1}. ${s.types.join('+')} ${s.lines.join(',')}` })
  })
  ;(async () => {
    for (let sh = 0; sh * 9 < tiles.length; sh++) {
      const group = tiles.slice(sh * 9, sh * 9 + 9)
      const comps = []
      for (let j = 0; j < group.length; j++) {
        const x = (j % 3) * 424, y = Math.floor(j / 3) * 444
        comps.push({ input: group[j].file, left: x, top: y + 20 })
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="20"><rect width="420" height="20" fill="#222"/><text x="6" y="14" font-family="sans-serif" font-size="12" fill="#fff">${group[j].label.replace(/&/g, '&amp;')}</text></svg>`
        comps.push({ input: Buffer.from(svg), left: x, top: y })
      }
      const file = path.join(OUT, `kinks-${variant}-sheet${sh + 1}.png`)
      await sharp({ create: { width: 3 * 424, height: Math.ceil(group.length / 3) * 444, channels: 3, background: '#ffffff' } }).composite(comps).png().toFile(file)
      console.log('sheet ' + path.relative(ROOT, file))
    }
  })()
}

#!/usr/bin/env node
/*
 * LAB — browser-free render of a lab variant at a given zoom, drawn the way
 * MapLibre would (CSS-px line widths, line-offset by laneOff / morph, band
 * order, white stripes). Output PNG -> qa/out/lab/.
 *
 *   node scripts/lab/render.js <variant> <lng,lat> <zoom> [name] [WxH]
 *   variant: london | graph | levels | morph | l0..l3 | graph2..graph5 | file.json
 *   env SIZE=map | staging   sizing as /lab ?size=map, or as /lab/staging1
 *       (clamped z11.4–12.4 above z11.4, map scale below)
 *   env STATIONS=1   draw station markers + names (for locating artefacts)
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { widthPx, mpp, offsetPx, MAP_W, STAGING } = require('./score.js')
const ROOT = path.join(__dirname, '..', '..')
const LAB = path.join(ROOT, 'src', 'app', '(game)', 'lab', 'data')
const [variant, center, zs, name, size] = process.argv.slice(2)
const z = +zs
const [W, H] = (size || '900x700').split('x').map(Number)
const meta = JSON.parse(fs.readFileSync(path.join(LAB, 'levels.json'), 'utf8'))
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
let fc, mode = 'lane'
if (variant === 'london') fc = load(path.join(ROOT, 'src', 'app', '(game)', 'london', 'data', 'routes.json'))
else if (variant === 'graph') fc = load(path.join(LAB, 'routes.graph.json'))
else if (variant === 'levels') fc = load(path.join(LAB, `routes.${meta.levels.find((L) => z >= L.minzoom && z < L.maxzoom).id}.json`))
else if (variant === 'morph') { fc = load(path.join(LAB, 'routes.morph.json')); mode = meta.morph }
else if (variant.endsWith('.json')) fc = load(variant)
else fc = load(path.join(LAB, `routes.${variant}.json`))
// map-scale sizing (as /lab ?size=map): graph5 always, others with SIZE=map
if (variant === 'graph5' || process.env.SIZE === 'map') mode = 'map'
if (process.env.SIZE === 'staging') mode = STAGING
const LINES = require('../line-order.js')
const cfgSrc = fs.readFileSync(path.join(ROOT, 'src', 'app', '(game)', 'london', 'config.ts'), 'utf8')
const colour = {}, stripe = {}
for (const m of cfgSrc.matchAll(/(\w+): \{\n\s+name: '[^']*',\n\s+color: '(#[0-9A-Fa-f]+)'[\s\S]*?\n\s+\},/g)) {
  colour[m[1]] = m[2]
  const s = /stripe: '(\w+)'/.exec(m[0]); if (s) stripe[m[1]] = s[1]
}
const band = (l) => (LINES[l] <= 10 ? 6 : l === 'ElizabethLine' ? 4 : l === 'DLR' ? 3 : l === 'Tramlink' ? 5 : l === 'CableCar' ? 5 : LINES[l] <= 16 ? 2 : 1)
const MG = 69300, ML = 111320
const [clng, clat] = center.split(',').map(Number)
const m = mpp(z)
const px = (c) => [W / 2 + ((c[0] - clng) * MG) / m, H / 2 - ((c[1] - clat) * ML) / m]
const w = mode === 'map' ? MAP_W / mpp(z) : mode.width ? mode.width(z) : widthPx(z)
const feats = fc.features.filter((f) => colour[f.properties.line]).sort((a, b) => band(a.properties.line) - band(b.properties.line) || (LINES[a.properties.line] ?? 99) - (LINES[b.properties.line] ?? 99))
const pathOf = (f) => {
  const P = f.geometry.coordinates.map(px)
  const off = offsetPx(f.properties, z, mode)
  if (P.every(([x, y]) => x < -50 || y < -50 || x > W + 50 || y > H + 50)) return null
  return P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    // screen y is down: right of direction = (-dy, dx) in screen coords
    return `${(p[0] - (off * dy) / L).toFixed(1)},${(p[1] + (off * dx) / L).toFixed(1)}`
  }).join(' ')
}
let svg = ''
for (const f of feats) {
  const d = pathOf(f); if (!d) continue
  const l = f.properties.line
  svg += `<polyline points="${d}" fill="none" stroke="${colour[l]}" stroke-opacity="0.95" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
  // stripe caps as in GamePage (solid: round, dashed: butt)
  if (stripe[l] === 'solid') svg += `<polyline points="${d}" fill="none" stroke="#fff" stroke-width="${w / 3}" stroke-linecap="round" stroke-linejoin="round"/>`
  if (stripe[l] === 'dashed') svg += `<polyline points="${d}" fill="none" stroke="#fff" stroke-width="${w / 3}" stroke-dasharray="${3 * w / 3},${2.5 * w / 3}" stroke-linejoin="round"/>`
}
if (process.env.STATIONS) {
  const st = load(path.join(ROOT, 'src', 'app', '(game)', 'london', 'data', 'features.json')).features
  const seen = new Set()
  for (const f of st) {
    const [x, y] = px(f.geometry.coordinates)
    if (x < 0 || y < 0 || x > W || y > H) continue
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#fff" stroke="#1d2835" stroke-width="1.5"/>`
    const k = f.properties.name
    if (seen.has(k)) continue
    seen.add(k)
    svg += `<text x="${(x + 7).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-family="sans-serif" font-size="11" fill="#333">${k.replace(/&/g, '&amp;')}</text>`
  }
}
const label = `${variant}  z${z}  ${name || ''}`
const out = path.join(ROOT, 'qa', 'out', 'lab', `${(name || 'view').replace(/\W+/g, '_')}-${path.basename(variant, ".json")}-z${z}.png`)
fs.mkdirSync(path.dirname(out), { recursive: true })
sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#f4f4f2"/>${svg}<text x="10" y="22" font-family="sans-serif" font-size="16" fill="#333">${label}</text></svg>`)).png().toFile(out).then(() => console.log(out))

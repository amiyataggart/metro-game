#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Browser-free SVG->PNG render of the baked ribbons over chosen bboxes
 * (PARALLEL-RIBBONS-BRIEF.md §8A). Draws LOWEST `order` first so the stack
 * matches the app's line-sort-key. Renders the new ribbons and (optionally)
 * the pre-ribbon baseline side by side, plus station dots so marker/line
 * alignment is visible.
 *
 * Usage: node scripts/qa-ribbons-render.js [routesFile] [--with-baseline]
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const DATA = path.join(__dirname, '..', 'src', 'app', '(game)', 'london', 'data')
const arg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(DATA, 'routes.json')
const withBaseline = process.argv.includes('--with-baseline')
const OUT = path.join(__dirname, '..', 'qa', 'out')
fs.mkdirSync(OUT, { recursive: true })

const ORDER = require('./line-order.js')
const COLOR = {
  Bakerloo: '#b36305', Central: '#e32017', Circle: '#ffd329', District: '#00782a',
  HammersmithAndCity: '#f3a9bb', Jubilee: '#a0a5a9', Metropolitan: '#9b0056',
  Northern: '#000000', Piccadilly: '#003688', Victoria: '#0098d4', WaterlooAndCity: '#84CAB3',
  ElizabethLine: '#6950A1', DLR: '#00afad', Lioness: '#FAA61A', Mildmay: '#3DB6E1',
  Windrush: '#DA291C', Weaver: '#823065', Suffragette: '#5BBD72', Liberty: '#7C878E',
  Thameslink: '#D182A0',
}

// [W,S,E,N] probe bboxes
const VIEWS = [
  { name: 'north-trunk', bbox: [-0.168, 51.5185, -0.118, 51.533] },
  { name: 'south-trunk', bbox: [-0.130, 51.4985, -0.098, 51.5135] },
  { name: 'watford-dc', bbox: [-0.230, 51.531, -0.205, 51.547] },
  { name: 'edgware-rd', bbox: [-0.180, 51.513, -0.158, 51.527] },
  { name: 'earls-court', bbox: [-0.215, 51.482, -0.175, 51.502] },
  { name: 'central-knot', bbox: [-0.150, 51.505, -0.075, 51.530] },
  { name: 'circle-loop', bbox: [-0.205, 51.488, -0.07, 51.537] },
  // National Rail corridors (lines without a COLOR entry use their feature colour)
  { name: 'wll', bbox: [-0.255, 51.46, -0.16, 51.54] }, // West London Line: Willesden Jn – Clapham Jn
  { name: 'greenwich-line', bbox: [-0.095, 51.47, 0.04, 51.51] }, // London Bridge – Charlton
  { name: 'lnwr', bbox: [-0.64, 51.65, -0.38, 51.81] }, // Watford Jn – Tring
  { name: 'southend-victoria', bbox: [0.3, 51.53, 0.73, 51.65] }, // Shenfield – Southend Victoria
  { name: 'swr-shepperton-hampton-court', bbox: [-0.46, 51.38, -0.33, 51.42] },
  { name: 'swr-dorking', bbox: [-0.36, 51.23, -0.3, 51.31] }, // Leatherhead – Dorking
  // Scope ends (spec §3): lines must stop at their end stations
  { name: 'network', bbox: [-1.15, 50.75, 0.95, 52.3] }, // whole scoped network
  { name: 'ebbsfleet', bbox: [0.26, 51.40, 0.42, 51.47] }, // Eurostar / SE high speed end, Gravesend
  { name: 'hitchin', bbox: [-0.33, 51.88, -0.15, 52.0] }, // TL/GN: Peterborough branch cut at Hitchin
  { name: 'brighton', bbox: [-0.25, 50.81, -0.05, 50.98] }, // Brighton, Coastway cut
  { name: 'reading', bbox: [-1.05, 51.40, -0.85, 51.50] }, // GWR/SWR/Elizabeth end at Reading
  { name: 'woking-guildford', bbox: [-0.66, 51.22, -0.5, 51.34] }, // SWR beyond Woking / Guildford cut
  { name: 'sevenoaks-otford', bbox: [0.1, 51.25, 0.26, 51.42] }, // Southeastern / TL ends
  { name: 'neasden', bbox: [-0.29, 51.54, -0.23, 51.57] }, // Chiltern/Met/Jubilee co-run
  { name: 'nkej', bbox: [-0.07, 51.484, -0.03, 51.498] }, // Thameslink at North Kent East Jn (M-1)
]
// --views a,b renders only the named views
const vi = process.argv.indexOf('--views')
if (vi >= 0) {
  const want = new Set(process.argv[vi + 1].split(','))
  for (let i = VIEWS.length - 1; i >= 0; i--) if (!want.has(VIEWS[i].name)) VIEWS.splice(i, 1)
}

const stationsFC = JSON.parse(fs.readFileSync(path.join(DATA, 'features.json'), 'utf8'))

function renderFile(routesPath, tag) {
  const fc = JSON.parse(fs.readFileSync(routesPath, 'utf8'))
  for (const v of VIEWS) {
    const [W, S, E, N] = v.bbox
    const PXW = 1700
    const PXH = Math.round((PXW * (N - S)) / ((E - W) * Math.cos(51.5 * Math.PI / 180)))
    const x = (l) => ((l - W) / (E - W)) * PXW
    const y = (l) => ((N - l) / (N - S)) * PXH
    const feats = fc.features
      .filter((f) => f.geometry && f.geometry.type === 'LineString' && (COLOR[f.properties.line] || f.properties.color))
      .sort((a, b) => (ORDER[a.properties.line] ?? 99) - (ORDER[b.properties.line] ?? 99))
    let p = ''
    for (const f of feats) {
      const pts = f.geometry.coordinates
        .filter((c) => c[0] > W - 0.01 && c[0] < E + 0.01 && c[1] > S - 0.01 && c[1] < N + 0.01)
      if (pts.length < 2) {
        // still draw the full line clipped by viewport; just map all points
      }
      // offset mode: apply laneOff at render like the app (line-offset = laneOff × width)
      const px = f.geometry.coordinates.map((c) => [x(c[0]), y(c[1])])
      const off = (f.properties.laneOff || 0) * 5.5
      const shown = !off ? px : px.map((q, i) => {
        const a = px[Math.max(0, i - 1)], b = px[Math.min(px.length - 1, i + 1)]
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
        return [q[0] - (off * dy) / L, q[1] + (off * dx) / L] // right of travel (screen y down)
      })
      const str = shown.map((c) => c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' ')
      p += `<polyline points="${str}" fill="none" stroke="${COLOR[f.properties.line] || f.properties.color}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`
    }
    // station dots (true positions) to show marker/line alignment
    let dots = ''
    for (const f of stationsFC.features) {
      if (f.geometry.type !== 'Point') continue
      const c = f.geometry.coordinates
      if (c[0] < W || c[0] > E || c[1] < S || c[1] > N) continue
      dots += `<circle cx="${x(c[0]).toFixed(1)}" cy="${y(c[1]).toFixed(1)}" r="3.2" fill="#fff" stroke="#1d2835" stroke-width="1.4"/>`
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PXW}" height="${PXH}"><rect width="100%" height="100%" fill="#f4f4f2"/>${p}${dots}<text x="10" y="24" font-family="sans-serif" font-size="20" fill="#333">${v.name} · ${tag}</text></svg>`
    const file = path.join(OUT, `ribbon__${v.name}__${tag}.png`)
    sharp(Buffer.from(svg)).png().toFile(file)
    console.log('wrote', path.relative(process.cwd(), file), `${PXW}x${PXH}`)
  }
}

renderFile(arg, 'new')
if (withBaseline) {
  // 'old' baseline = the pristine raw-OSM source the build was made from
  const base = path.join(DATA, 'routes.osm.json')
  if (fs.existsSync(base)) renderFile(base, 'src')
}

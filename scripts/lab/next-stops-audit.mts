// Audit of the vertical line diagrams (/learn "All lines" on phones,
// /lab/lines/vertical): per line, the stations that a lane runs past on the
// OUTSIDE (between the station's circle and its name) although that lane runs
// past more of the station's piece than the piece runs past of the lane's.
// Those are the "boxed-in" stations the owner flagged; two-route stretches
// (one route must run outside the other) are excluded by the majority rule.
//
//   node scripts/lab/next-stops-audit.mts            # all lines
//   LL=Thameslink,C2c node scripts/lab/next-stops-audit.mts
//
// Node 24 runs .mts/.ts directly (type stripping). Also prints each line's
// layoutScore (lower is better) so layout changes can be compared before/after.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { layoutLine, layoutScore } from '../../src/app/(game)/lab/lines/vertical/graph.ts'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const LONDON = path.join(ROOT, 'src', 'app', '(game)', 'london')
const feats = JSON.parse(fs.readFileSync(path.join(LONDON, 'data', 'features.json'), 'utf8')).features
const coords: Record<string, [number, number]> = {}
for (const f of feats) if (!coords[f.properties.name]) coords[f.properties.name] = f.geometry.coordinates
const cfg = fs.readFileSync(path.join(LONDON, 'config.ts'), 'utf8')
// National Rail lines (dashed stripe) are laid out London end first, as the page does
const radial = (line: string) => new RegExp(line + ': \\{[^}]*?stripe: .dashed.', 's').test(cfg)

const only = (process.env.LL || '').split(',').filter(Boolean)
const files = fs.readdirSync(path.join(LONDON, 'services')).filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'types.ts')
let total = 0
for (const file of files.sort()) {
  const { services } = await import(path.join(LONDON, 'services', file))
  const line: string = services[0]?.line
  if (!line || (only.length && !only.includes(line))) continue
  const L = layoutLine(services.map((s: { stops: string[] }) => s.stops), coords, radial(line))
  const span = (p: any): [number, number] => [
    p.top !== undefined ? 2 * p.top + 1 : 2 * Math.min(...p.rows),
    p.bottom !== undefined ? 2 * p.bottom - 1 : 2 * Math.max(...p.rows),
  ]
  const passN = (q: any, o: any) => { const [a, b] = span(q); return o.rows.filter((r: number) => !q.rows.includes(r) && a <= 2 * r && 2 * r <= b).length }
  const bad: string[] = []
  L.rows.forEach((row, i) => {
    const own = L.pieces.find((p) => p.rows.includes(i))
    if (!own) return
    if (L.pieces.some((q) => { if (q === own || q.lane <= own.lane) return false; const [a, b] = span(q); return a <= 2 * i && 2 * i <= b && passN(q, own) > passN(own, q) })) bad.push(row.name)
  })
  total += bad.length
  console.log(`${line.padEnd(22)} lanes ${String(L.lanes).padStart(2)}  score ${String(layoutScore(L)).padStart(4)}  boxed ${String(bad.length).padStart(3)} ${bad.slice(0, 10).join(', ')}${bad.length > 10 ? ' …' : ''}`)
}
console.log('TOTAL boxed', total)

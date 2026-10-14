import { Cabin } from 'next/font/google'
import features from '../../../london/data/features.json'
import { LINES, SERVICES, LINES_AT, FEATURE_ID } from '../lineData'
import StripDemo, { type StripLine, type StripService } from './StripDemo'
import { compareLines, groupNameOf } from '../../ui/shells/key/groups'

const font = Cabin({ weight: ['400', '500', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

export const metadata = {
  title: 'Lab lines: Carriage strip · London Rail Memory',
  description: 'The strip map above the train doors: one route, stations in order, interchanges marked.',
}

// Station positions, used only here on the server to orient each service with
// its London end on the left (the client never sees features.json).
type F = { properties: { name: string; line: string }; geometry: { coordinates: number[] } }
const FEATS = (features as unknown as { features: F[] }).features.filter((f) => LINES[f.properties.line])
const POS: Record<string, number[]> = {}
for (const f of FEATS) POS[f.properties.name] ||= f.geometry.coordinates

const CENTRE = [-0.1247, 51.508] // Charing Cross
function km(name: string): number | null {
  const p = POS[name]
  if (!p) return null
  const dx = (p[0] - CENTRE[0]) * 69.4 // km per degree of longitude at 51.5°N
  const dy = (p[1] - CENTRE[1]) * 111.2
  return Math.hypot(dx, dy)
}
/** distance from central London of the first stop (from one end) that has a position */
function endKm(stops: string[], fromEnd: boolean): number {
  const order = fromEnd ? stops.slice().reverse() : stops
  for (const s of order) {
    const d = km(s)
    if (d !== null) return d
  }
  return 0
}

const lines: StripLine[] = Object.entries(LINES)
  .filter(([key]) => SERVICES[key]?.length)
  .sort((a, b) => compareLines({ key: a[0], order: a[1].order }, { key: b[0], order: b[1].order }))
  .map(([key, l]) => ({
    key,
    name: l.name,
    color: l.color,
    stripe: l.stripe,
    stripeColor: l.stripeColor,
    group: groupNameOf(key, l.order),
  }))

const services: Record<string, StripService[]> = {}
const usedNames = new Set<string>()
for (const { key } of lines) {
  services[key] = SERVICES[key].map((s) => {
    // London end on the left: flip when the last stop is clearly more central
    // than the first (cross-London services whose ends are similar stay as written).
    const a = endKm(s.stops, false)
    const b = endKm(s.stops, true)
    const reversed = b < a * 0.8
    s.stops.forEach((n) => usedNames.add(n))
    return { name: s.name, stops: reversed ? s.stops.slice().reverse() : s.stops.slice(), reversed }
  })
}
// only ship what the diagrams need
const linesAt: Record<string, string[]> = {}
const featureId: Record<string, number> = {}
// One station, several names in the data (the National Rail termini are
// "London X" next to the Underground's "X"): their lines merge into one interchange.
const SAME_GROUPS = [
  ["King's Cross St Pancras", 'St Pancras International', 'London St Pancras', "London King's Cross"],
]
// Separate stations a short walk apart that count as interchanges (curated:
// proximity alone would pair Canary Wharf with Poplar). Shown as outline chips.
const WALK_GROUPS = [
  ['Bank', 'Monument'],
  ['Euston', 'Euston Square'],
  ['Waterloo', 'Waterloo East'],
  ['Tower Hill', 'Tower Gateway', 'London Fenchurch Street'],
  ['Camden Road', 'Camden Town'],
  ['Seven Sisters', 'South Tottenham'],
  ['Walthamstow Central', "Walthamstow Queen's Road"],
  ['West Hampstead', 'West Hampstead Thameslink'],
  ['Hackney Central', 'Hackney Downs'],
  ['Charing Cross', 'Embankment'],
  ['Finchley Road', 'Finchley Road & Frognal'],
  ['Woolwich Arsenal', 'Woolwich'],
]
const canon: Record<string, string> = {}
for (const g of SAME_GROUPS) for (const n of g) canon[n] = g[0]
for (const n of Object.keys(LINES_AT)) if (!canon[n] && n.startsWith('London ') && LINES_AT[n.slice(7)]) canon[n] = n.slice(7)
const canonOf = (n: string) => canon[n] || n
const members: Record<string, string[]> = {}
for (const n of Object.keys(LINES_AT)) (members[canonOf(n)] ||= []).push(n)
const linesOfCanon = (c: string) => Array.from(new Set((members[c] || []).flatMap((n) => LINES_AT[n])))
const walkOf: Record<string, string[]> = {}
for (const g of WALK_GROUPS) for (const n of g) walkOf[canonOf(n)] = g.map(canonOf).filter((m) => m !== canonOf(n))

const nearAt: Record<string, { name: string; lines: string[] }[]> = {}
Array.from(usedNames).forEach((n) => {
  if (LINES_AT[n]) linesAt[n] = linesOfCanon(canonOf(n))
  const walk = walkOf[canonOf(n)]
  if (walk) nearAt[n] = walk.map((m) => ({ name: m, lines: linesOfCanon(m) }))
  for (const l of LINES_AT[n] || []) if (FEATURE_ID[`${n}|${l}`] !== undefined) featureId[`${n}|${l}`] = FEATURE_ID[`${n}|${l}`]
})

export default function StripPage() {
  return (
    <div className={font.className}>
      <StripDemo
        lines={lines}
        services={services}
        linesAt={linesAt}
        nearAt={nearAt}
        featureId={featureId}
        fontFamily={font.style.fontFamily}
      />
    </div>
  )
}

import l0 from '../data/routes.l0.json'
import l1 from '../data/routes.l1.json'
import l2 from '../data/routes.l2.json'
import l3 from '../data/routes.l3.json'
import meta from '../data/levels.json'
import { LabShell, scoped } from '../labShell'

export const metadata = { title: 'Lab: Levels · London Rail Memory' }

const data: Record<string, unknown> = { l0, l1, l2, l3 }
// Coarsest first, so in each band the finer level fades in on top.
const routeLevels = [...meta.levels].reverse().map((L) => ({
  id: L.id,
  routes: scoped(data[L.id]),
  minzoom: L.minzoom,
  maxzoom: L.maxzoom,
}))

export default function LabLevels() {
  return <LabShell slug="levels" routeLevels={routeLevels} />
}

import graph7 from '../data/routes.graph7.json'
import graph5 from '../data/routes.graph5.json'
import { LabShell, scoped } from '../labShell'

export const metadata = { title: 'Lab: Staging 3 · London Rail Memory' }

// Staging 1 with Graph 7 instead of Graph 4 from z11.4 in (tube / DLR drawn
// from their raw OSM centrelines with /london's snapping); Graph 5 below.
const routeLevels = [
  { id: 'graph5', routes: scoped(graph5), minzoom: 0, maxzoom: 11.4 },
  { id: 'graph7', routes: scoped(graph7), minzoom: 11.4, maxzoom: 24 },
]

export default function LabStaging3() {
  return <LabShell slug="staging3" routeLevels={routeLevels} forceSize="staging" />
}

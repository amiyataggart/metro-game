import graph4 from '../data/routes.graph4.json'
import graph5 from '../data/routes.graph5.json'
import { LabShell, scoped } from '../labShell'

export const metadata = { title: 'Lab: Staging 1 · London Rail Memory' }

// Graph 4 (clamped sizing) from z11.4 in; zoomed out past z11.4 it switches
// to Graph 5's geometry with everything scaling with the map. Coarsest level
// first, so Graph 4 fades in on top across z11.15–11.65.
const routeLevels = [
  { id: 'graph5', routes: scoped(graph5), minzoom: 0, maxzoom: 11.4 },
  { id: 'graph4', routes: scoped(graph4), minzoom: 11.4, maxzoom: 24 },
]

export default function LabStaging1() {
  return <LabShell slug="staging1" routeLevels={routeLevels} forceSize="staging" />
}

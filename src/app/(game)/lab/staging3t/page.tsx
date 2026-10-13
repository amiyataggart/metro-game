import { LabShell } from '../labShell'

export const metadata = { title: 'Lab: Staging 3 true track · London Rail Memory' }

// Staging 3, plus a 'true track' level from z13.5 in: Graph 7T, where surface
// lines are not pulled together and share a corridor only on the same
// physical track. Cross-fades over ±0.25 zoom like Levels.
const routeLevels = [
  { id: 'graph5', routes: '/lab-data/staging3/graph5.json', minzoom: 0, maxzoom: 11.4, source: { maxzoom: 12, buffer: 64 } },
  { id: 'graph7', routes: '/lab-data/staging3/graph7.json', minzoom: 11.4, maxzoom: 13.5, source: { maxzoom: 14, buffer: 64 } },
  { id: 'graph7t', routes: '/lab-data/staging3/graph7t.json', minzoom: 13.5, maxzoom: 24, source: { maxzoom: 16, buffer: 64 } },
]

export default function LabStaging3t() {
  return <LabShell slug="staging3t" routeLevels={routeLevels} forceSize="staging" />
}

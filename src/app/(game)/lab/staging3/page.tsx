import { LabShell } from '../labShell'

export const metadata = { title: 'Lab: Staging 3 · London Rail Memory' }

// Graph 7 from z11.4 in, Graph 5 (map-scale sizing) below. Line data is served
// as packed static files (scripts/lab/pack-staging.js) that MapLibre fetches
// and parses in its worker, and each source only builds the tiles it can show
// (Graph 5 is never drawn above z11.65; Graph 7 tiles stop at z15 and are
// over-zoomed beyond).
const routeLevels = [
  { id: 'graph5', routes: '/lab-data/staging3/graph5.json', minzoom: 0, maxzoom: 11.4, source: { maxzoom: 12, buffer: 64 } },
  { id: 'graph7', routes: '/lab-data/staging3/graph7.json', minzoom: 11.4, maxzoom: 24, source: { maxzoom: 15, buffer: 64 } },
]

export default function LabStaging3() {
  return <LabShell slug="staging3" routeLevels={routeLevels} forceSize="staging" />
}

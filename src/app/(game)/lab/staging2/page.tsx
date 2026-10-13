import { LabShell } from '../labShell'

export const metadata = { title: 'Lab: Staging 2 · London Rail Memory' }

// Staging 1, made lighter: the line data is not imported into the page but
// served as packed static files (scripts/lab/pack-staging.js) that MapLibre
// fetches and parses in its worker; each source only builds the tiles it can
// show (Graph 5 is never drawn above z11.65; Graph 4 tiles stop at z15 and are
// over-zoomed beyond).
const routeLevels = [
  { id: 'graph5', routes: '/lab-data/staging2/graph5.json', minzoom: 0, maxzoom: 11.4, source: { maxzoom: 12, buffer: 64 } },
  { id: 'graph4', routes: '/lab-data/staging2/graph4.json', minzoom: 11.4, maxzoom: 24, source: { maxzoom: 15, buffer: 64 } },
]

export default function LabStaging2() {
  return <LabShell slug="staging2" routeLevels={routeLevels} forceSize="staging" />
}

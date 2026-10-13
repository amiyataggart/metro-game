import routes from '../data/routes.graph5.json'
import { LabShell, scoped } from '../labShell'

export const metadata = { title: 'Lab: Graph 5 · London Rail Memory' }

// Built for map-scale sizing: lane offsets are baked into the geometry in
// metres, so the page always scales sizes with the map.
export default function LabGraph5() {
  return <LabShell slug="graph5" routes={scoped(routes)} forceSize="map" />
}

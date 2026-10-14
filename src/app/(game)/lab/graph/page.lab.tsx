import routes from '../data/routes.graph.json'
import { LabShell, scoped } from '../labShell'

export const metadata = { title: 'Lab: Graph · London Rail Memory' }

export default function LabGraph() {
  return <LabShell slug="graph" routes={scoped(routes)} />
}

import routes from '../data/routes.graph2.json'
import { LabShell, scoped } from '../labShell'

export const metadata = { title: 'Lab: Graph 2 · London Rail Memory' }

export default function LabGraph2() {
  return <LabShell slug="graph2" routes={scoped(routes)} />
}

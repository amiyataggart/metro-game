import routes from '../data/routes.graph3.json'
import { LabShell, scoped } from '../labShell'

export const metadata = { title: 'Lab: Graph 3 · London Rail Memory' }

export default function LabGraph3() {
  return <LabShell slug="graph3" routes={scoped(routes)} />
}

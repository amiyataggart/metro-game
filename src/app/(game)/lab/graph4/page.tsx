import routes from '../data/routes.graph4.json'
import { LabShell, scoped } from '../labShell'

export const metadata = { title: 'Lab: Graph 4 · London Rail Memory' }

export default function LabGraph4() {
  return <LabShell slug="graph4" routes={scoped(routes)} />
}

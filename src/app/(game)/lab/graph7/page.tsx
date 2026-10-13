import routes from '../data/routes.graph7.json'
import { LabShell, scoped } from '../labShell'

export const metadata = { title: 'Lab: Graph 7 · London Rail Memory' }

export default function LabGraph7() {
  return <LabShell slug="graph7" routes={scoped(routes)} />
}

import routes from '../data/routes.morph.json'
import meta from '../data/levels.json'
import { LabShell, scoped } from '../labShell'

export const metadata = { title: 'Lab: Morph · London Rail Memory' }

export default function LabMorph() {
  return (
    <LabShell
      slug="morph"
      routes={scoped(routes)}
      morph={{ zCoarse: meta.morph.zCoarse, zFine: meta.morph.zFine }}
    />
  )
}

// Post-build: drop the lab's static data from out/ when the lab is disabled
// (see scripts/lab-enabled.mjs).
import fs from 'fs'
import { labEnabled } from './lab-enabled.mjs'

if (!labEnabled()) {
  fs.rmSync('out/lab-data', { recursive: true, force: true })
  console.log('lab disabled: removed out/lab-data')
}

// The /lab geometry experiments ship on dev (and locally) but not on main.
// Lab routes are `page.lab.tsx` files, which only count as pages when
// next.config adds the `lab.tsx` extension; public/lab-data is removed from
// out/ by scripts/strip-lab.mjs. Override with LAB=1 / LAB=0.
import { execSync } from 'child_process'

export function labEnabled() {
  if (process.env.LAB === '1') return true
  if (process.env.LAB === '0') return false
  // Cloudflare Workers Builds sets WORKERS_CI and WORKERS_CI_BRANCH
  let branch = process.env.WORKERS_CI_BRANCH
  if (!branch) {
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {}
  }
  // in CI, an unknown branch is treated as main (fail closed)
  if (process.env.WORKERS_CI && (!branch || branch === 'HEAD')) return false
  return branch !== 'main'
}

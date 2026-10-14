import { labEnabled } from './scripts/lab-enabled.mjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static site (client-side game + static data) — `next build` emits
  // `out/`, which Cloudflare serves directly via wrangler.jsonc's assets.
  output: 'export',
  images: { unoptimized: true },
  // /lab routes are page.lab.tsx: pages only where the lab is enabled (not main)
  pageExtensions: [...(labEnabled() ? ['lab.tsx'] : []), 'js', 'jsx', 'ts', 'tsx'],
  // page generation timeout
  staticPageGenerationTimeout: 30,
}

export default nextConfig

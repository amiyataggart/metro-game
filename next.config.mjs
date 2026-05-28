/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static site (client-side game + static data) — `next build` emits
  // `out/`, which Cloudflare serves directly via wrangler.jsonc's assets.
  output: 'export',
  images: { unoptimized: true },
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  // page generation timeout
  staticPageGenerationTimeout: 30,
}

export default nextConfig

#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * LAB — side-by-side comparison sheet: one row per spot, one column per
 * variant, each a render.js close-up (Staging sizing + station names).
 *
 *   node scripts/lab/compare.js <name> <variant,variant,...> <zoom> <lng,lat[:label]> ...
 *   -> qa/out/lab/cmp-<name>.png
 */
const path = require('path')
const { execFileSync } = require('child_process')
const sharp = require('sharp')

const OUT = path.join(__dirname, '..', '..', 'qa', 'out', 'lab')
const [name, variantsArg, zArg, ...spots] = process.argv.slice(2)
const variants = variantsArg.split(',')
const S = 460, PAD = 6, HEAD = 22
;(async () => {
  const comps = []
  spots.forEach((spec, r) => {
    const [at, label = at] = spec.split(':')
    variants.forEach((v, c) => {
      const tag = `cmp${r}`
      execFileSync('node', [path.join(__dirname, 'render.js'), v, at, zArg, tag, `${S}x${S}`], { env: { ...process.env, SIZE: process.env.SIZE || 'staging', STATIONS: '1' }, stdio: 'ignore' })
      const file = path.join(OUT, `${tag}-${path.basename(v, '.json')}-z${zArg}.png`)
      const x = c * (S + PAD), y = r * (S + HEAD + PAD)
      const text = `${label} · ${path.basename(v, '.json')}`.replace(/&/g, '&amp;')
      comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${HEAD}"><rect width="${S}" height="${HEAD}" fill="#222"/><text x="6" y="15" font-family="sans-serif" font-size="13" fill="#fff">${text}</text></svg>`), left: x, top: y })
      comps.push({ input: file, left: x, top: y + HEAD })
    })
  })
  const file = path.join(OUT, `cmp-${name}.png`)
  await sharp({ create: { width: variants.length * (S + PAD), height: spots.length * (S + HEAD + PAD), channels: 3, background: '#ffffff' } }).composite(comps).png().toFile(file)
  console.log(path.relative(process.cwd(), file))
})()

#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * QA render harness — screenshots the MapLibre map for one or more game
 * versions so geometry changes (snapping / smoothing / junction & overlap)
 * are visually verifiable without a human in the loop.
 *
 * Why Puppeteer (per project steer): headless software-WebGL on this Mac
 * returned blank MapLibre canvases in past attempts. We launch Chromium with
 * ANGLE/Metal GPU flags and capture via page.screenshot (the compositor),
 * which captures the WebGL canvas without needing preserveDrawingBuffer.
 * Falls back to headful (QA_HEADLESS=false) which always renders on macOS.
 *
 * Usage:
 *   node scripts/qa-render.js                 # default: london + v1..v4
 *   node scripts/qa-render.js london v2       # specific routes
 *   QA_HEADLESS=false node scripts/qa-render.js   # headful fallback
 *   QA_PORT=3002 node scripts/qa-render.js
 *
 * Output: qa/out/<route>__<view>.png  and a qa/out/_blankcheck.json report.
 */

const fs = require('fs')
const path = require('path')

const PORT = process.env.QA_PORT || '3002'
const BASE = `http://localhost:${PORT}`
const HEADLESS = process.env.QA_HEADLESS === 'false' ? false : true
const OUT = path.join(__dirname, '..', 'qa', 'out')

// Routes to shoot. `london` is the untouched baseline for comparison.
const DEFAULT_ROUTES = ['london', 'london/v1', 'london/v2', 'london/v3', 'london/v4']

// Views: overview = whatever fitBounds gives (whole network); the zoom views
// wheel-zoom toward a viewport-fraction point (the dense central-London knot,
// which sits up-and-left of center after fitBounds) to reach junction-level
// detail without needing the app to expose the map instance.
//   wheel: number of wheel ticks (negative deltaY = zoom in); fx/fy aim point.
const VIEWS = [
  { name: 'overview', wheel: 0 },
  // Aim at the central-London interchange knot (Zone 1), where most snapping
  // /ordering/overlap issues are visible. Zoom-toward-cursor keeps this point
  // fixed, so the aim must land on the knot itself.
  { name: 'central', wheel: 5, fx: 0.41, fy: 0.46 },
  { name: 'central-deep', wheel: 9, fx: 0.41, fy: 0.46 },
]

const VIEWPORT = { width: 1400, height: 1000, deviceScaleFactor: 1 }

async function shoot(browser, route) {
  const page = await browser.newPage()
  await page.setViewport(VIEWPORT)
  // Skip the intro modal so it can't cover the map.
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('london-stations-is-new-player', 'false')
    } catch (e) {}
  })
  page.on('dialog', (d) => d.accept().catch(() => {}))

  const url = `${BASE}/${route}`
  const report = { route, url, views: {} }
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
  } catch (e) {
    report.error = `goto failed: ${e.message}`
    await page.close()
    return report
  }

  // Wait for the map canvas to exist and the style+tiles to settle.
  try {
    await page.waitForSelector('#map canvas', { timeout: 30000 })
  } catch (e) {
    report.error = 'no map canvas appeared'
    await page.close()
    return report
  }
  await sleep(4000)

  for (const view of VIEWS) {
    if (view.wheel > 0) {
      const x = Math.round(VIEWPORT.width * (view.fx ?? 0.5))
      const y = Math.round(VIEWPORT.height * (view.fy ?? 0.5))
      await page.mouse.move(x, y)
      for (let i = 0; i < view.wheel; i++) {
        await page.mouse.wheel({ deltaY: -400 })
        await sleep(350)
      }
      await sleep(1800)
    }
    const file = path.join(OUT, `${route.replace(/\//g, '__')}__${view.name}.png`)
    await page.screenshot({ path: file })
    // Blank-detection: sample the map canvas region's pixel variance.
    const stats = await canvasStats(page)
    report.views[view.name] = { file: path.relative(process.cwd(), file), ...stats }
    console.log(
      `  ${route} / ${view.name}: ${stats.nonWhiteFrac != null ? (stats.nonWhiteFrac * 100).toFixed(1) + '% non-white' : 'n/a'} ${stats.blank ? '*** BLANK ***' : ''}`,
    )
    // reset zoom for next view by reloading (cheaper than zoom-out math)
    if (view !== VIEWS[VIEWS.length - 1]) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
      await page.waitForSelector('#map canvas', { timeout: 30000 })
      await sleep(3500)
    }
  }
  await page.close()
  return report
}

// Read the map canvas back via a 2D downscale to estimate how much is drawn.
async function canvasStats(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#map canvas')
    if (!c) return { blank: true, reason: 'no-canvas' }
    const w = 64, h = 48
    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const ctx = tmp.getContext('2d')
    try {
      ctx.drawImage(c, 0, 0, w, h)
    } catch (e) {
      return { blank: null, reason: 'tainted-or-empty: ' + e.message }
    }
    const data = ctx.getImageData(0, 0, w, h).data
    let nonWhite = 0
    const n = w * h
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      // "non-white" = visibly different from the positron near-white basemap.
      if (r < 240 || g < 240 || b < 240) nonWhite++
    }
    const frac = nonWhite / n
    return { blank: frac < 0.005, nonWhiteFrac: frac }
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES
  fs.mkdirSync(OUT, { recursive: true })
  const puppeteer = require('puppeteer')
  console.log(`Launching Chromium (headless=${HEADLESS})...`)
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    protocolTimeout: 180000,
    args: [
      '--use-angle=metal',
      '--use-gl=angle',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--no-sandbox',
    ],
  })
  const reports = []
  for (const route of routes) {
    console.log(`Route ${route} ...`)
    reports.push(await shoot(browser, route))
  }
  await browser.close()
  fs.writeFileSync(
    path.join(OUT, '_blankcheck.json'),
    JSON.stringify(reports, null, 2),
  )
  console.log(`\nWrote ${reports.length} route report(s) to ${path.relative(process.cwd(), OUT)}.`)
  for (const r of reports) {
    if (r.error) console.log(`  !! ${r.route}: ${r.error}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

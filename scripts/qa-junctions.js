#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Junction-level QA: drives the in-app search box (which flyTo's the map to a
 * station) to capture the exact junctions ISSUES.md calls out, then zooms in
 * for a gap/overlap check. Targets the live dev server.
 *
 * Usage: node scripts/qa-junctions.js [route]   (route default: london)
 */
const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer')

const PORT = process.env.QA_PORT || '3002'
const ROUTE = process.argv[2] || 'london'
const OUT = path.join(__dirname, '..', 'qa', 'out')
const HEADLESS = process.env.QA_HEADLESS === 'false' ? false : true

const JUNCTIONS = [
  "Earl's Court",
  'Gloucester Road',
  'Kennington',
  'Camden Town',
  'Farringdon',
]
const EXTRA_WHEEL = 3 // zoom past the flyTo's zoom 13 toward ~16 for detail
const VP = { width: 1200, height: 1000, deviceScaleFactor: 1 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ['--use-angle=metal', '--use-gl=angle', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
  })
  for (const name of JUNCTIONS) {
    const page = await browser.newPage()
    await page.setViewport(VP)
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem('london-stations-is-new-player', 'false') } catch (e) {}
    })
    page.on('dialog', (d) => d.accept().catch(() => {}))
    await page.goto(`http://localhost:${PORT}/${ROUTE}`, { waitUntil: 'networkidle2', timeout: 60000 })
    await page.waitForSelector('#map canvas', { timeout: 30000 })
    await sleep(3500)
    // Type the station name and submit -> app flyTo's to its coords.
    await page.focus('#input')
    await page.type('#input', name, { delay: 25 })
    await page.keyboard.press('Enter')
    await sleep(1600) // flyTo (zoom 13)
    // Zoom in further toward the junction center (viewport center after flyTo).
    await page.mouse.move(VP.width * 0.5, VP.height * 0.5)
    for (let i = 0; i < EXTRA_WHEEL; i++) { await page.mouse.wheel({ deltaY: -400 }); await sleep(350) }
    await sleep(1200)
    const file = path.join(OUT, `junction__${ROUTE.replace(/\//g, '_')}__${name.replace(/[^a-z0-9]+/gi, '_')}.png`)
    await page.screenshot({ path: file })
    console.log(`  ${name}: ${path.relative(process.cwd(), file)}`)
    await page.close()
  }
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })

# London Rail Memory

A self-hosted memory game for the London rail network. Type station names from
memory; correct guesses light up on a real-geography MapLibre map.

By default the map shows the **London Underground** (11 lines), **London
Overground** (6 lines), the **Elizabeth line**, and the **DLR**. **Thameslink**
is included but **off by default** — toggle it (or any individual line) from the
line picker next to the legend. Southern, Great Northern and Gatwick Express
remain in the data but are currently hidden (`HIDDEN_LINES` in
`visibility.ts`).

Forked from [benjamintd/metro-memory.com](https://github.com/benjamintd/metro-memory.com)
(MIT). The original shows the Underground only; this fork covers the wider
network, swaps the Mapbox basemap for a free MapLibre style, and rebuilds the
line data from OpenStreetMap with London-specific cartography — baked
parallel-offset ribbons, segmented-pie interchanges, and Greater London / City
of London boundary overlays.

## Stack

- **Next.js 14** App Router + TypeScript, **React 18**
- **MapLibre GL JS** with the Carto Positron (no-labels) basemap — no token;
  parks/water are recoloured in-app for contrast
- **TailwindCSS**, **Fuse.js** (fuzzy station-name matching)
- Data: **OpenStreetMap** (Overpass), the upstream metro-memory features file,
  **TfL**/**ONS** boundaries, and a curated alias table
- Dev tooling: **Puppeteer** + **sharp** for the QA render/geometry harness
- Ships as a **static export** for Cloudflare (see Deploy)

## Quick start

```sh
npm install
npm run dev
```

Open [http://localhost:3000/](http://localhost:3000/) (the home page redirects
to `/london`).

> Do **not** run `npm run build` while `npm run dev` is running — they share
> `.next/` and the production build will break the dev server until restarted.

## Map & gameplay

- **Line picker** (icon by the legend) groups lines by operator — London
  Underground / London Overground / Elizabeth Line / DLR / Thameslink — each
  toggling all its lines or expanding to individual lines. `SettingsModal` also
  has per-line toggles + "Reveal every station". Choices persist to
  `localStorage`.
- **Stations**: un-found stations are hollow rings; found single-line stations
  are a colour dot; found **multi-line interchanges** are a **segmented pie**
  (one wedge per serving line, grouped by physical location), all sharing the
  same ring. Markers **scale with zoom** so they don't overcrowd when zoomed out.
- **Draggable count-up timer** (top of the map; drag by the 6-dot handle).
- **Boundaries**: everything outside Greater London is greyed out with a dashed
  border; the City of London has a red dashed outline.
- **Default view**: centred on Charing Cross with most of Zone 1 in frame.

## Project layout

```
src/
  app/
    page.tsx                       # / -> /london (client redirect, static-export safe)
    (game)/london/
      page.tsx                     # builds fc/routes, applies visibility + interchange annotation
      config.ts                    # LINES (colour/order/stripe), MAP_CONFIG (centre/zoom/maxBounds), MAP_STYLE
      visibility.ts                # HIDDEN_LINES + Thameslink-trim filters (server-side)
      interchanges.ts              # tags stations with lineCount / pie colours, clustered by location
      data/
        features.json             # station GeoJSON (Point per station-line pair)
        routes.json               # baked line geometry (line-offset is 0 at render)
        london-mask.json          # Greater London grey-out mask (+ city-of-london.json outline)
        stations-extras.json      # National-Rail TOC stations from OSM
  components/                      # GamePage, LinePicker, Timer, FoundSummary, Input, SettingsModal, ...
scripts/                           # data pipeline + QA harness (see below)
wrangler.jsonc                     # Cloudflare static-assets deploy config
```

## Data pipeline

`routes.json` / `features.json` are committed pre-built snapshots.
`routes.preribbons.json` is the pristine pre-offset input; **always regenerate
`routes.json` from it** (never from `routes.json` itself, or you double-offset):

```sh
# bake parallel-ribbon offsets: pristine input -> routes.json
node scripts/build-ribbons.js \
  --in "src/app/(game)/london/data/routes.preribbons.json" \
  --out "src/app/(game)/london/data/routes.json"

node scripts/transform-data.js        # build features.json (stations; splits Overground, aliases, TOC merge)
node scripts/rename-stations.js       # drop redundant "London " name prefixes (keep as aliases)
```

(`scripts/fetch-osm-routes.js` re-fetches raw geometry from Overpass when the
network or line set changes — avoid depending on it in the committed pipeline.)

**Baked parallel ribbons (`build-ribbons.js`).** Co-running lines (e.g.
Circle/District/H&C/Met on the subsurface trunk) must render as distinct,
correctly-ordered parallel ribbons. MapLibre's runtime `line-offset` takes a
perpendicular from each line's *own* local tangent, so where two lines'
geometries differ — they come from different OSM ways and bow up to ~60m apart
between shared stations — the ribbons cross and flip order across zoom. Instead
`build-ribbons.js`:

1. Detects shared **corridors** by first-come geometric snapping to **spines**
   (shared centrelines, laid lowest-`order`-first), then extends membership
   along runs of **≥2 consecutive shared station nodes** (`features.json`) — the
   robust co-running signal that survives the between-station geometry bow.
   Stations are used for *detection only*; line geometry is never welded to them.
2. Packs each corridor's lines into evenly-spaced **lanes**, ordered by config
   `order` (which yields the required cross-track ordering, e.g. Circle interior
   to the subsurface loop), centred on the corridor.
3. Bakes each line = its corridor centreline offset by `lane × spacing`, blended
   smoothly onto/off corridors via a tapered offset, so co-runners are exact
   parallel offsets of one curve and **never cross or flip**. The map renders
   with `line-offset: 0`.

Loops (Circle) and branches are preserved: a spine's own laying feature is
reconstructed by identity (no self-overlap projection), and offsets taper to 0
where a branch leaves a trunk. All tunables are documented in the script's
`CONFIG`. Verify with `scripts/qa-ribbons.js` (scorecard) and
`scripts/qa-ribbons-render.js` (PNG renders). The previous weld/Chaikin/
miter-offset pipeline is retired to `archive/scripts/` (do not reuse — it
corrupted the Circle loop and never baked offsets into coordinates).

## QA / verification

Headless WebGL was unreliable for verifying map changes, so:

```sh
node scripts/qa-ribbons.js               # ribbon acceptance scorecard: per-line bbox/length
                                         # integrity vs the pre-ribbon snapshot, the §4 ordering
                                         # probes (no crossings, even spacing), Watford DC
node scripts/qa-ribbons-render.js        # browser-free SVG->PNG of the probe corridors -> qa/out/
                                         # (draws lowest order first; eyeball ordering/parallelism)
node scripts/qa-render.js [london ...]   # Puppeteer screenshots of hotspots -> qa/out/
node scripts/qa-junctions.js [route]     # drives the in-app search to screenshot named junctions
```

(`qa/` output is gitignored.)

## Configuration

- `config.ts` — `LINES` (name, colour, `backgroundColor`, `order`, optional
  `stripe: 'solid' | 'dashed'`), `MAP_CONFIG` (`center`/`zoom` default view and
  `maxBounds`), `MAP_STYLE`.
- `visibility.ts` — `HIDDEN_LINES` (fully removed lines) and `THAMESLINK_TRIM`.
- Default enabled lines live in `GamePage` (`defaultEnabled`); bump the
  `${CITY_NAME}-enabled-lines-vN` storage key when changing defaults.

## Deploy (Cloudflare)

The app is a static site: `next.config.mjs` sets `output: 'export'`, so
`npm run build` emits `out/`, and `wrangler.jsonc` serves `out/` as Workers
static assets.

```sh
npm run build       # -> out/
npx wrangler deploy # uploads out/ as static assets
```

## Credits

- Original game by **Benjamin Tran Dinh** — [metro-memory.com](https://github.com/benjamintd/metro-memory.com), MIT.
- London-focused fork by **AJ Taggart**.
- Line geometry © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL); boundaries via TfL Open Data / ONS (OGL); TfL Open Data acknowledged in the About modal.

## License

MIT, same as upstream. See `LICENSE.md`.

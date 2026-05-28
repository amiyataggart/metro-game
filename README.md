# London Rail Memory

A self-hosted memory game for the London rail network. Type station names from
memory; correct guesses light up on a real-geography map covering the London
Underground (11 lines), DLR, Elizabeth line, the six 2024 Overground lines
(Lioness, Mildmay, Windrush, Weaver, Suffragette, Liberty), Thameslink, Great
Northern, Southern, and Gatwick Express.

Forked from [benjamintd/metro-memory.com](https://github.com/benjamintd/metro-memory.com)
(MIT). The original game shows the Underground only; this fork adds the rest of
the Greater-London-area rail network, replaces the Mapbox basemap with a free
MapLibre style, and rebuilds the line data with proper OSM-derived geometry
including parallel-offset rendering and centerline averaging.

## Stack

- **Next.js 14** App Router + TypeScript
- **React 18**
- **MapLibre GL JS** with the Carto Positron (no-labels) basemap — no token needed
- **TailwindCSS** for layout
- **Fuse.js** for fuzzy station-name matching
- Data from OpenStreetMap (via Overpass API), the upstream metro-memory
  features file, and a hand-curated alias table

## Quick start

```sh
npm install
npm run dev
```

Then open [http://localhost:3000/](http://localhost:3000/) (or whatever port
`next dev` picked). The home page redirects to `/london`.

## Project layout

```
src/
  app/
    (game)/london/        # page, route, opengraph image
      config.ts           # line definitions (color, stripe, order)
      data/
        features.json     # station GeoJSON FeatureCollection (Point per station-line pair)
        features.original.json  # upstream metro-memory data — never touched at runtime
        routes.json       # line geometry (LineString per chain, with offset property)
        stations-extras.json    # National Rail TOC stations from OSM (transform input)
  components/             # GamePage, Input, FoundList, SettingsModal, etc.
  hooks/                  # useTranslation, useHideLabels, etc.
  lib/
    configContext.tsx     # provides config to game components
    i18n.tsx              # rosetta translations
    types.ts              # Config, Line, DataFeatureCollection types

scripts/
  fetch-osm-routes.js     # pulls geometry + station candidates from Overpass
  transform-data.js       # merges OSM stations into features.json, splits Overground

public/images/            # legacy line icons (most now superseded by inline SVG)
```

## Data pipeline

Two scripts. Run them in order any time OSM has been updated or the line
definitions change.

```sh
node scripts/fetch-osm-routes.js   # writes routes.json + stations-extras.json
node scripts/transform-data.js     # writes features.json
```

### `fetch-osm-routes.js`

Hits the Overpass API once for every relevant `route=subway/light_rail/train`
relation in the London area, then post-processes the OSM way+node data into
clean rendering geometry. The pipeline:

1. **Filter ways** — drop `service=siding/yard/spur/crossover` and
   `railway=platform/switch` so platform loops and pointwork artifacts don't
   end up in the rendered lines.
2. **Chain merge** — for each line, build a sub-graph (nodes = OSM node ids,
   edges = ways) and walk every maximal chain of degree-2 internal nodes,
   concatenating the way geometries into one continuous polyline. Chains
   break at junctions and leaves.
3. **Junction merge** — at degree-3+ junctions, greedily pair the two chains
   whose tangents point most opposite (≤60° deflection) and merge them, so a
   line runs continuously through junctions it crosses.
4. **Chain-level centerline averaging** — for each pair of same-line chains
   whose endpoints (in either orientation) are within ~120 m or whose Jaccard
   bucket overlap is ≥ 0.25, average their geometries via arc-length sampling
   to produce one centerline. This handles the two physical rails of a
   double-tracked surface line.
5. **Hausdorff containment dedup** — drop any same-line chain whose path is
   ≥60% within ~50 m of a longer kept chain (point-to-segment distance, not
   point-to-vertex). Catches near-duplicate chains that the averaging missed.
6. **Line-wide proximity offsets** — for each line, compute one offset value
   from the union of its bucket coverage and the LINE_ORDER positions of any
   other line sharing ≥30 buckets (~420 m of parallel running). All chains
   of the line inherit that offset, so where multiple services run side-by-
   side (Edgware Rd → Aldgate East has Circle/H&C/Met/District; Brighton main
   has Thameslink/Southern/GX) the colored ribbons render in parallel via
   MapLibre's `line-offset` paint property.

Output is `routes.json` (FeatureCollection of LineStrings with `line`,
`color`, `order`, `offset` properties) and `stations-extras.json` (array of
new-TOC station candidates).

### `transform-data.js`

Builds the final `features.json` station file used by the game:

1. **Split Overground** — the upstream `features.original.json` has a single
   `line: "Overground"` entry per station. Re-tag each station to one or more
   of the six 2024 Overground line names per the published rebrand mapping.
   Stations on multiple new lines (Willesden Junction, Highbury & Islington,
   Canonbury, Gospel Oak, Clapham Junction) get a feature per line.
2. **Apply aliases** — fold curated alternate names into each feature's
   `alternate_names` array so the fuzzy matcher accepts common variants
   ("Blackfriars" for "London Blackfriars", "Saint Albans" for "St Albans
   City"). St Pancras International deliberately does *not* include the King's
   Cross variants — typing those should resolve to the Tube interchange.
3. **Merge new-TOC stations** — for `Thameslink`, `Great Northern`, `Southern`,
   `Gatwick Express`, append OSM-derived stations from `stations-extras.json`
   if not already present.

## Configuration

Edit `src/app/(game)/london/config.ts`:

- `LINES` — every line's name, hex color, background color, stack order, and
  optional `stripe: 'solid' | 'dashed'` (Overground/Elizabeth/DLR/Southern/GN
  render with a solid white core stripe; Thameslink/Gatwick Express are
  dashed).
- `MAP_CONFIG` — bounds and minimum zoom for the map.
- `MAP_STYLE` — Carto Positron no-labels by default. Any MapLibre-compatible
  style URL works.

## Settings panel (in-game)

Click the menu → **Settings**. Toggles for:

- Show empty markers for all stations (un-found station outline circles)
- Show found-station name labels
- Per-line enable/disable (disabled lines disappear from the map *and* the
  score denominator). Persisted to `localStorage`.

Also includes a **"Reveal every station"** button for previewing the
completed map.

## Credits

- Game design and code originally by **Benjamin Tran Dinh** — [metro-memory.com](https://github.com/benjamintd/metro-memory.com), MIT.
- This London-focused fork by **AJ Taggart**.
- Line geometry data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL.
- TfL Open Data acknowledged in the game's About modal.

## License

MIT, same as upstream. See `LICENSE.md`.

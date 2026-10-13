# London Rail Memory

A self-hosted memory game for the London rail network. Type station names from
memory; correct guesses light up on a real-geography MapLibre map.

The network: the **London Underground** (11 lines), **London Overground**
(6 lines), the **Elizabeth line**, the **DLR**, **London Trams**, the **Cable
Car**, **Heathrow Express**, **c2c**, and the National Rail operators
around London — **Thameslink**, **Great Northern**, **Southern**, **Gatwick
Express**, **South Western Railway**, **GWR**, **Chiltern**, **London
Northwestern**, **East Midlands Railway**, **Greater Anglia**, **Southeastern**,
and **Southeastern high speed**. Underground, Overground, Elizabeth line, DLR, Thameslink and the
Cable Car are on by default (`src/lib/defaultEnabledLines.ts`); Trams and the
other National Rail lines are toggled on from the line picker next to the legend.

**Scope** (`src/app/(game)/london/scope.ts`, spec
`docs/superpowers/specs/2026-10-12-network-coverage-and-matching-design.md` §3):
Greater London plus selected commuter destinations. Lines in `FULL_LINES` are
kept whole; every other line runs out to its `END_STATIONS` (e.g. Thameslink to
Bedford / Cambridge / Brighton / Gravesend, SWR to Reading / Guildford / Woking,
Greater Anglia to Chelmsford / Southend Victoria / Cambridge). Medway,
Basingstoke, Milton Keynes, Colchester and Tonbridge / Tunbridge Wells are out.
Trimming happens at build time — stations come only from the scoped service
tables and route geometry is clipped at the end stations — so nothing beyond
scope reaches the game.

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
- **TailwindCSS**; guess matching by a deterministic matcher in
  `src/lib/matching/` (normalisation incl. `jn`/`jct`/`junc` → junction,
  aliases, one-typo tolerance with GB station-name decoys: a real station
  name that is not in the game, typed exactly or near-exactly, is never
  accepted)
- **Vitest** unit + data tests (`npm test`)
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

```sh
npm test         # vitest: matcher unit tests, data tests (service tables, scope, ids), script tests
npm run lint
npx tsc --noEmit
```

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
      visibility.ts                # HIDDEN_LINES filter (server-side; scoped* for /london); legacy
                                   # DISPLAY_BOUNDS clip kept only for /newtracks*
      scope.ts                     # FULL_LINES, END_STATIONS, DRAWN_TO: the network scope (spec §3)
      services/                    # curated per-line service tables (stop lists) — source of truth
                                   # for which stations each line has
      interchanges.ts              # tags stations with lineCount / pie colours, clustered by location
      *.data.test.ts               # data tests: services vs features, ids, scope, matching goldens
      data/
        features.json             # station GeoJSON (Point per station-line pair), from build-stations.js
        station-ids.json          # append-only id ledger (every pair ever assigned + high-water mark)
        routes.osm.json           # pristine raw-OSM route source (unclipped)
        routes.gap-fills.json     # graph-routed gap fills merged into routes.osm.json
        routes.json               # ribbon geometry built from routes.osm.json (clipped to scope)
        aliases.ts, gb-station-names.json  # matcher aliases and decoy station names
        london-mask.json          # Greater London grey-out mask (+ city-of-london.json outline)
        stations-extras.json      # (legacy) National-Rail TOC stations from OSM
    (game)/lab/                    # /lab: experimental line-geometry variants (graph, levels,
                                   # morph) + lander; data/ built by scripts/lab/ (see "Lab")
  lib/matching/                    # the guess matcher (+ unit tests)
  components/                      # GamePage, LinePicker, Timer, FoundSummary, Input, SettingsModal, ...
scripts/                           # data pipeline + QA harness (see below)
wrangler.jsonc                     # Cloudflare static-assets deploy config
```

## Data pipeline

**Sources of truth.** The service tables (`services/<Line>.ts`) decide which
stations each line has; `scope.ts` decides how far each line runs.
`features.json` and `routes.json` are committed, human-reviewed build outputs.
`routes.osm.json` is the **pristine raw-OSM source** (chained per-branch
centrelines, double-track-averaged, platform/siding-stripped, no welds, NOT
clipped to scope) plus hand-routed branches (`src` tag) and graph-routed gap
fills. **Always build `routes.json` from `routes.osm.json`**, never from
`routes.json` itself (`build-ribbons` refuses already-processed input).

Full pipeline, in order (steps 1–4 only when the OSM data or line set changes;
`$D` = `src/app/(game)/london/data`, `$TMP` = any scratch dir):

```sh
# 1. stations: features.json from the service tables. Existing (name, line)
#    pairs keep id/coords; ids come from the append-only ledger station-ids.json
#    (a retired id is never reused); new stations take coords from a same-name
#    feature or the OSM station node (Overpass, cached via --osm-cache).
node scripts/build-stations.js [--osm-cache $TMP/osm-stations.json] [--dry-run] [--list-dropped]

# 2. re-fetch the OSM route relations of the changed lines only
node scripts/fetch-osm-routes.js --lines A,B,C \
  --out $TMP/fresh.osm.json --stations-out $TMP/fresh-stations.json

# 3. merge them in (relation features replaced, hand-routed `src` features kept,
#    old graph-routed fills of those lines dropped), then find stop pairs the
#    line's own geometry doesn't cover and route them over the OSM rail graph
node scripts/merge-osm-routes.js --base $D/routes.osm.json --fresh $TMP/fresh.osm.json \
  --lines A,B,C --out $TMP/merged-nogaps.osm.json
node scripts/route-over-rail-graph.js --in $TMP/merged-nogaps.osm.json \
  --features $D/features.json --lines A,B,C --out $TMP/gaps.json --cache $TMP/railtiles
#    review $TMP/gaps.json; keep the fills of OTHER lines from routes.gap-fills.json
#    and add these, then commit the result as $D/routes.gap-fills.json

# 4. final merge -> the committed source
node scripts/merge-osm-routes.js --base $D/routes.osm.json --fresh $TMP/fresh.osm.json \
  --lines A,B,C --gaps $D/routes.gap-fills.json --out $D/routes.osm.json

# 5. ribbons: clip to scope (clip-to-scope.js, built in) + parallel-ribbon geometry
node scripts/build-ribbons.js --in $D/routes.osm.json --out $D/routes.json

# 6. hand-curated marker co-location fixes (e.g. Farringdon Elizabeth -> Thameslink level)
node scripts/marker-overrides.js

# 7. verify
npm test && node scripts/qa-ribbons.js && node scripts/qa-ribbons-render.js
```

Reproducibility: every step after the fetch is deterministic and in the repo.
`merge-osm-routes.js` on the pre-Task-8 `routes.osm.json` (git `d2b8aa3`), the
Task-8 Overpass fetch and `routes.gap-fills.json` gives the committed file
byte-for-byte — but that fetch output was a scratch file and is not committed,
and Overpass data changes daily, so a fresh refetch gives a slightly different
source (review it like any refetch).
Overpass requests send `User-Agent: tube-memory-dev/0.1 (offline build)` and
reject responses whose `osm3s.timestamp_osm_base` is older than 24 h.

**Scope clip (`clip-to-scope.js`).** Run by `build-ribbons.js` on its input
(`--no-clip` to skip). For each `END_STATIONS` line it keeps the track along
the shortest path between every pair of consecutive stops of the line's
services (plus any `DRAWN_TO` stations; currently none), everything within 60 m
of that (parallel tracks), and diverging bypasses that rejoin the same stop
pair's path; tails beyond end stations, branches to out-of-scope places and
track no scoped service uses are dropped. `FULL_LINES` are untouched.
`scope.data.test.ts` checks that no line runs on beyond its end stations and
that everything lies inside `maxBounds`.

**`/newtracks`, `/newtracks2` (experimental; local untracked work, not in the repo).** They read a frozen copy of
main's stations, `newtracks/data/features.london-main.json` (=
`git show d2b8aa3:src/app/(game)/london/data/features.json`), not the rebuilt
London `features.json`, so their stations match their own unscoped
`routes.json` as before. They use London's matcher and the legacy default `config`
/ `visibleStationFeatures` / `visibleRouteFeatures` (old camera box and
render-time clip to `DISPLAY_BOUNDS`). Their routes are NOT clipped to scope:
when rebuilding them with `build-ribbons.js`, pass **`--no-clip`** to match the
old output (it would otherwise clip using the features.json next to `--in`).

**Obsolete scripts** (kept on disk, not part of the pipeline):
`transform-data.js` (superseded by `build-stations.js`), `rename-stations.js`
(its "London " prefix renames conflict with the service-table names, e.g.
"London Victoria"), and the one-off `merge-national-rail.js`,
`build-southern-*.js`, `build-extra-branches.js` (their output lives on in
`routes.osm.json` as `src`-tagged features).

**Interchange pies** (`interchanges.ts`) group markers by name + co-location
(`CLUSTER_M = 30 m`); same-platform lines (coincident in the data) share one
segmented pie, while a multi-platform station (Finsbury Park, Wimbledon,
Farringdon, …) shows a pie per platform and plain dots elsewhere.

**Parallel ribbons (`build-ribbons.js`).** Co-running lines (e.g.
Circle/District/H&C/Met on the subsurface trunk) must render as distinct,
correctly-ordered parallel ribbons. They come from different OSM ways and bow
up to ~60 m apart between shared stations, so a naive runtime `line-offset`
(perpendicular to each line's *own* tangent) makes them cross and flip across
zoom. `build-ribbons.js`:

0. **Cleans the raw input** per feature: `deSpike` drops near-reversal vertices
   (station-weld darts, e.g. the Oval hairpin); `deWeld` flattens station-weld
   *bulges* (the line pulled to a platform, e.g. Angel) while leaving sustained
   real curves (junctions) faithful; `collapseDoubling` removes a track an
   out-and-back OSM way traces twice (e.g. Piccadilly's Heathrow branch) while
   leaving genuine one-way loops (Heathrow T4, Circle) intact.
1. Detects shared **corridors** by first-come geometric snapping to **spines**
   (shared centrelines, laid lowest-`order`-first), then extends membership
   along runs of **≥2 consecutive shared station nodes** (`features.json`) — the
   robust co-running signal that survives the between-station bow. Stations are
   used for *detection only*; line geometry is never welded to them.
2. Orders each corridor's lines into **lanes** by config `order` (which yields
   the required cross-track ordering, e.g. Circle interior to the subsurface
   loop), centred on the corridor; the per-vertex lane is smoothed so it ramps
   (not steps) at junctions.

**Two output modes** (`--mode`, default `offset`):
- **`offset`** — every line is emitted on its shared corridor **centreline** with
  a signed `laneOff` property (split into segments where the lane changes). The
  map (`GamePage.tsx`) renders the separation at runtime with
  `line-offset = laneOff × line-width(zoom)`. Because co-runners share the
  centreline, the offset keeps them exactly parallel and never flips, and the
  separation is a **constant screen amount at every zoom** (so the lower line is
  never hidden when zoomed out, and the geometry stays on the true track).
- **`baked`** — the lane offset is baked into the coordinates (ground-units) and
  the map renders with `line-offset: 0`. Zoom-stable but the separation shrinks
  to sub-pixel at the overview zoom (co-runners overlap when zoomed out).

**Declarative cartography overrides** (top of `build-ribbons.js`, re-applied on
every build so they survive a TfL/OSM re-fetch):
- `ORDER_OVERRIDES` — force the cross-track order (screen top→bottom) of named
  lines near a point, e.g. Mile End = Central / H&C / District, Jubilee above
  Metropolitan, Suffragette below Victoria, Victoria below Northern at Euston.
  Drives both the local lane ranking and a sign assertion that flips the shared
  spine if rendered upside-down. An optional `axis: 'lng'` (default `'lat'`)
  orients that assertion east/west instead of north/south, for N–S corridors
  where the cross-track direction is longitude. Only binds lines that actually
  share a spine — lines on separate spines need `NO_SNAP` instead.
- `NO_SNAP` — keep a line out of bundles near a point so it rides its own smooth
  geometry (no offset) instead of the oscillating per-bin lane packing — e.g.
  Mildmay over West Hampstead / Brondesbury, and Thameslink along the whole
  St Pancras → New Southgate corridor (it shares almost no centreline with the
  Piccadilly/Victoria pair, so left to snap it S-weaved across them; held off,
  it rides its true National-Rail track while Piccadilly & Victoria stay bundled).
- `FORCE_SNAP` — the inverse of `NO_SNAP`: bind a line *onto* a corridor
  (`onto: 'Line'`, within `dist`), reassigning even a rival parallel spine, so it
  co-runs as a true lane member. Present but currently unused.
- `SPINE_ORDER` — override which line lays a corridor's shared centreline
  (spine-laying priority) without touching config `order` (lane rank/colour).
  Present but currently unused.
- `NUDGE` — a last-resort cosmetic lateral shift (metre vector, ramped) that does
  NOT use the corridor/lane mechanism; prefer the above. Present but unused.

Loops (Circle) and branches are preserved (a spine's own laying feature is
reconstructed by identity — no self-overlap projection — and offsets/lane ramp
to 0 where a branch leaves a trunk). All tunables are documented in the script's
`CONFIG`. `scripts/snap-markers.js` (Idea B) can snap station markers onto their
lines — kept as a utility, not part of the default pipeline. Verify with
`scripts/qa-ribbons.js` (scorecard; simulates the render in offset mode) and
`scripts/qa-ribbons-render.js` (PNG renders). The previous weld/Chaikin/
miter-offset pipeline is retired to `archive/scripts/` (do not reuse — it
corrupted the Circle loop).

## QA / verification

Headless WebGL was unreliable for verifying map changes, so:

```sh
npm test                                 # unit + data tests (vitest)
node scripts/qa-ribbons.js               # ribbon acceptance scorecard: per-line bbox/length
                                         # integrity vs the (scope-clipped) raw source, the §4 ordering
                                         # probes (no crossings, even spacing), Watford DC
node scripts/qa-ribbons-render.js [routes.json] [--views a,b]
                                         # browser-free SVG->PNG of the probe corridors and
                                         # scope ends (network, ebbsfleet, hitchin, ...) -> qa/out/
                                         # (draws lowest order first; eyeball ordering/parallelism)
node scripts/qa-render.js [london ...]   # Puppeteer screenshots of hotspots -> qa/out/
node scripts/qa-junctions.js [route]     # drives the in-app search to screenshot named junctions
```

(`qa/` output is gitignored.)

## Lab (experimental line geometry)

`/lab` lists experimental versions of the map; each is the full game (own saved
progress) with different line geometry, plus an on-map panel (zoom, active level,
overlap/crossing scorecard vs `/london`). `/london` is unaffected.

```sh
# track data (committed: scripts/lab/data/tracks.json.gz, OSM rail+subway+light_rail)
osmium tags-filter ... ; osmium merge ... ; osmium cat -f opl ...   # see fetch-lab-tracks.js header
node scripts/lab/fetch-lab-tracks.js --opl all-rail.opl --osm-base <timestamp>   # or no args: Overpass (slow)
node scripts/lab/build-lab-tracks.js      # route every service over the track graph, bundle at
                                          # 4 radii, build-ribbons per level, align levels, morph
                                          # data, scorecard -> src/app/(game)/lab/data/
node scripts/lab/build-lab-v2.js         # /lab/graph2..graph5 (surface lines routed, tube/DLR raw
                                          # centrelines, strata, tapers, exit-side + network lane
                                          # order, graph5 baked for map-scale sizing); run after
                                          # build-lab-tracks.js (merges into scores.json)
node scripts/lab/render.js <variant> <lng,lat> <zoom> [name] [WxH]   # browser-free PNG -> qa/out/lab/
                                          # env SIZE=map|staging (lab sizing), STATIONS=1 (markers + names)
```

`build-ribbons.js` gained lab-only options (`--config` JSON; `ORIENT_SPINES`,
`EMIT_SPINE`, `STRATA`, `EXIT_ORDER`, `GLOBAL_ORDER`, `NO_SNAP_DROP`), all off by
default, so the `/london` build is byte-identical.

Every lab page has a **Sizing** switch (`?size=`): `current`; `clamp` (line widths, lane gaps,
stripes and station circles at today's z12.4 size from z12.4 up, half that from
z11.4 down (= map scale there), linear in between; station markers keep
shrinking linearly below z11.4 to today's z6 size); `map` (sizes pinned to the map scale as at
z12.4, doubling per zoom level). Station label text is never resized. `/lab/graph5`
is built for, and always uses, `map`. `/lab/staging1` = Graph 4 with `clamp` from z11.4
in, switching (cross-fade ±0.25) to Graph 5 below z11.4 where everything scales with
the map (sizes are continuous at the switch).

## Configuration

- `config.ts` — `LINES` (name, colour, `backgroundColor`, `order`, optional
  `stripe: 'solid' | 'dashed'`), `MAP_CONFIG` (`center`/`zoom` default view and
  `maxBounds`, fitted to the scoped network + ~10%), `MAP_STYLE`, `MATCHING`
  (aliases, decoys).
- `scope.ts` — `FULL_LINES`, `END_STATIONS`, `DRAWN_TO`; `services/` — the
  per-line stop lists. Change these, then re-run the pipeline (steps 1 and 5).
- Saved progress (`london-stations`) is a list of feature ids; ids no longer
  in the data are ignored on load (`filterKnownIds`), and guesses / reveal-all
  never drop finds on disabled lines (`addFound`).
- Guess matching: one matcher over every station; each result is restricted to
  the enabled lines (`restrictToEnabled`), so grouped names (King's Cross /
  St Pancras) work in any line selection.
- `visibility.ts` — `HIDDEN_LINES` (fully removed lines) and `THAMESLINK_TRIM`.
- Default enabled lines live in `src/lib/defaultEnabledLines.ts`; bump the
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

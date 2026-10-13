# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

London Rail Memory: a fork of metro-memory.com covering the wider London rail network. Players type station names from memory, and correct guesses light up on a MapLibre map. Next.js 14 App Router, React 18, TypeScript, Tailwind, Vitest. `README.md` (Data pipeline section) and `STATUS.md` (current state, open issues, caveats) are the detailed references; read them before working on geometry.

## Commands

```sh
npm run dev      # http://localhost:3000 (/ redirects client-side to /london)
npm run build    # static export -> out/
npm run lint     # next lint
npm test         # vitest run: matcher unit tests, data tests, script tests (~40 s; the exhaustive typo test dominates)
npx tsc --noEmit
npx wrangler deploy   # deploy out/ to Cloudflare as Workers static assets
```

- **Never run `npm run build` while `npm run dev` is running.** They share `.next/`, and the build breaks the dev server until it is restarted.
- Tests: `src/lib/matching/*.test.ts` (matcher), `src/app/(game)/london/*.data.test.ts` (service tables vs features.json, id ledger, scope trim, matching goldens), `scripts/*.test.ts` (pipeline helpers). Geometry is also checked with the QA scripts below, whose output goes to the gitignored `qa/out/`.
- TypeScript targets es6: use `Array.from(...)`, not `for..of`, over a Map/Set.
- Prettier uses `prettier-plugin-tailwindcss` (`prettier.config.js`).

## Architecture

**Static export only.** `next.config.mjs` sets `output: 'export'`, so server-only features (server `redirect()`, route handlers, dynamic server rendering) are unavailable. `src/app/page.tsx` redirects on the client for this reason.

**Per-city routes under `src/app/(game)/<city>/`.** Each route's `page.tsx` imports its own static JSON data at build time. It filters the data through `visibility.ts` (`/london`: `scopedStationFeatures`/`scopedRouteFeatures`, `HIDDEN_LINES` only, since scope trimming is done at build time; the old `visibleStationFeatures`/`visibleRouteFeatures` still clip to the legacy `DISPLAY_BOUNDS` box and exist only for the newtracks pages) and annotates interchanges (`interchanges.ts`). It then passes `fc` (stations) and `routes` (line geometry) into the shared `src/components/GamePage.tsx`, with the config supplied via `src/lib/configContext.tsx`. Filtering happens on the server side, so hidden services never reach the client.
- `london/` is the main game. `config.ts` holds `LINES` (colour, `order`, optional `stripe`), `MAP_CONFIG` (`maxBounds` fitted to the scoped network) and `MAP_STYLE`. `/london` uses the named `londonConfig`; the default `config` export is `@deprecated` (legacy camera box `DISPLAY_BOUNDS`, for the newtracks pages only).
- **Sources of truth:** `london/services/<Line>.ts` (per-line service stop lists) decide which stations each line has; `london/scope.ts` (`FULL_LINES`, `END_STATIONS`, `DRAWN_TO`) decides how far each line runs. Change these and re-run the pipeline; don't hand-edit features.json membership.
- **Matcher:** `src/lib/matching/` (normalise, aliases from `london/data/aliases.ts`, one-typo tolerance, GB station names as decoys via `config.MATCHING`: an exact decoy name is always `none`, and a typo near a decoy is never accepted; `jn`/`jct`/`junc` normalise to "junction"). GamePage builds it once over ALL stations and restricts each result to enabled lines (`restrictToEnabled`); never build it over enabled stations only (breaks curated groups like King's Cross / St Pancras).
- `lab/` is the experimental line-geometry lab (`/lab` lander, kept live in production; `/lab/graph`, `/lab/levels`, `/lab/morph`). Its data comes from `scripts/lab/build-lab-tracks.js` (routes over the OSM track graph in `scripts/lab/data/tracks.json.gz`, then `build-ribbons.js` with lab-only `--config`); GamePage's optional `routeLevels` / `morph` / `onMap` props exist only for it. README "Lab" has the commands.
- `newtracks/` and `newtracks2/` are experimental variants (untracked user work: don't edit). They read a frozen copy of main's stations (`newtracks/data/features.london-main.json`, not the rebuilt london features.json) and reuse the legacy default config, the legacy visibility functions and interchanges, but have their own `routes.json`, built by `scripts/build-newtracks*.js`, which re-routes National Rail and Overground lines over a shared OSM rail graph. They override only `CITY_NAME`, so their localStorage state stays separate.

**`GamePage.tsx` is the map and game core** (~1000 lines). It owns the MapLibre layers, the guess/found state and the settings. All persisted state uses `useLocalStorageValue` with keys prefixed `${CITY_NAME}-`. When you change the default enabled lines (`defaultEnabled`) or the stored format, bump the version in the `${CITY_NAME}-enabled-lines-vN` key (currently v7; defaults in `src/lib/defaultEnabledLines.ts`: all TfL + Thameslink + Cable Car). Found progress is a list of feature ids; ids not in the data are dropped on load (`filterKnownIds`), and `build-stations.js` never reuses a retired id (ledger `data/station-ids.json`).

**Line rendering model (offset mode).** Co-running lines in `routes.json` share one corridor centreline and carry a signed `laneOff`. `GamePage` separates them at render time with `line-offset = laneOff × line-width(zoom)`. This keeps the ribbons parallel at every zoom and stops them flipping. Do not add per-line offsets on each line's own geometry, because that brings back the crossing and flipping bug. Layers are drawn in per-category z-bands, bottom to top: Thameslink/National Rail, Overground, DLR, Elizabeth, Underground. Each band is a base line plus its white-stripe layers.

**Interchange markers.** `interchanges.ts` clusters station markers by name and by location within `CLUSTER_M = 30 m`. Lines that share a platform get one segmented pie. A station with several platforms gets one pie per platform.

## Data pipeline (`scripts/`, plain Node CommonJS)

- `data/routes.osm.json` is the **pristine raw-OSM source** (unclipped; plus `src`-tagged hand-routed branches and graph-routed gap fills from `data/routes.gap-fills.json`). `routes.json` and `features.json` are committed, human-reviewed build outputs.
- **Always build `routes.json` from `routes.osm.json`, never from `routes.json`.** `build-ribbons.js` refuses input that has already been processed. It clips the trimmed lines to scope first (`clip-to-scope.js`); pass `--no-clip` for diagnostics and when rebuilding the newtracks routes.
- Full order (README "Data pipeline" has the exact commands): `build-stations.js` (features.json from services + id ledger) → [only on refetch: `fetch-osm-routes.js --lines …` → `merge-osm-routes.js` → `route-over-rail-graph.js` → update `routes.gap-fills.json` → `merge-osm-routes.js --gaps …`] → `build-ribbons.js` → `marker-overrides.js` → `npm test` + QA.

```sh
node scripts/build-stations.js [--osm-cache FILE] [--dry-run]
node scripts/build-ribbons.js --in "src/app/(game)/london/data/routes.osm.json" \
  --out "src/app/(game)/london/data/routes.json"                        # default --mode offset
node scripts/marker-overrides.js   # hand-curated marker co-location fixes
```

- **Obsolete, do not run:** `transform-data.js` (superseded by `build-stations.js`) and `rename-stations.js` (its "London " prefix renames conflict with the service-table names). Overpass calls must send `User-Agent: tube-memory-dev/0.1 (offline build)` (the scripts do; ad-hoc requests also need `Accept: */*`); responses with a stale `osm3s.timestamp_osm_base` are rejected.

- **Cartography fixes are declarative overrides near the top of `build-ribbons.js`.** They are re-applied on every build, so they survive a data re-fetch. Prefer them to hand-editing `routes.json`:
  - `ORDER_OVERRIDES` forces lane order near a point. Options are `axis: 'lat'|'lng'` and `noFlip`.
  - `NO_SNAP` keeps a line out of bundles.
  - `FORCE_SNAP` binds a line onto a corridor.
  - `SPINE_ORDER` and `NUDGE` are a last resort and currently unused.
- Lane order within a corridor comes from config `order`. For example, Circle < District < H&C < Met is what places Circle on the inside of the subsurface loop.
- The previous weld/Chaikin/miter-offset pipeline has been retired to the gitignored `archive/`. Do not revive it, because it corrupted the Circle loop. `PARALLEL-RIBBONS-BRIEF.md` explains why, and `RIBBONS-VERIFICATION.md` covers acceptance.
- `build-ribbons.js` is deterministic (same input gives a byte-identical `routes.json`), but any input change (clip, refetch, features.json) shifts nearby ribbon geometry slightly; compare unchanged lines against a control build.

## QA / verification

Headless WebGL is unreliable for checking map changes, so use these scripts:

```sh
node scripts/qa-ribbons.js              # scorecard: per-line integrity vs the scope-clipped raw source, ordering probes, crossings
node scripts/qa-ribbons-render.js [routes.json] [--views a,b]  # browser-free SVG->PNG renders of probe corridors + scope ends -> qa/out/
node scripts/qa-render.js [london ...]  # Puppeteer screenshots of hotspots (needs dev server)
node scripts/qa-junctions.js [route]    # screenshots named junctions via in-app search
```

## Project docs

Design specs live in `docs/superpowers/specs/`. Update `STATUS.md` when you finish significant work, since it tracks the latest changes, open issues (#16–#18) and caveats.

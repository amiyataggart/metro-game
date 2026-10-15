# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

London Rail Memory: a fork of metro-memory.com covering the wider London rail network. Players type station names from memory, and correct guesses light up on a MapLibre map. Next.js 14 App Router, React 18, TypeScript, Tailwind, Vitest. `README.md` (Data pipeline and Lab sections) and `STATUS.md` (current state, open issues, caveats, dated log of geometry work) are the detailed references; read them before working on geometry.

## Working with the owner (preferences and workflow)

- **Flow:** work on a branch, open a PR into `dev`, then merge it yourself (`gh pr create --base dev`, `gh pr merge --merge`) so the owner can see it on dev.metro.amiyajames.com (Cloudflare deploys `dev`). Never merge `dev` into `main` unless asked. Commit only when asked or when this flow applies. End commits/PRs with the attribution lines the harness gives you.
- **Show, don't tell.** For anything visual, render close-up screenshots and show them (and send them to the owner with SendUserFile when they ask to see). Zoom in further when in doubt: issues hide at z14 that are obvious at z16–17. Compare against the previous maps (`/old1`, `/old2`) side by side, ideally with the real OSM tracks drawn underneath (`TRACKS=1`). Keep taking and checking screenshots while iterating.
- **Judge by how it looks, not by scores.** The lab overlap/crossing scorecard is only a hint of where to look. A better-looking result may score worse (true-to-track tunnels under surface lines count as "overlap"); that is fine. Never revert a visual improvement because a number got worse.
- **Find root causes, don't patch.** The owner explicitly prefers understanding why an artefact happens and fixing the general cause (which fixes many places at once) over point patches. Before adding a special case, explain the mechanism; prefer a pipeline rule over a coordinate override.
- **The map before Staging 3 (now `/old1`) is the quality bar.** Lab output must be at least as good as it everywhere when zoomed in. Where `/london` "nails it" (e.g. West Kensington), copying its approach is legitimate. Keep `/london`'s build byte-identical unless the owner asks to change it: every lab option in `build-ribbons.js` is off by default; verify with a control build + `cmp` (see below).
- **Lines should follow their real tracks** when zoomed in, and only merge where they really share track (e.g. GN's Moorgate branch keeps its own curve round Arsenal until it joins the main line; HS1 stays on its own tracks out of St Pancras; the deep Jubilee is not snapped onto the Waterloo East viaduct).
- **Don't touch the owner's untracked work:** `scripts/build-newtracks*.js`, `src/app/(game)/newtracks*/`.
- **Never run `npm run build` while `npm run dev` is running** (shared `.next/`). A dev server is often running on :3000; use it for browser checks.
- Don't change the live game's (`/play`) sizing or behaviour without being asked; experiments go in `/lab` (dev only), then get promoted when the owner approves.
- **Divide and conquer.** The owner wants work split: run independent pieces in parallel (background subagents on separate folders/files, while you do another part yourself), give each agent an exact brief (files it may touch, rules: no commits, no `next build`, don't start/stop the dev server, verify with screenshots) and check its screenshots yourself before merging. Shared pieces go in one component both sides import (e.g. `PlayLearnSwitch.tsx`).
- **When the owner says "merge to main" or "don't bother checking", do exactly that** (PR `dev` → `main`, merge with `gh pr merge <number> --merge`: a bare `gh pr merge` targets the current branch's PR). `main` was last merged from `dev` on 2026-10-15 (PR #44).
- **Owner's UI taste (Play/Learn):** TfL-style roundels whose ring fills as the line is completed (exactly as `lib/roundel.ts`, no faint full ring); pill (`rounded-full`) station input; line names regular weight; no hover-to-highlight on the map; no redundant progress bars; plain white (light) / black (dark) grounds, no paper/sepia tints; in dark mode the Northern line is white (Night Tube map) and white stripe cores turn black; station names full black/white text; line groups exactly "Underground", "Overground", "Thameslink, Elizabeth & More" (Thameslink, Elizabeth line, DLR, London Trams, London Cable Car, in that order), "National Rail"; percentages count each station once (not once per line).

## Commands

```sh
npm run dev      # http://localhost:3000 (/ and /london redirect client-side to /play)
npm run build    # static export -> out/
npm run lint     # next lint
npm test         # vitest run: matcher unit tests, data tests, script tests (~40 s; the exhaustive typo test dominates)
npx tsc --noEmit
npx wrangler deploy   # deploy out/ to Cloudflare as Workers static assets
```

- Tests: `src/lib/matching/*.test.ts` (matcher), `src/app/(game)/london/*.data.test.ts` (service tables vs features.json, id ledger, scope trim, matching goldens), `scripts/*.test.ts` (pipeline helpers). Geometry is also checked with the QA scripts below, whose output goes to the gitignored `qa/out/`.
- TypeScript targets es6: use `Array.from(...)`, not `for..of`, over a Map/Set.
- Prettier uses `prettier-plugin-tailwindcss` (`prettier.config.js`).
- If `tsc` complains about `.next/types/...` for a page that no longer exists (left by the dev server from another branch), delete that `.next/types` folder.
- zsh does not word-split unquoted `$var`; pass multi-argument commands explicitly, not via one variable.

## Architecture

**Static export only.** `next.config.mjs` sets `output: 'export'`, so server-only features (server `redirect()`, route handlers, dynamic server rendering) are unavailable. `src/app/page.tsx` redirects on the client for this reason.

**Site routes (Oct 2026).** `/play` is the game in the Key layout (`play/page.tsx` + `PlayGame.tsx`, which passes the Key shell from `lab/ui/shells/key/` to `GamePage`); `/learn` is line learning (`learn/page.tsx` renders `lab/learn/Learn.tsx`: route strips, all-branch diagrams, Test). Both keep `CITY_NAME` `london`, so progress from the old `/london` carries over; `/learn` only reads `london-stations`. They link to each other with `lab/ui/PlayLearnSwitch.tsx`. `/london` and `/` redirect client-side to `/play`. Archives: `/old2` = the Oct 2026 `/london` page (Classic layout, same save as `/play`), `/old1` = the map before Staging 3 (own save). The `london/` folder still holds the data, config, services and tests. Code under `lab/` that real pages import is ordinary code (only `page.lab.tsx` files are dropped on main), so changing it changes `/play` and `/learn` too.

**Per-city routes under `src/app/(game)/<city>/`.** Each route's `page.tsx` imports its own static JSON data at build time. It filters the data through `visibility.ts` (`/london`: `scopedStationFeatures`/`scopedRouteFeatures`, `HIDDEN_LINES` only, since scope trimming is done at build time; the old `visibleStationFeatures`/`visibleRouteFeatures` still clip to the legacy `DISPLAY_BOUNDS` box and exist only for the newtracks pages) and annotates interchanges (`interchanges.ts`). It then passes `fc` (stations) and `routes` (line geometry) into the shared `src/components/GamePage.tsx`, with the config supplied via `src/lib/configContext.tsx`.
- **The game's line geometry (since Oct 2026) is the promoted lab Staging 3**: `play/page.tsx` (and `old2/page.tsx`) pass `routeLevels` (Graph 5 below z11.4, Graph 7 from z11.4) pointing at frozen packed files in `public/london-data/`, plus the staging `sizing`. `london/data/routes.json` (build-ribbons output) is now only used by `/old1` (the previous map, own saved progress, `CITY_NAME` `london-old-oct-26`) and as the lab's comparison baseline. To update the game's geometry: change the lab pipeline, rebuild (`build-lab-v2.js`, `pack-staging.js`), check `/lab/staging3` with close-ups, then copy `public/lab-data/staging3/graph{5,7}.json` to `public/london-data/`.
- `london/` is the main game. `config.ts` holds `LINES` (colour, `order`, optional `stripe`), `MAP_CONFIG` (`maxBounds` fitted to the scoped network; opening zoom 12.4, min zoom 6) and `MAP_STYLE`. `/london` uses the named `londonConfig`; the default `config` export is `@deprecated` (legacy camera box `DISPLAY_BOUNDS`, for the newtracks pages only).
- **Sources of truth:** `london/services/<Line>.ts` (per-line service stop lists) decide which stations each line has; `london/scope.ts` (`FULL_LINES`, `END_STATIONS`, `DRAWN_TO`) decides how far each line runs. Change these and re-run the pipeline; don't hand-edit features.json membership.
- **Matcher:** `src/lib/matching/` (normalise, aliases from `london/data/aliases.ts`, one-typo tolerance, GB station names as decoys via `config.MATCHING`: an exact decoy name is always `none`, and a typo near a decoy is never accepted; `jn`/`jct`/`junc` normalise to "junction"). GamePage builds it once over ALL stations and restricts each result to enabled lines (`restrictToEnabled`); never build it over enabled stations only (breaks curated groups like King's Cross / St Pancras).
- `lab/` is the line-geometry lab: see "Lab" below.
- `newtracks/` and `newtracks2/` are experimental variants (untracked owner work: don't edit). They read a frozen copy of main's stations and have their own `routes.json` built by `scripts/build-newtracks*.js`.

**`GamePage.tsx` is the map and game core** (~1100 lines). It owns the MapLibre layers, the guess/found state and the settings. All persisted state uses `useLocalStorageValue` with keys prefixed `${CITY_NAME}-`. When you change the default enabled lines (`defaultEnabled`) or the stored format, bump the version in the `${CITY_NAME}-enabled-lines-vN` key (currently v7; defaults in `src/lib/defaultEnabledLines.ts`: all TfL + Thameslink + Cable Car, so National Rail lines start OFF on a fresh page: turn them on to review NR geometry). Found progress is a list of feature ids; ids not in the data are dropped on load (`filterKnownIds`), and `build-stations.js` never reuses a retired id (ledger `data/station-ids.json`). Lab-only props: `routeLevels` (several geometry sets by zoom, each `routes` either GeoJSON or a URL fetched by MapLibre's worker, optional `source` tiling options), `morph`, `onMap`, `sizing` (`LabSizing`: `map` = sizes pinned to the map scale; `clamp` = half the z12.4 size at z11.4 growing linearly to full at z12.4, held outside, optional `stationFloor`, optional `mapBelow` = map scale below `min`).

**Line rendering model (offset mode).** Co-running lines share one corridor centreline and carry a signed `laneOff`. `GamePage` separates them at render time with `line-offset = laneOff × line-width(zoom)`. This keeps the ribbons parallel at every zoom and stops them flipping. Do not add per-line offsets on each line's own geometry (it brings back crossing/flipping), except the lab's Graph 5, which bakes offsets in metres because its sizing is pinned to the map scale. Layers are drawn in per-category z-bands, bottom to top: Thameslink/National Rail, Overground, DLR, Elizabeth, Underground. Each band is a base line plus its white-stripe layers.

**Sizes on `/london`** (zoom-interpolated): line width ~3.0/4.0/4.8/5.7/7.1 px at z9/11/12.4/14/16 (lane gap = 1 width, stripe = ⅓ width), unfound station radius 1.8/4.4/6.0/7.5/9.6, labels 12–14 px (hidden below z11). Stations grow ~6.5× from z9 to z18 while lines grow ~2.8×.

**Interchange markers.** `interchanges.ts` clusters station markers by name and by location within `CLUSTER_M = 30 m`. Lines that share a platform get one segmented pie. A station with several platforms gets one pie per platform.

## Data pipeline (`scripts/`, plain Node CommonJS)

- `data/routes.osm.json` is the **pristine raw-OSM source** (unclipped; plus `src`-tagged hand-routed branches and graph-routed gap fills from `data/routes.gap-fills.json`). `routes.json` and `features.json` are committed, human-reviewed build outputs.
- **Always build `routes.json` from `routes.osm.json`, never from `routes.json`.** `build-ribbons.js` refuses input that has already been processed. It clips the trimmed lines to scope first (`clip-to-scope.js`); pass `--no-clip` for diagnostics and for lab/newtracks inputs.
- Full order (README "Data pipeline" has the exact commands): `build-stations.js` → [only on refetch: `fetch-osm-routes.js --lines …` → `merge-osm-routes.js` → `route-over-rail-graph.js` → update `routes.gap-fills.json` → `merge-osm-routes.js --gaps …`] → `build-ribbons.js` → `marker-overrides.js` → `npm test` + QA.

```sh
node scripts/build-stations.js [--osm-cache FILE] [--dry-run]
node scripts/build-ribbons.js --in "src/app/(game)/london/data/routes.osm.json" \
  --out "src/app/(game)/london/data/routes.json"                        # default --mode offset
node scripts/marker-overrides.js   # hand-curated marker co-location fixes
# /london must stay byte-identical after any build-ribbons change:
node scripts/build-ribbons.js --in "src/app/(game)/london/data/routes.osm.json" --out /tmp/x.json && cmp /tmp/x.json "src/app/(game)/london/data/routes.json"
```

- **Obsolete, do not run:** `transform-data.js` and `rename-stations.js`. Overpass calls must send `User-Agent: tube-memory-dev/0.1 (offline build)` (ad-hoc requests also need `Accept: */*`); responses with a stale `osm3s.timestamp_osm_base` are rejected.
- **Cartography fixes are declarative overrides near the top of `build-ribbons.js`**, re-applied on every build: `ORDER_OVERRIDES` (lane order near a point; `axis`, `noFlip`), `NO_SNAP` (keep a line out of bundles), `FORCE_SNAP` (bind onto a corridor), `SPINE_ORDER`/`NUDGE` (unused). Lane order within a corridor otherwise comes from config `order` (Circle < District < H&C < Met puts Circle inside the subsurface loop).
- The old weld/Chaikin/miter-offset pipeline is retired to the gitignored `archive/`; do not revive it (`PARALLEL-RIBBONS-BRIEF.md`, `RIBBONS-VERIFICATION.md`).
- `build-ribbons.js` is deterministic, but any input change shifts nearby ribbon geometry slightly; compare unchanged lines against a control build.

## Lab (`/lab`, experimental line geometry)

`/lab` is a lander listing variants, **built only off `main`** (dev and local; the owner's choice, Oct 2026): lab routes are named `page.lab.tsx`, which `next.config.mjs` treats as pages only when `scripts/lab-enabled.mjs` says so (branch from `WORKERS_CI_BRANCH` or git; `LAB=1`/`LAB=0` override), and `npm run build` then drops `out/lab-data` via `scripts/strip-lab.mjs`. New lab pages must be `page.lab.tsx`. Each variant is the full game with its own saved state (`CITY_NAME` `lab-<slug>`) plus a panel (zoom, active level, sizing switch, scorecard vs `/london`). Current best: **Staging 3** (`/lab/staging3`) = Graph 7 from z11.4 in with clamped sizing, Graph 5 (map-scale sizing, baked offsets) below z11.4; **Staging 3 · true track** (`/lab/staging3t`) adds Graph 7T from z13.5. Staging pages load packed line data from `public/lab-data/staging3/` (URL sources parsed in MapLibre's worker; the panel doesn't re-render the game per zoom frame). Older variants (graph, levels, morph, graph2–5, staging1) are kept for comparison.

**Build (after any geometry change):**

```sh
node scripts/lab/fetch-lab-tracks.js --opl all-rail.opl --osm-base <ts>  # only to refresh OSM tracks (Geofabrik extract + osmium; see header)
node scripts/lab/build-lab-tracks.js   # v1 variants (graph/levels/morph), slow; rarely needed
node scripts/lab/build-lab-v2.js       # graph2..graph7, graph7t; [--only graph7,graph7t]; ~2 min
node scripts/lab/pack-staging.js       # pack graph5/graph7/graph7t -> public/lab-data/staging3/
```

`build-lab-v2.js` experiments: `VX='{"id":"g7x","from":"graph7","d":0,"ribbon":{...}}' node scripts/lab/build-lab-v2.js --only g7x` builds a throwaway variant (then `git checkout` scores.json/v2.json and delete the routes file). `DEBUG_AT=lng,lat` prints base pieces near a point.

**QA tools (use them constantly):**

```sh
SIZE=staging STATIONS=1 TRACKS=1 node scripts/lab/render.js graph7 <lng,lat> <zoom> [name] [WxH]  # one close-up PNG
TRACKS=1 node scripts/lab/compare.js <name> london,graph7 16 "lng,lat:label" ...  # side-by-side sheet -> qa/out/lab/cmp-<name>.png
TRACKS=1 node scripts/lab/find-kinks.js graph7 --sheet 27   # network-wide detector (kinks, loose ends, doubled lines) + contact sheets
```

`render.js` env: `SIZE=staging|map` (sizing as the staging pages), `STATIONS=1` (markers + names), `TRACKS=1` (real OSM tracks underneath, tunnels dashed). The detector's "double" count is noisy (`/london` scores ~2000); read the sheets.

**Model (Graph 7):**
1. Surface lines (National Rail, Overground, Elizabeth, Thameslink) are routed stop-to-stop over the real OSM track graph (`scripts/lab/data/tracks.json.gz`) with an A* penalised off the line's own raw geometry, termini extended into the platforms. Tube + DLR use their raw OSM centrelines (scope-clipped), with repeated per-branch/direction stretches removed at source (`dropDuplicateRaw`).
2. Every point carries a stratum (`surface`, `tunnel-rail`, `tunnel-subway`, `tunnel-light`) from the OSM tracks under it; lines are NOT split at portals (`sts` per point; `build-ribbons` reads `props.st` per vertex).
3. Same-line copies are merged (pull + dedupe: 12 m on the surface, 30 m between tunnel points: twin bores), then a 35 m pre-bundling pull between different surface lines (`bundle2`, smoothed along whole chains of a line's pieces), then `build-ribbons` with lab options, then laneOff tapers across feature boundaries.
4. `build-ribbons` lab options (all off by default): `STRATA` (+ per-vertex strata), `STRATA_TUBE` (Underground lines bundle with each other across surface/tube tunnel), `WIDE_LINES`/`D_WIDE`/`D2_WIDE` (tube/DLR snapped with /london's 34 m / 130 m radii, per pair), `D_XSTRATA` (tube vs non-tube in different strata only when already within 15 m: Victoria/Piccadilly under Great Northern at Finsbury Park), `RAIL_TUNNEL_TUBE` (Elizabeth tunnels bundle with tube, as /london), `SOLO_LINES` (SoutheasternHighSpeed only bundles with itself), `WIDE_STATIC_ORDER` (tube corridors keep /london's static lane order), `EXIT_ORDER` + `GLOBAL_ORDER` (surface corridors: diverging lines peel off the outside; lane order consistent across corridors), `ORIENT_SPINES`, `NO_SNAP_DROP` (Thameslink's 5 km rule north of King's Cross is redundant with strata), `ANG_COS_TIGHT`, `EMIT_SPINE`.

**Root causes found so far (don't reintroduce):**
- Tight snapping (12 m) applied to raw tube centrelines: they need /london's loose snap (West Kensington, Camden, Neasden). Tight snap is right only for precise routed track.
- Bundling across tunnel/surface pulled the deep Jubilee onto the Waterloo East viaduct; but forbidding it entirely hid the Victoria/Piccadilly under Great Northern at Finsbury Park and made the Elizabeth line flicker at Barbican: see the per-pair strata rules above.
- Splitting a line at tunnel portals created gaps and Vs at joints (HS1 at York Way, GN at Drayton Park). Pinning every piece end during the pre-bundling pull did the same.
- A same-line dedupe or pull that is too wide merges separate routes of one line early (GN Moorgate branch) or treats a shallow crossing as a duplicate; too narrow leaves twin tunnel bores as two crossing lines (Elizabeth west of Whitechapel).
- Lines routed over different parallel tracks by different services were drawn twice side by side (Southern): same-line dedupe.
- EXIT/GLOBAL lane ordering flips lanes along tube corridors (Barbican): tube corridors use the static order.
- One geometry serves every zoom from z11.4 in, so neighbouring tracks are bundled even at z16 (a line is ~43 m wide at z12.4 but ~11 m at z14+). Staging 3 · true track is the experiment for showing real tracks when zoomed in.

**`/lab/ui` (page layouts) and `/lab/lines` (line diagrams).** `/lab/ui/<slug>` runs the real `/london` game inside an alternative layout: `GamePage` takes an optional `Shell` (`GameShellProps`: all game state plus `mapSlot`, the map container to render once); `/london` passes none. Shells live in `lab/ui/shells/<slug>/`, are registered in `lab/ui/uiVariants.ts` + `UiLab.tsx`, and share one saved game (`CITY_NAME` `lab-ui`). The Key shell was promoted to `/play`, the Learn page (`/lab/learn`) to `/learn` (see "Play and Learn"). `/lab/lines/<slug>` are standalone line-diagram demos (carriage strip, whole-line, next stops + Line Run practice, stopping patterns) built from `london/services/` via `lab/lines/lineData.ts`; they only read `/london`'s save (`london-stations`). Never name a file `layout.ts`/`page.ts`/`loading.ts` etc. inside `src/app` unless it is meant to be that Next special file (`pageExtensions` includes `ts`): a stray `layout.ts` broke routes until the dev server restarted.

**Performance:** zoom jank on the lab pages (6× CPU-throttled Chrome: ~74 fps vs `/london` 104) comes from the main thread receiving heavier worker tile results; packing/static files cut page weight (HTML 7.5 MB -> 0.5 MB) but not the jank. Not yet solved.

## QA / verification (`/london`)

Headless WebGL in this environment does render (Playwright MCP), but prefer the browser-free renders for geometry:

```sh
node scripts/qa-ribbons.js              # scorecard: per-line integrity vs the scope-clipped raw source, ordering probes, crossings
node scripts/qa-ribbons-render.js [routes.json] [--views a,b]  # SVG->PNG renders of probe corridors + scope ends -> qa/out/
node scripts/qa-render.js [london ...]  # Puppeteer screenshots of hotspots (needs dev server)
node scripts/qa-junctions.js [route]    # screenshots named junctions via in-app search
```

## Play and Learn (the live site, Oct 2026)

**`/play`** (`src/app/(game)/play/`): `page.tsx` builds the same data as `/old2` (stations, `routeLevels` from `public/london-data/`, staging `sizing`) and `PlayGame.tsx` renders `GamePage` with `Shell={Key}`. The Key shell lives in `src/app/(game)/lab/ui/shells/key/` (it grew out of the `/lab/ui` layout experiments; real pages import it, so edits there change `/play`):
- `Key.tsx`: layout (desktop sidebar + collapsed "spine"; phone bottom dock + sheet), header (the whole header box collapses the sidebar; "London Rail Memory" + `PlayLearnSwitch` + arrow; clicks inside `button, a, nav` don't collapse), feedback toasts, first-run hint, About modal, theme (`london-theme` in localStorage).
- `KeyBody.tsx`: line groups and rows (roundel `KeyRoundel` + name + found/total; click toggles the line in play), group headers, Recent list, the MAP `Clean | Dots` slider (`showAllStations`; found names always shown) and `ThemeButton`, Timer/About/Reveal all/Start over.
- `groups.ts`: the owner's four groups (also used by Learn and the lab line diagrams). `parts.tsx`: `KeyRoundel`, `uiLine` (dark-mode colours: Northern white, other near-black lines light grey, white stripe cores black), chips.
- `useMapTheme.ts`: dark mode recolours the Carto basemap at runtime (background + vector layers only; originals saved and restored exactly), swaps white stripe cores in the `*-stripe-*` layers to black, the Northern line to white in the lines/markers `match` expressions, and the station-label colours. **Label colours must keep GamePage's `case found → colour, else transparent` rule** (a constant colour revealed unfound names once).
- Overall % and group totals count unique station names among lines in play; per-line rows count per line.

**`/learn`** (`src/app/(game)/learn/page.tsx` renders `src/app/(game)/lab/learn/Learn.tsx` with `learnData()` from `lab/learn/data.ts`): a Key-style sidebar (no progress numbers; full roundels; the selected line opens to list its routes; "All lines" only when the line really branches, decided in `routes.ts`: services that are a reversal or a contiguous sub-run of another don't count) and two tabs:
- **Route** (`Route.tsx`): one route = the carriage strip imported from `lab/lines/strip/StripDiagram.tsx` (horizontal on desktop, vertical list on phones); "All lines" = the whole line's branches (`Branches.tsx`, layout from `lab/lines/branches/graphLayout.ts`, drawn in the strip's style) on desktop, and the vertical "Next stops" diagram (`lab/learn/Diagram.tsx` + `lab/lines/vertical/graph.ts`) on phones.
- **Test** (`TestStrip.tsx`): the strip with numbered blanks filled stop by stop (matcher, hints, Show, "N stops further on", summary, best results in `london-learn-practice-v1`; prefs `london-learn-prefs-v1`). The current blank and Show-revealed stops are styled with CSS aimed at the strip's own markup (`aria-label="Hidden station N"`, phone `ol>li`), so if `StripDiagram.tsx` markup changes, update `TestStrip.tsx`/`Route.tsx`. The correct-answer animation (marker pop, name slide) is played with Web Animations in an effect, not a CSS rule (the strip re-renders during a run and restarted CSS animations, leaving the stop invisible).
- Browse (the old vertical view) is archived in `lab/learn/archive/LearnWithBrowse.tsx` (unused). URL hash: `#line=Northern&mode=route|test&svc=…&flip=1`.
- Learn reads `london-stations` (the game's progress) and never writes it.

**Vertical diagram layout (`lab/lines/vertical/graph.ts`)**, used by `/learn` (phones, All lines) and `/lab/lines/vertical`. Rows = stations, lanes = columns. Rules worked out with the owner: stations sit on the outermost lane at their row, next to their names (a piece running past a row without a station goes inside the piece that has the station; mutual cases by majority); shortest continuation first at a split (a branch goes after its junction's shorter dead-end rest; of two routes between the same stations the shorter first), with each such move re-checked once the order is complete and vetoed if the skipped side ended up longer; the trunk is cut only where shortest-first needs it and its sections never claim the lane below them; branches are cut at junction stations and each stretch hugs the left (innermost free lane unless staying put crosses fewer lanes). Each line is laid out with and without shortest-first and the full trunk split, and `layoutScore` (boxed-in stations + 2 × lane crossings) picks the result, shortest-first preferred on ties. Termini are stations with one drawn neighbour. **Check every line after changing it:** `node scripts/lab/next-stops-audit.mts` (per-line boxed stations, lanes, score) plus screenshots; the owner approved the Underground, Overground and Elizabeth layouts, so diff their drawings before/after.

**Promoting more lab work:** real pages import lab code directly (only `page.lab.tsx` files are excluded on `main`). Verify a `main`-style build with the lab off from a copy of the tree (the dev server shares `.next/`): rsync the repo to a scratch dir (excluding `node_modules`, `.next`, `out`, `.git`, the untracked newtracks files), symlink `node_modules`, run `LAB=0 npm run build`, check the route list.

## Picking up this work

State on 2026-10-15: everything above is merged to `main` (live at metro.amiyajames.com) and `dev` (dev.metro.amiyajames.com). Recent PRs #21–#44 have descriptions explaining each change.

Known open items (all minor; the owner said they don't block release):
- Next stops / Learn phone diagram: c2c lists the Tilbury loop before Upminster. Upminster first (trunk = the direct main line via Basildon) was tried on 2026-10-15: it necessarily runs the Tilbury loop's lane past Upminster–Basildon on the outside (4 boxed stations), so it was not applied; the owner's call. (The Thameslink Horley jog was fixed: a short alternative route goes next to the end it is geographically near.)
- Map: rechecked 2026-10-15 at z16.5–17 against the original (`TRACKS=1 node scripts/lab/compare.js final london,graph7 17 …`): Camden Town, Mornington Crescent, Acton Town, Clapham Junction (Windrush end) are cleaner than the original, Wimbledon tram identical. Victoria throat: a short Southern branch-off at the platform end (the owner said they like the Victoria fan-out). Open: zoom jank under heavy CPU throttling (see Performance).
- Lab only: none known (Dock's phone map credit now starts collapsed to its (i) button; `/lab/lines/branches` does not clip: wide lines such as District scroll sideways).
- Learn: the strip demo's short-walk interchange chips (Bank/Monument etc.) aren't shown on Route (that data lives in the strip demo's page file); "All lines" is omitted for lines whose routes share one unbranched track (East Midlands Railway, Gatwick Express) pending the owner's OK.
- Ideas raised but not built: a Play-side "learn this line" link per line row (option C of the integration discussion); presets for lines in play; Learn practice formats from the learning brainstorm (gap fill, find it on the map, daily review).

How to verify changes: run the dev server (`npm run dev`), then screenshot with Puppeteer from the repo root (`require(process.cwd() + '/node_modules/puppeteer')`; scripts in a scratch dir). Seed state through `evaluateOnNewDocument`: `london-stations` (JSON array of feature ids from `london/data/features.json`), `london-stations-is-new-player` = `false`, `london-theme` = `light`/`dark`. Check desktop 1440×900 and phone 390×844 (`isMobile`, `deviceScaleFactor: 2`), light and dark. A brand-new route folder can 404 in `next dev` until the server restarts.

## Project docs

Design specs live in `docs/superpowers/specs/`. Update `STATUS.md` when you finish significant work (it has the dated log of the lab geometry work, open issues and caveats) and README "Lab" when commands change.

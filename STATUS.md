# STATUS

_Updated 2026-05-29 · branch `main` · pushed to `origin` at `c771f4e` · deploys to Cloudflare as a static export._

## Where it stands

- **Lines shown by default:** Underground + Overground + Elizabeth + DLR. **Thameslink** off by default (toggleable). **Southern / Great Northern / Gatwick Express** hidden (`HIDDEN_LINES`).
- **Geometry:** parallel-ribbon corridors rebuilt by `scripts/build-ribbons.js` (shared-centreline corridors + station-anchored membership + lane order by config `order`; de-spike / de-weld / collapse-doubling cleanup). Default **offset mode**: lines sit on the shared centreline carrying a `laneOff`, separated at render by `line-offset = laneOff × line-width(zoom)` → co-runners stay parallel, never flip, separate by a constant screen amount at every zoom (no hiding when zoomed out), geometry stays on the true track. (`--mode baked` available.) See README "Data pipeline". Source of truth is `routes.osm.json` (raw OSM); build `routes.json` from it, never from `routes.json` itself.
- **Stations:** hollow when un-found; colour dot (single-line) or segmented pie (interchange) when found; identical borders; **scale with zoom**.
- **Map furniture:** operator line picker, draggable timer, Greater London grey-out + border, red-dashed City of London, greener parks / bluer water, default view on Charing Cross (Zone 1).
- **Verification:** Puppeteer render + browser-free geometry scorecard harness (`scripts/qa-*.js`).

## Latest changes (action → result)

- **Declarative cartography overrides** (`ORDER_OVERRIDES` / `NO_SNAP` in `build-ribbons.js`, re-applied on every build → survive a data re-fetch) → fixed: Mile End (Central/H&C/District top→bottom), Jubilee above Metropolitan, Suffragette below Victoria, Mildmay passes over West Hampstead unaffected, Victoria connects to Euston from below the Northern line (`Euston` override). `ORDER_OVERRIDES` now takes an `axis` (`lat` default / `lng`) so the sign assertion can orient cross-track on N–S corridors too. **Thameslink Finsbury Park wobble**: diagnosed as a lane-sign oscillation (Thameslink shares <5 % of its centreline with Piccadilly/Victoria through the junction, so it's on its own spine and an order override can't bind it; the per-bin packing flipped its `laneOff` ±1.5 → the S-weave straddling the tube pair) — **not** a segment-count issue. Fixed by a `NO_SNAP` so Thameslink rides its own smooth centreline through Finsbury Park (one clean crossing instead of the weave; it follows the true National-Rail alignment, which sits east of / crosses the tube pair rather than strictly west).
- **Per-platform interchange pies** (`interchanges.ts` `CLUSTER_M` 150→30m) → multi-platform stations (Finsbury Park, Wimbledon, Farringdon, Kentish Town, …) now show a pie only over the lines sharing each platform + plain dots elsewhere, instead of one combined pie duplicated at every platform. `marker-overrides.js` co-locates Farringdon's Elizabeth marker with Thameslink (mainline level, not the subsurface tube).
- **Rebuilt line geometry from raw OSM (`fetch-osm-routes.js` → `routes.osm.json` → `build-ribbons`)** → dropped the legacy welds/Chaikin the old snapshot carried: the Angel weld bulge and the St Pancras Thameslink triangle are gone, lines are smooth/faithful. `routes.osm.json` is now the pristine source (replaces `routes.preribbons.json`). Build integrity verified (output vs source: all lines preserved); §4 orderings intact. Known follow-up: markers now float off the clean lines (OSM running-lines sit off platform stop-nodes) — needs a marker strategy.
- **Render-time offset mode (`build-ribbons.js --mode offset` + `line-offset` in GamePage)** → co-running ribbons separate by a constant screen amount at every zoom, so zoomed-out the higher-`order` line no longer hides the lower (fixed Met/H&C/Lioness overlap). Lines stored on the shared centreline (true track); `laneOff` ramps at junctions to avoid offset jogs.
- **De-weld + de-spike** → flattened station-weld bulges/hairpins (Angel, Oval, Kennington) so lines no longer snap to platform points, while keeping real junction curves faithful. `snap-markers.js` (Idea B) available but not in the default pipeline.
- **De-doubled Piccadilly's Heathrow out-and-back** (kept the T4 loop); member-count-aware lane spacing for baked mode.
- **Rebuilt ribbon geometry from scratch (`build-ribbons.js`)** → §4 orderings now correct & zoom-stable: north trunk Met/H&C/Circle, south trunk Circle/District (Circle interior to the loop everywhere, 0 cross-track reversals, ~14m spacing), Bakerloo & Lioness both visible on the Watford DC, District/Piccadilly separated at Earl's Court. Circle loop intact (length 27.3→27.1km). Output 0.34MB (was 0.83MB). Retired the weld/Chaikin/miter pipeline to `archive/scripts/`. Verified with `qa-ribbons.js` + `qa-ribbons-render.js`.
- Baked offsets into `routes.json` + render at `line-offset: 0` → fixed ribbon ordering flips (ISSUES #2).
- Welded same-line endpoints → closeable junction gaps 12 → 4 (ISSUES #1, as far as baked geometry allows).
- Fixed `stations-base` paint (zoom-interpolate was illegally nested in `case`) → empty markers now render (ISSUES #4).
- Segmented-pie interchanges, clustered by location → Blackfriars shows District/Circle at the Tube + a separate Thameslink marker 300 m south.
- Hid Southern/GN/Gatwick; Thameslink standalone & off by default; renamed `London Blackfriars/Victoria/St Pancras/King's Cross` (old names kept as search aliases).
- Reconstructed the missing **Thameslink Peterborough branch** (route stopped at Cambridge) from station coords.
- Markers now scale down at low zoom; rail lines 25 % thinner; bounds recentred to the visible network (Elizabeth/Reading sets the western edge).
- Cloudflare deploy fixed via `output: 'export'` + `wrangler.jsonc` (was failing — expected an OpenNext worker).

## Recent commits

- `c771f4e` **London map UI overhaul** — line picker, timer, segmented pies + matching borders, boundaries, basemap recolour, Charing Cross default view, zoom-scaled markers, thinner lines, line-visibility defaults, recentred bounds.
- `6ce2f91` **Scripts** — `bake-offsets`/`weld-endpoints` take a target path; `postprocess-routes` gained station-weld passes; QA render tweaks.
- `48d5b9d` **Data** — station renames + Thameslink Peterborough branch.
- `d5df29f` / `cdb582d` **Cloudflare** — static-export deploy (replaced the OpenNext config that didn't match `npm run build`).
- `f0f9907` empty-marker fix · `27139ec` hide/trim services (later revised) · `da9fe57` junction-gap weld · `b05d6b6` promote baked-offset geometry · `fe3591d` OSM postprocess pipeline + QA harness + ISSUES.

## Open / queued

- **#16 geometry fixes** — Oval right-angle jumps, Waterloo&City + DLR cut short of Bank, stray track off Wandsworth Road, acute-angle kinks (Angel/Warren St/KX/Charing Cross — pin-aware weld preserving corners), Weaver not reaching Cheshunt.
- **#17 raw-geometry Settings toggle** — needs an OSM re-fetch of unprocessed ways.
- **#18 real per-line station positions** — needs OSM per-line stop coords (for Edgware Rd / Paddington / Canary Wharf etc.); current per-location pies only cover cases already split in the data.

## Caveats

- `routes.json` is a **human-reviewed baked snapshot**; re-running the pipeline produces equivalent-but-not-byte-identical geometry.
- The Thameslink Peterborough branch is a **straight station-to-station reconstruction**, not a track-faithful trace.
- **Don't** run `npm run build` while `npm run dev` is running (shared `.next/`).

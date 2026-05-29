# STATUS

_Updated 2026-05-29 · branch `main` · pushed to `origin` at `b1623f2` · deploys to Cloudflare as a static export._

## Where it stands

- **Lines shown by default:** Underground + Overground + Elizabeth + DLR. **Thameslink** off by default (toggleable). **Southern / Great Northern / Gatwick Express** hidden (`HIDDEN_LINES`).
- **Geometry:** parallel-ribbon corridors rebuilt by `scripts/build-ribbons.js` (shared-centreline corridors + station-anchored membership + lane order by config `order`; de-spike / de-weld / collapse-doubling cleanup). Default **offset mode**: lines sit on the shared centreline carrying a `laneOff`, separated at render by `line-offset = laneOff × line-width(zoom)` → co-runners stay parallel, never flip, separate by a constant screen amount at every zoom (no hiding when zoomed out), geometry stays on the true track. (`--mode baked` available.) See README "Data pipeline". Source of truth is `routes.osm.json` (raw OSM); build `routes.json` from it, never from `routes.json` itself.
- **Stations:** hollow when un-found; colour dot (single-line) or segmented pie (interchange) when found; identical borders; **scale with zoom**.
- **Map furniture:** operator line picker, draggable timer, Greater London grey-out + border, red-dashed City of London, greener parks / bluer water, default view on Charing Cross (Zone 1).
- **Verification:** Puppeteer render + browser-free geometry scorecard harness (`scripts/qa-*.js`).

## Latest changes (action → result)

- **Declarative cartography overrides** (`build-ribbons.js`, re-applied on every build → survive a data re-fetch). Five mechanisms, all near the top of the file:
  - `ORDER_OVERRIDES` — force cross-track lane order near a point; optional `axis` (`lat` default / `lng`) for N–S corridors, and `noFlip` to rank lanes WITHOUT asserting a spine sign (for overrides riding the §4-locked Circle-loop spine). Fixes: Mile End, Jubilee above Met, Suffragette below Victoria, Victoria below Northern at Euston, the King's Cross stack, and Thameslink west of the subsurface at Farringdon.
  - `NO_SNAP` — keep a line off bundles near a point. Mildmay over West Hampstead; **Thameslink along Farringdon → New Southgate** (rides its own west-of-subsurface track, never weaving through Finsbury Park); Victoria own-track Warren St→Euston; Thameslink held solo just south of Farringdon so it joins the bundle only at the marker.
  - `FORCE_SNAP` — the inverse: bind a line *onto* a corridor (`onto: 'Line'`, within `dist`), even reassigning a rival parallel spine. Used for Victoria-below-Northern (Euston→KX) and to pull Victoria & Northern onto the subsurface for the KX stack.
  - `SPINE_ORDER` — override spine-laying priority without changing config `order` (lane rank/colour). Present, currently unused.
  - `NUDGE` — last-resort cosmetic lateral shift (does NOT use the lane mechanism). Present, unused.
- **King's Cross St Pancras cartography** → a 5-line stack on the subsurface corridor, top→bottom **Northern, Victoria, Met, H&C, Circle** (Victoria/Northern force-snapped onto the subsurface's north side; Northern stays north of Victoria through the station and just east, the two crossing only as they branch — Victoria NE to Highbury, Northern SE to Angel). **Thameslink** joins the subsurface's **west** side at the Farringdon marker, crosses to the **east** just north of Farringdon (as in reality), follows the east side to KX, then peels off north to **St Pancras International** on its own track. **Finsbury Park** wobble was diagnosed as a lane-sign oscillation (not segment count) and settled with `NO_SNAP`.
- **Render layer z-order rebuilt** (`GamePage.tsx`) → lines now draw as per-category **z-bands** (each = base line + its white-stripe layer(s) stacked together), bottom→top: Thameslink/National-Rail, Overground, DLR, Elizabeth, Underground. This keeps each line's white dashes at the line's own depth (Thameslink & its dashes pass UNDER the tube ribbons instead of floating over them). Within the Underground band, **subsurface (Circle/District/H&C/Met) draws above deep-tube** lines (sort-key boost). Per-line visibility toggles updated to filter the new band layers.
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

- `b1623f2` **King's Cross stack + Thameslink routing + per-category layer z-order** — 5-line KX stack (Northern/Victoria/Met/H&C/Circle); Thameslink west→east across Farringdon then peeling to St Pancras Int; render z-bands (UG > Elizabeth > DLR > Overground > Thameslink) with subsurface above deep-tube and stripes at each line's depth.
- `90a6dbf` **Finsbury wobble fix + Victoria/Euston + axis override** — `NO_SNAP` for the Thameslink Finsbury Park S-weave; Victoria below Northern at Euston; `ORDER_OVERRIDES` gains an `axis` (lat/lng).
- `3a1d67a` **Declarative cartography overrides** — `ORDER_OVERRIDES` / `NO_SNAP` in `build-ribbons.js` (Mile End, Jubilee/Met, Suffragette, Mildmay) + initial Finsbury work.
- `6a7fda0` **Search aliases** — King's Cross St Pancras / St Pancras International typing shortcuts.
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

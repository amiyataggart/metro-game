# Parallel-ribbons verification report

Rebuild of `routes.json` by `scripts/build-ribbons.js` (replaces the archived
weld/Chaikin/miter pipeline — see `PARALLEL-RIBBONS-BRIEF.md` §7). Built from
**`routes.osm.json`** — the pristine raw-OSM source re-fetched from Overpass
(chained per-branch centrelines, double-track-averaged, platform-stripped, no
legacy welds). **Default = offset mode**: lines are emitted
on their shared corridor centreline carrying a signed `laneOff`, and the map
(`GamePage.tsx`) renders the separation at runtime with
`line-offset = laneOff × line-width(zoom)`.

## Approach

Co-running lines come from different OSM ways and bow up to ~60 m apart between
shared stations, so a fixed-radius geometric corridor detector either misses
members or grabs the wrong one. Instead: lay **spines** (shared centrelines,
lowest-`order`-first), then confirm corridor membership along runs of **≥2
consecutive shared station nodes** (`features.json`, clustered into physical
nodes — coincident across co-serving lines, so robust). Stations drive
*detection only* — geometry is never welded to them. Raw input is first cleaned
(`deSpike` near-reversal darts, `deWeld` station-weld bulges, `collapseDoubling`
out-and-back tracks). Each corridor's lines are ordered into **lanes by config
`order`** (centred on the corridor); the per-vertex lane is smoothed so it ramps
(not steps) at junctions.

- **Offset mode (default):** each line is emitted on the shared centreline with a
  signed `laneOff`; separation is applied at render. Because co-runners share the
  centreline their tangents match, so the runtime offset keeps them exactly
  parallel and never flips, separates them by a **constant screen amount at every
  zoom** (the lower line is never hidden when zoomed out), and leaves geometry on
  the true track.
- **Baked mode (`--mode baked`):** lane offset baked into coordinates (ground
  units), render at `line-offset: 0`. Zoom-stable but co-runners merge at the
  overview zoom.

Loops/branches survive (a spine's laying feature is reconstructed by identity,
avoiding self-overlap projection; lane ramps to 0 at divergences).

## Scorecard (`node scripts/qa-ribbons.js`)

In offset mode the scorecard **simulates the render** (applies `laneOff` before
the ordering checks, since the stored geometry is the coincident centreline).

```
A. Integrity vs routes.osm.json (the build source) — all 23 lines preserved. In offset mode
   geometry IS the centreline, so bbox edge shift is ~0–9 m and length within
   ~1.5%. Circle loop intact (27.3 → 26.9 km, no lost arcs / collapse).

B. §4 ordering probes (render simulated, ~12 m per lane unit)
   North trunk (Gt Portland St → Euston Sq): top→bottom Metropolitan, H&C,
     Circle — OK; 0 cross-track reversals; spacing ~12 m.
   South trunk (Westminster → Embankment): top→bottom Circle, District — OK;
     0 reversals; spacing ~12 m.
   ⇒ Circle is interior to the subsurface loop everywhere.

C. Watford DC (Queen's Park): Bakerloo & Lioness both present, ~12 m apart — OK.
```

## Renders (`node scripts/qa-ribbons-render.js` → `qa/out/`, gitignored)

`north-trunk`, `south-trunk`, `watford-dc`, `edgware-rd`, `earls-court`,
`central-knot`, `circle-loop` — lowest `order` drawn first. (These render the
stored geometry; in offset mode that's the centreline, so use the live app or
the per-spot helpers to see the offset applied.)

## Tunables (`CONFIG` in `build-ribbons.js`, + render in `GamePage.tsx`)

| Key | Value | Meaning |
|---|---|---|
| render `line-offset` | `laneOff × line-width(zoom)` | offset-mode separation (GamePage); px-per-lane = the line width |
| `S` | 10 m | resample step |
| `D` / `D2` | 34 / 130 m | geometric snap radius / corridor ceiling for station-run bundling |
| `TAPER` | 80 m | on/off-corridor easing + laneOff ramp window |
| `R_NODE` / `CLUSTER` | 45 / 30 m | station-node attach radius / station-point merge radius |
| `MIN_SHARED_NODES` / `MAX_NODE_GAP` | 2 / 3000 m | consecutive shared stations to bundle / split a run (real divergence) |
| `MIN_SPINE` / `MIN_MEMBER` | 120 / 140 m | min run to seed a spine / count as a member |
| `SPIKE_ANGLE` | 88° | de-spike: drop only near-reversal darts (keeps real sharp curves/loops) |
| `WELD_R` / `WELD_WIN` | 42 m / 11 | de-weld: flatten station bulges near nodes, keep junctions faithful |
| `DEDUP_DIST` / `DEDUP_MIN_RUN` | 110 / 1500 m | collapse out-and-back doubling (leaves one-way loops) |
| `OFFSET_QUANT` | 0.1 | offset-mode: laneOff quantisation when segmenting (smaller = smoother ramps, more features) |
| `SMOOTH_WIN` | 2 | final gentle coord smoothing (kept low for faithful geometry) |
| `LANE_SPACING` | {2:22,3:17,4:14,5+:12} m | **baked mode only**: member-count lane spacing |
| `SIMPLIFY_EPS` / `COORD_DP` | 1.5 m / 6 | output Douglas–Peucker tolerance / coord precision |

## Known / unresolved

- **Markers at weld-bulge stations:** `deWeld` smooths the line off the platform
  point it was welded to, so at those few stations (Angel, Oval, …) the original
  marker sits slightly off the smoothed line. `snap-markers.js` (Idea B) snaps
  markers onto lines but is **not** in the default pipeline (it scattered
  interchange pies — one-marker-per-station is owned by `features.json`).
- **Thameslink @ St Pancras:** the source OSM geometry has a small triangular
  loop / spike just south of the station (an out-and-back / parallel-track
  artifact, present in source + baked + offset); `collapseDoubling` doesn't catch
  it (too short for its run threshold), and offset mode adds lane jitter at this
  dense 8-line junction. Open.
- **National-Rail mega-corridors** (Thameslink/GreatNorthern/Southern/Gatwick,
  hidden/off by default) bundle via the same mechanism; spot-checked.
- **Markers float off the clean lines:** OSM models running lines offset from
  platform stop-nodes, so e.g. Angel's marker sits ~69 m off its (now smooth)
  line. The old welds masked this by pulling the line to the marker. Needs a
  marker strategy (Idea B cluster-snap so interchanges stay one pie / accept /
  per-line dots). Open.
- **Source = raw OSM (done):** `routes.osm.json` is re-fetched from Overpass; the
  legacy welds (Angel) and the St Pancras Thameslink triangle are gone. Minor
  current-OSM extent differences at some termini/depots (mostly hidden National
  Rail; Victoria +~600 m terminus tail) vs the old snapshot — accepted.

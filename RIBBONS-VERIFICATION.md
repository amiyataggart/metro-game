# Parallel-ribbons verification report

Rebuild of `routes.json` by `scripts/build-ribbons.js` (replaces the archived
weld/Chaikin/miter pipeline — see `PARALLEL-RIBBONS-BRIEF.md` §7). Built from the
pristine `routes.preribbons.json`; renders at `line-offset: 0`.

## Approach (one paragraph)

Co-running lines come from different OSM ways and bow up to ~60 m apart between
shared stations, so a fixed-radius geometric corridor detector either misses
members or grabs the wrong one. Instead: lay **spines** (shared centrelines,
lowest-`order`-first), then confirm corridor membership along runs of **≥2
consecutive shared station nodes** (`features.json`, clustered into physical
nodes — coincident across co-serving lines, so robust). Stations drive
*detection only* — geometry is never welded to them. Each corridor's lines are
packed into evenly-spaced **lanes ordered by config `order`**, centred on the
corridor; each line is baked as `centreline + lane×spacing` along the *shared*
normal, blended on/off corridors by a smoothed offset vector. Because all
members are exact parallel offsets of one curve, they cannot cross or flip at
any zoom. Loops/branches survive (a spine's laying feature is reconstructed by
identity, avoiding self-overlap projection; offsets taper to 0 at divergences).

## Scorecard (`node scripts/qa-ribbons.js`)

```
A. Integrity vs routes.preribbons.json — all 23 lines preserved (bbox edge
   shift < 35 m = the offset itself; length within ~1%). Circle loop intact:
   27.3 → 27.1 km (no lost arcs / collapse).

B. §4 ordering probes
   North trunk (Gt Portland St → Euston Sq): top→bottom Metropolitan, H&C,
     Circle — OK; 0 cross-track reversals; spacing mean ~17 m (3-line corridor).
   South trunk (Westminster → Embankment): top→bottom Circle, District — OK;
     0 reversals; spacing mean ~22 m (2-line corridor).
   ⇒ Circle is interior to the subsurface loop everywhere.

C. Watford DC (Queen's Park): Bakerloo & Lioness both present, ~22 m apart — OK.
```

## Renders (`node scripts/qa-ribbons-render.js` → `qa/out/`, gitignored)

`north-trunk`, `south-trunk`, `watford-dc`, `edgware-rd`, `earls-court`,
`central-knot`, `circle-loop` — lowest `order` drawn first (matches the app's
`line-sort-key`). Confirmed by eye: parallel evenly-spaced ribbons, correct
ordering, branches reconnect at junctions, Circle loop continuous and interior.

## Tunables (`CONFIG` in `build-ribbons.js`)

| Key | Value | Meaning |
|---|---|---|
| `S` | 10 m | resample step |
| `LANE_SPACING` | {2:22, 3:17, 4:14, 5+:12} m | lane centre-to-centre by #co-runners — 2-line pairs wider so they separate at a lower zoom; dense stacks stay compact |
| `D` | 34 m | geometric snap radius (spine seeding) |
| `D2` | 130 m | corridor ceiling for station-run bundling |
| `TAPER` | 80 m | offset-vector smoothing window (on/off-corridor easing) |
| `R_NODE` | 45 m | station-node → line attach radius |
| `CLUSTER` | 30 m | station-point merge radius (physical nodes) |
| `MIN_SHARED_NODES` | 2 | consecutive shared stations to bundle |
| `MAX_NODE_GAP` | 3000 m | split a shared run here (real divergence) |
| `MIN_SPINE` / `MIN_MEMBER` | 120 / 140 m | min run to seed a spine / count as a member |
| `SMOOTH_WIN` | 2 | final gentle coord smoothing (kept low for faithful geometry) |
| `SPIKE_ANGLE` | 88° | de-spike: drop only near-reversal vertices (station-weld darts); preserves real sharp junction curves / turn-back loops |
| `DEDUP_DIST` / `DEDUP_MIN_RUN` | 110 m / 1500 m | collapse-doubling: anti-parallel self-overlap radius / min run to remove (de-doubles out-and-back tracks; leaves one-way loops) |
| `SIMPLIFY_EPS` | 1.5 m | output Douglas–Peucker tolerance (≪ spacing) |
| `COORD_DP` | 6 | output coordinate precision (≈0.11 m) |

Ground-unit spacing reads as clean ribbons when zoomed in and blends at the z12
overview — inherent to baked offsets (brief §2). Member-count spacing makes
2-line pairs separate at a lower zoom; at the far overview they still merge.

## Known / unresolved

- **Solo single-line weld spikes** (Kennington, Oval, Marylebone …) were
  inherited from the committed source. `deSpike` removes only near-reversal
  darts (`SPIKE_ANGLE=88°`) so the Oval 143° hairpin is gone while genuine sharp
  junction curves stay — the new geometry tracks the source faithfully (verified
  by overlaying new-vs-source at Kennington/Oval).
- **Out-and-back doubling** (one OSM way tracing both running tracks) is
  collapsed by `collapseDoubling`: Piccadilly's Heathrow branch is now a single
  line (−12%) with the T4 one-way loop preserved. One Thameslink feature still
  has partial doubling — its duplicate run isn't a clean removable tail, so the
  pass conservatively leaves it (Thameslink is off by default); revisit if needed.
- National-Rail mega-corridors (Thameslink/GreatNorthern/Southern/GatwickExpress,
  hidden/off by default) bundle via the same mechanism; spot-checked, not yet
  exhaustively eyeballed.

# Briefing card — design a snap-and-offset process for the line geometry

**You are a strong model being asked to design and implement, from scratch, the
build-time process that turns London Rail Memory's per-line track geometry into
clean, correctly-ordered parallel ribbons.** A previous, weaker attempt is
archived (see §7) and **must not be reused** — read it only to learn what failed.
Design your own approach.

This card is self-contained. Read it fully before writing code.

---

## 1. Mission in one sentence

Wherever two or more rail lines run along the same physical track, the map must
draw them as **distinct, evenly-spaced, parallel ribbons in a deterministic
cross-track order that never crosses itself and never flips as the user zooms** —
and you must achieve this without corrupting loops, branches, or junctions.

---

## 2. How the app renders lines (the constraints you design against)

- **Stack:** Next.js 14 (App Router) static export, React 18, **MapLibre GL JS**,
  Carto Positron (no-labels) basemap. Ships as a static `out/` for Cloudflare.
- The map component is `src/components/GamePage.tsx`. It loads
  `src/app/(game)/london/data/routes.json` as one GeoJSON source (`'lines'`) and
  draws it with a single `line` layer plus white-stripe overlay layers for
  Overground/Elizabeth/DLR (`stripe: 'solid'`) and Thameslink (`'dashed'`).
- **The decisive facts about that layer:**
  - `'line-offset': 0` — **hard-coded, leave it 0.** There is NO runtime offset.
    The only thing that separates co-running lines on screen is the **baked
    coordinate geometry**. (Runtime `line-offset` was tried and abandoned: it
    pushes each line along its *own* local tangent, so where two co-runners have
    even slightly different vertices the ribbons diverge and **flip order across
    zoom**. Baking the offset into coordinates is what makes ordering
    zoom-stable. Keep rendering at offset 0 and bake into coords.)
  - `'line-sort-key': ['get', 'order']` — **higher `order` draws on top.** This is
    the mechanism that currently *hides* lines: where two co-runners share
    coordinates, the higher-`order` line paints completely over the lower one.
  - `'line-color'`: resolved from the `LINES` config by line key (not from the
    baked `color` property), zoom-interpolated `line-width` ≈ **1.95px @ z8.8 →
    3.4px @ z13 → 6.75px @ z22**, `line-cap: round`, `line-join: round`.
  - White stripe layers reuse the same geometry at ~1/3 width.
- **Map view:** center Charing Cross `[-0.1247, 51.5085]`, default `zoom: 12.4`,
  `minZoom: 6`, `maxBounds` roughly `[-1.1,50.75]`→`[0.73,52.66]`. So ribbons are
  viewed mostly at **z11–16**. A ground-unit offset of ~12–14 m reads as cleanly
  parallel ribbons around z12–13 (tighter when zoomed out, wider when zoomed in —
  that ground-unit tradeoff is acceptable).
- Station markers are a **separate** concern (circle/symbol layers off
  `features.json`). **Do not touch markers** — they are out of scope for this brief.

**Implication:** two co-running lines are visually distinct **iff** their baked
coordinates are far enough apart (≳ one line width in ground units at the viewing
zoom). If they share coordinates, only the top-`order` line is visible.

---

## 3. The data

All paths under `src/app/(game)/london/data/`. The committed files are
pre-built snapshots; the app imports them directly (`page.tsx`).

| File | Role | Schema |
|---|---|---|
| `routes.json` | **line geometry — your output** | `FeatureCollection` of `LineString` features. `properties = { line, color, order, offset }`. **1+ features per line** (branches are separate features). |
| `features.json` | station points (app uses; you may use as topology anchors) | `FeatureCollection` of `Point`. `properties = { id, name, line }`. **One point per (station, line)**, 912 total. A line passes through each of its own stations. |
| `london-mask.json`, `city-of-london.json` | boundary overlays (don't touch) | polygons |
| `stations-extras.json` | National-Rail TOC stations (input to `transform-data.js`) | array |
| `source.json`, `features.original.json` | upstream metro-memory snapshots (input to `transform-data.js`) | — |

`routes.json` top level is `{ type, features }`. A representative feature:

```json
{ "type":"Feature",
  "properties":{ "line":"Circle", "color":"#ffd329", "order":2, "offset":-1 },
  "geometry":{ "type":"LineString", "coordinates":[[-0.16845,51.51975], …391 pts…] } }
```

> **`properties.offset` is legacy metadata** from the archived pipeline (integer
> "lane units"). The **renderer ignores it** (it renders at `line-offset: 0`).
> You may repurpose, recompute, or delete it — but the visible separation MUST
> come from the `coordinates`. Keep `line`, `color`, `order` on every feature.

Feature counts per line in the current `routes.json` (branch features):

```
Bakerloo 1, Central 3, Circle 2, HammersmithAndCity 1, District 5, Metropolitan 4,
Piccadilly 3, Jubilee 1, Victoria 1, WaterlooAndCity 1, Northern 6,
ElizabethLine 6, DLR 6, Lioness 1, Mildmay 3, Windrush 6, Weaver 3, Suffragette 1,
Liberty 1, Thameslink 12, GreatNorthern 7, Southern 22, GatwickExpress 3
```

**Line `order` + colour (from `config.ts`, also the legend/draw order):**

```
0  Bakerloo            #b36305      8  Piccadilly        #003688     16 Weaver        #823065 (stripe)
1  Central             #e32017      9  Victoria          #0098d4     17 Suffragette   #5BBD72 (stripe)
2  Circle              #ffd329     10  WaterlooAndCity   #84CAB3     18 Liberty       #7C878E (stripe)
3  District            #00782a     11  ElizabethLine     #6950A1 (s) 19 Thameslink    #D182A0 (dashed)
4  HammersmithAndCity  #f3a9bb     12  DLR               #00afad (s) 20 GreatNorthern #E8A33A (stripe)
5  Jubilee             #a0a5a9     13  Lioness           #FAA61A (s) 21 Southern      #3FA34D (stripe)
6  Metropolitan        #9b0056     14  Mildmay           #3DB6E1 (s) 22 GatwickExpress#1C1C1C (dashed)
7  Northern            #000000     15  Windrush          #DA291C (s)
```

Defaults: Underground + Overground + Elizabeth + DLR shown; **Thameslink off by
default**; Southern / Great Northern / Gatwick Express hidden
(`visibility.ts`). Design for all of them anyway.

---

## 4. The problem, concretely — two canonical failures you must fix

The committed `routes.json` was welded so co-runners are **nearly coincident**,
and the offsets were never baked into the coordinates. So co-running lines
overlap and `line-sort-key` (higher `order` on top) hides the rest:

1. **Circle vs District/Met/H&C (the subsurface trunks).** On the **Embankment**
   (south trunk) Circle (order 2) and District (3) coincide, so green District
   paints over yellow Circle. On the **Marylebone/Euston Rd** (north trunk)
   Circle/H&C/Met wander and *cross each other repeatedly*.
   **Required ordering after your fix (top→bottom on the map):**
   - **North trunk** (e.g. Baker St → King's Cross): **Metropolitan, Hammersmith
     & City, Circle.**
   - **South trunk** (Victoria/Westminster → Blackfriars): **Circle, District.**
   - i.e. **Circle is INTERIOR to the loop everywhere** — south of the others on
     the north trunk, north of District on the south trunk.

2. **Bakerloo hidden under Lioness (the Watford DC line).** From **Queen's Park
   → Harrow & Wealdstone** the Bakerloo (order 0) and Lioness (order 13) share
   the track; Lioness paints completely over Bakerloo, which **vanishes**. After
   your fix both must be visible as two parallel ribbons.

These are just the two the user named. The fix must be **general**: *every* pair
of lines sharing a corridor must come out visibly separated and consistently
ordered. Other known corridors include (detect, don't hard-code): District↔
Piccadilly (Earl's Court→Acton/Hammersmith), Metropolitan↔Piccadilly (Rayners
Lane→Uxbridge), Circle↔H&C↔Met (Baker St→Aldgate), Circle↔District (Gloucester
Rd/Edgware Rd west side), Thameslink↔Great Northern (East Coast Main Line),
Thameslink↔Metropolitan (Farringdon→St Pancras), and several Overground pairs.

---

## 5. Hard requirements / acceptance criteria

1. **Separation:** every pair of lines sharing a corridor is drawn as distinct
   parallel ribbons (centre-to-centre ≳ one line width at z12–13; the archived
   code used ~12–14 m ground spacing — a reasonable starting tunable).
2. **Ordering — exactly as in §4** for the two named cases; **deterministic and
   consistent along the whole corridor** for every other case (no point where the
   cross-track order of a set of co-runners reverses).
3. **No crossings, no zoom-flips.** Because you render at `line-offset: 0`, this
   means: on a shared corridor the member lines must have **parallel baked
   geometry** (offset a *shared* centreline; don't perpendicular-offset each
   line's own slightly-different polyline).
4. **Loop-safe.** The Circle line is essentially a **closed loop in a single
   feature (~391 verts)** and **passes Edgware Road twice** (a spiral / self-
   overlap). It must stay **intact and continuous** — no lost arcs, no collapse.
   (The archived code destroyed it; see §7.)
5. **Branch/junction-safe.** District (5 features), Metropolitan (4), Piccadilly
   (3), Northern (6), etc. fork and rejoin at junction stations (Earl's Court,
   Baker St, Aldgate, Edgware Rd, Camden Town, Kennington, Rayners Lane). Branches
   must stay **connected to their trunk** (no gaps at junctions), and offsets must
   **transition smoothly** where a line enters/leaves a shared corridor (no
   sideways "jump").
6. **Smoothness.** Curves stay smooth; offsetting must not introduce kinks or
   spikes (watch tight corners / miter blow-up on the inside of bends).
7. **Schema preserved.** Output `routes.json` keeps `{line, color, order}` on
   every feature; render stays at `line-offset: 0`. Don't change `config.ts`
   line order/colour semantics, `features.json`, the masks, or the markers.
8. **Deterministic.** No `Math.random` / `Date`. Reviewable diffs. Document every
   tunable (spacing, tolerances, corridor thresholds).

---

## 6. Edge cases that *will* bite you

- **Different source geometry per line.** Each line's polyline came from a
  different OSM way-average, so two co-runners have *different vertices/tangents*
  on the same track. Perpendicular-offsetting each line independently makes them
  diverge and cross — **this is the central failure mode.** The robust fix is to
  detect a corridor, build **one shared centreline** for it, and place each member
  at a lane offset of that *shared* line (identical tangents ⇒ truly parallel).
- **Loops reverse travel direction.** A left-normal offset of a closed loop flips
  N/S between the top and bottom of the loop automatically — so a *single signed
  offset can keep Circle interior all the way around* **if** the loop orientation
  is consistent and the geometry isn't mangled. Exploit this, but beware the
  **self-overlap** at Edgware Rd (arc-length / "nearest point on centreline"
  projections misbehave where a polyline doubles back).
- **Per-line-uniform offset is not expressive enough.** A line can need a
  different *relative lane* in different corridors (e.g. Circle is the interior of
  the subsurface loop, but elsewhere a line may need to sit on the opposite side
  of a different partner). A single global offset per line cannot express that and
  gives no per-corridor ordering control. Prefer assigning **lanes per corridor**
  (and reconciling a line's lane across the corridors it belongs to), or another
  model that gives you explicit per-trunk ordering — whatever you choose, you must
  be able to hit the §4 orderings.
- **Variable corridor width.** 2 lines (Watford DC) up to 4 (subsurface). Centre
  each stack on the true track so it doesn't drift off-route.
- **Junction transitions.** Where a branch joins a trunk, taper the offset to 0 at
  the divergence point (or otherwise blend) so there's no visible step.

---

## 7. Prior art that FAILED (archived — do not reuse)

Moved to `archive/scripts/` (gitignored). Read for cautionary detail only:

- `postprocess-routes.js` — vertex welds (cross-feature ~25 m, same-line ~40 m) +
  per-line integer offset units by `LINE_ORDER` + overlap graph + Chaikin smooth.
- `bake-offsets.js` — shared-centreline pass, station weld, endpoint weld,
  pin-aware Chaikin, same-line byte-splice, then **bake** a per-line **uniform**
  offset via per-vertex miter normals; render at `line-offset: 0`.
- `weld-endpoints.js`, `fix-thameslink-north.js` (a manual branch patch).

**Why it failed — confirmed by inspection:**

1. The committed `routes.json` ended up **welded near-coincident with offsets only
   in `properties.offset` metadata — never baked into coordinates.** So the
   deployed map shows co-runners overlapping and the higher-`order` line hiding
   the rest. That's *both* §4 failures.
2. **Re-running `bake-offsets.js` on the current `routes.json` corrupts the Circle
   loop.** Instrumented run: Circle is fine through the centreline/weld steps
   (391+88 verts), then at the **pin-aware Chaikin + RDP smoothing** step it
   collapses to **99+81 verts and loses its entire eastern + northern arc**
   (bbox shrinks from `[-0.196,51.492 … -0.075,51.531]` to `[-0.197 … -0.166]` —
   only the western stub survives). Root causes: station-welding stacks duplicate
   vertices that the dedup in pin-aware Chaikin then eats, and arc-length /
   nearest-point projection misbehaves on the self-overlapping loop.
3. The **per-line uniform offset** model can't express per-corridor ordering (see
   §6) and made the subsurface order effectively arbitrary.

**Net:** don't iterate on this code. Design a model that is loop/self-overlap
safe and gives explicit per-corridor ordering, and **actually bake the offset
into `coordinates`** (verify the coords moved, not just metadata).

---

## 8. How to verify without a human (do this every iteration)

Headless WebGL is unreliable on this machine, so use these:

**A. Browserless render-to-PNG (fast eyeball of ordering/parallelism/crossings).**
`sharp` is installed in the project. Build an SVG of the lines you care about over
a bbox, **draw lowest `order` first** so the stack matches the app, rasterize,
and open the PNG. Reference snippet (run from the project root so `sharp`
resolves):

```js
const fs=require('fs'), sharp=require('sharp');
const fc=JSON.parse(fs.readFileSync('src/app/(game)/london/data/routes.json','utf8'));
const COLOR={Circle:'#ffd329',District:'#00782a',HammersmithAndCity:'#f3a9bb',
  Metropolitan:'#9b0056',Bakerloo:'#b36305',Lioness:'#FAA61A'};
const ORDER={Bakerloo:0,Circle:2,District:3,HammersmithAndCity:4,Metropolitan:6,Lioness:13};
const [W,S,E,N]=[-0.165,51.5195,-0.118,51.5320]; // north trunk; swap per probe
const PXW=1600, PXH=Math.round(PXW*(N-S)/((E-W)*Math.cos(51.5*Math.PI/180)));
const x=l=>(l-W)/(E-W)*PXW, y=l=>(N-l)/(N-S)*PXH;
const feats=fc.features.filter(f=>COLOR[f.properties.line])
  .sort((a,b)=>(ORDER[a.properties.line]??99)-(ORDER[b.properties.line]??99));
let p=''; for(const f of feats){const pts=f.geometry.coordinates.map(c=>x(c[0]).toFixed(1)+','+y(c[1]).toFixed(1)).join(' ');
  p+=`<polyline points="${pts}" fill="none" stroke="${COLOR[f.properties.line]}" stroke-width="6" stroke-linecap="round"/>`;}
sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${PXW}" height="${PXH}"><rect width="100%" height="100%" fill="#f4f4f2"/>${p}</svg>`))
  .png().toFile('/tmp/check.png').then(()=>console.log('wrote /tmp/check.png'));
```

**B. Geometry scorecard (assert, don't eyeball).** For sampled points along each
shared corridor, find the nearest point on each member line, project the
inter-line vector onto the shared local left-normal to get a **signed
cross-track offset**, then assert (a) the member order by signed offset matches
the spec, (b) it never reverses along the corridor (no crossings), (c) spacing is
~uniform. `scripts/qa-geometry.js` (kept) is a starting point for browserless
geometry checks. Also assert **no line lost vertices/extent** vs the input
(catch loop corruption early).

**C. Acceptance probe points** (lng, lat) for the named cases:
- North trunk: Great Portland St `(-0.1438, 51.5238)`, Euston Sq `(-0.1357, 51.5258)`
  → top→bottom must be **Metropolitan, H&C, Circle**.
- South trunk: Embankment `(-0.1223, 51.5073)`, Westminster `(-0.1254, 51.5012)`
  → top→bottom must be **Circle, District**.
- Watford DC: between Queen's Park `(-0.2143, 51.5341)` and Harrow & Wealdstone
  `(-0.3346, 51.5921)` → **Bakerloo and Lioness both visible**, parallel.

**D. Full visual.** `npm run dev` then `node scripts/qa-render.js` (Puppeteer,
kept) for real MapLibre screenshots, and/or ask the human — they will check the
live app. (Do **not** run `npm run build` while `npm run dev` is running — shared
`.next/`.)

---

## 9. Constraints & non-goals

- **Static export, committed data.** Your deliverable is a **build-time tool** that
  rewrites `routes.json` (in place, or to a versioned file the app imports). It is
  fine for it to be slow/manual; it just has to be deterministic and reviewable.
- **Input geometry:** prefer operating on the existing per-line `routes.json`
  geometry (and `features.json` station anchors). Re-fetching raw OSM is allowed
  if you need cleaner per-line ways — `scripts/fetch-osm-routes.js` (Overpass,
  kept) shows how — but avoid depending on the network in the committed pipeline.
- **Keep render at `line-offset: 0`** and the `routes.json` schema. **Don't** touch
  markers, station data, masks, or `config.ts` colour/order semantics.
- **Non-goals:** marker sizing/appearance, station matching, gameplay, anything
  outside producing correctly-offset line geometry.

---

## 10. Deliverables

1. A documented build script (under `scripts/`) that reads the current per-line
   geometry and writes a `routes.json` with **baked parallel offsets**, correctly
   ordered (§4/§5), loop- and branch-safe.
2. The regenerated, **verified** `routes.json`.
3. A short verification report: PNG renders for the three probe corridors + the
   scorecard output, plus the list of tunables and any corridors you couldn't
   fully resolve.
4. Updated pipeline docs (`README.md` "Data pipeline" + `STATUS.md`) describing
   the new process and retiring references to the archived scripts.

> Sanity check before you call it done: open the live app (or PNG renders) at the
> three probe corridors and confirm the §4 orderings by eye **and** that the
> scorecard passes. Then have the human look.

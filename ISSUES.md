# Known issues

Snapshot of what's working and what's still broken, taken mid-iteration so
we have a single place to come back to.

## Done in this session

- **Legend roundel**. `src/components/ProgressBars.tsx` renders each line as
  a horizontal service bar (half its previous thickness) over a hollow
  progress ring whose outer diameter is 80% of the bar width and whose
  stroke width equals the bar thickness. At 0% the legend reads as bars;
  at 100% it reads as TFL roundels.
- **Map ↔ legend ↔ list colour parity**. `src/components/GamePage.tsx`
  resolves `line-color` for the map via a `match` expression on the LINES
  config (`src/app/(game)/london/config.ts`), so the map can never drift
  from the legend or the completed-station list again.
- **Thameslink colour** set to `#D182A0` (config.ts).
- **St Pancras International** added as a separate Thameslink station,
  located slightly west of King's Cross St Pancras
  (`src/app/(game)/london/data/features.json`). Misleading Kings Cross
  aliases removed from `scripts/transform-data.js`.
- **Station circle size** reduced to 0.8× the previous radii on both the
  found and empty layers.
- **Station label position** raised so the label bottom sits ~1em above
  the marker (clears the smaller circle).
- **Postprocess pipeline** (`scripts/postprocess-routes.js`):
    1. Same-line vertex weld at ~40m tolerance (lines that share a
       junction station end up with a shared vertex).
    2. Per-line offset assignment computed from the LINE_ORDER position
       inside each line's local strong-overlap stack, with a nudge loop
       that breaks any residual ties between strongly-overlapping pairs.
    3. Chaikin smoothing pass with a very tight RDP simplification
       afterwards so close-but-distinct branches (Northern Bank vs Charing
       Cross around Kennington) aren't snapped together by the simplifier.

## Open issues

### 1. Same-line gaps at junctions

**Where it shows up:**
- District line between High Street Kensington, Earl's Court, and Gloucester
  Road (the Edgware Road branch ↔ trunk handoff).
- District at Gunnersbury / Chiswick Park / Acton Town (Richmond branch ↔
  Ealing branch ↔ trunk).
- Metropolitan after Harrow on the Hill — West Harrow branch looks
  disconnected from the station because it overlaps with the Northwick
  Park branch around there.
- Northern around Kennington (City/Bank vs Charing Cross/West End branches).
- Visible at most major junctions: Camden Town, Euston, London Blackfriars
  ↔ Elephant & Castle ↔ London Bridge, etc.

**Root cause.** OSM models each platform / track / branch as a separate
`relation` / `way`, so a single line ends up as a handful of disjoint
LineString features. The vertex-weld pass in
`scripts/postprocess-routes.js` is supposed to snap nearby vertices on the
same line to a shared coord, but with the current 40m tolerance some
junction vertices still don't pair up (their nearest neighbour on the
other branch falls slightly outside the window) and the `line-offset`
paint property then nudges the two branches a few pixels apart with no
shared point — that's the gap the eye picks up. A safer fix would weld at
station coordinates explicitly: for every (station, line) pair, find the
nearest vertex on every feature of that line and weld them all to the
station coord. That guarantees connectivity at every station regardless
of OSM's modelling.

### 2. Parallel-line ordering inconsistency

**Where it shows up:**
- Circle ↔ District where they share track — the two lines "switch sides"
  along the shared trunk.
- Farringdon → St Pancras corridor — the visual stack order of the lines
  that run through it changes between zoom levels.

**Root cause.** `line-offset` in MapLibre is a *perpendicular* offset
applied at every vertex along a line, with the perpendicular direction
computed from the LOCAL tangent. Where two lines share a trunk but have
slightly different geometries (because each was derived from a different
OSM relation), their local tangents and therefore their perpendiculars
disagree, and the resulting pixel shift can flip the visual ordering
along the corridor. The zoom dependence comes from the line-offset
multiplier being a zoom-interpolated value: at low zoom the offsets are
tiny so the inconsistency hides inside the line width; at high zoom the
inconsistency becomes a visible "lines crossing over each other".

The clean fix is to align cross-line geometry on shared trunks (replace
both lines' geometry along the trunk with a shared averaged centerline,
similar to what `fetch-osm-routes.js` already does within a line via
`averageTwoWays`, but extended across lines). That's a chunk of geometric
work that wasn't completed this session.

### 3. Same-line parallel ribbons

**Where it shows up:**
- Piccadilly between South Ealing & Heathrow — the T2/3/5 main and the
  T4 loop are separate OSM relations and render as two parallel ribbons
  of the same colour along the shared trunk.
- Thameslink between Finsbury Park and Hitchin — multiple Thameslink
  services on the East Coast Main Line are modelled as separate features.

**What was tried.** A trunk-merging pass in `postprocess-routes.js` that
trimmed each shorter feature to only its non-shadowed portion. It worked
for these specific cases but broke connectivity at every same-line
junction (cf. issue 1), so the trimming pass was reverted. Best path
forward is probably the centerline-averaging approach (issue 2) extended
to handle multiple features of the same line — produce one shared
geometry for the shared trunk plus separate features for the unique
branches.

### 4. Stations toggle / visibility (status unclear)

User reported that the empty station markers don't appear regardless of
the "Show empty markers for all stations" setting. The `stations-base`
layer paint was tightened this session — darker stroke, explicit
`circle-stroke-opacity` case — but the change was not visually verified
because headless Chrome on this Mac wasn't able to render the MapLibre
canvas reliably. Worth verifying in a real browser whether the issue is
now (a) fixed by the stronger styling, (b) still broken because the
layer is genuinely hidden, or (c) was a visibility-against-the-basemap
issue all along.

### 5. Verification gap

Most visual changes this session weren't screenshot-verified by the
agent — headless Chrome with software WebGL on this machine intermittently
returned blank canvases for the map area. The legend renders fine in
those screenshots so the React side was verifiable; the map side needs a
real browser to confirm. Concretely, please eyeball:

- The legend at both 0% and a high percentage to confirm the new roundel
  proportions look right.
- The Thameslink colour against the new `#D182A0`.
- The empty station markers (setting on and off) to verify issue 4.
- District around Earl's Court / Gunnersbury / Acton Town and Northern
  around Kennington to see how much of issue 1 the vertex-weld actually
  fixed.
- Circle ↔ District in central London at multiple zooms to see if
  issue 2 still occurs (it almost certainly does — no cross-line
  geometry alignment was added).

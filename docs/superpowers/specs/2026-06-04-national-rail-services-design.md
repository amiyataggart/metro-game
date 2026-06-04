# Design: add National Rail services (state-owned & privately-owned groups)

_Created 2026-06-04. Approved for implementation._

Adds 12 National Rail services to the London game, grouped in the line picker as
**State-owned National Rail** and **Privately-owned National Rail**, both **off by
default**. Data for the full routes is fetched and stored; only the portion inside
the map's bounding box is displayed, so expanding the box later needs no re-fetch.

Builds on the scoping doc `2026-06-03-additional-services-scoping.md` (the "anatomy
of adding a service" 8-step pipeline) and the verified OSM matchers / colours
recorded during investigation.

## Scope

Services to add (Thameslink already exists and stays as its own standalone group):

- **State-owned National Rail**: South Western Railway, c2c, Greater Anglia,
  Southeastern, Southeastern high speed, Southern, Great Northern, Gatwick Express.
- **Privately-owned National Rail**: Chiltern Railways, East Midlands Railway,
  Great Western Railway, Heathrow Express.

Out of scope (this pass): London Northwestern Railway, Luton Airport DART, London
Trams, London Cable Car. Co-running parallel-ribbon pixel-tuning is a follow-up.

## 1. Display-bounds filter (core new mechanism)

Goal: store full route geometry + all stops on disk, but render only what's inside
the map box, driven solely by the bounds so a future box expansion needs no
re-fetch.

- New constant in `config.ts`: `DISPLAY_BOUNDS` defaulting to `MAP_CONFIG.maxBounds`
  (`[[-1.1, 50.75], [0.73, 52.66]]`). Exported for `visibility.ts`.
- `visibility.ts`:
  - Add `inDisplayBounds(coord)` — simple lng/lat box test against `DISPLAY_BOUNDS`.
  - `visibleStationFeatures` — additionally drop any station outside the box.
  - `visibleRouteFeatures` — clip every line to maximal runs of in-bounds vertices
    (reusing the existing `THAMESLINK_TRIM` run-splitting via `makeRun`), keeping one
    boundary-crossing vertex on each side so the line reaches the box edge.
- **Global**: applies to all lines. Existing lines already fit inside `maxBounds`, so
  it is a no-op for them; QA must confirm no existing edge station is lost (if any is,
  widen `DISPLAY_BOUNDS` slightly beyond the camera `maxBounds`).
- Consequence: stations outside the box are not in the game/score — they are simply
  not displayed, matching the requirement.

The underlying `routes.json` / `features.json` keep full data; this is fully
reversible by widening `DISPLAY_BOUNDS`.

## 2. Data acquisition — full routes, no trim

Extend `scripts/fetch-osm-routes.js`:

- Add to `RELATION_MATCHERS`, `OVERPASS_QUERY`, `LINE_COLORS`, `LINE_ORDER` (orders
  20+). Matchers (verified against Overpass):
  - `route=train` by name prefix: `"Southern:"`, `"GWR:"`, `"CH:"`, `"c2c:"`,
    `"Gatwick Express:"`, `"Great Northern:"`, `"Heathrow Express:"` (Heathrow has an
    **empty operator tag** — match by name only).
  - `route=train` by operator: `Greater Anglia`, `South Western Railway`,
    `East Midlands Railway`, `Southeastern`.
  - **Southeastern high speed** = the Southeastern subset named `"…High Speed:"` /
    ref `HS1` — split into its own line key `SoutheasternHighSpeed`.
  - **Great Northern & Gatwick Express** share `operator=Govia Thameslink Railway`
    with Thameslink → split by name prefix (same idea as the existing `^Thameslink:`
    matcher), never by operator.
- Constrain to a UK area/bbox in the Overpass query to avoid worldwide false
  positives (e.g. Indian "South Western Railways", US "Southeastern").
- Use the **surgical per-service merge** (narrowed query → temp files → replace only
  the new lines' features in `routes.osm.json` / `features.json`): avoids the missing
  `features.original.json`, leaves all existing reviewed geometry byte-for-byte
  intact. Overpass mirror fallbacks (`overpass.kumi.systems`,
  `overpass.private.coffee`) for 504s.
- Re-run `scripts/build-ribbons.js` to regenerate `routes.json` (auto-computes
  parallel `laneOff` where new lines share track).

`LINE_COLORS` / `LINE_ORDER` are duplicated in `config.ts` and `fetch-osm-routes.js`
(known no-single-source) — keep both in sync.

## 3. Colours + stripe extension

12 new `LINES` entries (orders 20–31), each `stripe: 'dashed'`, plus darker
`backgroundColor` and readable `textColor`. User-verified line hexes:

| Group | Service | line key | color | dash |
|---|---|---|---|---|
| State | South Western Railway | `SouthWesternRailway` | `#C63834` | white |
| State | c2c | `C2c` | `#C62F7C` | white |
| State | Greater Anglia | `GreaterAnglia` | `#828795` | white |
| State | Southeastern | `Southeastern` | `#2B65A0` | white |
| State | Southeastern high speed | `SoutheasternHighSpeed` | `#2B65A0` | **`#F4D04D`** |
| State | Southern | `Southern` | `#439752` | white |
| State | Great Northern | `GreatNorthern` | `#BB9767` | white |
| State | Gatwick Express | `GatwickExpress` | `#1A1919` | white |
| Private | Chiltern Railways | `Chiltern` | `#A382AA` | white |
| Private | East Midlands Railway | `EastMidlandsRailway` | `#4F9AB3` | white |
| Private | Great Western Railway | `GreatWesternRailway` | `#2A2D74` | white |
| Private | Heathrow Express | `HeathrowExpress` | `#75BAB1` | white |

Stripe extension: add optional `stripeColor?: string` to the `Line` type (defaults
to `#ffffff`). Threaded through the three render spots:
- `GamePage.tsx` `lines-<band>-stripe-dashed` layer `line-color` (currently hardcoded
  `#ffffff`) → resolve per-line via a `match` on `stripeColor`.
- `LineSwatch.tsx` dashed stroke colour.
- `roundel.ts` dashed stripe stroke colour (and include `stripeColor` in its cache key).

Only `SoutheasternHighSpeed` sets `stripeColor`; everything else inherits white, so
existing lines are unaffected.

## 4. Picker groups, defaults, z-bands

- `LinePicker.tsx` `GROUPS`: append after the existing 5 —
  - `{ name: 'State-owned National Rail', lines: [SouthWesternRailway, C2c,
    GreaterAnglia, Southeastern, SoutheasternHighSpeed, Southern, GreatNorthern,
    GatwickExpress] }`
  - `{ name: 'Privately-owned National Rail', lines: [Chiltern, EastMidlandsRailway,
    GreatWesternRailway, HeathrowExpress] }`
  - Existing expand/collapse + indeterminate-checkbox group behaviour applies.
- `GamePage.tsx` default `enabledLines`: all 12 new keys **default false** (Thameslink
  stays false too). Bump the storage key `${CITY_NAME}-enabled-lines-v4` → `-v5` so
  returning players inherit the new defaults.
- `GamePage.tsx` `zBands`: add all 12 keys to the existing `'nr'` band:
  `{ id: 'nr', keys: ['Thameslink', ...12 new keys] }`. (A key in no band silently
  fails to render — must not forget any.)

## 5. Follow-up (not this spec)

Co-running parallel-ribbon pixel tuning (Southern/GN/Gatwick beside Thameslink on the
Brighton & East Coast main lines; Heathrow Express beside the Elizabeth line on the
GWML). `build-ribbons` gives a reasonable first pass automatically. These lines are
off by default, so polish can land later.

## Verification

- `tsc` clean (new field, new keys).
- `scripts/qa-ribbons.js` / `qa-ribbons-render.js` after rebuild — ordering + render.
- Manual: open picker → two new groups present below Thameslink, both unchecked;
  toggling on a state line shows dashed track clipped to the box; Southeastern high
  speed shows yellow dashes; no existing station disappeared.

## Files touched

1. `scripts/fetch-osm-routes.js` — matchers, query, colours, order.
2. `routes.osm.json` / `features.json` / `stations-extras.json` / `routes.json` —
   regenerated data (surgical merge + build-ribbons).
3. `src/lib/types.ts` — `stripeColor?` on `Line`.
4. `src/app/(game)/london/config.ts` — 12 `LINES` entries, `DISPLAY_BOUNDS`.
5. `src/app/(game)/london/visibility.ts` — bounds filter for stations + routes.
6. `src/components/GamePage.tsx` — zBands, default enabledLines, storage-key bump,
   stripe-colour layer expression.
7. `src/components/LineSwatch.tsx` — stripeColor.
8. `src/lib/roundel.ts` — stripeColor + cache key.
9. `src/components/LinePicker.tsx` — two new groups.

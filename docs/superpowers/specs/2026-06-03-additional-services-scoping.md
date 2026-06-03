# Scoping: adding 8 more services

_Created 2026-06-03 · Updated 2026-06-03 to reflect the add-then-remove of the 3 GTR services. Scoping only._

Services requested: **London Trams, London Cable Car, Southern, Great Northern, Gatwick Express, Heathrow Express, Luton Airport DART, Greater Anglia.**

## Status (2026-06-03)

Since this was first written, **Southern, Great Northern and Gatwick Express were added and then fully removed** again:

- They were briefly un-hidden and rebuilt from a **fresh OSM fetch** (narrowed Overpass query → temp files → replace only those lines' features in `routes.osm.json` / `features.json` → `build-ribbons`), then — at the user's request — **removed entirely**: their `config.ts` `LINES` entries, the `zBands` keys, the `fetch-osm-routes.js` matchers/colours/order, and all their features in `routes.osm.json` / `routes.json` / `features.json` / `stations-extras.json` are gone.
- **Net effect on this doc:** those 3 are **no longer "in pipeline."** Re-adding them is now the same class of work as the greenfield services — *but* the path is **proven**, the OSM matchers are known, and the data characteristics are recorded below, making them the **lowest-risk** of the eight.

**Key learnings from doing it once:**

- **The surgical per-service path works and sidesteps two "shared prerequisites."** A narrowed Overpass query (just the target service) → temp files → a merge that replaces only that service's features avoids the all-or-nothing full re-fetch, *and* never needs `features.original.json` (you bypass `transform-data` by writing the stops straight into `features.json` with the same id/alias logic). It also leaves every other line's reviewed geometry byte-for-byte intact.
- **Overpass congestion is real:** the public endpoint returned `504` repeatedly; a mirror fallback (`overpass.kumi.systems`, `overpass.private.coffee`) made the fetch reliable.
- **Extent is a real problem, now quantified.** With the 3 live, **10 stations fell outside `maxBounds`** (reachable only by expanding bounds or trimming the tails): Southern (8) — Rye, Appledore, Ham Street, Ashford International, Portchester, Fareham, Swanwick, Southampton Central; Great Northern (2) — Watlington, King's Lynn.

## 1. Anatomy of adding a service (the shared cost)

A "line/service" threads through the whole pipeline. Adding one touches up to **8 places**:

| # | File / artifact | What to add | Notes |
|---|---|---|---|
| 1 | `scripts/fetch-osm-routes.js` | a `RELATION_MATCHERS` entry, an `OVERPASS_QUERY` clause, plus `LINE_COLORS` + `LINE_ORDER` entries | Matches OSM `route=*` relations by `ref`/`name`/`operator`. Re-running writes `routes.osm.json` **and** `stations-extras.json` (route geometry + every `stop`-role node). |
| 2 | `scripts/build-ribbons.js` | re-run; **only** add `ORDER_OVERRIDES` / `NO_SNAP` / `FORCE_SNAP` if the service **co-runs** with existing lines | Standalone services (own track) need nothing here. Co-runners on shared corridors are the expensive, fiddly part (cf. the Thameslink work in STATUS). |
| 3 | `scripts/transform-data.js` | usually nothing — non-"original" lines are auto-merged from `stations-extras.json` (Pass 3). Optionally add `NAME_ALIASES` | New services are *not* in `ORIGINAL_LINES`, so their OSM stops merge automatically. |
| 4 | `src/app/(game)/london/config.ts` → `LINES` | `{ name, color, backgroundColor, textColor, order, stripe? }` | Drives legend, colour-match on the map, picker, score. |
| 5 | `src/app/(game)/london/visibility.ts` | add a per-service trim for far-reaching services (generalise `THAMESLINK_TRIM`); `HIDDEN_LINES` can hide a service without deleting it | See §3 "extent". |
| 6 | `src/components/GamePage.tsx` → `zBands` | add the new key to a render z-band (or a new band for a new mode) | Bands are hardcoded key-lists. A key not in any band **won't render as a ribbon**. Also: the `enabledLines` default (everything on except Thameslink) and the `-enabled-lines-v4` storage key. |
| 7 | `config.ts` → `MAP_CONFIG.maxBounds` | expand if the service extends past the current box, **or** trim it (see §3) | Current box `[[-1.1,50.75],[0.73,52.66]]` (lng,lat). |
| 8 | QA | `scripts/qa-ribbons.js` / `qa-ribbons-render.js` | Verify ordering + render after a rebuild. |

### Prerequisite gaps / risks (shared, must resolve once)

- **`features.original.json` is NOT in the repo.** `transform-data.js` reads it to build `features.json`, but only `source.json` (upstream Citymapper, 14 lines), the built `features.json`, and `stations-extras.json` are committed. The documented station pipeline therefore can't be re-run as-is. **Proven workaround (used for the GTR three):** the surgical per-service merge bypasses `transform-data` entirely — write the new stops straight into `features.json` with the same id/alias logic — so this blocker only bites if you insist on the full documented pipeline.
- **`fetch-osm-routes.js` duplicates `LINE_COLORS` / `LINE_ORDER`** that also live in `config.ts`. Both must be kept in sync by hand (no single source).
- **Overpass re-fetch is all-or-nothing & slow** (~60–120s, single query). Adding services means re-pulling everything; `routes.json` is a "human-reviewed baked snapshot" (per STATUS), so a re-fetch + rebuild needs re-review of the cartography overrides.
- **z-band list is hardcoded** — easy to forget; a missing entry silently drops the ribbon.

## 2. Per-service assessment

Extent checked against `maxBounds` lng `[-1.1, 0.73]`, lat `[50.75, 52.66]`. "Greenfield" = not in `source.json` and not in `stations-extras.json` today (needs OSM fetch or manual entry).

| Service | In pipeline today? | Data source | Co-runs with | Extent vs bounds | Rough effort |
|---|---|---|---|---|---|
| **Gatwick Express** | ❌ removed (proven re-add path) | OSM `name~"^Gatwick Express:"` — known matcher; ~7 stations | Thameslink on Brighton Main Line | within | **Low** |
| **Great Northern** | ❌ removed (proven re-add path) | OSM `name~"^Great Northern:"` — known matcher; ~52 stations | Thameslink on ECML (Finsbury Park→Welwyn) | King's Lynn + Watlington past N edge | **Low–Med** |
| **Southern** | ❌ removed (proven re-add path) | OSM name/`operator="Southern"` — known matchers; ~134 stations | Thameslink/Gatwick Exp on BML; many termini | Southampton (-1.41W), Ashford (0.87E) + 6 more past edges | **Med** |
| **London Trams** | ❌ greenfield | OSM `route=tram` | nothing (separate SW/S area) | within | **Med** |
| **London Cable Car** | ❌ greenfield | OSM `aerialway` (likely not a clean route reln) — may need manual 2-pt line | nothing | within | **Low–Med** |
| **Heathrow Express** | ❌ greenfield | OSM `route=train` operator "Heathrow Express" | **Elizabeth line** on GWML (Paddington→Heathrow) | within | **Med** |
| **Luton Airport DART** | ❌ greenfield | OSM tagging uncertain (people-mover / `funicular`) — may need manual entry | nothing (Parkway is a Thameslink interchange) | within (51.87N) | **Low–Med** |
| **Greater Anglia** | ❌ greenfield | OSM `route=train` operator "Greater Anglia" | Elizabeth (GEML Liverpool St→Shenfield), Overground (Lea Valley) | Norwich/Ipswich/Harwich far past E edge (~1.3E) | **High** |

### Detail & special issues

**Gatwick Express** — Smallest (Victoria–Gatwick, a few stops). **Removed**; re-add via the proven path (matcher `name~"^Gatwick Express:"`, ~7 stations, dashed style). Cosmetic tuning where it bundles with Thameslink (and Southern, if also re-added) on the BML.

**Great Northern** — **Removed** (was ~52 stations). Core (Moorgate/King's Cross–Finsbury Park–Welwyn/Hertford/Cambridge/Peterborough) is in-bounds; **King's Lynn and Watlington sit past the N edge** (bounds were chosen to exclude King's Lynn — see the `config.ts` comment). Either expand N or add a GN trim. Co-runs with Thameslink on the ECML north of Finsbury Park → minor override work.

**Southern** — **Removed** (was ~134 stations). Big network: **8 stations fall outside the box** (Southampton/Fareham/Portchester/Swanwick to the W; Ashford/Rye/Appledore/Ham Street to the SE); Brighton/Portsmouth near the edges. Decision needed: expand bounds (zooms the overview way out) vs. a Southern trim to a London-area boundary. Heavy **co-running on the Brighton Main Line** (Victoria/London Bridge–East Croydon–Gatwick) with Thameslink (+ Gatwick Express if re-added) → real `ORDER_OVERRIDES`/`NO_SNAP` work, plus large interchange pies at Clapham Junction / East Croydon / London Bridge / Victoria.

**London Trams (Tramlink)** — New **mode** (tram). ~35 stops, 4 routes, Wimbledon–Croydon–Beckenham–Elmers End–New Addington, all in-bounds. Self-contained (doesn't co-run with tube) → **no cartography overrides**, but needs: an Overpass clause for `route=tram` (+ `tram_stop` nodes), a `LINES` entry (TfL trams green), and **its own z-band** (or shares NR band). Name collisions are *good* here (Wimbledon, East/West Croydon, Beckenham Jct, Elmers End → interchange pies). Greenfield stations from OSM.

**London Cable Car (IFS Cloud)** — Only **2 stations** (Royal Docks ↔ Greenwich Peninsula), in-bounds. Risk: it's an `aerialway` (gondola), **probably not a standard `route` relation**, so the matcher pattern may not catch it — likely needs a bespoke matcher or a hand-entered 2-point line + 2 stations. Trivial geometry, no co-running. Needs a `LINES` entry + z-band.

**Heathrow Express** — Greenfield, ~3–4 stations (Paddington, Heathrow T2&3, T5), in-bounds. **Co-runs with the Elizabeth line on the GWML** (Paddington→Heathrow) → needs `ORDER_OVERRIDES`/`NO_SNAP` so it parallels rather than weaves through Elizabeth. New matcher (operator "Heathrow Express"), `LINES` entry (HEX purple), z-band.

**Luton Airport DART** — Greenfield, **2 stations** (Luton Airport Parkway ↔ Luton Airport), in-bounds at the N (51.87). Risk: it's a short automated people-mover; **OSM tagging is uncertain** (may be `route=funicular`/people-mover or just a way) → probe Overpass first; may be simplest to **hand-enter** the 2 stops + a straight line. Parkway is a Thameslink/EMR interchange. New `LINES` entry + z-band.

**Greater Anglia** — **Biggest job.** Liverpool Street hub fanning out to Norwich, Ipswich, Harwich, Clacton, Colchester, Cambridge, Stansted, Southend — **most of which are far past the E edge** (Norwich ~1.3E vs box 0.73E). Requires either a large bounds expansion (overview zooms out to all of East Anglia — bad UX) or **aggressive trimming to a London boundary** (generalise the `THAMESLINK_TRIM` mechanism). Co-runs with **Elizabeth on the GEML** (Liverpool St–Stratford–Shenfield) and **Overground (Weaver/Liberty)** on the Lea Valley / Romford lines → override work + name-collision/interchange handling. Large station count.

## 3. Cross-cutting decisions

1. **Bounds vs. trim (the big one).** Four services (Southern, GN, Greater Anglia, and to a lesser extent Gatwick Exp/Luton) reach beyond the current box. Options:
   - **Expand `maxBounds`** to encompass everything → the default overview zooms out to the whole of the South-East/East Anglia, shrinking London (worse for the core game).
   - **Generalise `THAMESLINK_TRIM`** into a reusable per-service "trim to a London-area boundary" in `visibility.ts` (it already does exactly this for Thameslink via bearing/distance boundary stations). **Recommended** — keeps the map London-focused and is the established pattern.
2. **New modes / z-bands.** Trams, Cable Car and the DART are not National Rail. Decide whether each gets its own z-band (and where in the stack) or rides an existing band. The `ug` band is computed (`order ≤ 10`); everything else is an explicit key-list.
3. **Default enabled set.** `GamePage` turns every line on except Thameslink. Adding ~8 services (some sprawling) likely means more **off-by-default**; that also means **bumping the `-enabled-lines-v*` storage key** so existing players pick up the new defaults.
4. **Colours.** All eight services need real TfL/NR colours, added in **both** `config.ts` and `fetch-osm-routes.js` (the GTR three's previous colours were removed along with everything else).
5. **Interchange pies at big termini.** Liverpool St, Victoria, London Bridge, Clapham Junction, East Croydon will gain many segments. The per-platform pie logic (`interchanges.ts`, `CLUSTER_M = 30 m`) should cope but warrants a visual check.
6. **Name collisions with Overground.** Lea Valley (Cheshunt/Enfield/Chingford → Weaver) and Romford/Upminster (→ Liberty) overlap Greater Anglia/c2c-style services; Tramlink overlaps rail at Croydon/Wimbledon. These merge into interchange pies **only if names match exactly** — alias curation may be needed.

## 4. Suggested sequencing (cheapest → hardest)

1. **Decide bounds-vs-trim first** (generalise `THAMESLINK_TRIM`) — it gates Southern, GN and Greater Anglia. `features.original.json` reconstruction is **no longer a hard prerequisite**: the surgical per-service merge avoids it.
2. **Re-add the 3 GTR services** (Gatwick Express → Great Northern → Southern) via the proven surgical path, tackling extent-trim + co-running overrides in that order of difficulty. Lowest risk of the eight — matchers and data characteristics are already known.
3. **Self-contained greenfield**: London Trams, then Cable Car, then Luton DART (each is isolated; main cost is the OSM probe / possible manual entry + a z-band).
4. **Co-running greenfield**: Heathrow Express (vs Elizabeth).
5. **Greater Anglia last** (extent + trimming + co-running + volume).

### Rough effort

- Per **GTR re-add** (proven surgical path): ~0.5–1 day each (mostly extent-trim + cartography tuning).
- Per **isolated greenfield** (Trams / Cable Car / DART): ~0.5–1.5 days each (data probe + wiring; Trams the most for ~35 stops).
- **Heathrow Express**: ~1 day (co-running overrides).
- **Greater Anglia**: ~2–4 days (extent strategy, trimming, overrides, volume, collisions).
- **Shared groundwork** (generalised trim + z-band/defaults refactor): ~1 day, done once.

This is scoping only; each service should get its own brainstorm → spec → plan before building.

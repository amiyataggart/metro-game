# Line-completion celebration — design

_Date: 2026-06-01 · Status: draft for review_

## Goal

Celebrate progress milestones in the London tube-map quiz:

1. **Per-line:** when the player completes 100% of a single visible line, burst confetti made of **that line's roundel** and flash that line on the map.
2. **Grand finale:** when the player completes 100% of **every visible (enabled) line**, play a larger celebration. On the final station this fires **alongside** the per-line burst for the line that station completed (both at once, by design).

Celebrations fire **only for genuine in-session completions** — never on page reload of an already-complete game, and never for the "Reveal all" debug action.

This revives and extends a confetti effect that existed in the parent repo (`tsparticles-confetti` in `FoundSummary.tsx`), removed in fork commit `b567f6e`. See `memory/confetti-prior-art.md`.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Confetti particle | The **legend roundel** (coloured ring + bar + white solid/dashed stripe), reused per line, drawn in its completed state |
| Library | **`tsparticles-confetti`** — required because roundels are two-tone, which needs *image* particles (`shapes: ['image']`); `canvas-confetti` only supports single-colour shapes. This is the same mechanism the parent repo used. |
| Detection | A baseline-guarded diff in a `GamePage` effect (not `FoundSummary`, which is mounted twice and would double-fire) |
| On-map flash | A temporary highlight layer per completed line, animated (width/opacity/blur pulse ~1 s) then removed |
| Final moment | Per-line burst **and** finale fire together (not suppressed/escalated) |
| Suppress "Reveal all" | Yes — explicit suppression flag |
| Suppress reload | Yes — an explicit **baseline-ready** guard: the first hydrated state is recorded as a silent baseline, never celebrated |

## Architecture

Five focused units, each independently understandable and testable:

### 1. `src/lib/roundel.ts` (new) — shared roundel geometry

Pure function extracted from the existing `LegendRoundel` in `ProgressBars.tsx`:

```ts
// Returns SVG markup for a line's roundel. pct controls the progress arc;
// confetti uses pct = 1 (full ring → reads as a roundel).
export function roundelSvg(line: Line, opts?: { pct?: number }): string

// Cached data-URL image descriptor for confetti image particles.
export function roundelImage(line: Line): { src: string; width: number; height: number }
```

- `roundelSvg` holds the geometry currently inline in `LegendRoundel` (ring, bar, solid/dashed white stripe), parameterised by `line.color` / `line.stripe` and `pct`.
- `roundelImage` wraps `roundelSvg(line, { pct: 1 })` as a `data:image/svg+xml;utf8,…` URL at a fixed 64×64 box, **memoised per line key** (built once, reused for every burst).

**Depends on:** `Line` type only. No React.

### 2. `src/components/ProgressBars.tsx` — refactor (no visual change)

`LegendRoundel` is reworked to render `roundelSvg(line, { pct })` instead of its own inline SVG, so the legend and the confetti share one source of geometry. Output must be byte-equivalent to today's legend (verify visually).

### 3. `src/lib/completion.ts` (new) — pure detection

```ts
export interface CompletionInput {
  prevPerLine: Record<string, number>             // previous foundStationsPerLine (real prior play state)
  perLine: Record<string, number>                  // current foundStationsPerLine
  totals: Record<string, number>                   // stationsPerLine (enabled)
  prevFoundCount: number
  foundCount: number
}
export interface CompletionResult {
  newlyCompleteLines: string[]   // lines that went →100% on a real find this tick
  allJustCompleted: boolean      // every enabled line is now 100% (and wasn't before)
}
export function detectCelebrations(i: CompletionInput): CompletionResult
```

Rules:
- **Gate on a real find:** if `foundCount <= prevFoundCount`, return empty. This kills celebrations caused by toggling a line off (which can shrink the denominator to make `foundProportion` hit 1 without any new find).
- `newlyCompleteLines`: lines where `perLine[line] > (prevPerLine[line] ?? 0)`, and `perLine[line] === totals[line] > 0`.
- `allJustCompleted`: every enabled line with `totals[line] > 0` is complete now, and at least one was incomplete in `prevPerLine`.

`detectCelebrations` assumes `prevPerLine` is a **real prior play state**, not the hydration jump — the caller guarantees this via the baseline-ready guard (below), so the function never has to reason about reload. Pure and synchronous → unit-testable in isolation (TDD).

### 4. `src/lib/mapFlash.ts` (new) — on-map line flash

```ts
export function flashLines(
  map: maplibregl.Map,
  lineKeys: string[],
  expr: { lineOffset: ExpressionSpec; lineWidth: ExpressionSpec },
  opts?: { finale?: boolean },
): void
```

- Adds a temporary `line` layer (`lines-flash-<n>`) on the `lines` source, filtered to `lineKeys`, inserted **just below `stations-base`** so it sits above the ribbon bands but under the markers.
- Reuses the **same `line-offset` expression** as the ribbon layers so the glow tracks the real (offset) ribbon position; `line-width` animates from the base width up to ~2.5× and back, with `line-opacity`/`line-blur` pulsing, over ~900 ms (finale ~1.4 s) via `requestAnimationFrame` + `setPaintProperty`.
- Glow colour: a white halo (reads as a shimmer over any line colour). Removes the layer on completion.
- To share the offset/width expressions, **hoist** the `lineOffset` / `lineWidth` expression builders in `GamePage` out of the map-init closure (module-level helpers) so both init and `flashLines` use one definition.

### 5. `src/hooks/useCelebration.ts` (new) — confetti orchestration

```ts
export function useCelebration(): {
  celebrateLines: (lineKeys: string[]) => void   // one burst, roundels of the given lines
  celebrateFinale: (allLineKeys: string[]) => void // bigger, mix of all visible roundels
}
```

- **Dynamic-imports** `tsparticles-confetti` on first use (keeps it out of the initial bundle, as the original did; also avoids any SSR/static-export issue since the call only runs in a browser event handler).
- `celebrateLines`: `confetti({ spread: 120, particleCount: 150, origin: { y: 0.2 }, decay: 0.85, gravity: 2, startVelocity: 50, scalar: 2, ticks: 200, shapes: ['image'], shapeOptions: { image: lineKeys.map(roundelImage) } })` (parent-repo values).
- `celebrateFinale`: larger — more particles / longer `ticks`, two origins (left + right) for a fuller sweep, `image` = every visible line's roundel.

## Data flow

`GamePage` holds three refs: `prevPerLineRef`, `prevFoundCountRef`, and `baselineReadyRef` (plus the `suppressRef` for Reveal-all). The detection effect depends on `localFound`, `foundStationsPerLine`, `stationsPerLine`, `found.length`.

```
Input (Enter) ──setFound──▶ GamePage state
                              │  recompute foundStationsPerLine / found.length
                              ▼
   detection useEffect (GamePage):
     if localFound == null: return                       // not hydrated yet — do nothing
     const advanceBaseline = () => { prevPerLineRef = foundStationsPerLine; prevFoundCountRef = found.length }

     if (!baselineReadyRef.current):                      // first hydrated state
         advanceBaseline(); baselineReadyRef = true; return     // silent baseline — never celebrated
     if (suppressRef.current):                            // Reveal-all
         advanceBaseline(); suppressRef = false; return         // skip, but advance baseline
     {
       const r = detectCelebrations({ prevPerLine: prevPerLineRef, perLine: foundStationsPerLine,
                                      totals: stationsPerLine, prevFoundCount: prevFoundCountRef, foundCount: found.length })
       if (r.newlyCompleteLines.length) { celebrateLines(r.newlyCompleteLines); flashLines(map, r.newlyCompleteLines) }
       if (r.allJustCompleted)          { celebrateFinale(enabledKeys);         flashLines(map, enabledKeys, { finale: true }) }
       advanceBaseline()                                  // always advance, even when nothing fired
     }
```

- **Both-at-once:** on the last station, `newlyCompleteLines` holds the final line **and** `allJustCompleted` is true, so both branches run in the same tick.
- **Reload:** the first hydrated state (which may already be 100%) is captured by `baselineReadyRef` as a silent baseline and returns before any detection — nothing fires.
- **Reveal all:** `revealAll` sets `suppressRef.current = true` immediately before `setFound(ids)`; the effect skips firing, advances the baseline, and clears the flag, so the next real find diffs correctly.
- **Toggle a line off to reach 100%:** `found.length` doesn't increase → `detectCelebrations` gate returns empty → no finale. The baseline still advances (totals changed), so a later real find diffs correctly.
- **Baseline always advances** on every non-early-return path, so a fired (or gated) tick never leaves a stale baseline that double-fires next time.

## Files touched

| File | Change |
|---|---|
| `src/lib/roundel.ts` | **new** — `roundelSvg`, `roundelImage` (extracted geometry) |
| `src/lib/completion.ts` | **new** — pure `detectCelebrations` |
| `src/lib/mapFlash.ts` | **new** — `flashLines` |
| `src/hooks/useCelebration.ts` | **new** — confetti orchestration (dynamic import) |
| `src/components/ProgressBars.tsx` | refactor `LegendRoundel` onto `roundelSvg` (no visual change) |
| `src/components/GamePage.tsx` | detection effect + `suppressRef`; wire `revealAll`; call `celebrate*` / `flashLines`; hoist `lineOffset`/`lineWidth` expressions |
| `package.json` | add `tsparticles-confetti` (restores the parent-repo dependency) |

`FoundSummary.tsx` is **not** the home for detection (it is mounted twice).

## Testing

- **Unit (TDD):** `detectCelebrations` — covers single completion, multi-line completion on one find, the all-complete transition (fires) vs. already-all-complete (no `allJustCompleted`), and the found-count gate (toggle case). Reload is handled by the caller's baseline-ready guard, so it's covered by the manual check below rather than this pure function.
- **Manual:**
  - Complete one line → its roundel bursts + that line flashes.
  - Complete the last line → final line bursts **and** finale plays together.
  - "Reveal all" → no celebration.
  - Reload an already-complete game → no celebration.
  - Toggle the only-incomplete line off so the score hits 100% → no celebration.
  - Verify the legend looks unchanged after the `roundel.ts` refactor.
- **Build:** `npm run build` (static export) succeeds; confetti import is browser-only.

## Out of scope / YAGNI

- Sound effects.
- Persisted "already celebrated this line" state across sessions (reload suppression covers the practical case).
- Reduced-motion handling — _possible follow-up:_ skip/curtail confetti when `prefers-reduced-motion` is set.
- Celebrating lines that are completed but currently toggled off.

// Pure detection of line-completion celebration triggers. Kept free of React /
// map so it can be reasoned about and unit-tested in isolation. The caller
// (GamePage) is responsible for only invoking this on a *real prior play state*
// — i.e. after a baseline-ready guard has skipped the hydration jump and a
// Reveal-all suppression flag has been handled. See the design spec.

export interface CompletionInput {
  /** previous foundStationsPerLine (a real prior play state, not hydration) */
  prevPerLine: Record<string, number>
  /** current foundStationsPerLine */
  perLine: Record<string, number>
  /** stationsPerLine for currently-enabled lines */
  totals: Record<string, number>
  /** size of the found set before this change */
  prevFoundCount: number
  /** size of the found set after this change */
  foundCount: number
}

export interface CompletionResult {
  /** lines that crossed to 100% on a genuine find this tick */
  newlyCompleteLines: string[]
  /** every enabled line is now 100% and at least one wasn't before */
  allJustCompleted: boolean
}

export function detectCelebrations(i: CompletionInput): CompletionResult {
  // Gate on a real find. Toggling a line off can shrink the denominator so the
  // overall score hits 100% with no new station found — that must not celebrate.
  if (i.foundCount <= i.prevFoundCount) {
    return { newlyCompleteLines: [], allJustCompleted: false }
  }

  const lines = Object.keys(i.totals).filter((l) => i.totals[l] > 0)

  const newlyCompleteLines = lines.filter((l) => {
    const now = i.perLine[l] ?? 0
    const before = i.prevPerLine[l] ?? 0
    return now > before && now === i.totals[l]
  })

  const isComplete = (perLine: Record<string, number>) =>
    lines.length > 0 && lines.every((l) => (perLine[l] ?? 0) === i.totals[l])

  const allJustCompleted = isComplete(i.perLine) && !isComplete(i.prevPerLine)

  return { newlyCompleteLines, allJustCompleted }
}

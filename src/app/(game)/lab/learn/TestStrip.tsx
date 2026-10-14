'use client'
// The Test tab drawn as the Route strip: every stop a numbered blank that
// fills in as the player types the stops in order. The strip is imported as
// is (./Route's StripView); the current blank and the stops that had to be
// shown are marked with CSS aimed at the strip's own markup (its blanks carry
// "Hidden station N" labels; the phone list is one <li> per stop).
import type { LineInfo } from './data'
import { StripView, useStripStops } from './Route'

const q = (s: string) => JSON.stringify(s) // a CSS string (names hold apostrophes)

export default function TestStrip({
  line,
  stops,
  lineOf,
  linesAt,
  isFound,
  answered,
  shown,
  current,
  touch,
  fontFamily,
}: {
  line: LineInfo
  stops: string[]
  lineOf: (k: string) => LineInfo
  linesAt: Record<string, string[]>
  isFound: (name: string) => boolean | null
  /** stops [0, answered) are filled in */
  answered: number
  /** indices of stops that were shown (Show), not typed */
  shown: Set<number>
  /** index of the blank being asked, if a run is going */
  current?: number
  touch: boolean
  fontFamily: string
}) {
  const { stripLine, stripLines, info } = useStripStops({ line, stops, lineOf, linesAt, isFound })
  const revealed = new Set(stops.slice(0, answered))
  const cur = current !== undefined ? current + 1 : 0
  const css = [
    cur &&
      `.lr-test g[aria-label="Hidden station ${cur}"] rect[rx="8"]{fill:var(--cur);stroke:#f59e0b;stroke-width:2;stroke-dasharray:4 3}
.lr-test g[aria-label="Hidden station ${cur}"] text{fill:var(--cur-ink)}
.lr-test ol>li:nth-child(${cur}) span[class*="bg-[var(--blank)]"]{background:var(--cur);color:var(--cur-ink);outline:2px dashed #f59e0b;outline-offset:-2px}
.lr-test ol>li:nth-child(${cur})>button{background:var(--cur-row)}`,
    ...Array.from(shown).map(
      (i) => `.lr-test g[aria-label=${q(stops[i])}] text{fill:var(--ns-reveal)}
.lr-test ol>li:nth-child(${i + 1}) span.leading-tight{color:var(--ns-reveal)!important}`,
    ),
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div className="lr-route lr-test">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <StripView
        touch={touch}
        fontFamily={fontFamily}
        line={stripLine}
        stops={info}
        lineOf={stripLines}
        learning
        progress={false}
        revealed={revealed}
        selected={current !== undefined ? stops[current] : null}
        onStop={() => {}}
      />
    </div>
  )
}

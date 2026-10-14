'use client'
// The Test tab drawn as the Route strip: every stop a numbered blank that
// fills in as the player types the stops in order. The strip is imported as
// is (./Route's StripView); the current blank and the stops that had to be
// shown are marked with CSS aimed at the strip's own markup (its blanks carry
// "Hidden station N" labels; the phone list is one <li> per stop).
import { useEffect, useRef } from 'react'
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
  popAt,
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
  /** index of the stop just filled in: it plays the original Test's
   *  animations (marker pops in, name slides in) */
  popAt?: number
  touch: boolean
  fontFamily: string
}) {
  const { stripLine, stripLines, info } = useStripStops({ line, stops, lineOf, linesAt, isFound })
  // the stop just filled in plays the original Test's animations once: its
  // marker pops in and its name slides in (along its slant on the strip).
  // Played from here (Web Animations), not a CSS rule, because the strip
  // re-renders while a run is going and a CSS animation restarted every time.
  const root = useRef<HTMLDivElement>(null)
  const popName = popAt !== undefined && popAt >= 0 && popAt < answered ? stops[popAt] : null
  useEffect(() => {
    const el = root.current
    if (!el || popName === null || popAt === undefined) return
    const pop: Keyframe[] = [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]
    const slide: Keyframe[] = [
      { transform: 'translateX(-10px)', opacity: 0, filter: 'blur(2px)' },
      { transform: 'none', opacity: 1, filter: 'none' },
    ]
    const popOpts = { duration: 520, easing: 'cubic-bezier(.2,1.6,.4,1)' }
    const slideOpts = { duration: 420, easing: 'ease-out' }
    const play = (e: Element | null, k: Keyframe[], o: KeyframeAnimationOptions) => {
      if (!e) return
      if (e instanceof SVGElement) {
        e.style.transformBox = 'fill-box'
        e.style.transformOrigin = 'center'
      }
      else if (e instanceof HTMLElement && getComputedStyle(e).display === 'inline') e.style.display = 'inline-block'
      e.animate(k, o)
    }
    const g = el.querySelector(`g[aria-label=${q(popName)}]`)
    if (g) {
      play(g.querySelector(':scope>circle, :scope>rect:not([fill="transparent"])'), pop, popOpts)
      g.querySelectorAll(':scope>g>text').forEach((t) => play(t, slide, slideOpts))
    }
    const li = el.querySelector(`ol>li:nth-child(${popAt + 1})`)
    if (li) {
      play(li.querySelector('span.leading-tight'), slide, slideOpts)
      play(li.querySelector('svg'), pop, popOpts)
    }
  }, [popName, popAt])
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
    <div ref={root} className="lr-route lr-test">
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

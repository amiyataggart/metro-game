'use client'

import { useEffect, useRef } from 'react'
import type { Line } from '@/lib/types'
import LineSwatch from '@/components/LineSwatch'
import { LineGroup, isDarkColor, shortName, uiColor } from './lines'

// Phone: the horizontal line strip directly above the input. Each pill is the
// line's legend entry, its progress (fill + count) and its in-play toggle.
export default function Strip({
  groups,
  LINES,
  found,
  total,
  enabled,
  toggle,
  pulse,
}: {
  groups: LineGroup[]
  LINES: Record<string, Line>
  found: Record<string, number>
  total: Record<string, number>
  enabled: Record<string, boolean>
  toggle: (key: string) => void
  /** lines touched by the latest find (pulse + scroll into view) */
  pulse: { keys: string[]; at: number } | null
}) {
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pulse || !scroller.current) return
    const el = scroller.current.querySelector<HTMLElement>(`[data-line="${pulse.keys[0]}"]`)
    if (!el) return
    const s = scroller.current
    const left = el.offsetLeft - (s.clientWidth - el.offsetWidth) / 2
    s.scrollTo({ left, behavior: 'smooth' })
  }, [pulse])

  return (
    <div
      ref={scroller}
      className="flex snap-x items-center gap-1.5 overflow-x-auto px-3 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {groups.map((g, gi) => (
        <div key={g.mode.id} className="flex shrink-0 items-center gap-1.5">
          <span
            className={`flex h-8 shrink-0 items-center text-[10px] font-bold uppercase tracking-[0.12em] text-white/45 ${gi ? 'ml-2 border-l border-white/10 pl-3' : 'pl-0.5'}`}
          >
            {g.mode.short}
          </span>
          {g.keys.map((k) => {
            const line = LINES[k]
            const n = found[k] ?? 0
            const N = total[k] ?? 0
            const on = !!enabled[k]
            const pct = N ? n / N : 0
            const done = on && N > 0 && n === N
            const pulsing = !!pulse && pulse.keys.includes(k)
            return (
              <button
                key={pulsing ? `${k}-${pulse!.at}` : k}
                type="button"
                data-line={k}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggle(k)}
                aria-pressed={on}
                aria-label={`${line.name}: ${on ? `${n} of ${N} found, in play` : 'not in play'}. Tap to ${on ? 'remove from' : 'add to'} play.`}
                style={pulsing ? ({ '--pc': line.color } as React.CSSProperties) : undefined}
                className={[
                  'relative flex h-8 shrink-0 snap-center items-center gap-1.5 overflow-hidden rounded-full pl-2 pr-2.5 text-[12.5px] font-bold transition-opacity',
                  on ? 'border border-white/10 bg-white/[0.07] text-white' : 'border border-dashed border-white/20 text-white/45',
                  pulsing ? 'dock-pulse' : '',
                ].join(' ')}
              >
                {on && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
                    style={{ width: `${pct * 100}%`, background: `linear-gradient(to top, ${uiColor(line)} 0 3px, transparent 3px), ${uiColor(line)}${done ? '88' : '40'}` }}
                  />
                )}
                <span className={`relative flex items-center rounded-full ${isDarkColor(line.color) ? 'ring-1 ring-white/40' : ''} ${on ? '' : 'opacity-50 grayscale'}`}>
                  <LineSwatch line={line} size="xs" />
                </span>
                <span className="relative whitespace-nowrap">{shortName(k, line)}</span>
                {on ? (
                  <span className="relative whitespace-nowrap text-[11px] font-semibold tabular-nums text-white/60">
                    {done ? '★' : `${n}/${N}`}
                  </span>
                ) : (
                  <span className="relative text-[10px] font-semibold uppercase tracking-wider text-white/35">off</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

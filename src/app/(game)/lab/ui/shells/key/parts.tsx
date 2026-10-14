'use client'

import classNames from 'classnames'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Line } from '@/lib/types'
import { roundelSvg } from '@/lib/roundel'
import type { KeyGroup } from './groups'
import { shortName } from './groups'

export const ACCENT = '#0019a8'
export const fmtInt = (n: number) => n.toLocaleString('en-GB')

/** Dark mode: the Northern line is white (as on the Night Tube map); other near-black lines (Gatwick Express) light grey. */
export function uiLine(line: Line, dark: boolean): Line {
  if (!dark) return line
  // white stripe cores turn black at night, as on the map
  if (line.stripe && !line.stripeColor) line = { ...line, stripeColor: '#000000' }
  if (line.name === 'Northern') return { ...line, color: '#ffffff' } // white on the Night Tube map
  const h = line.color.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return lum < 0.12 ? { ...line, color: '#e4e4e7' } : line
}

/* ------------------------------------------------------------------ */
/* Roundel (lib/roundel: progress ring + line bar), as /london's legend */
/* ------------------------------------------------------------------ */

// The line's roundel exactly as /london's legend draws it: the ring colours in
// as the line's stations are found.
export function KeyRoundel({ line, pct, on, size = 26 }: { line: Line; pct: number; on: boolean; size?: number }) {
  const html = useMemo(() => roundelSvg(line, { pct, px: size }), [line, pct, size])
  return (
    <span
      className={classNames('relative block shrink-0 transition-[filter,opacity]', !on && 'opacity-30 grayscale')}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="absolute inset-0 [&>svg]:block" dangerouslySetInnerHTML={{ __html: html }} />
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Pips (in-play toggles)                                              */
/* ------------------------------------------------------------------ */

export function GroupPip({ state }: { state: 'all' | 'some' | 'none' }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-zinc-900 dark:text-zinc-100" aria-hidden>
      {state === 'all' && (
        <>
          <circle cx="8" cy="8" r="7.25" fill="currentColor" />
          <path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" className="stroke-white dark:stroke-zinc-900" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {state === 'some' && (
        <>
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M4.6 8h6.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {state === 'none' && (
        <circle cx="8" cy="8" r="6.6" fill="none" stroke="#a1a1aa" strokeWidth="1.3" strokeDasharray="2.6 2" />
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Barcode: one bar per line, grouped by mode                          */
/* ------------------------------------------------------------------ */

export function Barcode({
  groups,
  LINES,
  enabled,
  frac,
  height = 28,
  pulse,
  dark = false,
}: {
  groups: KeyGroup[]
  LINES: Record<string, Line>
  enabled: Record<string, boolean>
  frac: (k: string) => number
  height?: number
  pulse?: Set<string>
  dark?: boolean
}) {
  return (
    <div className="flex w-full items-end gap-[5px]" style={{ height }}>
      {groups.map((g) => (
        <div key={g.id} className="flex h-full items-end gap-[2px]" style={{ flexGrow: g.keys.length, flexBasis: 0 }}>
          {g.keys.map((k) => {
            const on = enabled[k]
            const f = frac(k)
            const color = uiLine(LINES[k], dark).color
            return (
              <div
                key={k}
                title={`${LINES[k].name}${on ? ` · ${Math.round(f * 100)}%` : ' · off'}`}
                className={classNames(
                  'relative h-full min-w-[2px] flex-1 overflow-hidden rounded-[2px]',
                  !on && 'border border-dashed border-zinc-300 dark:border-zinc-600',
                )}
                style={on ? { background: hexA(color, 0.18) } : undefined}
              >
                {on && (
                  <div
                    className={classNames('absolute inset-x-0 bottom-0', pulse?.has(k) && 'animate-pulse')}
                    style={{
                      height: `${f > 0 ? Math.max(8, f * 100) : 0}%`,
                      background: color,
                      transition: 'height 600ms cubic-bezier(.2,.8,.2,1)',
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function hexA(hex: string, a: number) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/* ------------------------------------------------------------------ */
/* Line chip (feedback / recent)                                       */
/* ------------------------------------------------------------------ */

export function LineChip({ line }: { line: Line }) {
  return (
    <span
      className="inline-flex h-5 items-center rounded-[4px] px-1.5 text-[11px] font-bold leading-none"
      style={{ background: line.color, color: line.textColor || '#fff' }}
    >
      {shortName(line)}
    </span>
  )
}

export function LineDots({ lines, LINES }: { lines: string[]; LINES: Record<string, Line> }) {
  return (
    <span className="flex w-[52px] shrink-0 items-center gap-[3px]">
      {lines.slice(0, 6).map((k) => (
        <span
          key={k}
          title={LINES[k]?.name}
          className="h-2 w-2 shrink-0 rounded-full dark:ring-1 dark:ring-white/25"
          style={{ background: LINES[k]?.color }}
        />
      ))}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Compact timer (lives in the key header)                             */
/* ------------------------------------------------------------------ */

export function KeyTimer({ hidden }: { hidden: boolean }) {
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const base = useRef(0)
  useEffect(() => {
    if (hidden) setRunning(false)
  }, [hidden])
  useEffect(() => {
    if (!running) return
    base.current = performance.now() - elapsed
    const iv = setInterval(() => setElapsed(performance.now() - base.current), 250)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])
  if (hidden) return null
  const s = Math.floor(elapsed / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const txt = s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
  return (
    <button
      type="button"
      onClick={() => setRunning((r) => !r)}
      className={classNames(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-bold tabular-nums transition-colors',
        running
          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
          : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-300',
      )}
      aria-label={running ? 'Pause timer' : 'Start timer'}
    >
      {running ? (
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="currentColor"><rect x="1.5" y="1" width="2.4" height="8" rx=".6" /><rect x="6.1" y="1" width="2.4" height="8" rx=".6" /></svg>
      ) : (
        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="currentColor"><path d="M2 1.2v7.6L8.6 5z" /></svg>
      )}
      {txt}
    </button>
  )
}

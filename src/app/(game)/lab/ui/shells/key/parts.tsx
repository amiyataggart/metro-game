'use client'

import classNames from 'classnames'
import { useEffect, useRef, useState } from 'react'
import type { Line } from '@/lib/types'
import type { KeyGroup } from './groups'
import { shortName } from './groups'

export const ACCENT = '#0019a8'
export const fmtInt = (n: number) => n.toLocaleString('en-GB')

/* ------------------------------------------------------------------ */
/* Line stripe = legend sample + progress bar                          */
/* ------------------------------------------------------------------ */

export function LineStripe({
  line,
  frac,
  on,
  width = 72,
  height = 8,
}: {
  line: Line
  frac: number
  on: boolean
  width?: number
  height?: number
}) {
  const r = height / 2
  const fw = frac > 0 ? Math.max(height, frac * width) : 0
  const cy = r
  const sw = Math.max(1.4, height / 3.2)
  const id = `ks-${line.name.replace(/\W/g, '')}-${width}`
  if (!on) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden>
        <rect
          x={0.6}
          y={0.6}
          width={width - 1.2}
          height={height - 1.2}
          rx={r - 0.6}
          fill="none"
          stroke="#a1a1aa"
          strokeWidth={1.2}
          strokeDasharray="3 2.4"
        />
      </svg>
    )
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden>
      <defs>
        <clipPath id={id}>
          <rect x={0} y={0} width={width} height={height} rx={r} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect x={0} y={0} width={width} height={height} fill={line.color} opacity={0.2} />
        <rect
          x={0}
          y={0}
          width={fw}
          height={height}
          fill={line.color}
          style={{ transition: 'width 600ms cubic-bezier(.2,.8,.2,1)' }}
        />
        {line.stripe === 'solid' && fw > 0 && (
          <line x1={0} y1={cy} x2={fw} y2={cy} stroke="#fff" strokeWidth={sw} />
        )}
        {line.stripe === 'dashed' && fw > 0 && (
          <line
            x1={0}
            y1={cy}
            x2={fw}
            y2={cy}
            stroke={line.stripeColor ?? '#fff'}
            strokeWidth={sw}
            strokeDasharray="3.5 2.5"
          />
        )}
        {line.stripe === 'triple' && fw > 0 && (
          <>
            <line x1={0} y1={height * 0.33} x2={fw} y2={height * 0.33} stroke="#fff" strokeWidth={1} />
            <line x1={0} y1={height * 0.67} x2={fw} y2={height * 0.67} stroke="#fff" strokeWidth={1} />
          </>
        )}
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Pips (in-play toggles)                                              */
/* ------------------------------------------------------------------ */

export function LinePip({ color, on }: { color: string; on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
      {on ? (
        <>
          <circle cx="8" cy="8" r="7.25" fill={color} />
          <path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <circle cx="8" cy="8" r="6.6" fill="#fff" stroke="#a1a1aa" strokeWidth="1.3" strokeDasharray="2.6 2" />
      )}
    </svg>
  )
}

export function GroupPip({ state }: { state: 'all' | 'some' | 'none' }) {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
      {state === 'all' && (
        <>
          <circle cx="8" cy="8" r="7.25" fill="#18181b" />
          <path d="M4.8 8.3l2.1 2.1 4.3-4.6" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {state === 'some' && (
        <>
          <circle cx="8" cy="8" r="6.6" fill="#fff" stroke="#18181b" strokeWidth="1.3" />
          <path d="M4.6 8h6.8" stroke="#18181b" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {state === 'none' && (
        <circle cx="8" cy="8" r="6.6" fill="#fff" stroke="#a1a1aa" strokeWidth="1.3" strokeDasharray="2.6 2" />
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
  onHoverLine,
  pulse,
}: {
  groups: KeyGroup[]
  LINES: Record<string, Line>
  enabled: Record<string, boolean>
  frac: (k: string) => number
  height?: number
  onHoverLine?: (k: string | null) => void
  pulse?: Set<string>
}) {
  return (
    <div className="flex w-full items-end gap-[5px]" style={{ height }} onMouseLeave={() => onHoverLine?.(null)}>
      {groups.map((g) => (
        <div key={g.id} className="flex h-full items-end gap-[2px]" style={{ flexGrow: g.keys.length, flexBasis: 0 }}>
          {g.keys.map((k) => {
            const on = enabled[k]
            const f = frac(k)
            return (
              <div
                key={k}
                title={`${LINES[k].name}${on ? ` · ${Math.round(f * 100)}%` : ' · off'}`}
                onMouseEnter={() => on && onHoverLine?.(k)}
                className={classNames(
                  'relative h-full min-w-[2px] flex-1 overflow-hidden rounded-[2px]',
                  !on && 'border border-dashed border-zinc-300',
                )}
                style={on ? { background: hexA(LINES[k].color, 0.18) } : undefined}
              >
                {on && (
                  <div
                    className={classNames('absolute inset-x-0 bottom-0', pulse?.has(k) && 'animate-pulse')}
                    style={{
                      height: `${f > 0 ? Math.max(8, f * 100) : 0}%`,
                      background: LINES[k].color,
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
          className="h-2 w-2 shrink-0 rounded-full"
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
        running ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-900',
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

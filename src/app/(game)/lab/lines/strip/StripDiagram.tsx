'use client'

import { useEffect, useMemo, useState } from 'react'
import type { StripLine } from './StripDemo'

export type StopInfo = {
  name: string
  /** other lines at this station */
  others: string[]
  /** stations under another name a short walk away, with their extra lines */
  near: { name: string; lines: string[] }[]
  nearLines: string[]
  inGame: boolean
  found: boolean
}

type Common = {
  line: StripLine
  stops: StopInfo[]
  lineOf: Record<string, StripLine>
  learning: boolean
  progress: boolean
  revealed: Set<string>
  selected: string | null
  onStop: (name: string) => void
}

// ---- geometry constants (px) ----
const T = 14 // line thickness
const FS = 13 // label size
const FS_T = 15 // terminus label size
const COS = Math.SQRT1_2 // labels at 45°
const S_MIN = 36 // closest station spacing before wrapping onto another row
const S_MAX = 120 // widest station spacing (short lines)
const LEFT = 40 // left margin (room for the continuation stub)
const RIGHT = 16
const TICK = 8
const LABEL_GAP = 9 // from the top of the line to the label start
const CHIP_W = 20
const CHIP_H = 8
const CHIP_GAP = 3
const ROW_GAP = 30
const BLANK_W = 64 // learning-mode blank (fixed: doesn't give the name length away)

/** canvas text measurement with the page font, re-run once webfonts have loaded */
function useMeasure(fontFamily: string) {
  const [ready, setReady] = useState(0)
  useEffect(() => {
    let live = true
    document.fonts?.ready.then(() => live && setReady((r) => r + 1))
    return () => {
      live = false
    }
  }, [])
  return useMemo(() => {
    const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
    const cache = new Map<string, number>()
    return (text: string, size: number, weight: number) => {
      const k = `${weight}|${size}|${text}`
      let w = cache.get(k)
      if (w === undefined) {
        if (ctx) {
          ctx.font = `${weight} ${size}px ${fontFamily}`
          w = ctx.measureText(text).width
        } else w = text.length * size * 0.52
        cache.set(k, w)
      }
      return w
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily, ready])
}

/** near-black lines (Northern, Gatwick Express) turn light in dark mode, as on dark-mode transit maps */
export const paint = (hex: string) => (isDark(hex) ? `var(--ink-line, ${hex})` : hex)
const isDark = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255) < 120
}

/** visible state of one stop's name */
function labelState(s: StopInfo, c: Common): 'name' | 'blank' | 'revealed' {
  if (!c.learning) return 'name'
  if (c.progress && s.found) return 'name'
  return c.revealed.has(s.name) ? 'revealed' : 'blank'
}

function LineBar({ line, x0, x1, y, faded }: { line: StripLine; x0: number; x1: number; y: number; faded?: boolean }) {
  if (x1 <= x0) return null
  const sc = line.stripeColor || '#fff'
  return (
    <g opacity={faded ? 0.35 : 1}>
      <rect x={x0} y={y - T / 2} width={x1 - x0} height={T} fill={paint(line.color)} />
      {line.stripe === 'solid' && <rect x={x0} y={y - T / 8} width={x1 - x0} height={T / 4} fill={sc} />}
      {line.stripe === 'dashed' && (
        <line x1={x0 + 2} x2={x1} y1={y} y2={y} stroke={sc} strokeWidth={T / 4} strokeDasharray="10 7" />
      )}
      {line.stripe === 'triple' && (
        <>
          <rect x={x0} y={y - T / 2 + T / 3 - 1} width={x1 - x0} height={2} fill={sc} />
          <rect x={x0} y={y - T / 2 + (2 * T) / 3 - 1} width={x1 - x0} height={2} fill={sc} />
        </>
      )}
    </g>
  )
}

function Chip({ line, x, y, title, hollow }: { line: StripLine; x: number; y: number; title: string; hollow?: boolean }) {
  if (hollow)
    return (
      <g>
        <title>{title}</title>
        <rect x={x - CHIP_W / 2 + 0.9} y={y + 0.9} width={CHIP_W - 1.8} height={CHIP_H - 1.8} rx={(CHIP_H - 1.8) / 2} fill="var(--card)" stroke={paint(line.color)} strokeWidth={1.8} />
      </g>
    )
  return (
    <g>
      <title>{title}</title>
      <rect x={x - CHIP_W / 2} y={y} width={CHIP_W} height={CHIP_H} rx={CHIP_H / 2} fill={paint(line.color)} />
      {line.stripe && line.stripe !== 'triple' && (
        <line
          x1={x - CHIP_W / 2 + 4}
          x2={x + CHIP_W / 2 - 4}
          y1={y + CHIP_H / 2}
          y2={y + CHIP_H / 2}
          stroke={line.stripeColor || '#fff'}
          strokeWidth={2}
          strokeDasharray={line.stripe === 'dashed' ? '3 2' : undefined}
        />
      )}
    </g>
  )
}

type Placed = { s: StopInfo; i: number; x: number; w: number; terminus: boolean }
type Row = { items: Placed[]; y: number; above: number; below: number; first: boolean; last: boolean }

/**
 * Horizontal strip. Layout: names at 45° above the line, so neighbours never
 * collide as long as stations are >= ~2 label heights apart. The strip wraps
 * onto balanced rows when one row would need tighter spacing than S_MIN; one
 * spacing is used for every row so the rhythm stays even, and it is capped so
 * that each row's names still fit inside the right edge.
 */
export function StripDiagram(props: Common & { width: number; fontFamily: string }) {
  const { width: W, fontFamily, line, stops, lineOf, selected, onStop, progress } = props
  const measure = useMeasure(fontFamily)

  const layout = useMemo(() => {
    const n = stops.length
    const widths = stops.map((s, i) => {
      const term = i === 0 || i === n - 1
      return measure(s.name, term ? FS_T : FS, term ? 700 : 500) + (progress && s.found ? 14 : 0)
    })
    const avail = W - LEFT - RIGHT
    // spacing that fits stops [a, b) on one row
    const fit = (a: number, b: number) => {
      let s = b - a > 1 ? avail / (b - a - 1) : S_MAX
      for (let k = a + 1; k < b; k++) s = Math.min(s, (avail - widths[k] * COS - 10) / (k - a))
      return s
    }
    let rows = 1
    let s = 0
    let per = n
    for (; rows <= n; rows++) {
      per = Math.ceil(n / rows)
      s = Infinity
      for (let a = 0; a < n; a += per) s = Math.min(s, fit(a, Math.min(n, a + per)))
      if (s >= S_MIN || per <= 2) break
    }
    s = Math.min(S_MAX, s)
    // a single short row is centred
    let x0 = LEFT
    if (rows === 1) {
      const extent = Math.max(...widths.map((w, i) => i * s + w * COS + 10))
      x0 = Math.max(LEFT, LEFT + (avail - extent) / 2)
    }
    const out: Row[] = []
    let y = 14
    for (let a = 0, r = 0; a < n; a += per, r++) {
      const items: Placed[] = []
      for (let k = a; k < Math.min(n, a + per); k++)
        items.push({ s: stops[k], i: k, x: x0 + (k - a) * s, w: widths[k], terminus: k === 0 || k === n - 1 })
      const above = Math.max(...items.map((p) => p.w * COS + (p.terminus ? FS_T : FS) * COS)) + LABEL_GAP + T / 2 + 6
      const nChips = Math.max(0, ...items.map((p) => p.s.others.length + p.s.nearLines.length))
      const below = T / 2 + (nChips ? 11 + nChips * (CHIP_H + CHIP_GAP) : 12) + 6
      out.push({ items, y: y + above, above, below, first: r === 0, last: a + per >= n })
      y += above + below + ROW_GAP
    }
    return { rows: out, height: y - ROW_GAP + 14, s }
  }, [stops, W, measure, progress])

  const cont = Math.min(28, layout.s * 0.6)

  return (
    <svg
      width={W}
      height={layout.height}
      viewBox={`0 0 ${W} ${layout.height}`}
      className="block select-none"
      role="img"
      aria-label={`${line.name} strip map`}
    >
      {layout.rows.map((row, r) => {
        const first = row.items[0]
        const last = row.items[row.items.length - 1]
        const y = row.y
        return (
          <g key={r}>
            {/* continuation stubs between rows */}
            {!row.first && <LineBar line={line} x0={first.x - cont - 10} x1={first.x} y={y} faded />}
            {!row.last && (
              <>
                <LineBar line={line} x0={last.x} x1={last.x + cont} y={y} />
                <path
                  d={`M${last.x + cont + 3},${y - T / 2 - 3} l${T / 2 + 5},${T / 2 + 3} l${-(T / 2 + 5)},${T / 2 + 3} z`}
                  fill={paint(line.color)}
                />
              </>
            )}
            <LineBar line={line} x0={first.x} x1={last.x} y={y} />
            {row.items.map((p) => (
              <Stop
                key={p.i}
                p={p}
                y={y}
                c={props}
                line={line}
                lineOf={lineOf}
                selected={selected === p.s.name}
                progress={progress}
                onStop={onStop}
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}

function Stop({
  p,
  y,
  c,
  line,
  lineOf,
  selected,
  progress,
  onStop,
}: {
  p: Placed
  y: number
  c: Common
  line: StripLine
  lineOf: Record<string, StripLine>
  selected: boolean
  progress: boolean
  onStop: (n: string) => void
}) {
  const { s, x, terminus } = p
  const inter = s.others.length + s.nearLines.length > 0
  const st = labelState(s, c)
  const size = terminus ? FS_T : FS
  const lx = x + 1
  const ly = y - T / 2 - LABEL_GAP
  const unfound = progress && !s.found
  const fill =
    st === 'revealed' ? 'var(--revealed)' : !s.inGame ? 'var(--muted)' : unfound ? 'var(--muted)' : 'var(--fg)'
  const hitLen = Math.max(st === 'blank' ? BLANK_W : p.w, 30)

  return (
    <g
      className="strip-stop"
      tabIndex={0}
      role="button"
      aria-label={st === 'blank' ? `Hidden station ${p.i + 1}` : s.name}
      onClick={() => onStop(s.name)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onStop(s.name))}
    >
      {/* hit area: the label band plus the marker */}
      <g transform={`translate(${lx} ${ly}) rotate(-45)`}>
        <rect className="strip-hit" x={-6} y={-size * 0.75} width={hitLen + 12} height={size * 1.5} rx={4} fill="transparent" />
      </g>
      <rect x={x - 10} y={y - T / 2 - 10} width={20} height={T + 20 + (s.others.length + s.nearLines.length) * (CHIP_H + CHIP_GAP)} fill="transparent" />

      {/* progress / selection halo */}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={inter || terminus ? 13 : 10}
          fill={selected ? 'var(--accent)' : 'var(--found)'}
          opacity={selected ? 0.28 : 0.3}
        />
      )}

      {/* marker */}
      {inter ? (
        <circle cx={x} cy={y} r={terminus ? 8.5 : 7.2} fill="#fff" stroke="#18181b" strokeWidth={terminus ? 3.4 : 3} />
      ) : terminus ? (
        <rect x={x - 3} y={y - T / 2 - 6} width={6} height={T + 12} rx={2} fill={paint(line.color)} />
      ) : (
        <rect x={x - 2} y={y - T / 2 - TICK} width={4} height={TICK + 1} fill={s.inGame ? paint(line.color) : 'var(--faint)'} />
      )}

      {/* label */}
      <g transform={`translate(${lx} ${ly}) rotate(-45)`}>
        {st === 'blank' ? (
          <>
            <rect x={0} y={-8} width={BLANK_W} height={16} rx={8} fill="var(--blank)" />
            <text x={BLANK_W / 2} y={0} dominantBaseline="central" textAnchor="middle" fontSize={11} fill="var(--blank-ink)" fontWeight={700}>
              {p.i + 1}
            </text>
          </>
        ) : (
          <>
          {progress && s.found && (
            <g>
              <circle cx={5} cy={0} r={5.5} fill="var(--found)" />
              <path d="M2.6,0.2 l1.7,1.8 l3.2,-3.6" stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )}
          <text
            className={st === 'revealed' ? '' : 'strip-label'}
            x={progress && s.found ? 14 : 0}
            y={0}
            dominantBaseline="central"
            fontSize={size}
            fontWeight={terminus ? 700 : 500}
            fill={fill}
            fontStyle={s.inGame ? undefined : 'italic'}
          >
            {s.name}
          </text>
          </>
        )}
      </g>

      {/* interchange chips */}
      {s.others.map((k, j) => (
        <Chip
          key={k}
          line={lineOf[k]}
          x={x}
          y={y + T / 2 + 9 + j * (CHIP_H + CHIP_GAP)}
          title={`${st === 'blank' ? 'Change' : s.name}: change for ${lineOf[k].name}`}
        />
      ))}
      {s.nearLines.map((k, j) => (
        <Chip
          key={k}
          hollow
          line={lineOf[k]}
          x={x}
          y={y + T / 2 + 9 + (s.others.length + j) * (CHIP_H + CHIP_GAP)}
          title={`${lineOf[k].name}: a short walk to ${s.near.filter((n) => n.lines.includes(k)).map((n) => n.name).join(' / ')}`}
        />
      ))}
    </g>
  )
}

/**
 * Phone layout: the strip turned vertical (top = London end), names
 * horizontal, interchanges as small named pills.
 */
export function StripList(props: Common) {
  const { line, stops, lineOf, selected, onStop, progress } = props
  const sc = line.stripeColor || '#fff'
  return (
    <ol className="px-3 py-4">
      {stops.map((s, i) => {
        const terminus = i === 0 || i === stops.length - 1
        const inter = s.others.length + s.nearLines.length > 0
        const st = labelState(s, props)
        const unfound = progress && !s.found
        return (
          <li key={i}>
            <button
              onClick={() => onStop(s.name)}
              className={`flex min-h-[44px] w-full items-center rounded-lg text-left ${selected === s.name ? 'bg-[var(--soft)]' : ''}`}
            >
              {/* rail */}
              <span className="relative block w-11 shrink-0 self-stretch">
                <span
                  className="absolute left-1/2 w-[12px] -translate-x-1/2"
                  style={{
                    top: i === 0 ? '50%' : 0,
                    bottom: i === stops.length - 1 ? '50%' : 0,
                    background: paint(line.color),
                  }}
                >
                  {line.stripe && (
                    <span
                      className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2"
                      style={{
                        background:
                          line.stripe === 'dashed'
                            ? `repeating-linear-gradient(${sc} 0 9px, transparent 9px 15px)`
                            : sc,
                      }}
                    />
                  )}
                </span>
                {inter ? (
                  <span
                    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[#18181b] bg-white ${terminus ? 'h-[19px] w-[19px]' : 'h-[16px] w-[16px]'}`}
                  />
                ) : terminus ? (
                  <span
                    className="absolute left-1/2 top-1/2 h-[6px] w-[26px] -translate-x-1/2 -translate-y-1/2 rounded-sm"
                    style={{ background: paint(line.color) }}
                  />
                ) : (
                  <span
                    className="absolute top-1/2 h-[3px] w-[7px] -translate-y-1/2"
                    style={{ left: 'calc(50% + 6px)', background: paint(line.color) }}
                  />
                )}
              </span>
              {/* name */}
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-1.5 pl-1">
                {progress && s.found && <FoundDot />}
                {st === 'blank' ? (
                  <span className="inline-flex h-6 w-28 items-center justify-center rounded-full bg-[var(--blank)] text-xs font-bold text-[var(--blank-ink)]">
                    {i + 1}
                  </span>
                ) : (
                  <span
                    className={`${terminus ? 'text-[17px] font-bold' : 'text-[15px] font-medium'} leading-tight`}
                    style={{
                      color: st === 'revealed' ? 'var(--revealed)' : unfound ? 'var(--muted)' : 'var(--fg)',
                    }}
                  >
                    {s.name}
                  </span>
                )}
                {inter && (
                  <span className="flex flex-wrap gap-1">
                    {s.others.map((k) => (
                      <span
                        key={k}
                        className="rounded px-1 text-[10px] font-bold leading-[15px]"
                        style={{ background: paint(lineOf[k].color), color: isDark(lineOf[k].color) ? 'var(--ink-on-line, #fff)' : luminanceInk(lineOf[k].color) }}
                      >
                        {short(lineOf[k].name)}
                      </span>
                    ))}
                    {s.nearLines.map((k) => (
                      <span
                        key={k}
                        title={`a short walk to ${s.near.filter((n) => n.lines.includes(k)).map((n) => n.name).join(' / ')}`}
                        className="rounded px-1 text-[10px] font-bold leading-[15px] ring-[1.5px] ring-inset"
                        style={{ ['--tw-ring-color' as string]: paint(lineOf[k].color), color: 'var(--fg)' }}
                      >
                        {short(lineOf[k].name)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function FoundDot() {
  return (
    <svg width="14" height="14" viewBox="-7 -7 14 14" aria-label="found" className="shrink-0">
      <circle r={6.5} fill="var(--found)" />
      <path d="M-3,0 l2,2.1 l3.8,-4.2" stroke="#fff" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function luminanceInk(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#18181b' : '#fff'
}
const SHORT: Record<string, string> = {
  'Hammersmith & City': 'H&C',
  'Waterloo & City': 'W&C',
  'Elizabeth line': 'Elizabeth',
  'Southeastern high speed': 'SE high speed',
  'Great Western Railway': 'GWR',
  'South Western Railway': 'SWR',
  'East Midlands Railway': 'EMR',
  'London Northwestern': 'LNR',
  'Chiltern Railways': 'Chiltern',
  'London Cable Car': 'Cable Car',
  'London Trams': 'Trams',
}
const short = (n: string) => SHORT[n] || n

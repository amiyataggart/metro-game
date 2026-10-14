'use client'
// The vertical line diagram: HTML rows (names, chips) over one measured SVG
// (bars, forks, station dots).
import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { LineLayout } from './graph'
import type { LineInfo } from './data'

export type DotKind = 'found' | 'open' | 'current' | 'revealed' | 'out' | 'given'

export interface RowView {
  key: string
  dot: DotKind
  interchange: boolean
  label: ReactNode
  /** extra content under the name (chips) */
  extra?: ReactNode
  /** animate the dot (just answered) */
  pop?: boolean
  terminus?: boolean
}

const DOT_Y = 24 // dot centre from the row top (matches the name's first line)

export function laneGeometry(lanes: number) {
  const gap = lanes <= 3 ? 26 : Math.max(17, Math.round(78 / (lanes - 1)))
  const pad = 24
  return { gap, pad, x: (l: number) => pad + l * gap }
}

export default function Diagram({
  layout,
  line,
  views,
  rowRefs,
  current,
}: {
  layout: LineLayout
  line: LineInfo
  views: RowView[]
  rowRefs?: React.MutableRefObject<(HTMLDivElement | null)[]>
  current?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const localRefs = useRef<(HTMLDivElement | null)[]>([])
  const refs = rowRefs ?? localRefs
  const [ys, setYs] = useState<number[]>([])
  const [height, setHeight] = useState(0)
  const { x } = laneGeometry(layout.lanes)

  const measure = useCallback(() => {
    const el = box.current
    if (!el) return
    const next = layout.rows.map((_, i) => {
      const r = refs.current[i]
      return r ? r.offsetTop + DOT_Y : 0
    })
    setYs((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next))
    setHeight(el.offsetHeight)
  }, [layout, refs])

  useLayoutEffect(() => {
    measure()
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, views])

  const W = 9 // bar width
  const ready = ys.length === layout.rows.length && ys.length > 0
  const paths: string[] = []
  if (ready) {
    for (const p of layout.pieces) {
      const X = x(p.lane)
      let d = ''
      const own = p.rows.map((r) => ys[r])
      const curveLen = (a: number, b: number) => Math.min(64, Math.max(14, (b - a) * 0.9))
      if (p.top !== undefined) {
        const ta = layout.rows[p.top].lane
        const y0 = ys[p.top]
        const nextY = own.length ? own[0] : ys[p.bottom!]
        if (ta === p.lane) d += `M${X} ${y0}`
        else {
          const c = curveLen(y0, ys[p.top + 1] ?? nextY)
          const xa = x(ta)
          d += `M${xa} ${y0} C${xa} ${y0 + c * 0.5} ${X} ${y0 + c * 0.5} ${X} ${y0 + c}`
        }
      } else if (own.length) d += `M${X} ${own[0]}`
      for (const y of own) d += ` L${X} ${y}`
      if (p.bottom !== undefined) {
        const ba = layout.rows[p.bottom].lane
        const y1 = ys[p.bottom]
        if (ba === p.lane) d += ` L${X} ${y1}`
        else {
          const c = curveLen(ys[p.bottom - 1] ?? y1, y1)
          const xb = x(ba)
          d += ` L${X} ${y1 - c} C${X} ${y1 - c * 0.5} ${xb} ${y1 - c * 0.5} ${xb} ${y1}`
        }
      }
      paths.push(d)
    }
  }
  const svgW = x(layout.lanes - 1) + 24
  const stripe = line.stripe
  const stripeColor = line.stripeColor ?? '#fff'

  return (
    <div ref={box} className="relative">
      <svg
        className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible"
        width={svgW}
        height={height}
        aria-hidden
      >
        {paths.map((d, i) => (
          <path key={`b${i}`} d={d} fill="none" stroke={line.color} strokeWidth={W} strokeLinejoin="round" />
        ))}
        {stripe &&
          paths.map((d, i) => (
            <path
              key={`s${i}`}
              d={d}
              fill="none"
              stroke={stripeColor}
              strokeWidth={stripe === 'triple' ? 1.5 : 3}
              strokeDasharray={stripe === 'dashed' ? '7 6' : undefined}
              strokeLinejoin="round"
            />
          ))}
        {ready &&
          layout.rows.map((row, i) => {
            const v = views[i]
            if (!v) return null
            return <Dot key={v.key} cx={x(row.lane)} cy={ys[i]} v={v} line={line} isCurrent={current === i} />
          })}
      </svg>
      {layout.rows.map((row, i) => {
        const v = views[i]
        const left = x(layout.busy[i] ?? row.lane) + 22
        const isCur = current === i
        return (
          <div
            key={v?.key ?? i}
            ref={(el) => {
              refs.current[i] = el
            }}
            className={`relative flex min-h-[48px] flex-col justify-start pb-1.5 pr-3 pt-[11px] transition-colors duration-300 ${
              isCur ? 'bg-amber-100/70 dark:bg-amber-400/10' : ''
            }`}
            style={{ paddingLeft: left }}
          >
            {isCur && <div className="absolute inset-y-0 left-0 w-1 rounded-r bg-amber-400" />}
            <div className="flex min-h-[26px] flex-wrap items-center gap-x-2 gap-y-1">{v?.label}</div>
            {v?.extra}
          </div>
        )
      })}
    </div>
  )
}

function Dot({ cx, cy, v, line, isCurrent }: { cx: number; cy: number; v: RowView; line: LineInfo; isCurrent: boolean }) {
  const ink = 'var(--ns-ink)'
  const bg = 'var(--ns-bg)'
  const ring = v.interchange ? ink : line.color
  const r = v.interchange ? 9.5 : 8
  const style = v.pop
    ? ({ transformBox: 'fill-box', transformOrigin: 'center', animation: 'ns-pop 520ms cubic-bezier(.2,1.6,.4,1)' } as const)
    : undefined
  if (v.dot === 'out')
    return <rect x={cx - 9} y={cy - 2} width={18} height={4} rx={1} fill={line.color} opacity={0.7} />
  if (v.dot === 'found' || v.dot === 'given' || v.dot === 'revealed') {
    const fill = v.dot === 'revealed' ? 'var(--ns-reveal)' : v.interchange ? ink : line.color
    const tick = v.dot === 'revealed' ? '#fff' : v.interchange ? bg : line.textColor
    return (
      <g style={style}>
        <circle cx={cx} cy={cy} r={r + 2} fill={bg} />
        <circle cx={cx} cy={cy} r={r} fill={fill} />
        {v.dot === 'found' && (
          <path
            d={`M${cx - 3.6} ${cy + 0.2} l2.5 2.6 l4.9 -5.2`}
            fill="none"
            stroke={tick}
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {v.dot === 'revealed' && <circle cx={cx} cy={cy} r={2.4} fill="#fff" />}
      </g>
    )
  }
  // open / current
  return (
    <g>
      {isCurrent && (
        <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke="#f59e0b" strokeWidth={3} className="ns-pulse" />
      )}
      <circle cx={cx} cy={cy} r={r} fill={bg} stroke={ring} strokeWidth={3.5} />
    </g>
  )
}

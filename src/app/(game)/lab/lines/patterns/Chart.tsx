'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Col, Model } from './model'
import { LINES, LINES_AT } from '../lineData'

export type Progress = 'off' | 'show' | 'hide'
export type Header = { title: string; sub: string }

type Props = {
  model: Model
  cols: Col[]
  header: (c: Col) => Header
  color: (line: string) => string
  /** found state of a stop: true / false / undefined (not in the game) */
  found: (station: string, line: string) => boolean | undefined
  /** found state of a row (any of its lines) */
  rowFound: (station: string) => boolean | undefined
  progress: Progress
  anchor?: string
  /** lines to leave out of the interchange dots (the line on show) */
  skipLines: string[]
  selCol?: string
  onSelCol: (key: string | undefined) => void
  onStation: (name: string) => void
  narrow: boolean
}

const mask = (name: string) =>
  name
    .split(' ')
    .map((w) => (w.length > 1 && /[A-Za-z]/.test(w[0]) ? w[0] + w.slice(1).replace(/[A-Za-z']/g, '·') : w))
    .join(' ')
const short = (s: string) =>
  s.replace(/London (?=(Victoria|Charing Cross|Waterloo|Paddington|Marylebone|Euston|King's Cross|St Pancras|Liverpool Street|Fenchurch Street)\b)/g, '')
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

export default function Chart(p: Props) {
  const { model, cols, narrow } = p
  const ROW = narrow ? 30 : 30
  const DIV = 26
  const COLW = narrow ? 28 : 32
  const HEAD = narrow ? 160 : 196
  const NAMEW = narrow ? 138 : 236
  const PADL = 10
  const [hover, setHover] = useState<number | undefined>()
  const anchorRef = useRef<HTMLDivElement>(null)

  // vertical layout: station rows, with a divider before each new block
  const layout = useMemo(() => {
    const top: number[] = []
    const divs: { y: number; label: string; sub?: string }[] = []
    let y = 0
    const starts = new Map(model.blocks.map((b) => [b.start, b] as const))
    model.rows.forEach((_, r) => {
      const b = starts.get(r)
      if (b && r > 0) {
        divs.push({
          y,
          label: b.from ? `Branch from ${b.from}` : `Also starting at ${model.rows[b.start]}`,
          sub: b.to ? `continues to ${b.to}` : undefined,
        })
        y += DIV
      }
      top.push(y)
      y += ROW
    })
    return { top, divs, height: y + 8 }
  }, [model, ROW])
  const yc = (r: number) => layout.top[r] + ROW / 2
  const W = PADL * 2 + cols.length * COLW
  const xOf = (i: number) => PADL + i * COLW + COLW / 2
  const anchorRow = p.anchor ? model.rows.indexOf(p.anchor) : -1
  // corridor view: bring the chosen station into view inside the scroller
  useEffect(() => {
    const el = anchorRef.current
    const sc = el?.closest('.overflow-auto') as HTMLElement | null
    if (!el || !sc) return
    sc.scrollTop = Math.max(0, el.offsetTop - (sc.clientHeight - HEAD) / 3)
  }, [model, p.anchor, HEAD])

  const kindStyle = (k: Col['kind']) =>
    k === 'fast'
      ? { fill: 'var(--ink)', stroke: 'var(--ink)', text: 'var(--bg)' }
      : k === 'semi'
        ? { fill: 'var(--muted2)', stroke: 'var(--muted2)', text: 'var(--bg)' }
        : { fill: 'var(--panel)', stroke: 'var(--muted)', text: 'var(--ink)' }

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `${NAMEW}px ${Math.max(W, 40)}px`, width: 'max-content' }}
      onMouseLeave={() => setHover(undefined)}
    >
      {/* corner */}
      <div
        className="sticky left-0 top-0 z-30 flex flex-col justify-end border-b border-r px-3 pb-2 text-xs"
        style={{ height: HEAD, background: 'var(--panel)', borderColor: 'var(--rule)', color: 'var(--muted)' }}
      >
        <div className="font-bold uppercase tracking-wider" style={{ color: 'var(--ink)' }}>
          Station
        </div>
        <div>
          {model.rows.length} stations{narrow ? '' : ` · ${cols.length} ${cols.length === 1 ? 'service' : 'services'}`}
        </div>
      </div>

      {/* column headers */}
      <svg
        width={W}
        height={HEAD}
        className="sticky top-0 z-20 block border-b"
        style={{ background: 'var(--panel)', borderColor: 'var(--rule)' }}
      >
        {cols.map((c, i) => {
          const x = xOf(i)
          const h = p.header(c)
          const ks = kindStyle(c.kind)
          const sel = p.selCol === c.key
          const dim = p.selCol && !sel
          return (
            <g
              key={c.key}
              className="cursor-pointer"
              opacity={dim ? 0.35 : 1}
              onClick={() => p.onSelCol(sel ? undefined : c.key)}
            >
              <title>{`${c.name}${c.part ? ` (part ${c.part})` : ''}: ${c.nStops} stops`}</title>
              <rect x={x - COLW / 2} y={0} width={COLW} height={HEAD} fill={sel ? 'var(--hl)' : 'transparent'} />
              <g transform={`translate(${x}, ${HEAD - 36}) rotate(-90)`}>
                <text y={-1} fontSize={12.5} fontWeight={700} fill="var(--ink)">
                  {clip(short(h.title), narrow ? 17 : 24)}
                </text>
                <text y={11} fontSize={10} fill="var(--muted)">
                  {clip(short(h.sub), narrow ? 22 : 30)}
                </text>
              </g>
              <rect x={x - 11} y={HEAD - 28} width={22} height={16} rx={8} fill={ks.fill} stroke={ks.stroke} strokeWidth={1.2} />
              <text x={x} y={HEAD - 16.2} fontSize={10.5} fontWeight={700} textAnchor="middle" fill={ks.text}>
                {c.nStops}
              </text>
              <rect x={x - 3} y={HEAD - 6} width={6} height={6} rx={1} fill={p.color(c.line)} />
            </g>
          )
        })}
      </svg>

      {/* station names */}
      <div className="sticky left-0 z-10 border-r" style={{ background: 'var(--panel)', borderColor: 'var(--rule)' }}>
        {model.rows.map((name, r) => {
          const d = layout.divs.find((d) => d.y + DIV === layout.top[r])
          const fnd = p.rowFound(name)
          const inGame = fnd !== undefined
          const shown = p.progress === 'hide' && fnd === false ? mask(name) : name
          const others = (LINES_AT[name] ?? []).filter((l) => !p.skipLines.includes(l) && LINES[l])
          const isAnchor = r === anchorRow
          return (
            <Fragment key={name}>
              {d && (
                <div
                  className="flex flex-col justify-center overflow-hidden whitespace-nowrap px-3 text-[10.5px] font-bold uppercase leading-tight tracking-wide"
                  style={{ height: DIV, color: 'var(--muted)', background: 'var(--band2)' }}
                  title={d.sub ? `${d.label}, ${d.sub}` : d.label}
                >
                  <span className="truncate">{d.label}</span>
                </div>
              )}
              <div
                ref={isAnchor ? anchorRef : undefined}
                className="flex items-center gap-1.5 pl-3 pr-2"
                style={{
                  height: ROW,
                  background: isAnchor ? 'var(--hl)' : hover === r ? 'var(--hover)' : r % 2 ? 'var(--band)' : 'transparent',
                }}
                onMouseEnter={() => setHover(r)}
              >
                <button
                  className="min-w-0 truncate text-left text-[13.5px] leading-tight hover:underline"
                  style={{
                    color: !inGame
                      ? 'var(--muted)'
                      : p.progress !== 'off' && !fnd
                        ? 'var(--muted)'
                        : 'var(--ink)',
                    fontStyle: inGame ? 'normal' : 'italic',
                    fontWeight: isAnchor || (p.progress !== 'off' && fnd) ? 700 : 500,
                    letterSpacing: shown !== name ? '0.06em' : undefined,
                  }}
                  title={
                    (p.progress === 'hide' && fnd === false ? 'Not found yet' : name) +
                    (inGame ? '' : ' (not in the game)') +
                    ' · show every service here'
                  }
                  onClick={() => p.onStation(name)}
                >
                  {shown}
                </button>
                <span className="ml-auto flex shrink-0 items-center -space-x-0.5">
                  {others.slice(0, narrow ? 2 : 6).map((l) => (
                    <span
                      key={l}
                      title={LINES[l].name}
                      className="inline-block h-[9px] w-[9px] rounded-full"
                      style={{ background: p.color(l), boxShadow: '0 0 0 1.5px var(--panel)' }}
                    />
                  ))}
                  {others.length > (narrow ? 2 : 6) && (
                    <span className="pl-1 text-[10px]" style={{ color: 'var(--muted)' }}>
                      +{others.length - (narrow ? 2 : 6)}
                    </span>
                  )}
                </span>
              </div>
            </Fragment>
          )
        })}
      </div>

      {/* the diagram */}
      <svg width={W} height={layout.height} className="block" style={{ background: 'var(--panel)' }}>
        {model.rows.map((_, r) => (
          <rect
            key={r}
            x={0}
            y={layout.top[r]}
            width={W}
            height={ROW}
            fill={r === anchorRow ? 'var(--hl)' : hover === r ? 'var(--hover)' : r % 2 ? 'var(--band)' : 'transparent'}
            onMouseEnter={() => setHover(r)}
          />
        ))}
        {layout.divs.map((d, i) => (
          <rect key={i} x={0} y={d.y} width={W} height={DIV} fill="var(--band2)" />
        ))}
        {cols.map((c, i) => {
          const x = xOf(i)
          const col = p.color(c.line)
          const sel = p.selCol === c.key
          const dim = p.selCol && !sel
          const stripe = LINES[c.line]?.stripe
          // solid runs (consecutive rows) and jumps (over other branches' rows)
          const solid: number[][] = []
          const jumps: [number, number][] = []
          let cur: number[] = [c.rows[0]]
          for (let k = 1; k < c.rows.length; k++) {
            if (c.rows[k] === c.rows[k - 1] + 1) cur.push(c.rows[k])
            else {
              solid.push(cur)
              jumps.push([c.rows[k - 1], c.rows[k]])
              cur = [c.rows[k]]
            }
          }
          solid.push(cur)
          const firstStop = c.rows[c.stop.indexOf(true)]
          const lastStop = c.rows[c.stop.lastIndexOf(true)]
          return (
            <g key={c.key} opacity={dim ? 0.18 : 1} className="cursor-pointer" onClick={() => p.onSelCol(sel ? undefined : c.key)}>
              {sel && <rect x={x - COLW / 2} y={0} width={COLW} height={layout.height} fill="var(--hl)" opacity={0.55} />}
              {jumps.map(([a, b], k) => (
                <line
                  key={k}
                  x1={x}
                  x2={x}
                  y1={yc(a) + 7}
                  y2={yc(b) - 7}
                  stroke={col}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray="0 6"
                  opacity={0.5}
                />
              ))}
              {solid.map(
                (s, k) =>
                  s.length > 1 && (
                    <g key={k}>
                      <line x1={x} x2={x} y1={yc(s[0])} y2={yc(s[s.length - 1])} stroke={col} strokeWidth={6} strokeLinecap="round" />
                      {stripe === 'solid' && (
                        <line
                          x1={x}
                          x2={x}
                          y1={yc(s[0])}
                          y2={yc(s[s.length - 1])}
                          stroke={LINES[c.line].stripeColor ?? 'var(--panel)'}
                          strokeWidth={2}
                        />
                      )}
                    </g>
                  ),
              )}
              {c.rows.map((r, k) => {
                const y = yc(r)
                const name = model.rows[r]
                if (!c.stop[k]) return <line key={r} x1={x - 7} x2={x + 7} y1={y} y2={y} stroke={col} strokeWidth={1.6} opacity={0.9} />
                const f = p.found(name, c.line)
                const hollow = p.progress !== 'off' && f === false
                const ghost = p.progress !== 'off' && f === undefined
                const term = (r === firstStop && c.startsHere) || (r === lastStop && c.endsHere)
                const fill = hollow ? 'var(--panel)' : col
                const stroke = hollow ? col : 'var(--panel)'
                const sw = hollow ? 2.4 : 1.6
                return term ? (
                  <rect key={r} x={x - 8} y={y - 5} width={16} height={10} rx={3} fill={fill} stroke={stroke} strokeWidth={sw} opacity={ghost ? 0.55 : 1}>
                    <title>{`${name}: ${c.name} terminates`}</title>
                  </rect>
                ) : (
                  <circle key={r} cx={x} cy={y} r={hollow ? 5 : 5.6} fill={fill} stroke={stroke} strokeWidth={sw} opacity={ghost ? 0.55 : 1}>
                    <title>{`${name}: ${c.name} calls`}</title>
                  </circle>
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

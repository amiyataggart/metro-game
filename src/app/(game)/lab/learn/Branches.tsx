'use client'
// Route · "All lines" on wide screens: every branch of the line at once. The
// layout is ../lines/branches/graphLayout's (computed on the server in
// data.ts: rows, forks, which side each label goes); the drawing is redone
// here in the carriage strip's language (../lines/strip/StripDiagram): a 14 px
// line, ticks on the label side, white interchange rings, bars across the
// termini, names at 45 degrees, found ticks, interchange pills, and blanks when
// unfound names are hidden. Coordinates are stretched (never squeezed) to the
// strip's spacing; what is still wider than the box scrolls sideways.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Branches as Body, LineInfo } from './data'

const T = 14 // line thickness, as the strip
const FS = 13
const FS_T = 15
const TICK = 8
const OFF = 17 // label start, from the station along the label's axis (clears the line)
const CHIP_W = 12
const CHIP_H = 8
const CHIP_GAP = 3
const BLANK_W = 56
const S_MAX = 1.5 // stretch so the pitch nears the strip's (~36 px)
const S_MIN = 1.3

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function Bar({ d, line }: { d: string; line: LineInfo }) {
  const sc = line.stripeColor || '#fff'
  return (
    <g fill="none" strokeLinejoin="round">
      <path d={d} stroke={line.color} strokeWidth={T} />
      {line.stripe === 'solid' && <path d={d} stroke={sc} strokeWidth={T / 4} />}
      {line.stripe === 'dashed' && <path d={d} stroke={sc} strokeWidth={T / 4} strokeDasharray="10 7" />}
      {line.stripe === 'triple' && (
        <>
          <path d={d} stroke={sc} strokeWidth={T / 3 + 4} />
          <path d={d} stroke={line.color} strokeWidth={T / 3} />
        </>
      )}
    </g>
  )
}

export default function Branches({
  body,
  line,
  lineOf,
  isFound,
  hideNames,
  chipName,
  onStation,
  selected,
  fontFamily,
}: {
  body: Body
  line: LineInfo
  lineOf: (k: string) => LineInfo
  isFound: (name: string) => boolean | null
  hideNames: boolean
  chipName: (k: string) => string
  onStation: (name: string) => void
  selected: string | null
  fontFamily: string
}) {
  const [box, avail] = useWidth()
  const measure = useMeasure(fontFamily)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  useEffect(() => setRevealed(new Set()), [line.key, hideNames])

  // never below S_MIN: names at 45 degrees need the room; what is still too wide scrolls
  const s = avail ? Math.min(S_MAX, Math.max(S_MIN, (avail - 64) / body.width)) : S_MIN
  const sy = Math.min(s, 1.25) // rows need less extra room than stations
  const pad = 12
  const W = Math.ceil(body.width * s + 2 * pad + 40)
  const H = Math.ceil(body.height * sy + 2 * pad + 20)
  const X = (x: number) => pad + x * s
  const Y = (y: number) => pad + 10 + y * sy
  const edges = useMemo(
    () =>
      body.edges.map((d) =>
        d.replace(/([MHVL])\s*(-?[\d.]+)(?:\s+(-?[\d.]+))?/g, (_, c: string, a: string, b?: string) => {
          if (c === 'H') return `H${X(+a).toFixed(1)}`
          if (c === 'V') return `V${Y(+a).toFixed(1)}`
          return `${c}${X(+a).toFixed(1)} ${Y(+(b as string)).toFixed(1)}`
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [body, s, sy],
  )

  return (
    <div ref={box} className="w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
      {avail > 0 && W > avail && (
        <p className="sticky left-0 px-3 text-[12px] text-zinc-500 dark:text-zinc-400">Scroll sideways for the rest of the line →</p>
      )}
      {avail > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block select-none" role="img" aria-label={`${line.name}: all branches`}>
          {edges.map((d, i) => (
            <Bar key={i} d={d} line={line} />
          ))}
          {body.stations.map((st) => {
            const x = X(st.x)
            const y = Y(st.y)
            const f = st.ghost ? null : isFound(st.name)
            const inGame = f !== null
            const ix = st.others.length > 0
            const hidden = hideNames && inGame && !f && !revealed.has(st.name)
            const rot = st.side * st.lean > 0 ? -45 : 45
            const L = st.lean
            const anchor = L > 0 ? 'start' : 'end'
            const size = st.terminus ? FS_T : FS
            const sel = selected === st.name && !st.ghost
            const tickX = f ? 14 : 0
            const onClick = () => {
              if (st.ghost) return
              if (hidden) setRevealed((r) => new Set(r).add(st.name))
              else onStation(st.name)
            }
            return (
              <g
                key={st.key}
                className={st.ghost ? undefined : 'strip-stop'}
                onClick={onClick}
                role={st.ghost ? undefined : 'button'}
                aria-label={st.ghost ? undefined : hidden ? 'Hidden station' : st.name}
              >
                <title>{st.ghost ? `${st.via ?? 'to'} ${st.name}: the branch joins it here` : hidden ? 'Tap to reveal' : st.name}</title>
                <rect x={x - 10} y={y - 14} width={20} height={28} fill="transparent" />
                {sel && <circle cx={x} cy={y} r={13} fill="var(--accent)" opacity={0.28} />}
                {st.ghost ? (
                  <circle cx={x} cy={y} r={4.5} fill="var(--ix-fill)" stroke={line.color} strokeWidth={2.5} />
                ) : ix ? (
                  <circle cx={x} cy={y} r={st.terminus ? 8.5 : 7.2} fill="var(--ix-fill)" stroke="var(--ix-ink)" strokeWidth={st.terminus ? 3.4 : 3} />
                ) : st.terminus ? (
                  <rect x={x - 3} y={y - T / 2 - 6} width={6} height={T + 12} rx={2} fill={line.color} />
                ) : (
                  <rect
                    x={x - 2}
                    y={st.side > 0 ? y - T / 2 - TICK : y + T / 2 - 1}
                    width={4}
                    height={TICK + 1}
                    fill={inGame ? line.color : 'var(--faint)'}
                  />
                )}
                <g transform={`translate(${x} ${y}) rotate(${rot})`}>
                  {hidden ? (
                    <>
                      <rect className="strip-hit" x={L > 0 ? OFF : -OFF - BLANK_W} y={-8} width={BLANK_W} height={16} rx={8} fill="var(--blank)" />
                      <text x={L * (OFF + BLANK_W / 2)} y={0} dominantBaseline="central" textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--blank-ink)">
                        ?
                      </text>
                    </>
                  ) : (
                    <>
                      {f && (
                        <g transform={`translate(${L * (OFF + 5)} 0)`}>
                          <circle r={5.5} fill="var(--found)" />
                          <path d="M-2.4,0.2 l1.7,1.8 l3.2,-3.6" stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </g>
                      )}
                      <text
                        className={st.ghost ? undefined : 'strip-label'}
                        x={L * (OFF + tickX)}
                        y={0}
                        dominantBaseline="central"
                        textAnchor={anchor}
                        fontSize={st.ghost ? 12 : size}
                        fontWeight={st.terminus ? 700 : 500}
                        fill={st.ghost ? 'var(--ghost)' : 'var(--fg)'}
                        fontStyle={st.ghost || !inGame ? 'italic' : undefined}
                      >
                        {st.ghost ? `${st.via ?? 'to'} ${st.name}` : st.name}
                      </text>
                    </>
                  )}
                  {/* interchange pills after the name, along the label (the layout reserved room for them) */}
                  {!hidden &&
                    st.others.map((k, j) => {
                      const o = lineOf(k)
                      if (!o) return null
                      const nameW = measure(st.name, size) + tickX
                      const cx = L * (OFF + nameW + 7 + j * (CHIP_W + CHIP_GAP) + CHIP_W / 2)
                      return (
                        <g key={k}>
                          <title>{`Change for ${chipName(k)}`}</title>
                          <rect x={cx - CHIP_W / 2} y={-CHIP_H / 2} width={CHIP_W} height={CHIP_H} rx={CHIP_H / 2} fill={o.color} />
                          {o.stripe && o.stripe !== 'triple' && (
                            <line x1={cx - 3} x2={cx + 3} y1={0} y2={0} stroke={o.stripeColor || '#fff'} strokeWidth={2} strokeDasharray={o.stripe === 'dashed' ? '2 1.5' : undefined} />
                          )}
                        </g>
                      )
                    })}
                </g>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

/** canvas text measurement with the page font, re-run once webfonts have loaded (as the strip) */
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
    return (text: string, size: number) => {
      const k = `${size}|${text}`
      let w = cache.get(k)
      if (w === undefined) {
        if (ctx) {
          ctx.font = `${size === FS_T ? 700 : 500} ${size}px ${fontFamily}`
          w = ctx.measureText(text).width
        } else w = text.length * size * 0.52
        cache.set(k, w)
      }
      return w
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily, ready])
}

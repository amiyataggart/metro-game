'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Body, Diagram, DStation } from './graphLayout'

export type LineMeta = { name: string; color: string }
type Mode = 'names' | 'progress' | 'quiz'
type Shape = 'auto' | 'joined' | 'rows'

const FOUND_KEY = 'london-stations' // the real game's save (read-only here)
const DEFAULT_LINE = 'Northern'

function readFound(): Set<number> {
  try {
    const v = JSON.parse(window.localStorage.getItem(FOUND_KEY) || '[]')
    return new Set(
      Array.isArray(v) ? v.filter((n) => typeof n === 'number') : [],
    )
  } catch {
    return new Set()
  }
}

/** very dark line colours (Northern, Gatwick Express) need a light stand-in on dark backgrounds */
function darkSafe(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const l =
    (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return l < 0.2 ? '#d4d4d8' : hex
}

export default function WholeLine({
  diagrams,
  groups,
  lines,
}: {
  diagrams: Record<string, Diagram>
  groups: { title: string; keys: string[] }[]
  lines: Record<string, LineMeta>
}) {
  const [key, setKey] = useState(DEFAULT_LINE)
  const [mode, setMode] = useState<Mode>('names')
  const [found, setFound] = useState<Set<number>>(new Set())
  const [service, setService] = useState<number | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [shape, setShape] = useState<Shape>('auto')

  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.slice(1))
    if (h && diagrams[h]) setKey(h)
    const q = new URLSearchParams(window.location.search).get('mode')
    if (q === 'progress' || q === 'quiz') setMode(q)
    const sh = new URLSearchParams(window.location.search).get('shape')
    if (sh === 'joined' || sh === 'rows') setShape(sh)
    setFound(readFound())
    const onStorage = (e: StorageEvent) =>
      e.key === FOUND_KEY && setFound(readFound())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [diagrams])

  const pick = (k: string) => {
    setKey(k)
    setService(null)
    setRevealed(new Set())
    window.history.replaceState(null, '', `#${k}`)
  }

  const d = diagrams[key]
  const body = d.layouts[shape === 'auto' ? d.auto : shape]
  const counted = body.stations.filter((s) => s.id !== null)
  const nFound = counted.filter((s) => found.has(s.id!)).length

  return (
    <div className="mt-6">
      <label className="block sm:hidden">
        <span className="sr-only">Line</span>
        <select
          value={key}
          onChange={(e) => pick(e.target.value)}
          className="w-full rounded-lg border-0 bg-white px-3 py-2 text-base font-bold shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
        >
          {groups.map((g) => (
            <optgroup key={g.title} label={g.title}>
              {g.keys.map((k) => (
                <option key={k} value={k}>
                  {lines[k].name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <nav className="hidden space-y-2.5 sm:block">
        {groups.map((g) => (
          <div key={g.title} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 w-full text-xs font-bold uppercase tracking-wide text-zinc-500 sm:w-auto sm:min-w-[7.5rem]">
              {g.title}
            </span>
            {g.keys.map((k) => (
              <button
                key={k}
                onClick={() => pick(k)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm ring-1 transition ${
                  k === key
                    ? 'bg-zinc-900 text-white ring-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-100'
                    : 'bg-white ring-zinc-200 hover:ring-zinc-400 dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:ring-zinc-600'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: lines[k].color }}
                />
                {lines[k].name}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <section className="mt-6 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <span
              className="h-4 w-8 rounded-sm"
              style={{ background: d.color }}
            />
            <h2 className="text-xl font-bold">{d.name}</h2>
          </div>
          <span className="text-sm text-zinc-500">
            {counted.length} stations · {d.services.length} service
            {d.services.length === 1 ? '' : 's'}
          </span>
          <div className="ml-auto flex items-center gap-3">
            {mode !== 'names' && (
              <span className="whitespace-nowrap text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                <b className="text-zinc-900 dark:text-zinc-100">{nFound}</b> /{' '}
                {counted.length} found
              </span>
            )}
            <Seg
              value={mode}
              onChange={(m) => (setMode(m), setRevealed(new Set()))}
              options={[
                ['names', 'All names'],
                ['progress', 'My progress'],
                ['quiz', 'Hide unfound'],
              ]}
            />
          </div>
        </header>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-sm text-zinc-500">
          <span>Layout</span>
          <Seg
            value={shape}
            onChange={setShape}
            options={[
              ['auto', `Auto (${d.auto === 'joined' ? 'joined' : 'rows'})`],
              ['joined', 'Joined loops'],
              ['rows', 'Branch rows'],
            ]}
          />
          <span className="text-xs">
            {body.stats.rows} row{body.stats.rows === 1 ? '' : 's'}
            {body.stats.loops > 0 &&
              ` · ${body.stats.loops} loop${body.stats.loops === 1 ? '' : 's'}`}
            <span className="sm:hidden"> · swipe sideways →</span>
          </span>
        </div>
        <div className="overflow-x-auto overscroll-x-contain">
          <LineSvg
            d={d}
            body={body}
            lines={lines}
            mode={mode}
            found={found}
            route={service === null ? null : d.services[service]}
            revealed={revealed}
            onReveal={(n) => setRevealed((r) => new Set(r).add(n))}
          />
        </div>
        {d.services.length > 1 && (
          <footer className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Services · tap to trace
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {d.services.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setService(service === i ? null : i)}
                  className={`rounded-md px-2 py-0.5 text-left text-sm ring-1 transition ${
                    service === i
                      ? 'text-white ring-transparent'
                      : 'bg-zinc-50 ring-zinc-200 hover:ring-zinc-400 dark:bg-zinc-950 dark:ring-zinc-800 dark:hover:ring-zinc-600'
                  }`}
                  style={service === i ? { background: d.color } : undefined}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </footer>
        )}
      </section>
      <p className="mt-3 text-xs text-zinc-500">
        Interchange chips show the other lines at a station. Grey italic names
        are calling points outside the game.
        {d.express > 0 &&
          ` ${d.express} fast-train hop${
            d.express === 1 ? ' was' : 's were'
          } folded into the stopping route; trace a service to see where it calls.`}
        {body.notes.length > 0 && ` Not drawn: ${body.notes.join(', ')}.`}
      </p>
    </div>
  )
}

function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: [T, string][]
}) {
  return (
    <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800 sm:text-sm">
      {options.map(([m, t]) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`whitespace-nowrap rounded-md px-2 py-0.5 transition sm:px-2.5 ${
            value === m
              ? 'bg-white font-bold text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100'
              : 'text-zinc-600 dark:text-zinc-400'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

function LineSvg({
  d,
  body,
  lines,
  mode,
  found,
  route,
  revealed,
  onReveal,
}: {
  d: Diagram
  body: Body
  lines: Record<string, LineMeta>
  mode: Mode
  found: Set<number>
  route: { route: string[]; stops: string[] } | null
  revealed: Set<string>
  onReveal: (n: string) => void
}) {
  const onRoute = useMemo(() => {
    if (!route) return null
    const e = new Set<string>()
    const ek = (a: string, b: string) =>
      a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`
    for (let i = 1; i < route.route.length; i++)
      e.add(ek(route.route[i - 1], route.route[i]))
    return {
      edges: e,
      nodes: new Set(route.route),
      calls: new Set(route.stops),
    }
  }, [route])
  const col = d.color
  const vars = { '--lc': col, '--lcd': darkSafe(col) } as React.CSSProperties
  const lineCls = '[stroke:var(--lc)] dark:[stroke:var(--lcd)]'
  const W = 7
  const stripe =
    d.stripe === 'solid' || d.stripe === 'triple'
      ? { w: 2.4, dash: undefined }
      : d.stripe === 'dashed'
      ? { w: 2.4, dash: '5 5' }
      : null

  return (
    <svg
      width={body.width}
      height={body.height}
      viewBox={`0 0 ${body.width} ${body.height}`}
      style={vars}
      className="block select-none"
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {body.edges.map((e, i) => (
          <path
            key={i}
            d={e.d}
            strokeWidth={W}
            className={lineCls}
            opacity={onRoute && !onRoute.edges.has(e.key) ? 0.16 : 1}
          />
        ))}
        {stripe &&
          body.edges.map((e, i) => (
            <path
              key={`s${i}`}
              d={e.d}
              strokeWidth={stripe.w}
              strokeDasharray={stripe.dash}
              strokeLinecap={stripe.dash ? 'butt' : 'round'}
              stroke={d.stripeColor ?? undefined}
              className={
                d.stripeColor ? undefined : 'stroke-white dark:stroke-zinc-900'
              }
              opacity={onRoute && !onRoute.edges.has(e.key) ? 0.3 : 1}
            />
          ))}
      </g>
      {body.stations.map((s) => (
        <Station
          key={s.key}
          s={s}
          lines={lines}
          lineCls={lineCls}
          mode={mode}
          isFound={s.id !== null && found.has(s.id)}
          dim={!!onRoute && !onRoute.nodes.has(s.name)}
          skipped={
            !!onRoute && onRoute.nodes.has(s.name) && !onRoute.calls.has(s.name)
          }
          revealed={revealed.has(s.name)}
          onReveal={onReveal}
        />
      ))}
    </svg>
  )
}

function Station({
  s,
  lines,
  lineCls,
  mode,
  isFound,
  dim,
  skipped,
  revealed,
  onReveal,
}: {
  s: DStation
  lines: Record<string, LineMeta>
  lineCls: string
  mode: Mode
  isFound: boolean
  dim: boolean
  skipped: boolean
  revealed: boolean
  onReveal: (n: string) => void
}) {
  const inGame = s.id !== null
  const ix = s.others.length > 0
  const rot = s.side * s.lean > 0 ? -45 : 45
  const anchor = s.lean > 0 ? 'start' : 'end'
  const L = s.lean // label runs along +L on its rotated axis
  const off = ix ? 10 : 9
  const hidden = mode === 'quiz' && inGame && !isFound && !revealed
  const bold = s.terminus || (mode !== 'names' && isFound)
  // Measure the real text so the interchange chips sit right after the name.
  const ref = useRef<SVGTextElement>(null)
  const [tw, setTw] = useState(s.tw)
  useLayoutEffect(() => {
    const m = () => ref.current && setTw(ref.current.getComputedTextLength())
    m()
    document.fonts?.ready.then(m)
  }, [s.name, bold, hidden])
  const textX = L * off
  const nameW = hidden ? 52 : tw
  const chips = s.others.map((o, i) => ({
    o,
    x: L * (off + nameW + 6 + i * 9) - (L > 0 ? 0 : 7),
  }))
  const faded = mode !== 'names' && inGame && !isFound
  const op = dim ? 0.18 : skipped ? 0.45 : 1
  const textCls = s.ghost
    ? 'fill-zinc-500 italic dark:fill-zinc-400'
    : !inGame
    ? 'fill-zinc-400 italic dark:fill-zinc-500'
    : faded && !revealed
    ? 'fill-zinc-400 dark:fill-zinc-500'
    : 'fill-zinc-900 dark:fill-zinc-100'
  const tip = `${s.name}${
    s.others.length
      ? ` · also ${s.others.map((o) => lines[o]?.name ?? o).join(', ')}`
      : ''
  }${
    s.ghost
      ? ' · the branch joins it here (drawn on another row)'
      : inGame
      ? ''
      : ' · not in the game'
  }`
  return (
    <g
      opacity={op}
      onClick={hidden ? () => onReveal(s.name) : undefined}
      className={hidden ? 'cursor-pointer' : undefined}
    >
      <title>{tip}</title>
      {s.ghost ? (
        <circle
          cx={s.x}
          cy={s.y}
          r={3.2}
          strokeWidth={2.2}
          className={`${lineCls} fill-white dark:fill-zinc-900`}
        />
      ) : ix ? (
        <circle
          cx={s.x}
          cy={s.y}
          r={5.6}
          strokeWidth={2.3}
          className={
            mode !== 'names' && isFound
              ? `${lineCls} fill-white dark:fill-zinc-900`
              : 'fill-white stroke-zinc-900 dark:fill-zinc-900 dark:stroke-zinc-100'
          }
        />
      ) : (
        <line
          x1={s.x}
          y1={s.y}
          x2={s.x}
          y2={s.y - s.side * (s.terminus ? 10 : 8)}
          strokeWidth={s.terminus ? 4.5 : 3.6}
          className={inGame ? lineCls : 'stroke-zinc-400'}
        />
      )}
      {mode !== 'names' && isFound && (
        <>
          {!ix && (
            <circle
              cx={s.x}
              cy={s.y}
              r={4.6}
              strokeWidth={2}
              className={`${lineCls} fill-white dark:fill-zinc-900`}
            />
          )}
          <circle
            cx={s.x}
            cy={s.y}
            r={2.3}
            className="fill-zinc-900 dark:fill-white"
          />
        </>
      )}
      <g transform={`translate(${s.x} ${s.y}) rotate(${rot})`}>
        {chips.map((c) => (
          <rect
            key={c.o}
            x={c.x}
            y={-3.5}
            width={7}
            height={7}
            rx={2}
            fill={lines[c.o]?.color ?? '#888'}
            className="stroke-white/70 dark:stroke-zinc-900"
            strokeWidth={0.8}
          />
        ))}
        {hidden ? (
          <g>
            <rect
              x={L > 0 ? textX : textX - 52}
              y={-7.5}
              width={52}
              height={15}
              rx={7.5}
              className="fill-zinc-100 stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-600"
              strokeDasharray="3 2"
            />
            <text
              x={textX + L * 26}
              y={4}
              textAnchor="middle"
              fontSize={11}
              className="fill-zinc-400"
            >
              ?
            </text>
          </g>
        ) : (
          <text
            ref={ref}
            x={textX}
            y={4.3}
            textAnchor={anchor}
            fontSize={12.5}
            fontWeight={bold ? 700 : 500}
            className={textCls}
          >
            {s.ghost ? `${s.via ?? 'to'} ${s.name}` : s.name}
          </text>
        )}
      </g>
    </g>
  )
}

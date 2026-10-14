'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import Chart, { type Header, type Progress } from './Chart'
import { allStations, build, corridorTracks, lineModel, sortCols, type Col } from './model'
import { FEATURE_ID, LINES, LINES_AT, LONDON_FOUND_KEY, SERVICES } from '../lineData'

const GROUPS: [string, (o: number, k: string) => boolean][] = [
  ['National Rail', (o, k) => o >= 21 && k !== 'CableCar'],
  ['Thameslink', (o) => o === 19],
  ['Underground', (o) => o <= 10],
  ['Overground', (o) => o >= 11 && o <= 16],
  ['Elizabeth line', (o) => o === 17],
  ['DLR', (o) => o === 18],
  ['Trams & cable car', (o, k) => o === 20 || k === 'CableCar'],
]
const FEATURED = ['Southern', 'Southeastern', 'Thameslink', 'GreatNorthern', 'SouthWesternRailway', 'C2c', 'GreaterAnglia', 'Metropolitan', 'Northern']
const HUBS = ['Clapham Junction', 'East Croydon', 'London Bridge', 'Stratford', 'Finsbury Park', 'Harrow-on-the-Hill', 'Wimbledon', 'Lewisham']
const DEFAULT_LINE = 'Southeastern'

const hexLum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const lighten = (hex: string, t: number) => {
  const n = parseInt(hex.slice(1), 16)
  const m = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t))
  return `rgb(${m.join(',')})`
}

function readHash() {
  if (typeof window === 'undefined') return {}
  const q = new URLSearchParams(window.location.hash.slice(1))
  return { line: q.get('line') ?? undefined, at: q.get('at') ?? undefined, flip: q.get('flip') === '1' }
}

export default function PatternsApp() {
  const [mode, setMode] = useState<'line' | 'corridor'>('line')
  const [line, setLine] = useState(DEFAULT_LINE)
  const [station, setStation] = useState('Clapham Junction')
  const [stationInput, setStationInput] = useState('Clapham Junction')
  const [flip, setFlip] = useState(false)
  const [sort, setSort] = useState<'speed' | 'route'>('speed')
  const [reach, setReach] = useState(6)
  const [progress, setProgress] = useState<Progress>('off')
  const [found, setFound] = useState<Set<number>>(new Set())
  const [selCol, setSelCol] = useState<string | undefined>()
  const [narrow, setNarrow] = useState(false)
  const [dark, setDark] = useState(false)
  const [ready, setReady] = useState(false)

  // initial state from the URL hash; progress from the real game's save (read-only)
  useEffect(() => {
    const h = readHash()
    if (h.line && SERVICES[h.line]) setLine(h.line)
    if (h.at) {
      setMode('corridor')
      setStation(h.at)
      setStationInput(h.at)
    }
    if (h.flip) setFlip(true)
    const load = () => {
      try {
        const raw = window.localStorage.getItem(LONDON_FOUND_KEY)
        const ids = raw ? (JSON.parse(raw) as unknown) : []
        setFound(new Set(Array.isArray(ids) ? ids.filter((x): x is number => typeof x === 'number') : []))
      } catch {
        setFound(new Set())
      }
    }
    load()
    const onStorage = (e: StorageEvent) => e.key === LONDON_FOUND_KEY && load()
    window.addEventListener('storage', onStorage)
    const mq = window.matchMedia('(max-width: 640px)')
    const dq = window.matchMedia('(prefers-color-scheme: dark)')
    const upd = () => {
      setNarrow(mq.matches)
      setDark(dq.matches)
    }
    upd()
    mq.addEventListener('change', upd)
    dq.addEventListener('change', upd)
    setReady(true)
    return () => {
      window.removeEventListener('storage', onStorage)
      mq.removeEventListener('change', upd)
      dq.removeEventListener('change', upd)
    }
  }, [])
  useEffect(() => {
    if (!ready) return
    const q = new URLSearchParams()
    if (mode === 'line') q.set('line', line)
    else q.set('at', station)
    if (flip) q.set('flip', '1')
    window.history.replaceState(null, '', `#${q.toString().replace(/\+/g, '%20')}`)
  }, [mode, line, station, flip, ready])
  useEffect(() => setSelCol(undefined), [mode, line, station, flip, reach])

  const stations = useMemo(() => allStations(), [])
  const lineKeys = useMemo(() => Object.keys(LINES).filter((k) => SERVICES[k]?.length), [])

  const model = useMemo(
    () => (mode === 'line' ? lineModel(line, flip) : build(corridorTracks(station, reach), { flip })),
    [mode, line, station, reach, flip],
  )
  const cols = useMemo(
    () => sortCols(model.cols, sort, mode === 'corridor' ? (l) => LINES[l]?.order ?? 99 : undefined),
    [model, sort, mode],
  )

  // column headers: far end, plus "via" when two columns share their ends
  const headers = useMemo(() => {
    const out = new Map<string, Header>()
    const groups = new Map<string, Col[]>()
    for (const c of cols) {
      const k = `${c.line}|${c.from}|${c.to}`
      ;(groups.get(k) ?? groups.set(k, []).get(k)!).push(c)
    }
    const name = (r: number) => model.rows[r]
    for (const c of cols) {
      const g = groups.get(`${c.line}|${c.from}|${c.to}`)!
      let sub = `from ${c.from}`
      if (g.length > 1) {
        const mine = new Set(c.rows.filter((_, k) => c.stop[k]).map(name))
        const others = g.filter((o) => o !== c)
        const via = c.rows
          .map(name)
          .find((s, k) => c.stop[k] && others.every((o) => !o.rows.some((r, j) => o.stop[j] && name(r) === s)))
        const skip = !via
          ? others
              .flatMap((o) => o.rows.filter((_, j) => o.stop[j]).map(name))
              .find((s) => !mine.has(s) && c.rows.map(name).includes(s))
          : undefined
        sub = via ? `via ${via}` : skip ? `not ${skip}` : `from ${c.from}`
      }
      let title = c.to
      if (mode === 'corridor' && c.ends) {
        // whole service, outer end first (line diagrams run London outward)
        title = c.ends[1]
        sub = g.length > 1 && !sub.startsWith('from') ? sub : `from ${c.ends[0]}`
      }
      if (mode === 'corridor') sub = `${(LINES[c.line]?.name ?? c.line).replace(/ Railways?$/, '').replace('South Western', 'SW Railway')} · ${sub}`
      out.set(c.key, { title, sub })
    }
    return out
  }, [cols, model, mode])

  const color = (l: string) => {
    const c = LINES[l]?.color ?? '#888'
    return dark && hexLum(c) < 0.1 ? lighten(c, hexLum(c) < 0.03 ? 0.55 : 0.3) : c
  }
  const found1 = (name: string, l: string) => {
    const id = FEATURE_ID[`${name}|${l}`]
    return id === undefined ? undefined : found.has(id)
  }
  const shownLines = mode === 'line' ? [line] : Array.from(new Set(cols.map((c) => c.line)))
  const rowFound = (name: string) => {
    let any: boolean | undefined
    for (const l of mode === 'line' ? [line] : LINES_AT[name] ?? []) {
      const f = found1(name, l)
      if (f) return true
      if (f === false) any = false
    }
    return any
  }
  const prog = useMemo(() => {
    let n = 0
    let f = 0
    for (const s of model.rows) {
      const v = rowFound(s)
      if (v !== undefined) n++
      if (v) f++
    }
    return { n, f }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, found, mode, line])
  const sel = cols.find((c) => c.key === selCol)
  const kinds = { fast: 0, semi: 0, stopping: 0 }
  cols.forEach((c) => kinds[c.kind]++)

  const goStation = (s: string) => {
    setMode('corridor')
    setStation(s)
    setStationInput(s)
    window.scrollTo({ top: 0 })
  }
  const goLine = (l: string) => {
    setMode('line')
    setLine(l)
  }

  const chip = (active: boolean) =>
    `rounded-full px-2.5 py-0.5 text-[13px] transition sm:px-3 sm:py-1 sm:text-sm ${active ? 'font-bold' : 'hover:opacity-80'}`
  const chipStyle = (active: boolean) =>
    active
      ? { background: 'var(--ink)', color: 'var(--bg)' }
      : { background: 'var(--panel)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 1px var(--rule)' }

  return (
    <main className="pt min-h-screen px-4 pb-10 pt-6 sm:px-6" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <style>{`
        .pt { --bg:#f6f5f2; --panel:#ffffff; --ink:#1c1b1a; --muted:#77736c; --muted2:#a29d94; --rule:#e2dfd8; --band:#faf9f6; --band2:#efede7; --hover:#f1efe9; --hl:#fff1c2; }
        @media (prefers-color-scheme: dark) {
          .pt { --bg:#121212; --panel:#1b1b1c; --ink:#ededea; --muted:#9a968f; --muted2:#6e6a64; --rule:#2e2d2b; --band:#202021; --band2:#29282a; --hover:#2b2a2c; --hl:#4a3f17; color-scheme: dark; }
        }
        .pt select, .pt input { background: var(--panel); color: var(--ink); border: 1px solid var(--rule); }
      `}</style>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">Stopping patterns</h1>
          <Link href="/lab/lines" className="text-sm hover:underline" style={{ color: 'var(--muted)' }}>
            ← Line diagrams
          </Link>
        </div>
        <p className="mt-1 max-w-3xl text-[13px] leading-snug sm:text-sm" style={{ color: 'var(--muted)' }}>
          Which trains stop where. Each column is one service, fastest first: a dot where it calls, a tick where it runs
          through without stopping, a dotted line where it skips over another branch. Tap a station for every service
          through it.
        </p>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-full p-0.5" style={{ background: 'var(--band2)' }}>
            {(['line', 'corridor'] as const).map((m) => (
              <button key={m} className={chip(mode === m)} style={mode === m ? chipStyle(true) : { color: 'var(--ink)' }} onClick={() => setMode(m)}>
                {m === 'line' ? 'Line' : 'Corridor'}
              </button>
            ))}
          </div>
          {mode === 'line' ? (
            <select
              className="h-9 rounded-lg px-2 text-sm"
              value={line}
              onChange={(e) => goLine(e.target.value)}
              aria-label="Line"
            >
              {GROUPS.map(([g, f]) => {
                const ks = lineKeys.filter((k) => f(LINES[k].order, k))
                return ks.length ? (
                  <optgroup key={g} label={g}>
                    {ks.map((k) => (
                      <option key={k} value={k}>
                        {LINES[k].name} ({SERVICES[k].length})
                      </option>
                    ))}
                  </optgroup>
                ) : null
              })}
            </select>
          ) : (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const m = stations.find((s) => s.toLowerCase() === stationInput.trim().toLowerCase())
                if (m) goStation(m)
              }}
            >
              <input
                list="pt-stations"
                className="h-9 w-44 rounded-lg px-2 text-sm sm:w-56"
                value={stationInput}
                aria-label="Station"
                onChange={(e) => {
                  setStationInput(e.target.value)
                  const m = stations.find((s) => s === e.target.value)
                  if (m) setStation(m)
                }}
              />
              <datalist id="pt-stations">
                {stations.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <select className="h-9 w-24 rounded-lg px-2 text-sm sm:w-auto" value={reach} onChange={(e) => setReach(+e.target.value)} aria-label="Reach">
                <option value={3}>± 3 stations</option>
                <option value={6}>± 6 stations</option>
                <option value={12}>± 12 stations</option>
                <option value={99}>whole routes</option>
              </select>
            </form>
          )}
          <div className="flex rounded-full p-0.5" style={{ background: 'var(--band2)' }}>
            {(['speed', 'route'] as const).map((m) => (
              <button key={m} className={chip(sort === m)} style={sort === m ? chipStyle(true) : { color: 'var(--ink)' }} onClick={() => setSort(m)}>
                {m === 'speed' ? 'Fastest first' : 'By route'}
              </button>
            ))}
          </div>
          <button className={chip(flip)} style={chipStyle(flip)} onClick={() => setFlip(!flip)} title="Turn the diagram upside down">
            ⇅ Flip
          </button>
          <div className="flex rounded-full p-0.5" style={{ background: 'var(--band2)' }} title="Your progress from the main game (read-only)">
            {(['off', 'show', 'hide'] as const).map((m) => (
              <button key={m} className={chip(progress === m)} style={progress === m ? chipStyle(true) : { color: 'var(--ink)' }} onClick={() => setProgress(m)}>
                {m === 'off' ? 'All names' : m === 'show' ? 'My progress' : 'Quiz'}
              </button>
            ))}
          </div>
        </div>

        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {(mode === 'line' ? FEATURED : HUBS).map((k) =>
            mode === 'line' ? (
              <button key={k} className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs" style={chipStyle(line === k)} onClick={() => goLine(k)}>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: color(k) }} />
                {LINES[k]?.name}
              </button>
            ) : (
              <button key={k} className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs" style={chipStyle(station === k)} onClick={() => goStation(k)}>
                {k}
              </button>
            ),
          )}
        </div>

        {/* summary / selection */}
        <div className="mt-3 flex min-h-[2.5rem] flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {sel ? (
            <>
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: color(sel.line) }} />
              <span className="font-bold">{sel.name}</span>
              {sel.part && <span style={{ color: 'var(--muted)' }}>part {sel.part}</span>}
              <span style={{ color: 'var(--muted)' }}>
                {sel.nStops} stops
                {sel.span > sel.nStops ? `, runs through ${sel.span - sel.nStops} without stopping` : ''} ·{' '}
                {sel.kind === 'semi' ? 'semi-fast' : sel.kind}
                {sel.dup > 1 ? ` · ${sel.dup} patterns like this` : ''}
              </span>
              {mode === 'corridor' && (
                <button className="underline" onClick={() => goLine(sel.line)}>
                  Open {LINES[sel.line]?.name}
                </button>
              )}
              <button style={{ color: 'var(--muted)' }} onClick={() => setSelCol(undefined)}>
                ✕
              </button>
            </>
          ) : (
            <>
              <span className="font-bold">
                {mode === 'line' ? LINES[line]?.name : `Through ${station}`}
              </span>
              <span style={{ color: 'var(--muted)' }}>
                {cols.length} {cols.length === 1 ? 'service' : 'services'}: {kinds.fast} fast, {kinds.semi} semi-fast, {kinds.stopping}{' '}
                stopping
              </span>
              {progress !== 'off' && (
                <span style={{ color: 'var(--muted)' }}>
                  · found {prog.f} of {prog.n} stations
                  {found.size === 0 ? ' (no saved progress found on this device)' : ''}
                </span>
              )}
              <Legend />
            </>
          )}
        </div>

        {/* chart */}
        <div
          className="mt-2 max-h-[82dvh] w-fit max-w-full overflow-auto rounded-xl shadow-sm"
          style={{ background: 'var(--panel)', boxShadow: '0 0 0 1px var(--rule)', overscrollBehavior: 'contain' }}
        >
          {ready && model.rows.length > 0 ? (
            <Chart
              model={model}
              cols={cols}
              header={(c) => headers.get(c.key) ?? { title: c.to, sub: '' }}
              color={color}
              found={found1}
              rowFound={rowFound}
              progress={progress}
              anchor={mode === 'corridor' ? station : undefined}
              skipLines={shownLines}
              selCol={selCol}
              onSelCol={setSelCol}
              onStation={goStation}
              narrow={narrow}
            />
          ) : (
            <div className="p-6 text-sm" style={{ color: 'var(--muted)' }}>
              {ready ? 'No services found.' : 'Loading…'}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function Legend() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--muted)' }}>
      <svg width={150} height={16} className="shrink-0">
        <line x1={8} x2={8} y1={0} y2={16} stroke="var(--muted)" strokeWidth={5} />
        <circle cx={8} cy={8} r={4.6} fill="var(--muted)" stroke="var(--panel)" strokeWidth={1.4} />
        <text x={18} y={12} fontSize={11} fill="var(--muted)">
          calls
        </text>
        <line x1={58} x2={58} y1={0} y2={16} stroke="var(--muted)" strokeWidth={5} />
        <line x1={52} x2={64} y1={8} y2={8} stroke="var(--muted)" strokeWidth={1.5} />
        <text x={68} y={12} fontSize={11} fill="var(--muted)">
          passes
        </text>
        <line x1={114} x2={114} y1={2} y2={14} stroke="var(--muted)" strokeWidth={2} strokeLinecap="round" strokeDasharray="0 5" />
        <text x={122} y={12} fontSize={11} fill="var(--muted)">
          skips
        </text>
      </svg>
    </span>
  )
}

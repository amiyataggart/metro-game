'use client'
import Link from 'next/link'
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createMatcher } from '@/lib/matching'
import { LONDON_ALIASES } from '../../../london/data/aliases'
import Diagram, { RowView } from './Diagram'
import { flipLayout, layoutLine, LineLayout } from './graph'
import type { LineInfo, VerticalData } from './data'
import { compareLines, groupNameOf } from '../../ui/shells/key/groups'

const FOUND_KEY = 'london-stations' // the real game's save: READ ONLY here
const PRACTICE_KEY = 'lab-lines-vertical-practice-v1' // this page's own results
const PREFS_KEY = 'lab-lines-vertical-prefs-v1'

const SHORT: Record<string, string> = {
  Bakerloo: 'Bak', Central: 'Cen', Circle: 'Cir', District: 'Dis', HammersmithAndCity: 'H&C', Jubilee: 'Jub',
  Metropolitan: 'Met', Northern: 'Nor', Piccadilly: 'Pic', Victoria: 'Vic', WaterlooAndCity: 'W&C', Liberty: 'Lib',
  Lioness: 'Lio', Mildmay: 'Mil', Suffragette: 'Suf', Weaver: 'Wea', Windrush: 'Win', ElizabethLine: 'Eliz',
  DLR: 'DLR', Thameslink: 'TL', Tramlink: 'Tram', C2c: 'c2c', Chiltern: 'Chil', EastMidlandsRailway: 'EMR',
  GatwickExpress: 'GX', GreatNorthern: 'GN', GreatWesternRailway: 'GWR', GreaterAnglia: 'GA', HeathrowExpress: 'HEx',
  SouthWesternRailway: 'SWR', Southeastern: 'SE', SoutheasternHighSpeed: 'HS1', Southern: 'Sthn',
  LondonNorthwestern: 'LNR', CableCar: 'Cable',
}

function groupOf(l: LineInfo) {
  return groupNameOf(l.key, l.order)
}

type Mode = 'browse' | 'practice'
type Theme = 'auto' | 'light' | 'dark'

interface RunStats {
  mistakes: number
  hints: number
  reveals: number
  ms: number
}
interface PracticeStore {
  [key: string]: { runs: number; best?: RunStats; last?: RunStats }
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 1
  const n = parseInt(m[1], 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}
function liftDark(l: LineInfo): LineInfo {
  return luminance(l.color) < 0.12 ? { ...l, color: '#d4d4d8', textColor: '#18181b' } : l
}

function linearLayout(stops: string[]): LineLayout {
  return {
    rows: stops.map((name) => ({ name, lane: 0 })),
    pieces: [{ lane: 0, rows: stops.map((_, i) => i) }],
    lanes: 1,
    busy: stops.map(() => 0),
    jumps: {},
  }
}
function dedupe(stops: string[]) {
  return stops.filter((s, i) => s !== stops[i - 1])
}
const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const score = (r: RunStats) => r.mistakes + r.hints + 3 * r.reveals

/** Keep the bottom input above the on-screen keyboard (iOS keeps the layout viewport). */
function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const on = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => {
      vv.removeEventListener('resize', on)
      vv.removeEventListener('scroll', on)
    }
  }, [])
  return inset
}

export default function NextStops({ data, fontClass }: { data: VerticalData; fontClass: string }) {
  const { lines, services, linesAt, featureId } = data
  const lineByKey = useMemo(() => Object.fromEntries(lines.map((l) => [l.key, l])), [lines])
  const [lineKey, setLineKey] = useState('Northern')
  const [mode, setMode] = useState<Mode>('browse')
  const [svc, setSvc] = useState<number>(-1) // browse: -1 = whole line
  const [flip, setFlip] = useState(false)
  const [hideNames, setHideNames] = useState(false)
  const [theme, setTheme] = useState<Theme>('auto')
  const [prefersDark, setPrefersDark] = useState(false)
  const [found, setFound] = useState<Set<number>>(new Set())
  const [hydrated, setHydrated] = useState(false)
  const [store, setStore] = useState<PracticeStore>({})
  const baseLine = lineByKey[lineKey] ?? lines[0]

  // ---- boot: hash, prefs, saves ----
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1))
    const prefs = readJSON<{ theme?: Theme; hideNames?: boolean }>(PREFS_KEY, {})
    if (prefs.theme) setTheme(prefs.theme)
    if (prefs.hideNames) setHideNames(true)
    const l = h.get('line')
    if (l && lineByKey[l]) setLineKey(l)
    if (h.get('mode') === 'practice') setMode('practice')
    if (h.get('svc')) setSvc(+h.get('svc')!)
    if (h.get('flip') === '1') setFlip(true)
    if (h.get('hide') === '1') setHideNames(true)
    const ids = readJSON<unknown>(FOUND_KEY, [])
    setFound(new Set(Array.isArray(ids) ? ids.filter((x): x is number => typeof x === 'number') : []))
    setStore(readJSON<PracticeStore>(PRACTICE_KEY, {}))
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setPrefersDark(mq.matches)
    const on = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
    mq.addEventListener?.('change', on)
    setHydrated(true)
    return () => mq.removeEventListener?.('change', on)
  }, [lineByKey])
  useEffect(() => {
    if (!hydrated) return
    const h = new URLSearchParams({ line: lineKey })
    if (mode === 'practice') h.set('mode', 'practice')
    if (svc >= 0) h.set('svc', String(svc))
    if (flip) h.set('flip', '1')
    window.history.replaceState(null, '', `#${h.toString()}`)
  }, [hydrated, lineKey, mode, svc, flip])
  useEffect(() => {
    if (hydrated) writeJSON(PREFS_KEY, { theme, hideNames })
  }, [hydrated, theme, hideNames])

  const dark = theme === 'dark' || (theme === 'auto' && prefersDark)
  // near-black lines (Northern) would vanish on a dark background: draw them light grey there
  const line = useMemo(() => (dark ? liftDark(baseLine) : baseLine), [dark, baseLine])
  const lineServices = useMemo(() => services[line.key] ?? [], [services, line.key])

  const pickLine = (k: string) => {
    setLineKey(k)
    setSvc(mode === 'practice' ? 0 : -1)
    setFlip(false)
    setRun(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const pickMode = (m: Mode) => {
    setMode(m)
    setSvc(m === 'practice' ? Math.max(0, svc) : -1)
    setRun(null)
  }

  // ---- browse ----
  const isFound = useCallback(
    (name: string) => {
      const id = featureId[`${name}|${line.key}`]
      return id === undefined ? null : found.has(id)
    },
    [featureId, found, line.key],
  )
  const wholeLayout = useMemo(() => {
    const radial = line.stripe === 'dashed'
    return layoutLine(
      lineServices.map((s) => s.stops),
      data.coords,
      radial,
    )
  }, [lineServices, data.coords, line.stripe])

  const chips = (name: string) => {
    const others = (linesAt[name] ?? []).filter((k) => k !== line.key && lineByKey[k])
    others.sort((a, b) => lineByKey[a].order - lineByKey[b].order)
    return others
  }
  const chipList = (name: string) => {
    const o = chips(name)
    if (!o.length) return null
    return (
      <span className="flex flex-wrap gap-1">
        {o.map((k) => (
          <span
            key={k}
            title={lineByKey[k].name}
            className="rounded-[5px] px-1.5 text-[11px] font-bold leading-[18px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.3)]"
            style={{ background: lineByKey[k].color, color: lineByKey[k].textColor }}
          >
            {SHORT[k] ?? lineByKey[k].name}
          </span>
        ))}
      </span>
    )
  }

  // ---- practice ----
  const [run, setRun] = useState<null | {
    stops: string[]
    answered: number // stops [0, answered) are filled
    revealed: Set<number>
    popAt: number
    hint: number
    mistakes: number
    hints: number
    reveals: number
    t0: number
    done?: RunStats
  }>(null)
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'bad' | 'near' | 'good'; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const kb = useKeyboardInset()

  const practiceStops = useMemo(() => {
    const s = lineServices[Math.max(0, svc)]
    if (!s) return []
    const st = dedupe(s.stops)
    return flip ? st.slice().reverse() : st
  }, [lineServices, svc, flip])
  const practiceKey = `${line.key}|${Math.max(0, svc)}|${flip ? 'r' : 'f'}`

  // stops that are given for free: the first, ones outside the game, and repeats on loops
  const autoFill = useCallback(
    (stops: string[], from: number) => {
      let i = from
      while (i < stops.length) {
        const s = stops[i]
        const outOfGame = featureId[`${s}|${line.key}`] === undefined
        if (i === 0 || outOfGame || stops.indexOf(s) < i) i++
        else break
      }
      return i
    },
    [featureId, line.key],
  )

  // one matcher over every station name (as the game does), so curated groups
  // like King's Cross / St Pancras resolve; the result is then checked against the run
  const matcher = useMemo(() => {
    const names = new Set(Object.keys(linesAt))
    Object.values(services).forEach((ss) => ss.forEach((s) => s.stops.forEach((n) => names.add(n))))
    return createMatcher(
      Array.from(names).map((name, id) => ({ id, name })),
      LONDON_ALIASES,
    )
  }, [linesAt, services])

  const startRun = () => {
    const stops = practiceStops
    setRun({
      stops,
      answered: autoFill(stops, 0),
      revealed: new Set(),
      popAt: -1,
      hint: 0,
      mistakes: 0,
      hints: 0,
      reveals: 0,
      t0: Date.now(),
    })
    setInput('')
    setFeedback(null)
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50)
  }

  const finishIfDone = (r: NonNullable<typeof run>) => {
    if (r.answered < r.stops.length) return r
    const stats: RunStats = { mistakes: r.mistakes, hints: r.hints, reveals: r.reveals, ms: Date.now() - r.t0 }
    const prev = store[practiceKey]
    const better = !prev?.best || score(stats) < score(prev.best) || (score(stats) === score(prev.best) && stats.ms < prev.best.ms)
    const next = { ...store, [practiceKey]: { runs: (prev?.runs ?? 0) + 1, best: better ? stats : prev!.best, last: stats } }
    setStore(next)
    writeJSON(PRACTICE_KEY, next)
    inputRef.current?.blur()
    return { ...r, done: stats }
  }

  const submit = () => {
    if (!run || run.done) return
    const q = input.trim()
    if (!q) return
    const expected = run.stops[run.answered]
    const res = matcher(q)
    const names = res.kind === 'match' ? res.names : []
    if (names.includes(expected)) {
      const r = { ...run, answered: autoFill(run.stops, run.answered + 1), popAt: run.answered, hint: 0 }
      setRun(finishIfDone(r))
      setInput('')
      setFeedback({ kind: 'good', text: expected })
      return
    }
    let text = names.length ? `${names[0]} isn't on this run.` : 'Not a station we know. Try again.'
    let kind: 'bad' | 'near' = 'bad'
    const onRun = names.find((n) => run.stops.includes(n))
    if (onRun) {
      const n = onRun
      const later = run.stops.indexOf(n, run.answered + 1)
      const earlier = run.stops.lastIndexOf(n, run.answered - 1)
      if (later > run.answered) {
        text = `${n} is on this run, ${later - run.answered} stop${later - run.answered > 1 ? 's' : ''} further on.`
        kind = 'near'
      } else if (earlier >= 0) {
        text = `Already passed ${n}.`
        kind = 'near'
      }
    } else if (res.kind === 'ambiguous') text = 'Which one? Be more specific.'
    setRun({ ...run, mistakes: run.mistakes + 1 })
    setFeedback({ kind, text })
    inputRef.current?.animate(
      [0, -7, 7, -5, 5, 0].map((x) => ({ transform: `translateX(${x}px)` })),
      { duration: 340, easing: 'ease-in-out' },
    )
    setTimeout(() => inputRef.current?.select(), 0)
  }
  const hint = () => {
    if (!run || run.done) return
    const expected = run.stops[run.answered]
    if (run.hint >= expected.length - 1) return
    setRun({ ...run, hint: run.hint + 1, hints: run.hints + 1 })
    inputRef.current?.focus({ preventScroll: true })
  }
  const reveal = () => {
    if (!run || run.done) return
    const revealed = new Set(run.revealed)
    revealed.add(run.answered)
    const r = {
      ...run,
      revealed,
      reveals: run.reveals + 1,
      answered: autoFill(run.stops, run.answered + 1),
      popAt: run.answered,
      hint: 0,
    }
    setFeedback({ kind: 'bad', text: `It was ${run.stops[run.answered]}.` })
    setRun(finishIfDone(r))
    setInput('')
    inputRef.current?.focus({ preventScroll: true })
  }

  // keep the current blank in view
  const currentRow = run && !run.done ? run.answered : undefined
  useEffect(() => {
    if (currentRow === undefined) return
    const el = rowRefs.current[currentRow]
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: Math.max(0, top - window.innerHeight * 0.38), behavior: 'smooth' })
  }, [currentRow])

  // ---- what to draw ----
  let layout: LineLayout
  let views: RowView[]
  // termini: stations with only one neighbour in the drawn line (robust to how
  // the line is cut into pieces: a branch split at a junction still ends there)
  const termini = (L: LineLayout) => {
    const deg = new Map<number, number>()
    const link = (u: number, v: number) => {
      if (u === v) return
      deg.set(u, (deg.get(u) ?? 0) + 1)
      deg.set(v, (deg.get(v) ?? 0) + 1)
    }
    L.pieces.forEach((p) => {
      const rs = p.rows
      for (let k = 1; k < rs.length; k++) link(rs[k - 1], rs[k])
      if (rs.length) {
        if (p.top !== undefined) link(p.top, rs[0])
        if (p.bottom !== undefined) link(rs[rs.length - 1], p.bottom)
      } else if (p.top !== undefined && p.bottom !== undefined) link(p.top, p.bottom)
    })
    const ends = new Set<number>()
    L.rows.forEach((_, i) => { if ((deg.get(i) ?? 0) <= 1) ends.add(i) })
    return ends
  }

  if (mode === 'browse') {
    if (svc >= 0 && lineServices[svc]) layout = linearLayout(dedupe(lineServices[svc].stops))
    else layout = wholeLayout
    if (flip) layout = flipLayout(layout)
    const ends = termini(layout)
    views = layout.rows.map((row, i) => {
      const f = isFound(row.name)
      const out = f === null
      const show = f || !hideNames || out
      const jumps = layout.jumps[i]
      return {
        key: `${i}:${row.name}`,
        dot: out ? 'out' : f ? 'found' : 'open',
        interchange: chips(row.name).length > 0,
        terminus: ends.has(i),
        label: (
          <>
            {show ? (
              <span
                className={`text-[16.5px] leading-[26px] ${
                  out
                    ? 'italic text-zinc-400 dark:text-zinc-500'
                    : f
                    ? 'font-bold text-zinc-900 dark:text-white'
                    : 'text-zinc-400 dark:text-zinc-500'
                } ${ends.has(i) ? 'uppercase tracking-wide' : ''}`}
              >
                {row.name}
              </span>
            ) : (
              <span
                className="inline-block h-[10px] rounded-full bg-zinc-200 dark:bg-zinc-800"
                style={{ width: Math.min(220, 26 + row.name.length * 6.5) }}
                aria-label="not found yet"
              />
            )}
            {chipList(row.name)}
            {out && <span className="text-[11px] text-zinc-400">not in the game</span>}
          </>
        ),
        extra: jumps ? (
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500 dark:text-zinc-400">
            {jumps.map((to) => (
              <button
                key={to}
                className="underline decoration-dotted underline-offset-2 hover:text-zinc-900 dark:hover:text-white"
                onClick={() => {
                  const r = layout.rows.findIndex((x) => x.name === to)
                  const el = rowRefs.current[r]
                  if (el)
                    window.scrollTo({
                      top: el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4,
                      behavior: 'smooth',
                    })
                }}
              >
                also to {to} ↗
              </button>
            ))}
          </div>
        ) : undefined,
      } satisfies RowView
    })
  } else {
    const stops = run ? run.stops : practiceStops
    layout = linearLayout(stops)
    const ends = termini(layout)
    const answered = run ? run.answered : autoFill(stops, 0)
    views = stops.map((name, i) => {
      const isAnswered = i < answered || !!run?.done
      const isCur = run && !run.done && i === answered
      const revealed = run?.revealed.has(i)
      const outOfGame = featureId[`${name}|${line.key}`] === undefined
      const given = i === 0 || outOfGame || stops.indexOf(name) < i
      let label: ReactNode
      if (isAnswered) {
        label = (
          <>
            <span
              className={`text-[16.5px] leading-[26px] ${
                revealed ? 'text-rose-600 dark:text-rose-400' : 'font-bold text-zinc-900 dark:text-white'
              } ${run?.popAt === i ? 'ns-slide' : ''} ${ends.has(i) ? 'uppercase tracking-wide' : ''}`}
            >
              {name}
            </span>
            {chipList(name)}
          </>
        )
      } else if (isCur) {
        const shown = name.slice(0, run!.hint)
        label = (
          <span className="inline-flex h-[30px] items-center rounded-md border-2 border-dashed border-amber-400 px-2 font-mono text-[15px] tracking-wider text-amber-700 dark:text-amber-300">
            {shown ? `${shown}…` : 'next stop?'}
          </span>
        )
      } else {
        label = <span className="text-[15px] tracking-[0.3em] text-zinc-300 dark:text-zinc-700">· · ·</span>
      }
      return {
        key: `${practiceKey}:${i}`,
        dot: isAnswered ? (revealed ? 'revealed' : given && i > 0 ? 'given' : 'found') : 'open',
        interchange: isAnswered && chips(name).length > 0,
        terminus: ends.has(i),
        pop: run?.popAt === i,
        label,
      } satisfies RowView
    })
  }

  // ---- stats ----
  const lineStations = useMemo(() => {
    const set = new Set<string>()
    lineServices.forEach((s) => s.stops.forEach((n) => featureId[`${n}|${line.key}`] !== undefined && set.add(n)))
    return Array.from(set)
  }, [lineServices, featureId, line.key])
  const foundCount = lineStations.filter((n) => isFound(n)).length
  const pct = lineStations.length ? foundCount / lineStations.length : 0
  const progress = run ? run.answered / Math.max(1, run.stops.length) : 0
  const bestHere = store[practiceKey]?.best
  const groups = useMemo(() => {
    const g: [string, LineInfo[]][] = []
    for (const l of lines.slice().sort(compareLines)) {
      const name = groupOf(l)
      const hit = g.find((x) => x[0] === name)
      if (hit) hit[1].push(l)
      else g.push([name, [l]])
    }
    return g
  }, [lines])

  const swatch = (l: LineInfo, size = 14) => (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: l.color,
        boxShadow: l.stripe
          ? `inset 0 0 0 ${size / 2 - 2}px ${l.color}, inset 0 0 0 ${size}px #fff`
          : dark
          ? '0 0 0 1px rgba(255,255,255,.35)'
          : undefined,
      }}
    />
  )

  const modeTabs = () => (
    <div className="flex rounded-full bg-zinc-200/80 p-1 text-sm font-bold dark:bg-zinc-800">
      {(['browse', 'practice'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => pickMode(m)}
          className={`flex-1 rounded-full px-4 py-1.5 transition ${
            mode === m ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500'
          }`}
        >
          {m === 'browse' ? 'Browse' : 'Line run'}
        </button>
      ))}
    </div>
  )

  const servicePicker = () => (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-zinc-500">
        {mode === 'practice' ? 'Service' : 'Show'}
      </span>
      <select
        value={svc}
        onChange={(e) => {
          setSvc(+e.target.value)
          setRun(null)
        }}
        className={`w-full rounded-lg border-0 bg-white py-2 pl-3 pr-8 text-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700`}
      >
        {mode === 'browse' && <option value={-1}>Whole line (all branches)</option>}
        {lineServices.map((s, i) => (
          <option key={i} value={i}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )

  const toggles = () => (
    <div className="flex flex-wrap gap-2 text-sm">
      <button
        onClick={() => {
          setFlip(!flip)
          setRun(null)
        }}
        className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-200 hover:ring-zinc-400 dark:bg-zinc-900 dark:ring-zinc-700"
      >
        ⇅ {mode === 'practice' ? 'Other direction' : 'Flip'}
      </button>
      {mode === 'browse' && (
        <button
          onClick={() => setHideNames(!hideNames)}
          className={`rounded-full px-3 py-1 ring-1 ${
            hideNames
              ? 'bg-zinc-900 text-white ring-zinc-900 dark:bg-white dark:text-zinc-900 dark:ring-white'
              : 'bg-white ring-zinc-200 hover:ring-zinc-400 dark:bg-zinc-900 dark:ring-zinc-700'
          }`}
        >
          {hideNames ? 'Unfound names hidden' : 'Hide unfound names'}
        </button>
      )}
      <button
        onClick={() => setTheme(theme === 'auto' ? (dark ? 'light' : 'dark') : theme === 'dark' ? 'light' : 'dark')}
        className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-200 hover:ring-zinc-400 dark:bg-zinc-900 dark:ring-zinc-700"
        aria-label="Toggle dark mode"
      >
        {dark ? '☀︎' : '☾'}
      </button>
    </div>
  )

  const progressCard = () =>
    mode === 'browse' ? (
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Your progress</span>
          <span className="text-sm tabular-nums">
            <b>{foundCount}</b> / {lineStations.length}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct * 100}%`, background: line.color }}
          />
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">
          {found.size ? 'From your /london game on this device.' : 'Nothing found yet in /london on this device.'}
        </p>
      </div>
    ) : (
      <div className="text-sm">
        <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">Best on this run</div>
        {bestHere ? (
          <p className="mt-1 tabular-nums">
            {plural(bestHere.mistakes, 'mistake')} · {plural(bestHere.hints, 'hint')} · {bestHere.reveals} shown ·{' '}
            {fmtTime(bestHere.ms)}
            <span className="text-zinc-500"> ({plural(store[practiceKey].runs, 'run')})</span>
          </p>
        ) : (
          <p className="mt-1 text-zinc-500">Not tried yet.</p>
        )}
      </div>
    )

  const headerTitle = (
    <div className="flex items-center gap-3">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold"
        style={{ background: line.color, color: line.textColor }}
      >
        {(SHORT[line.key] ?? line.name).slice(0, 4)}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 truncate text-xl font-bold leading-6">
          {line.name}
          <svg width="12" height="12" viewBox="0 0 12 12" className="text-zinc-400 lg:hidden" aria-hidden>
            <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="truncate text-xs text-zinc-500">
          {mode === 'browse'
            ? svc >= 0
              ? lineServices[svc]?.name
              : `${lineServices.length} service${lineServices.length > 1 ? 's' : ''} · ${lineStations.length} stations`
            : `${practiceStops[0]} → ${practiceStops[practiceStops.length - 1]}`}
        </div>
      </div>
    </div>
  )

  return (
    <div className={`${fontClass} ${dark ? 'dark' : ''}`}>
      <style>{`
        .ns-root { --ns-ink: #18181b; --ns-bg: #ffffff; --ns-reveal: #e11d48; }
        .dark .ns-root { --ns-ink: #f4f4f5; --ns-bg: #09090b; --ns-reveal: #fb7185; }
        @keyframes ns-pop { 0% { transform: scale(.2); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
        @keyframes ns-slide { 0% { transform: translateX(-10px); opacity: 0; filter: blur(2px) } 100% { transform: none; opacity: 1; filter: none } }
        .ns-slide { display: inline-block; animation: ns-slide 420ms ease-out both }
        @keyframes ns-pulse { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
        .ns-pulse { animation: ns-pulse 1.4s ease-in-out infinite }
        html { scroll-behavior: smooth }
      `}</style>
      <div className="ns-root min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 lg:bg-zinc-50 lg:dark:bg-black">
        <div className="mx-auto flex max-w-[1060px] justify-center gap-10 lg:px-6 lg:py-8">
          {/* ---- desktop side panel ---- */}
          <aside className="hidden w-[300px] shrink-0 lg:block">
            <div className="sticky top-8 flex max-h-[calc(100vh-4rem)] flex-col gap-5">
              <div>
                <Link href="/lab/lines" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                  ← Line diagrams
                </Link>
                <h1 className="mt-1 text-2xl font-bold">Next stops</h1>
              </div>
              {modeTabs()}
              <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                {progressCard()}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-white p-2 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                {groups.map(([g, ls]) => (
                  <div key={g} className="mb-2">
                    <div className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">{g}</div>
                    {ls.map((l) => (
                      <button
                        key={l.key}
                        onClick={() => pickLine(l.key)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-sm ${
                          l.key === line.key
                            ? 'bg-zinc-100 font-bold dark:bg-zinc-800'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                        }`}
                      >
                        {swatch(l)}
                        <span className="truncate">{l.name}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* ---- the column ---- */}
          <main className="w-full max-w-[480px] lg:overflow-clip lg:rounded-[28px] lg:bg-white lg:shadow-xl lg:ring-1 lg:ring-zinc-200 lg:dark:bg-zinc-950 lg:dark:ring-zinc-800">
            <div className="flex items-center justify-between px-4 pt-3 lg:hidden">
              <Link href="/lab/lines" className="text-sm text-blue-600 dark:text-blue-400">
                ← Line diagrams
              </Link>
              <span className="text-sm font-bold text-zinc-500">Next stops</span>
            </div>
            <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/95 px-4 pb-2.5 pt-2.5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:pt-0">
              <div className="-mx-4 mb-3 hidden h-1.5 lg:block" style={{ background: line.color }} />
              <div className="relative">
                {headerTitle}
                {/* phone: the title is the line picker */}
                <select
                  aria-label="Line"
                  value={line.key}
                  onChange={(e) => pickLine(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 lg:hidden"
                >
                  {groups.map(([g, ls]) => (
                    <optgroup key={g} label={g}>
                      {ls.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {mode === 'practice' && run && !run.done && (
                <div className="mt-2 flex items-center gap-3 text-xs tabular-nums text-zinc-500">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress * 100}%`, background: line.color }}
                    />
                  </div>
                  <span>
                    {run.answered}/{run.stops.length}
                  </span>
                  <span className={run.mistakes ? 'font-bold text-rose-600 dark:text-rose-400' : ''}>
                    {run.mistakes} mistake{run.mistakes === 1 ? '' : 's'}
                  </span>
                  <span>
                    {run.hints} hint{run.hints === 1 ? '' : 's'}
                  </span>
                </div>
              )}
            </header>

            <div className="space-y-3 px-4 pb-1 pt-4">
              <div className="lg:hidden">{modeTabs()}</div>
              {servicePicker()}
              {toggles()}
              <div className="lg:hidden">
                {progressCard()}
              </div>
              {mode === 'practice' && !run && (
                <div className="rounded-xl bg-zinc-50 p-4 text-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                  <p>
                    Type each stop in order, from <b>{practiceStops[0]}</b> to{' '}
                    <b>{practiceStops[practiceStops.length - 1]}</b>. Hints show the next letter; mistakes are counted.
                  </p>
                  <button
                    onClick={startRun}
                    className="mt-3 w-full rounded-full py-2.5 text-base font-bold shadow-sm transition active:scale-[.98]"
                    style={{ background: line.color, color: line.textColor }}
                  >
                    Start the run ({practiceStops.length} stops)
                  </button>
                </div>
              )}
            </div>

            <div className="pb-6 pt-2">
              {layout.rows.length ? (
                <Diagram
                  layout={layout}
                  line={line}
                  views={views}
                  rowRefs={rowRefs}
                  current={currentRow}
                />
              ) : (
                <p className="p-6 text-zinc-500">No services for this line.</p>
              )}
            </div>

            {/* ---- pinned answer bar ---- */}
            {mode === 'practice' && run && !run.done && (
              <div
                className="sticky z-30 border-t border-zinc-200 bg-white/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
                style={{ bottom: kb }}
              >
                <div
                  className={`mb-1.5 h-5 truncate px-1 text-sm ${
                    feedback?.kind === 'good'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : feedback?.kind === 'near'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {feedback ? (feedback.kind === 'good' ? `✓ ${feedback.text}` : feedback.text) : ''}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    submit()
                  }}
                  className="flex gap-2"
                >
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Next station…"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="words"
                    spellCheck={false}
                    enterKeyHint="go"
                    className={`min-w-0 flex-1 rounded-full border-0 bg-zinc-100 px-4 py-2.5 text-base ring-2 ring-transparent focus:outline-none focus:ring-zinc-400 dark:bg-zinc-900`}
                  />
                  <button
                    type="button"
                    onClick={hint}
                    className="rounded-full bg-amber-100 px-3 text-sm font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-300"
                  >
                    Hint
                  </button>
                  <button
                    type="button"
                    onClick={reveal}
                    className="rounded-full bg-zinc-100 px-3 text-sm font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    Show
                  </button>
                </form>
              </div>
            )}

            {mode === 'practice' && run?.done && (
              <div className="sticky bottom-0 z-30 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                <div className="ns-slide w-full rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">
                  <div className="flex items-center gap-2">
                    {swatch(line, 16)}
                    <div className="text-lg font-bold">Run complete</div>
                    {store[practiceKey]?.best === run.done && (
                      <span className="rounded-full bg-emerald-100 px-2 text-xs font-bold text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300">
                        new best
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {[
                      ['Mistakes', run.done.mistakes],
                      ['Hints', run.done.hints],
                      ['Shown', run.done.reveals],
                      ['Time', fmtTime(run.done.ms)],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-zinc-50 py-2 dark:bg-zinc-800">
                        <div className="text-xl font-bold tabular-nums">{v}</div>
                        <div className="text-[11px] uppercase tracking-wider text-zinc-500">{k}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">
                    {run.done.mistakes + run.done.hints + run.done.reveals === 0
                      ? 'Perfect run. Every stop from memory.'
                      : `${run.stops.length - run.done.reveals} of ${run.stops.length} stops without being shown.`}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={startRun}
                      className="flex-1 rounded-full py-2 font-bold"
                      style={{ background: line.color, color: line.textColor }}
                    >
                      Again
                    </button>
                    <button
                      onClick={() => {
                        setFlip(!flip)
                        setRun(null)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      className="flex-1 rounded-full bg-zinc-100 py-2 font-bold dark:bg-zinc-800"
                    >
                      Reverse
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

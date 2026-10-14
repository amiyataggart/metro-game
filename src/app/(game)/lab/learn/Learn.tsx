'use client'
// /lab/learn: the "Next stops" demo (../lines/vertical) laid out like the
// game's Key shell (../ui/shells/key). Desktop: the Key's left panel lists the
// lines; the selected one opens in place to list its services, which choose
// what the main area shows. The main area, where the game has its map, holds
// Browse (the vertical line diagram), Route (one service as the carriage strip,
// ../lines/strip) and Test (type the stops in order). Found stations (ticks)
// come from the real game's save, read-only. Phone: the main area is full
// screen, a dock at the bottom shows the selected line and opens the list as a sheet.
import classNames from 'classnames'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createMatcher } from '@/lib/matching'
import { LONDON_ALIASES } from '../../london/data/aliases'
import Diagram, { RowView } from './Diagram'
import { layoutLine, LineLayout } from '../lines/vertical/graph'
import type { LearnData, LineInfo } from './data'
import { buildGroups } from '../ui/shells/key/groups'
import { KeyRoundel, uiLine } from '../ui/shells/key/parts'
import type { Theme } from '../ui/shells/key/useMapTheme'
import { KeyFooter, KeyLines, PAPER, PhoneSheet, RULE, Spine, inkOn } from './LearnKey'
import PlayLearnSwitch from '../ui/PlayLearnSwitch'
import Route, { ROUTE_CSS, StationCard } from './Route'
import Branches from './Branches'
import TestStrip from './TestStrip'
import { SHORT } from './short'

const FOUND_KEY = 'london-stations' // the real game's save: READ ONLY here
const PRACTICE_KEY = 'london-learn-practice-v1' // this page's own Test results
const PREFS_KEY = 'london-learn-prefs-v1'
const THEME_KEY = 'london-theme' // shared with the Key shell, so the theme matches the game


// Browse (the vertical diagram as a tab) is archived: archive/LearnWithBrowse.tsx
type Mode = 'route' | 'test'
const MODES: Mode[] = ['route', 'test']

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

function dedupe(stops: string[]) {
  return stops.filter((s, i) => s !== stops[i - 1])
}
const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const score = (r: RunStats) => r.mistakes + r.hints + 3 * r.reveals

// as the Key shell: one theme, remembered under the Key's own key
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>('light')
  useEffect(() => {
    try {
      if (window.localStorage.getItem(THEME_KEY) === 'dark') setThemeState('dark')
    } catch {}
  }, [])
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      window.localStorage.setItem(THEME_KEY, t)
    } catch {}
  }, [])
  return [theme, setTheme]
}

function useIsDesktop() {
  const [d, setD] = useState<boolean | null>(null)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setD(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return d
}

// Phone (as the Key): size the layout to the *visual* viewport, so the dock
// with the Test input rides on top of the on-screen keyboard.
function useVisualViewport(active: boolean) {
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null)
  useEffect(() => {
    const v = typeof window !== 'undefined' ? window.visualViewport : null
    if (!active || !v) {
      setVv(null)
      return
    }
    const on = () => setVv({ h: v.height, top: v.offsetTop })
    on()
    v.addEventListener('resize', on)
    v.addEventListener('scroll', on)
    return () => {
      v.removeEventListener('resize', on)
      v.removeEventListener('scroll', on)
    }
  }, [active])
  return vv
}

export default function Learn({ data, fontClass, fontFamily }: { data: LearnData; fontClass: string; fontFamily: string }) {
  const { lines, services, linesAt, featureId } = data
  const lineByKey = useMemo(() => Object.fromEntries(lines.map((l) => [l.key, l])), [lines])
  const groups = useMemo(() => buildGroups(lineByKey), [lineByKey])
  const [lineKey, setLineKey] = useState('Northern')
  const [mode, setMode] = useState<Mode>('route')
  const [svc, setSvc] = useState<number>(-1) // -1 = all lines (lines with branches; Test then uses the first route)
  const [flip, setFlip] = useState(false)
  const [hideNames, setHideNames] = useState(false)
  const [found, setFound] = useState<Set<number>>(new Set())
  const [hydrated, setHydrated] = useState(false)
  const [store, setStore] = useState<PracticeStore>({})
  const [spine, setSpine] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [theme, setTheme] = useTheme()
  const dark = theme === 'dark'
  const isDesktop = useIsDesktop()
  const desktop = isDesktop !== false
  const touch = !desktop
  const vv = useVisualViewport(touch)
  const scroller = useRef<HTMLDivElement>(null)

  // ---- boot: hash, prefs, saves ----
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1))
    const prefs = readJSON<{ hideNames?: boolean }>(PREFS_KEY, {})
    if (prefs.hideNames) setHideNames(true)
    const l = h.get('line')
    if (l && lineByKey[l]) setLineKey(l)
    const m = h.get('mode')
    if (m === 'test' || m === 'practice') setMode('test') // anything else (old #mode=browse links too) opens Route
    if (h.get('svc')) setSvc(+h.get('svc')!)
    if (h.get('flip') === '1') setFlip(true)
    if (h.get('hide') === '1') setHideNames(true)
    const ids = readJSON<unknown>(FOUND_KEY, [])
    setFound(new Set(Array.isArray(ids) ? ids.filter((x): x is number => typeof x === 'number') : []))
    setStore(readJSON<PracticeStore>(PRACTICE_KEY, {}))
    setHydrated(true)
  }, [lineByKey])
  useEffect(() => {
    if (!hydrated) return
    const h = new URLSearchParams({ line: lineKey })
    h.set('mode', mode)
    if (svc >= 0) h.set('svc', String(svc))
    if (flip) h.set('flip', '1')
    window.history.replaceState(null, '', `#${h.toString()}`)
  }, [hydrated, lineKey, mode, svc, flip])
  // bring the selected line's row into view in the list (e.g. opened from a shared link)
  const asideRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hydrated) return
    const box = asideRef.current
    // the line's row with its routes under it
    const el = box?.querySelector<HTMLElement>(`[data-line="${lineKey}"]`)?.parentElement
    // the list's own scroller (desktop: the list; phone: the sheet's body); never scrollIntoView,
    // which would also scroll the overflow-hidden page
    const sc = desktop ? box : box?.parentElement
    if (!el || !sc) return
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop
    if (top < sc.scrollTop || top + el.offsetHeight > sc.scrollTop + sc.clientHeight)
      sc.scrollTop = Math.max(0, el.offsetHeight > sc.clientHeight * 0.6 ? top - 40 : top - (sc.clientHeight - el.offsetHeight) / 2)
  }, [hydrated, lineKey, spine, desktop, sheet])
  useEffect(() => {
    if (hydrated) writeJSON(PREFS_KEY, { hideNames })
  }, [hydrated, hideNames])

  // lines as drawn in the current theme (dark: Northern white, stripe cores black)
  const lineOf = useCallback((k: string) => inkOn(uiLine(lineByKey[k], dark) as LineInfo), [lineByKey, dark])
  const line = lineOf(lineByKey[lineKey] ? lineKey : lines[0].key)
  const lineServices = useMemo(() => services[line.key] ?? [], [services, line.key])
  // the line's distinct routes (no reversals or short runs of another service);
  // "All lines" only for lines whose routes actually branch
  const routesOf = useCallback((k: string) => (data.routes[k]?.length ? data.routes[k] : [0]), [data.routes])
  const branchesOf = (k: string) => data.branches[k]
  const lineRoutes = routesOf(line.key)
  const hasBranches = !!branchesOf(line.key)
  const allLines = svc < 0 && hasBranches
  const svcEff = svc >= 0 && lineServices[svc] ? svc : lineRoutes[0]

  const scrollToTop = () => scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
  const scrollToRow = (el: HTMLElement | null, at: number) => {
    const s = scroller.current
    if (!el || !s) return
    const top = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop
    s.scrollTo({ top: Math.max(0, top - s.clientHeight * at), behavior: 'smooth' })
  }

  // a line opens in place in the list to show its services: on phones the
  // sheet stays open so one can be picked; picking a service closes it
  const pickLine = (k: string) => {
    if (k === line.key) {
      setSheet(false)
      return
    }
    setLineKey(k)
    setSvc(branchesOf(k) && mode === 'route' ? -1 : routesOf(k)[0])
    setBrSel(null)
    setFlip(false)
    setRun(null)
    scrollToTop()
  }
  const pickService = (i: number) => {
    setSvc(i)
    setBrSel(null)
    setFlip(false)
    setRun(null)
    setSheet(false)
    scrollToTop()
  }
  const [brSel, setBrSel] = useState<string | null>(null) // the station picked on the All lines diagram
  const pickMode = (m: Mode) => {
    if (m === mode) return
    setMode(m)
    setRun(null)
    scrollToTop()
  }

  // ---- the whole line, every branch (desktop: Branches; phones: the vertical diagram) ----
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
        {o.map((k) => {
          const l = lineOf(k)
          return (
            <span
              key={k}
              title={l.name}
              className="rounded-[4px] px-1.5 text-[11px] font-bold leading-[18px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
              style={{ background: l.color, color: l.textColor }}
            >
              {SHORT[k] ?? l.name}
            </span>
          )
        })}
      </span>
    )
  }

  // ---- test ----
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

  const practiceStops = useMemo(() => {
    const s = lineServices[svcEff]
    if (!s) return []
    const st = dedupe(s.stops)
    return flip ? st.slice().reverse() : st
  }, [lineServices, svcEff, flip])
  const practiceKey = `${line.key}|${svcEff}|${flip ? 'r' : 'f'}`

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
    const better =
      !prev?.best || score(stats) < score(prev.best) || (score(stats) === score(prev.best) && stats.ms < prev.best.ms)
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
    setFeedback({ kind: 'near', text: `Hint: stop ${run.answered + 1} starts “${expected.slice(0, run.hint + 1)}…”` })
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

  // keep the current blank in view (the strip's markup: see TestStrip)
  const currentRow = run && !run.done ? run.answered : undefined
  useEffect(() => {
    if (currentRow === undefined) return
    const sel = touch ? `.lr-test ol > li:nth-child(${currentRow + 1})` : `.lr-test g[aria-label="Hidden station ${currentRow + 1}"]`
    scrollToRow(scroller.current?.querySelector<HTMLElement>(sel) ?? null, touch ? 0.4 : 0.3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRow, touch])

  // ---- phones, All lines: the vertical diagram (every branch once, names level) ----
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
    L.rows.forEach((_, i) => {
      if ((deg.get(i) ?? 0) <= 1) ends.add(i)
    })
    return ends
  }
  const verticalViews = (L: LineLayout): RowView[] => {
    const ends = termini(L)
    return L.rows.map((row, i) => {
      const f = isFound(row.name)
      const out = f === null
      const show = f || !hideNames || out
      const jumps = L.jumps[i]
      return {
        key: `${i}:${row.name}`,
        dot: out ? 'out' : f ? 'found' : 'open',
        interchange: chips(row.name).length > 0,
        terminus: ends.has(i),
        label: (
          <>
            {show ? (
              <span
                className={classNames(
                  'text-[16.5px] leading-[26px] text-zinc-900 dark:text-zinc-50',
                  ends.has(i) ? 'font-bold uppercase tracking-wide' : 'font-medium',
                  out && 'italic',
                )}
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
            {out && <span className="text-[11px] text-zinc-500 dark:text-zinc-400">not in the game</span>}
          </>
        ),
        extra: jumps ? (
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500 dark:text-zinc-400">
            {jumps.map((to) => (
              <button
                key={to}
                className="underline decoration-dotted underline-offset-2 hover:text-zinc-900 dark:hover:text-white"
                onClick={() => scrollToRow(rowRefs.current[L.rows.findIndex((x) => x.name === to)], 0.4)}
              >
                also to {to} ↗
              </button>
            ))}
          </div>
        ) : undefined,
      } satisfies RowView
    })
  }

  const progress = run ? run.answered / Math.max(1, run.stops.length) : 0
  const bestHere = store[practiceKey]?.best
  const running = mode === 'test' && !!run && !run.done

  /* ---------------- pieces ---------------- */

  const smallCaps = 'text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400'
  const pill = (on: boolean) =>
    classNames(
      'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 text-[13px] font-bold transition-colors',
      on
        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-black dark:text-zinc-200 dark:hover:border-zinc-300',
    )

  const tabs = (
    <div role="tablist" aria-label="Mode" className="relative grid w-full grid-cols-2 rounded-full bg-zinc-200/80 p-1 dark:bg-zinc-800">
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 w-[calc((100%-8px)/2)] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-transform duration-200 ease-out dark:bg-zinc-600"
        style={{ transform: `translateX(${MODES.indexOf(mode) * 100}%)` }}
      />
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => pickMode(m)}
          className={classNames(
            'relative z-10 flex items-center justify-center gap-1.5 rounded-full text-[13.5px] font-bold transition-colors',
            touch ? 'h-9' : 'h-8',
            mode === m ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
          )}
        >
          {m === 'route' ? (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M1.5 9.5h13" strokeWidth="2.6" />
              <path d="M5 9.5V6M11 9.5V6M8 9.5V4.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.5 2.5l3 3L6 13H3v-3z" />
            </svg>
          )}
          {m === 'route' ? 'Route' : 'Test'}
        </button>
      ))}
    </div>
  )

  const wholeCount = data.stations[line.key]?.length ?? 0
  const showAll = mode === 'route' && allLines
  const subtitle = showAll
    ? `All lines · ${plural(lineRoutes.length, 'route')} · ${wholeCount} stations`
    : `${practiceStops[0]} → ${practiceStops[practiceStops.length - 1]}${mode === 'route' ? ` · ${practiceStops.length} stops` : ''}`

  // a test runs one route: with "All lines" picked it takes the first
  const oneService = mode === 'test' && allLines && (
    <div className="flex items-start gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-[13px] leading-snug text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
      <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.3" />
        <path d="M8 7.3v3.6M8 5.1v.1" />
      </svg>
      <span>
        A test runs one route at a time: this is <b className="text-zinc-900 dark:text-zinc-100">{lineServices[svcEff]?.name}</b>. Pick
        another under the {line.name} in the line list.
      </span>
    </div>
  )

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {!showAll && (
      <button
          type="button"
          onClick={() => {
            setFlip(!flip)
            setRun(null)
          }}
          aria-pressed={flip}
          className={pill(false)}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 2.5v11M2.5 5L5 2.5 7.5 5M11 13.5v-11M8.5 11l2.5 2.5 2.5-2.5" />
          </svg>
          {mode === 'test' ? 'Other direction' : 'Flip'}
        </button>
      )}
      {mode !== 'test' && (
        <button type="button" onClick={() => setHideNames(!hideNames)} aria-pressed={hideNames} className={pill(hideNames)}>
          {hideNames ? 'Unfound names hidden' : 'Hide unfound names'}
        </button>
      )}
    </div>
  )

  const best = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13px]">
      <span className={smallCaps}>Best on this test</span>
      {bestHere ? (
        <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
          {plural(bestHere.mistakes, 'mistake')} · {plural(bestHere.hints, 'hint')} · {bestHere.reveals} shown · {fmtTime(bestHere.ms)}
          <span className="text-zinc-400 dark:text-zinc-500"> ({plural(store[practiceKey].runs, 'run')})</span>
        </span>
      ) : (
        <span className="text-zinc-400 dark:text-zinc-500">Not tried yet</span>
      )}
    </div>
  )

  const startPanel = mode === 'test' && !run && (
    <div className={classNames('rounded-xl border-2 p-4 text-[14px] leading-snug', RULE)}>
      <p>
        Type each stop in order, from <b>{practiceStops[0]}</b> to <b>{practiceStops[practiceStops.length - 1]}</b>. Hints show the
        next letter; mistakes are counted.
      </p>
      <button
        type="button"
        onClick={startRun}
        className="mt-3 h-11 w-full rounded-full text-[15px] font-bold transition active:scale-[.98]"
        style={{ background: line.color, color: line.textColor }}
      >
        Start the test ({practiceStops.length} stops)
      </button>
      <div className="mt-3">{best}</div>
    </div>
  )

  const runBar = running && run && (
    <div className="flex items-center gap-3 text-[12.5px] tabular-nums text-zinc-500 dark:text-zinc-400">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress * 100}%`, background: line.color }} />
      </div>
      <span>
        <b className="text-zinc-900 dark:text-zinc-100">{run.answered}</b>/{run.stops.length}
      </span>
      <span className={run.mistakes ? 'font-bold text-rose-600 dark:text-rose-400' : ''}>{plural(run.mistakes, 'mistake')}</span>
      <span>{plural(run.hints, 'hint')}</span>
    </div>
  )

  const answer = running && (
    <div>
      <div
        className={classNames(
          'mb-1.5 h-5 truncate px-2 text-[14px]',
          feedback?.kind === 'good'
            ? 'text-emerald-700 dark:text-emerald-400'
            : feedback?.kind === 'near'
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-rose-600 dark:text-rose-400',
        )}
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
          onFocus={touch ? () => setSheet(false) : undefined}
          placeholder={run && run.hint ? `Stop ${run.answered + 1}: ${run.stops[run.answered].slice(0, run.hint)}…` : `Stop ${run ? run.answered + 1 : ''}: next station…`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="go"
          className={classNames(
            'min-w-0 flex-1 rounded-full border-2 border-zinc-900 bg-white px-5 font-bold text-zinc-900 caret-[#0019a8] outline-none transition-shadow placeholder:font-normal placeholder:text-zinc-400 focus:shadow-[0_0_0_4px_rgba(0,25,168,0.15)]',
            'dark:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-50 dark:caret-sky-400 dark:placeholder:text-zinc-500 dark:focus:border-zinc-300 dark:focus:shadow-[0_0_0_4px_rgba(255,255,255,0.08)]',
            touch ? 'h-12 text-[17px]' : 'h-14 text-xl',
          )}
        />
        {[
          ['Hint', hint],
          ['Show', reveal],
        ].map(([label, fn]) => (
          <button
            key={label as string}
            type="button"
            onClick={fn as () => void}
            className={classNames(
              'shrink-0 rounded-full border-2 border-zinc-300 px-4 text-[14px] font-bold text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-300',
              touch ? 'h-12 px-3.5' : 'h-14',
            )}
          >
            {label as string}
          </button>
        ))}
      </form>
    </div>
  )

  const summary = mode === 'test' && run?.done && (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-3">
      <div
        className={classNames(
          'ns-rise pointer-events-auto mx-auto w-full max-w-[560px] rounded-2xl border-2 p-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)] dark:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)]',
          RULE,
          PAPER,
        )}
      >
        <div className="flex items-center gap-2.5">
          <KeyRoundel line={line} pct={1} on size={24} />
          <div className="text-[18px] font-bold">Test complete</div>
          {store[practiceKey]?.best === run.done && (
            <span className="rounded-full bg-emerald-100 px-2 text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-300">
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
            <div key={k} className="rounded-xl bg-zinc-100 py-2 dark:bg-zinc-900">
              <div className="text-[22px] font-bold leading-tight tabular-nums">{v}</div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">{k}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[13.5px] text-zinc-500 dark:text-zinc-400">
          {run.done.mistakes + run.done.hints + run.done.reveals === 0
            ? 'Perfect. Every stop from memory.'
            : `${run.stops.length - run.done.reveals} of ${run.stops.length} stops without being shown.`}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={startRun}
            className="h-10 flex-1 rounded-full text-[14px] font-bold"
            style={{ background: line.color, color: line.textColor }}
          >
            Again
          </button>
          <button
            type="button"
            onClick={() => {
              setFlip(!flip)
              setRun(null)
              scrollToTop()
            }}
            className="h-10 flex-1 rounded-full border-2 border-zinc-900 text-[14px] font-bold dark:border-zinc-500"
          >
            Reverse
          </button>
        </div>
      </div>
    </div>
  )

  const lineList = (t: boolean) => (
    <KeyLines
      groups={groups}
      lineOf={lineOf}
      selected={line.key}
      onSelect={pickLine}
      services={lineRoutes.map((i) => ({ i, name: lineServices[i]?.name ?? '', stops: dedupe(lineServices[i]?.stops ?? []).length }))}
      allLines={hasBranches}
      wholeCount={wholeCount}
      svc={allLines ? -1 : svcEff}
      onService={pickService}
      touch={t}
    />
  )
  const wide = desktop // the strip wants the width the map has in the game
  const maxW = wide ? 'max-w-[1120px]' : 'max-w-[600px]'

  return (
    // `dark` sits on a layout-less wrapper: Tailwind's dark: variants match descendants of .dark
    <div className={classNames('contents', fontClass, dark && 'dark')}>
      {/* as HTML: the strip's attribute selectors hold quotes, which React would escape as text (hydration mismatch) */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .ns-root { --ns-ink: #18181b; --ns-bg: #ffffff; --ns-reveal: #e11d48; }
        .dark .ns-root { --ns-ink: #f4f4f5; --ns-bg: #000000; --ns-reveal: #fb7185; }
        @keyframes ns-pop { 0% { transform: scale(.2); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
        @keyframes ns-slide { 0% { transform: translateX(-10px); opacity: 0; filter: blur(2px) } 100% { transform: none; opacity: 1; filter: none } }
        .ns-slide { display: inline-block; animation: ns-slide 420ms ease-out both }
        @keyframes ns-rise { 0% { transform: translateY(12px); opacity: 0 } 100% { transform: none; opacity: 1 } }
        .ns-rise { animation: ns-rise 260ms ease-out both }
        @keyframes ns-pulse { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
        .ns-pulse { animation: ns-pulse 1.4s ease-in-out infinite }
        body { background: ${dark ? '#000' : '#fff'} }
        ${ROUTE_CSS}
      `,
        }}
      />
      <div
        className={classNames(
          'ns-root flex h-[100dvh] w-full overflow-hidden text-zinc-900 dark:text-zinc-100',
          fontClass,
          PAPER,
          desktop ? 'flex-row' : 'flex-col',
        )}
        style={vv ? { height: vv.h, transform: vv.top ? `translateY(${vv.top}px)` : undefined } : undefined}
      >
        {/* ---------------- desktop key ---------------- */}
        {desktop &&
          (spine ? (
            <Spine groups={groups} lineOf={lineOf} selected={line.key} onOpen={() => setSpine(false)} />
          ) : (
            <aside className={classNames('z-10 flex h-full w-[360px] shrink-0 flex-col border-r-2', RULE, PAPER)}>
              {/* the whole header collapses the list to its spine, as the game's Key */}
              <header
                role="button"
                tabIndex={0}
                aria-label="Collapse the line list"
                title="Collapse the line list"
                onClick={(e) => {
                  // as the game's Key: clicks on the Play | Learn switch are not collapses
                  const b = (e.target as HTMLElement).closest('button, a, nav')
                  if (b && !b.hasAttribute('data-collapse')) return
                  setSpine(true)
                }}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    setSpine(true)
                  }
                }}
                className="flex cursor-pointer select-none items-center px-5 py-3 transition-colors hover:bg-zinc-100/70 focus-visible:outline-none dark:hover:bg-white/[0.04]"
              >
                <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">London Rail Memory</span>
                <span className="ml-auto mr-1">
                  <PlayLearnSwitch current="learn" />
                </span>
                <button
                  type="button"
                  data-collapse
                  tabIndex={-1}
                  className="-mr-1.5 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  aria-label="Collapse the line list"
                  title="Collapse the line list"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 3.5L5.5 8l4.5 4.5" />
                  </svg>
                </button>
              </header>
              <div ref={asideRef} className={classNames('min-h-0 grow overflow-y-auto overscroll-contain border-t-[3px] [scrollbar-width:thin]', RULE)}>
                {lineList(false)}
              </div>
              <footer className={classNames('border-t-2 px-5 py-3', RULE)}>
                <KeyFooter theme={theme} setTheme={setTheme} touch={false} />
              </footer>
            </aside>
          ))}

        {/* ---------------- main (where the game has its map) ---------------- */}
        <div className="relative isolate z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className={classNames('z-20 shrink-0 border-b-2', RULE, PAPER)}>
            <div className={classNames('mx-auto w-full', maxW, touch ? 'px-4 pb-2.5 pt-2.5' : 'px-6 pb-3 pt-4')}>
              {desktop ? (
                <div className="flex items-center gap-4">
                  <KeyRoundel line={line} pct={1} on size={38} />
                  <div className="min-w-0 grow">
                    <h1 className="truncate text-[24px] font-bold leading-tight tracking-tight">{line.name}</h1>
                    <div className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">{subtitle}</div>
                  </div>
                  <div className="w-[288px] shrink-0">{tabs}</div>
                </div>
              ) : (
                tabs
              )}
              {runBar && <div className={desktop ? 'mt-3' : 'mt-2.5'}>{runBar}</div>}
            </div>
          </div>

          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
            <div className={classNames('mx-auto w-full', maxW, touch ? 'pt-3' : 'pt-5')}>
              <div className={classNames('space-y-3', touch ? 'px-4' : 'px-6')}>
                {touch && <div className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">{subtitle}</div>}
                {controls}
                {oneService}
                {mode === 'test' && run && <div className="pt-1">{best}</div>}
                {startPanel}
              </div>
              {mode === 'route' ? (
                <div className={classNames('pb-10', touch ? 'px-1 pt-1' : 'px-3 pt-4')}>
                  {showAll && desktop ? (
                    <div className="lr-route">
                      {hideNames && <p className="mb-2 px-3 text-[13px] text-zinc-600 dark:text-zinc-400">Unfound names are hidden: tap a blank to reveal it.</p>}
                      <Branches
                        body={branchesOf(line.key)}
                        line={line}
                        lineOf={lineOf}
                        isFound={isFound}
                        hideNames={hideNames}
                        chipName={(k) => lineOf(k)?.name ?? k}
                        onStation={(n) => setBrSel((c) => (c === n ? null : n))}
                        selected={brSel}
                        fontFamily={fontFamily}
                      />
                      {brSel && (
                        <StationCard
                          name={brSel}
                          detail={isFound(brSel) === null ? 'not in the game' : isFound(brSel) ? 'found ✓' : 'not found yet'}
                          chips={chipList(brSel)}
                          hasChips={chips(brSel).length > 0}
                        />
                      )}
                    </div>
                  ) : showAll ? (
                    // phones: the vertical diagram shows each branch once with level names;
                    // a strip list per route would repeat the shared trunk for every route
                    <Diagram layout={wholeLayout} line={line} views={verticalViews(wholeLayout)} rowRefs={rowRefs} />
                  ) : practiceStops.length ? (
                    <Route
                      line={line}
                      stops={practiceStops}
                      lineOf={lineOf}
                      linesAt={linesAt}
                      isFound={isFound}
                      hideNames={hideNames}
                      touch={touch}
                      fontFamily={fontFamily}
                      chipList={chipList}
                    />
                  ) : (
                    <p className="p-6 text-zinc-500">No services for this line.</p>
                  )}
                </div>
              ) : (
                <div className={classNames(touch ? 'px-1 pt-1' : 'px-3 pt-4', run?.done ? 'pb-72' : 'pb-10')}>
                  <TestStrip
                    key={practiceKey}
                    line={line}
                    stops={run ? run.stops : practiceStops}
                    lineOf={lineOf}
                    linesAt={linesAt}
                    isFound={isFound}
                    answered={run ? (run.done ? run.stops.length : run.answered) : autoFill(practiceStops, 0)}
                    shown={run ? run.revealed : new Set()}
                    current={currentRow}
                    popAt={run ? run.popAt : undefined}
                    touch={touch}
                    fontFamily={fontFamily}
                  />
                </div>
              )}
            </div>
          </div>

          {/* desktop: the answer bar sits at the foot of the main area */}
          {desktop && answer && (
            <div className={classNames('z-20 shrink-0 border-t-2 px-6 pb-4 pt-2', RULE, PAPER)}>
              <div className="mx-auto w-full max-w-[600px]">{answer}</div>
            </div>
          )}
          {summary}

          {touch && (
            <PhoneSheet open={sheet} onClose={() => setSheet(false)}>
              <div className="flex items-center gap-2 px-5 pb-2.5 pt-1">
                <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">London Rail Memory</span>
                <span className="ml-auto">
                  <PlayLearnSwitch current="learn" touch />
                </span>
                <button
                  type="button"
                  onClick={() => setSheet(false)}
                  className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  aria-label="Close the line list"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
              </div>
              <div ref={asideRef} className={classNames('border-t-[3px]', RULE)}>
                {lineList(true)}
                <div className={classNames('border-t-2 px-5 pb-5 pt-3', RULE)}>
                  <KeyFooter theme={theme} setTheme={setTheme} touch />
                </div>
              </div>
            </PhoneSheet>
          )}
        </div>

        {/* ---------------- phone dock ---------------- */}
        {touch && (
          <div className={classNames('relative z-30 shrink-0 border-t-2 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2', RULE, PAPER)}>
            <button
              type="button"
              onClick={() => setSheet((s) => !s)}
              aria-expanded={sheet}
              aria-label={sheet ? 'Close the line list' : 'Choose a line'}
              className={classNames('flex w-full min-w-0 items-center gap-2.5 px-1', running ? 'pb-1' : 'py-1')}
            >
              <KeyRoundel line={line} pct={1} on size={26} />
              <span className="flex min-w-0 grow flex-col text-left">
                <span className="truncate text-[16px] font-bold leading-tight">{line.name}</span>
                {!running && (
                  <span className="truncate text-[12px] leading-tight text-zinc-500 dark:text-zinc-400">
                    {showAll ? 'All lines' : lineServices[svcEff]?.name}
                  </span>
                )}
              </span>
              <svg
                viewBox="0 0 16 16"
                className={classNames('h-4 w-4 shrink-0 text-zinc-500 transition-transform dark:text-zinc-400', sheet && 'rotate-180')}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M4 10l4-4 4 4" />
              </svg>
            </button>
            {answer}
          </div>
        )}
      </div>
    </div>
  )
}

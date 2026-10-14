'use client'

import classNames from 'classnames'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GameShellProps } from '@/components/GamePage'
import { useConfig } from '@/lib/configContext'
import AboutModal from '@/components/AboutModal'
import KeyInput, { GuessResult } from './KeyInput'
import { buildGroups, GroupId } from './groups'
import { KeyTimer, LineChip, fmtInt, hexA, uiLine } from './parts'
import { Count, KeyGroups, Recent, SettingsBar } from './KeyBody'
import useMapTheme, { Theme } from './useMapTheme'

const PAPER = 'bg-white dark:bg-black'
// heavy "key" rules: black on paper, a soft grey on dark
const RULE = 'border-zinc-900 dark:border-zinc-600'
const THEME_KEY = 'lab-ui-key-theme'

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

// Phone: size the layout to the *visual* viewport so the dock (input) rides
// on top of the on-screen keyboard and the map stays visible above it.
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

// "The Key": the diagram legend is the whole game UI. Each line has exactly
// one row (legend sample = progress bar = in-play toggle), grouped by mode.
// Desktop: the key is a left panel (collapsible to a barcode spine) and the
// guess field floats over the map. Phone: map on top; a dock holds the
// barcode summary + the field, and the barcode opens the full key as a sheet.
export default function Key(p: GameShellProps) {
  const { LINES } = useConfig()
  const groups = useMemo(() => buildGroups(LINES), [LINES])
  const isDesktop = useIsDesktop()
  const desktop = isDesktop !== false
  const touch = !desktop
  const vv = useVisualViewport(touch)

  const [result, setResult] = useState<GuessResult | null>(null)
  const [resultLines, setResultLines] = useState<string[]>([])
  const [pulse, setPulse] = useState<Set<string>>(new Set())
  const [spine, setSpine] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [about, setAbout] = useState(false)
  const [hintGone, setHintGone] = useState(false)

  const [theme, setTheme] = useTheme()
  const dark = theme === 'dark'
  useMapTheme(p.map, theme)

  // names of found stations are always shown (the map control is Clean / Dots only)
  const { showFoundLabels, setShowFoundLabels } = p
  useEffect(() => {
    if (showFoundLabels === false) setShowFoundLabels(true)
  }, [showFoundLabels, setShowFoundLabels])

  const frac = useCallback(
    (k: string) => {
      const t = p.stationsPerLine[k] || 0
      return t ? (p.foundStationsPerLine[k] || 0) / t : 0
    },
    [p.stationsPerLine, p.foundStationsPerLine],
  )

  // Each station counts ONCE (by name), however many lines call there. A
  // station is in play if any of its lines is, and found if any of its
  // in-play line features is found. Per-line rows keep per-line counts.
  const byName = useMemo(() => {
    const m = new Map<string, { id: number; line: string }[]>()
    p.idMap.forEach((f, id) => {
      const name = f.properties.name
      const line = f.properties.line
      if (!name || !line) return
      const e = m.get(name)
      if (e) e.push({ id, line })
      else m.set(name, [{ id, line }])
    })
    return m
  }, [p.idMap])
  const { overall, groupCount } = useMemo(() => {
    const found = new Set(p.knownFound)
    const gOf: Record<string, GroupId> = {}
    groups.forEach((g) => g.keys.forEach((k) => (gOf[k] = g.id)))
    const overall: Count = { got: 0, total: 0 }
    const groupCount: Partial<Record<GroupId, Count>> = {}
    groups.forEach((g) => (groupCount[g.id] = { got: 0, total: 0 }))
    byName.forEach((list) => {
      let inPlay = false
      let isFound = false
      const gIn = new Set<GroupId>()
      const gFound = new Set<GroupId>()
      list.forEach(({ id, line }) => {
        if (!p.enabledLines[line]) return
        const f = found.has(id)
        inPlay = true
        if (f) isFound = true
        const g = gOf[line]
        if (g) {
          gIn.add(g)
          if (f) gFound.add(g)
        }
      })
      if (inPlay) overall.total++
      if (isFound) overall.got++
      gIn.forEach((g) => groupCount[g]!.total++)
      gFound.forEach((g) => groupCount[g]!.got++)
    })
    return { overall, groupCount }
  }, [byName, p.knownFound, p.enabledLines, groups])
  const pct = overall.total ? (overall.got / overall.total) * 100 : 0
  const pctTxt = pct >= 100 ? '100' : pct.toFixed(1)

  // lines of the station hovered on the map -> tick their rows
  const markLines = useMemo(() => {
    const s = new Set<string>()
    if (p.hoveredId == null) return s
    const name = p.idMap.get(p.hoveredId)?.properties.name
    if (!name) return s
    p.idMap.forEach((f) => {
      if (f.properties.name === name && f.properties.line) s.add(f.properties.line)
    })
    return s
  }, [p.hoveredId, p.idMap])

  const onResult = useCallback(
    (r: GuessResult) => {
      setResult(r)
      if (r.kind === 'found') {
        const ls = new Set<string>()
        r.ids.forEach((id) => {
          const l = p.idMap.get(id)?.properties.line
          if (l) ls.add(l)
        })
        setPulse(ls)
        setResultLines(Array.from(ls).sort((a, b) => (LINES[a]?.order ?? 99) - (LINES[b]?.order ?? 99)))
        setTimeout(() => setPulse(new Set()), 1400)
      }
    },
    [p.idMap, LINES],
  )
  useEffect(() => {
    if (!result) return
    const ms = result.kind === 'found' ? 7000 : result.kind === 'ambiguous' ? 2500 : 2200
    const t = setTimeout(() => setResult((r) => (r === result ? null : r)), ms)
    return () => clearTimeout(t)
  }, [result])

  const afterToggle = useCallback(() => {
    if (desktop) p.inputRef.current?.focus({ preventScroll: true })
  }, [desktop, p.inputRef])

  // the map box changes size when the key collapses to its spine
  useEffect(() => {
    const t = setTimeout(() => p.map?.resize(), 30)
    return () => clearTimeout(t)
  }, [spine, desktop, p.map])

  const showHint = p.isNewPlayer && !hintGone
  const dismissHint = () => {
    setHintGone(true)
    p.setIsNewPlayer(false)
    p.inputRef.current?.focus({ preventScroll: true })
  }

  const common = { p, LINES, groups, pulse, markLines, afterToggle, touch, dark, groupCount }
  const settings = (t: boolean) => (
    <SettingsBar p={p} touch={t} openAbout={() => setAbout(true)} theme={theme} setTheme={setTheme} />
  )

  const input = (
    <KeyInput
      matcher={p.matcher}
      found={p.knownFound}
      setFound={p.setFound}
      setIsNewPlayer={p.setIsNewPlayer}
      inputRef={p.inputRef}
      map={p.map}
      idMap={p.idMap}
      onResult={onResult}
      size={desktop ? 'lg' : 'md'}
      onFocus={touch ? () => setSheet(false) : undefined}
    />
  )

  return (
    // `dark` sits on a layout-less wrapper: Tailwind's dark: variants match descendants of .dark
    <div className={classNames('contents', dark && 'dark')}>
    <div
      className={classNames(
        'flex h-[100dvh] w-full overflow-hidden text-zinc-900 dark:text-zinc-100',
        PAPER,
        desktop ? 'flex-row' : 'flex-col',
      )}
      style={vv ? { height: vv.h, transform: vv.top ? `translateY(${vv.top}px)` : undefined } : undefined}
    >
      {/* ---------------- desktop key ---------------- */}
      {desktop &&
        (spine ? (
          <Spine p={p} groups={groups} LINES={LINES} frac={frac} pctTxt={pctTxt} dark={dark} onOpen={() => setSpine(false)} />
        ) : (
          <aside className={classNames('z-10 flex h-full w-[360px] shrink-0 flex-col border-r-2', RULE, PAPER)}>
            <header className="px-5 pb-3 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">London Rail Memory · Key</span>
                <button
                  type="button"
                  onClick={() => setSpine(true)}
                  className="-mr-1.5 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  aria-label="Collapse key"
                  title="Collapse key"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 3.5L5.5 8l4.5 4.5" />
                  </svg>
                </button>
              </div>
              <div className="mt-1 flex items-end gap-3">
                <div className="text-[46px] font-bold leading-[0.95] tracking-tight tabular-nums">
                  {pctTxt}
                  <span className="ml-0.5 text-[24px] text-zinc-400 dark:text-zinc-500">%</span>
                </div>
                <div className="pb-0.5 text-[13px] leading-tight text-zinc-500 dark:text-zinc-400">
                  <div>
                    <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{fmtInt(overall.got)}</span> of{' '}
                    <span className="tabular-nums">{fmtInt(overall.total)}</span>
                  </div>
                  <div>stations on lines in play</div>
                </div>
                <div className="ml-auto pb-0.5">
                  <KeyTimer hidden={!p.showTimer} />
                </div>
              </div>
            </header>
            <div className={classNames('min-h-0 grow overflow-y-auto overscroll-contain border-t-[3px] [scrollbar-width:thin]', RULE)}>
              <KeyGroups {...common} />
              <Recent p={p} LINES={LINES} touch={false} foundCount={overall.got} />
            </div>
            <footer className={classNames('border-t-2 px-5 py-3', RULE)}>{settings(false)}</footer>
          </aside>
        ))}

      {/* ---------------- map ---------------- */}
      <div key="map" className="relative isolate z-0 min-h-0 min-w-0 flex-1 overflow-hidden">
        {p.mapSlot}

        {desktop && (
          <div className="pointer-events-none absolute left-1/2 top-5 z-20 flex w-[min(520px,calc(100%-40px))] -translate-x-1/2 flex-col items-stretch gap-2">
            <div className="pointer-events-auto rounded-full shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)] dark:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.7)]">{input}</div>
            <Feedback result={result} lines={resultLines} LINES={LINES} />
            {showHint && (
              <Hint onClose={dismissHint}>
                Name any London station you remember and press <b>Enter</b>. The key on the left is your scoreboard: click a line to put it in or
                out of play.
              </Hint>
            )}
          </div>
        )}

        {!desktop && (
          <>
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex flex-col items-center gap-2">
              {showHint && !sheet && (
                <Hint onClose={dismissHint}>
                  Type any station you remember, then <b>Go</b>. Tap the count below to see your lines.
                </Hint>
              )}
              {!sheet && <Feedback result={result} lines={resultLines} LINES={LINES} />}
            </div>
            <PhoneSheet open={sheet} onClose={() => setSheet(false)}>
              <div className="flex items-center gap-3 px-5 pb-3 pt-1">
                <div className="text-[34px] font-bold leading-none tracking-tight tabular-nums">
                  {pctTxt}
                  <span className="text-[18px] text-zinc-400 dark:text-zinc-500">%</span>
                </div>
                <div className="text-[12.5px] leading-tight text-zinc-500 dark:text-zinc-400">
                  <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{fmtInt(overall.got)}</span> of {fmtInt(overall.total)}
                  <br />
                  stations in play
                </div>
                <button
                  type="button"
                  onClick={() => setSheet(false)}
                  className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  aria-label="Close key"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
              </div>
              <div className={classNames('border-t-[3px]', RULE)}>
                <KeyGroups {...common} />
                <Recent p={p} LINES={LINES} touch limit={8} foundCount={overall.got} />
                <div className={classNames('border-t-2 px-5 pb-5 pt-3', RULE)}>{settings(true)}</div>
              </div>
            </PhoneSheet>
          </>
        )}
      </div>

      {/* ---------------- phone dock ---------------- */}
      {!desktop && (
        <div className={classNames('relative z-30 shrink-0 border-t-2 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2', RULE, PAPER)}>
          <div className="flex items-center gap-2.5 pb-2">
            <button
              type="button"
              onClick={() => setSheet((s) => !s)}
              aria-expanded={sheet}
              aria-label={sheet ? 'Close key' : 'Open key'}
              className="flex min-w-0 grow items-center gap-2.5"
            >
              <span className="shrink-0 text-[19px] font-bold leading-none tabular-nums">
                {pct >= 100 ? '100' : Math.floor(pct)}
                <span className="text-[12px] text-zinc-400 dark:text-zinc-500">%</span>
              </span>
              <span className="min-w-0 grow truncate text-left text-[13px] text-zinc-500 dark:text-zinc-400">
                <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{fmtInt(overall.got)}</span> of{' '}
                <span className="tabular-nums">{fmtInt(overall.total)}</span> stations
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
            {p.showTimer && <KeyTimer hidden={!p.showTimer} />}
          </div>
          {input}
        </div>
      )}

      <AboutModal open={about} setOpen={setAbout} />
      <style>{`@keyframes keyIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>
    </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Feedback({ result, lines, LINES }: { result: GuessResult | null; lines: string[]; LINES: Record<string, any> }) {
  if (!result) return null
  const base = 'pointer-events-auto flex max-w-full items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] shadow-[0_6px_20px_-8px_rgba(0,0,0,0.35)] animate-[keyIn_.18s_ease-out]'
  if (result.kind === 'found') return <FoundFeedback result={result} lines={lines} LINES={LINES} className={base} />
  if (result.kind === 'already')
    return (
      <div key={result.t} className={classNames(base, 'self-center bg-white text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300')}>
        <span className="h-2 w-2 rounded-full bg-zinc-400" />
        Already found: <b className="text-zinc-900 dark:text-white">{result.name}</b>
      </div>
    )
  if (result.kind === 'ambiguous')
    return (
      <div key={result.t} className={classNames(base, 'self-center bg-amber-100 text-amber-900 dark:bg-amber-300 dark:text-amber-950')}>
        <b>Be more specific</b>
        <span className="truncate text-amber-800 dark:text-amber-900">“{result.q}” matches several stations</span>
      </div>
    )
  return (
    <div key={result.t} className={classNames(base, 'self-center bg-white text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300')}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
      <span className="truncate">
        No station <b className="text-zinc-900 dark:text-white">“{result.q}”</b> on the lines in play
      </span>
    </div>
  )
}

function FoundFeedback({
  result,
  lines,
  LINES,
  className,
}: {
  result: Extract<GuessResult, { kind: 'found' }>
  lines: string[]
  LINES: Record<string, any>
  className: string
}) {
  return (
    <div key={result.t} className={classNames(className, 'flex-wrap self-center bg-zinc-900 text-white dark:bg-zinc-800 dark:ring-1 dark:ring-white/10')}>
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
      <b className="truncate">{result.name}</b>
      <span className="flex flex-wrap items-center gap-1">
        {lines.map((k) => LINES[k] && <LineChip key={k} line={LINES[k]} />)}
      </span>
    </div>
  )
}

function Hint({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="pointer-events-auto flex items-start gap-3 rounded-xl border-2 border-zinc-900 bg-white px-4 py-3 text-[14px] leading-snug text-zinc-800 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.35)] dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
      <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">i</span>
      <p className="grow">{children}</p>
      <button type="button" onClick={onClose} className="-mr-1 shrink-0 rounded-md px-2 py-0.5 text-[13px] font-bold text-zinc-900 hover:bg-zinc-900/10 dark:text-zinc-100 dark:hover:bg-white/10">
        Got it
      </button>
    </div>
  )
}

function PhoneSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onClose}
        className={classNames('absolute inset-0 z-30 bg-zinc-900/25 transition-opacity duration-200 dark:bg-black/40', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />
      <div
        className={classNames(
          'absolute inset-x-0 bottom-0 z-40 flex max-h-[88%] flex-col rounded-t-2xl border-x-2 border-t-2 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out',
          RULE,
          PAPER,
          open ? 'translate-y-0' : 'pointer-events-none translate-y-full',
        )}
        aria-hidden={!open}
      >
        <div className="flex justify-center pb-1 pt-2">
          <span className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
        </div>
        <div className="min-h-0 grow overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </>
  )
}

function Spine({
  p,
  groups,
  LINES,
  frac,
  pctTxt,
  dark,
  onOpen,
}: {
  p: GameShellProps
  groups: ReturnType<typeof buildGroups>
  LINES: Record<string, any>
  frac: (k: string) => number
  pctTxt: string
  dark: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Open key"
      aria-label="Open key"
      className={classNames('z-10 flex h-full w-[68px] shrink-0 flex-col items-center gap-3 border-r-2 py-4 hover:bg-white dark:hover:bg-zinc-800', RULE, PAPER)}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3.5L10.5 8 6 12.5" />
      </svg>
      <span className="text-[17px] font-bold leading-none tabular-nums">
        {Math.floor(parseFloat(pctTxt))}
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">%</span>
      </span>
      <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
        {groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-[3px]">
            {g.keys.map((k) => {
              const on = p.enabledLines[k]
              const color = uiLine(LINES[k], dark).color
              return (
                <div
                  key={k}
                  title={LINES[k].name}
                  className={classNames('relative h-[7px] w-10 overflow-hidden rounded-full', !on && 'border border-dashed border-zinc-300 dark:border-zinc-600')}
                  style={on ? { background: hexA(color, 0.2) } : undefined}
                >
                  {on && <div className="absolute inset-y-0 left-0" style={{ width: `${frac(k) * 100}%`, background: color }} />}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </button>
  )
}

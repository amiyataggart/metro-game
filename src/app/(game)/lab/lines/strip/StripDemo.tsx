'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { StripDiagram, StripList, paint, type StopInfo } from './StripDiagram'

export type StripLine = {
  key: string
  name: string
  color: string
  stripe?: 'solid' | 'dashed' | 'triple'
  stripeColor?: string
  group: string
}
export type StripService = { name: string; stops: string[]; reversed: boolean }

type Props = {
  lines: StripLine[]
  services: Record<string, StripService[]>
  linesAt: Record<string, string[]>
  nearAt: Record<string, { name: string; lines: string[] }[]>
  featureId: Record<string, number>
  fontFamily: string
}

const FOUND_KEY = 'london-stations' // the real game's save (read-only here)
const DEFAULT_LINE = 'Northern'
const PHONE = 640 // below this container width the strip turns vertical

/** service name as drawn: flip "A → B" when the strip runs the other way */
function displayName(s: StripService, flipped: boolean): string {
  const rev = s.reversed !== flipped
  if (rev && s.name.includes(' → ')) return s.name.split(' → ').reverse().join(' → ')
  return s.name
}

function luminance(hex: string): number {
  const m = hex.replace('#', '')
  const v = m.length === 3 ? m.split('').map((c) => c + c) : [m.slice(0, 2), m.slice(2, 4), m.slice(4, 6)]
  const [r, g, b] = v.map((x) => {
    const c = parseInt(x, 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const inkOn = (hex: string) => (luminance(hex) > 0.38 ? '#18181b' : '#ffffff')
/** text colour on a paint()ed line colour (near-black lines flip in dark mode) */
export const inkVar = (hex: string) => (luminance(hex) < 0.01 ? 'var(--ink-on-line, #fff)' : inkOn(hex))

export default function StripDemo({ lines, services, linesAt, nearAt, featureId, fontFamily }: Props) {
  const byKey = useMemo(() => Object.fromEntries(lines.map((l) => [l.key, l])), [lines])
  const [lineKey, setLineKey] = useState(DEFAULT_LINE)
  const [svcIdx, setSvcIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [learning, setLearning] = useState(false)
  const [progress, setProgress] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [found, setFound] = useState<Set<number> | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto')
  const [width, setWidth] = useState(0)
  const [layout, setLayout] = useState<'auto' | 'strip' | 'list'>('auto')
  const boxRef = useRef<HTMLDivElement>(null)
  const [urlRead, setUrlRead] = useState(false)

  // URL state (?line=&svc=&flip=1&learn=1&progress=1&theme=dark) — handy for sharing and screenshots
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const l = q.get('line')
    if (l && services[l]) setLineKey(l)
    const s = Number(q.get('svc'))
    if (Number.isFinite(s) && s > 0) setSvcIdx(s)
    if (q.get('flip') === '1') setFlipped(true)
    if (q.get('learn') === '1') setLearning(true)
    if (q.get('progress') === '1') setProgress(true)
    const t = q.get('theme')
    if (t === 'light' || t === 'dark') setTheme(t)
    const lay = q.get('layout')
    if (lay === 'strip' || lay === 'list') setLayout(lay)
    setUrlRead(true)
  }, [services])
  useEffect(() => {
    if (!urlRead) return
    const q = new URLSearchParams(window.location.search)
    q.set('line', lineKey)
    q.set('svc', String(svcIdx))
    flipped ? q.set('flip', '1') : q.delete('flip')
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`)
  }, [lineKey, svcIdx, flipped, urlRead])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FOUND_KEY)
      const ids = raw ? JSON.parse(raw) : []
      setFound(new Set(Array.isArray(ids) ? ids.filter((x: unknown) => typeof x === 'number') : []))
    } catch {
      setFound(new Set())
    }
  }, [])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const line = byKey[lineKey]
  const svcs = services[lineKey] || []
  const svc = svcs[Math.min(svcIdx, svcs.length - 1)]
  const stops = useMemo(() => {
    if (!svc) return []
    const rev = flipped
    const list = rev ? svc.stops.slice().reverse() : svc.stops
    return list
  }, [svc, flipped])

  const info: StopInfo[] = useMemo(
    () =>
      stops.map((name) => {
        const others = (linesAt[name] || []).filter((k) => k !== lineKey && byKey[k])
        others.sort((a, b) => lines.indexOf(byKey[a]) - lines.indexOf(byKey[b]))
        const near = (nearAt[name] || [])
          .map((n) => ({ name: n.name, lines: n.lines.filter((k) => k !== lineKey && byKey[k] && !others.includes(k)) }))
          .filter((n) => n.lines.length)
        const nearLines = Array.from(new Set(near.flatMap((n) => n.lines)))
        nearLines.sort((a, b) => lines.indexOf(byKey[a]) - lines.indexOf(byKey[b]))
        const id = featureId[`${name}|${lineKey}`]
        return {
          name,
          others,
          near,
          nearLines,
          inGame: !!linesAt[name],
          found: found && id !== undefined ? found.has(id) : false,
        }
      }),
    [stops, linesAt, nearAt, lineKey, byKey, lines, featureId, found],
  )

  // reset per-route state when the route changes
  useEffect(() => {
    setRevealed(new Set())
    setSelected(null)
  }, [lineKey, svcIdx, flipped])

  const nFound = info.filter((s) => s.found).length
  const nRevealed = info.filter((s) => revealed.has(s.name)).length
  const vertical = layout === 'list' || (layout === 'auto' && width > 0 && width < PHONE)

  const groups = useMemo(() => {
    const g: { name: string; lines: StripLine[] }[] = []
    for (const l of lines) {
      const last = g[g.length - 1]
      if (last && last.name === l.group) last.lines.push(l)
      else g.push({ name: l.group, lines: [l] })
    }
    return g
  }, [lines])

  const pickLine = (k: string) => {
    setLineKey(k)
    setSvcIdx(0)
    setFlipped(false)
  }
  const pickSvc = (i: number) => {
    setSvcIdx(i)
    setFlipped(false)
  }
  const toggleReveal = (name: string) =>
    setRevealed((r) => {
      const n = new Set(r)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })
  const onStop = (name: string) => {
    const s = info.find((x) => x.name === name)
    const hidden = learning && !(progress && s?.found) && !revealed.has(name)
    if (learning && hidden) toggleReveal(name)
    else setSelected((cur) => (cur === name ? null : name))
  }
  const sel = selected ? info.find((s) => s.name === selected) : null
  const selIdx = sel ? info.indexOf(sel) : -1

  const first = stops[0]
  const last = stops[stops.length - 1]

  return (
    <div className="strip-root min-h-screen bg-[var(--bg)] text-[var(--fg)]" data-theme={theme}>
      <style>{CSS}</style>
      <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-8">
        {/* header */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div>
            <Link href="/lab/lines" className="text-sm text-[var(--accent)] hover:underline">
              ← Line diagrams
            </Link>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Carriage strip</h1>
          </div>
          <div className="flex items-center gap-1 text-xs text-[var(--muted)]">
            Theme
            {(['auto', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`rounded-full px-2.5 py-0.5 ${theme === t ? 'bg-[var(--chip)] text-[var(--fg)]' : 'hover:text-[var(--fg)]'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 max-w-3xl text-[var(--muted)]">
          The strip map above the train doors: one route at a time, London end on the left. Pick a line, then a
          service.
        </p>

        {/* line picker: pills on wider screens, a select on phones */}
        <div className="mt-5 hidden space-y-2 sm:block">
          {groups.map((g) => (
            <div key={g.name} className="flex flex-wrap items-center gap-1.5">
              <div className="w-full text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{g.name}</div>
              {g.lines.map((l) => {
                const on = l.key === lineKey
                return (
                  <button
                    key={l.key}
                    onClick={() => pickLine(l.key)}
                    className={`flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2.5 text-sm transition ${
                      on ? 'font-bold shadow-sm' : 'bg-[var(--card)] ring-1 ring-[var(--ring)] hover:ring-[var(--muted)]'
                    }`}
                    style={on ? { background: paint(l.color), color: inkVar(l.color) } : undefined}
                  >
                    <Swatch line={l} on={on} />
                    {l.name}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 sm:hidden">
          {line && <Swatch line={line} />}
          <Select value={lineKey} onChange={pickLine} label="Line">
            {groups.map((g) => (
              <optgroup key={g.name} label={g.name}>
                {g.lines.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>

        {/* service picker: chips when there are few, a select (with stepping) when there are many */}
        {svcs.length > 1 && (
          <>
            <div className={`mt-4 flex-wrap gap-1.5 ${svcs.length > 10 ? 'hidden' : 'hidden sm:flex'}`}>
              {svcs.map((s, i) => {
                const on = i === svcIdx
                return (
                  <button
                    key={i}
                    onClick={() => pickSvc(i)}
                    className={`max-w-full rounded-lg px-2.5 py-1 text-left text-xs leading-snug transition ${
                      on
                        ? 'bg-[var(--fg)] text-[var(--bg)]'
                        : 'bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--ring)] hover:text-[var(--fg)]'
                    }`}
                  >
                    {displayName(s, false)}
                  </button>
                )
              })}
            </div>
            <div className={`mt-3 items-center gap-1.5 sm:mt-4 ${svcs.length > 10 ? 'flex' : 'flex sm:hidden'}`}>
              <StepButton onClick={() => pickSvc((svcIdx + svcs.length - 1) % svcs.length)} label="Previous service">
                ‹
              </StepButton>
              <Select value={String(svcIdx)} onChange={(v) => pickSvc(Number(v))} label="Service">
                {svcs.map((s, i) => (
                  <option key={i} value={i}>
                    {displayName(s, false)}
                  </option>
                ))}
              </Select>
              <StepButton onClick={() => pickSvc((svcIdx + 1) % svcs.length)} label="Next service">
                ›
              </StepButton>
              <span className="shrink-0 text-xs text-[var(--muted)]">
                {svcIdx + 1}/{svcs.length}
              </span>
            </div>
          </>
        )}

        {/* the card */}
        <div className="mt-6 overflow-hidden rounded-2xl bg-[var(--card)] shadow-sm ring-1 ring-[var(--ring)]">
          {line && svc && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--ring)] px-4 py-3 sm:px-6">
              <span
                className="rounded-md px-2.5 py-1 text-sm font-bold"
                style={{ background: paint(line.color), color: inkVar(line.color) }}
              >
                {line.name}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold leading-tight">
                  {first} <span className="text-[var(--muted)]">→</span> {last}
                </div>
                <div className="truncate text-xs text-[var(--muted)]">
                  {stops.length} stops · {displayName(svc, flipped)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <Toggle on={learning} onClick={() => setLearning((v) => !v)} label="Learning" />
                <Toggle
                  on={progress}
                  onClick={() => setProgress((v) => !v)}
                  label={progress && found ? `Your progress · ${nFound}/${stops.length}` : 'Your progress'}
                />
                <button
                  onClick={() => setFlipped((v) => !v)}
                  title="Reverse the direction of the strip"
                  className="rounded-full px-3 py-1 text-[var(--muted)] ring-1 ring-[var(--ring)] hover:text-[var(--fg)]"
                >
                  ⇄ Reverse
                </button>
              </div>
            </div>
          )}
          {learning && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-[var(--soft)] px-4 py-2 text-sm sm:px-6">
              <span className="text-[var(--muted)]">
                {progress
                  ? 'Stations you have found are shown; tap a blank to reveal the rest.'
                  : 'Station names are hidden. Tap a blank to reveal it.'}{' '}
                <b className="text-[var(--fg)]">{nRevealed}</b> revealed.
              </span>
              <span className="flex gap-3">
                <button className="text-[var(--accent)] hover:underline" onClick={() => setRevealed(new Set(stops))}>
                  Reveal all
                </button>
                <button className="text-[var(--accent)] hover:underline" onClick={() => setRevealed(new Set())}>
                  Hide all
                </button>
              </span>
            </div>
          )}
          {progress && found && found.size === 0 && (
            <div className="bg-[var(--soft)] px-4 py-2 text-sm text-[var(--muted)] sm:px-6">
              No saved progress found in this browser. Play{' '}
              <Link href="/london" className="text-[var(--accent)] hover:underline">
                the game
              </Link>{' '}
              and come back.
            </div>
          )}

          <div ref={boxRef} className="w-full">
            {line && width > 0 && (
              <div key={`${lineKey}-${svcIdx}-${flipped}`}>
                {vertical ? (
                  <StripList
                    line={line}
                    stops={info}
                    lineOf={byKey}
                    learning={learning}
                    progress={progress}
                    revealed={revealed}
                    selected={selected}
                    onStop={onStop}
                  />
                ) : (
                  <StripDiagram
                    width={width}
                    fontFamily={fontFamily}
                    line={line}
                    stops={info}
                    lineOf={byKey}
                    learning={learning}
                    progress={progress}
                    revealed={revealed}
                    selected={selected}
                    onStop={onStop}
                  />
                )}
              </div>
            )}
          </div>

          {sel && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--ring)] px-4 py-3 text-sm sm:px-6">
              <b className="text-base">{sel.name}</b>
              <span className="text-[var(--muted)]">
                stop {selIdx + 1} of {stops.length}
                {selIdx === 0 || selIdx === stops.length - 1 ? ' · terminus' : ''}
              </span>
              {progress && (
                <span className={sel.found ? 'font-bold text-emerald-600' : 'text-[var(--muted)]'}>
                  {sel.found ? 'found ✓' : 'not found yet'}
                </span>
              )}
              {sel.others.length > 0 && <span className="text-[var(--muted)]">Change for</span>}
              {sel.others.map((k) => (
                <LinePill key={k} line={byKey[k]} />
              ))}
              {sel.near.map((n) => (
                <span key={n.name} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[var(--muted)]">
                    {sel.others.length || n !== sel.near[0] ? 'and' : 'Change for'} a short walk to <b className="text-[var(--fg)]">{n.name}</b>
                  </span>
                  {n.lines.map((k) => (
                    <LinePill key={k} line={byKey[k]} />
                  ))}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[var(--muted)]">
          <span className="flex items-center gap-2">
            <svg width="34" height="16" aria-hidden>
              <rect x="0" y="5" width="34" height="6" fill={line ? paint(line.color) : undefined} />
              <rect x="15.5" y="0" width="3" height="5" fill={line ? paint(line.color) : undefined} />
            </svg>
            station
          </span>
          <span className="flex items-center gap-2">
            <svg width="34" height="16" aria-hidden>
              <rect x="0" y="5" width="34" height="6" fill={line ? paint(line.color) : undefined} />
              <circle cx="17" cy="8" r="5.5" fill="#fff" stroke="#18181b" strokeWidth="2.4" />
            </svg>
            interchange: chips show the other lines
          </span>
          <span className="flex items-center gap-2">
            <svg width="22" height="10" aria-hidden>
              <rect x="1" y="1" width="20" height="8" rx="4" fill="none" stroke="var(--muted)" strokeWidth="1.6" />
            </svg>
            outline chip: a short walk to a station with another name
          </span>
          <span className="flex items-center gap-2">
            <svg width="34" height="16" aria-hidden>
              <rect x="0" y="5" width="20" height="6" fill={line ? paint(line.color) : undefined} />
              <rect x="18" y="1" width="5" height="14" rx="1.5" fill={line ? paint(line.color) : undefined} />
            </svg>
            terminus
          </span>
          <span>Tap a station for details.</span>
          <span className="ml-auto flex items-center gap-1">
            Layout
            {(['auto', 'strip', 'list'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setLayout(t)}
                className={`rounded-full px-2 py-0.5 ${layout === t ? 'bg-[var(--chip)] text-[var(--fg)]' : 'hover:text-[var(--fg)]'}`}
              >
                {t}
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  )
}

function LinePill({ line }: { line: StripLine }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ background: paint(line.color), color: inkVar(line.color) }}>
      {line.name}
    </span>
  )
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="relative min-w-0 flex-1 sm:max-w-xl">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none truncate rounded-lg bg-[var(--card)] py-1.5 pl-3 pr-8 text-sm text-[var(--fg)] ring-1 ring-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">▾</span>
    </label>
  )
}

function StepButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="h-8 w-8 shrink-0 rounded-lg bg-[var(--card)] text-lg leading-none text-[var(--muted)] ring-1 ring-[var(--ring)] hover:text-[var(--fg)]"
    >
      {children}
    </button>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3 ring-1 transition ${
        on ? 'bg-[var(--fg)] text-[var(--bg)] ring-[var(--fg)]' : 'text-[var(--muted)] ring-[var(--ring)] hover:text-[var(--fg)]'
      }`}
    >
      <span
        className={`relative inline-block h-4 w-7 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-[var(--chip)]'}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? 'left-3.5' : 'left-0.5'}`}
        />
      </span>
      {label}
    </button>
  )
}

export function Swatch({ line, on }: { line: StripLine; on?: boolean }) {
  return (
    <svg width="22" height="12" aria-hidden className="shrink-0">
      <rect
        x="0.5"
        y="1.5"
        width="21"
        height="9"
        rx="4.5"
        fill={paint(line.color)}
        stroke={on ? inkVar(line.color) : 'none'}
        strokeOpacity={0.5}
      />
      {line.stripe && (
        <line
          x1="5"
          x2="17"
          y1="6"
          y2="6"
          stroke={line.stripeColor || '#fff'}
          strokeWidth="3"
          strokeDasharray={line.stripe === 'dashed' ? '3 2' : undefined}
        />
      )}
    </svg>
  )
}

const LIGHT = `--bg:#f4f3ef;--card:#ffffff;--soft:#f7f6f2;--fg:#18181b;--muted:#6b6b73;--faint:#c9c9cf;--ring:#e4e3de;--chip:#e7e6e1;--accent:#1d5fd6;--casing:transparent;--blank:#ecebe6;--blank-ink:#a1a1aa;--revealed:#1d5fd6;--found:#059669`
const DARK = `--bg:#0f1012;--card:#18191c;--soft:#1e1f23;--fg:#f1f1f3;--muted:#9a9aa3;--faint:#4a4a52;--ring:#2b2c31;--chip:#2e2f35;--accent:#7aa7ff;--casing:#6b6b75;--ink-line:#e4e4e7;--ink-on-line:#18181b;--blank:#2a2b30;--blank-ink:#6b6b75;--revealed:#8fb4ff;--found:#34d399`
const CSS = `
.strip-root{${LIGHT}}
body:has(.strip-root){background:#f4f3ef}
@media (prefers-color-scheme: dark){body:has(.strip-root:not([data-theme=light])){background:#0f1012}}
body:has(.strip-root[data-theme=dark]){background:#0f1012}
body:has(.strip-root[data-theme=light]){background:#f4f3ef}
@media (prefers-color-scheme: dark){.strip-root:not([data-theme=light]){${DARK}}}
.strip-root[data-theme=dark]{${DARK}}
.strip-stop{cursor:pointer}
.strip-stop:hover .strip-label{fill:var(--accent)}
.strip-stop:focus{outline:none}
.strip-stop:focus-visible .strip-hit{stroke:var(--accent);stroke-width:2}
`

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Feature, Point } from 'geojson'
import type { GameShellProps } from '@/components/GamePage'
import { useConfig } from '@/lib/configContext'
import AboutModal from '@/components/AboutModal'
import DockInput, { Miss } from './DockInput'
import Strip from './Strip'
import Toast, { ToastData, TOAST_MS } from './Toast'
import { FoundPanel, Hints, LinesList, Segmented, SettingsPanel } from './Panels'
import { groupLines } from './lines'
import useVisualViewport from './useVisualViewport'

// "Dock": phone-first game layout (brainstorm: Ticket Barrier + Line Strip).
// Phone: the input is docked at the bottom, riding on the keyboard; a strip of
// line pills sits right above it; a progress pill top-left; details live in a
// pull-up sheet (Lines / Found / Settings). Desktop: the same dock, centred at
// the bottom; the line key down the left; found + settings in a collapsible
// panel on the right.

type SheetTab = 'lines' | 'found' | 'settings'
const LG = '(min-width: 1024px)'
const RAIL_W = 300
const PANEL_W = 340

const CSS = `
@keyframes dock-flap { 0% { transform: rotateX(-90deg); opacity: 0 } 55% { transform: rotateX(18deg); opacity: 1 } 80% { transform: rotateX(-6deg) } 100% { transform: rotateX(0) } }
.dock-flap { animation: dock-flap 380ms cubic-bezier(.2,.7,.3,1) both; transform-origin: 50% 50%; backface-visibility: hidden }
@keyframes dock-toast { 0% { transform: translateY(10px) scale(.97); opacity: 0 } 9% { transform: none; opacity: 1 } 88% { transform: none; opacity: 1 } 100% { transform: translateY(-6px); opacity: 0 } }
.dock-toast { animation: dock-toast ${TOAST_MS}ms ease-out both }
@keyframes dock-pulse { 0% { box-shadow: 0 0 0 0 var(--pc); transform: scale(1) } 25% { transform: scale(1.08) } 100% { box-shadow: 0 0 0 10px transparent; transform: scale(1) } }
.dock-pulse { animation: dock-pulse 900ms ease-out 2 }
@keyframes dock-in { from { transform: translateY(8px); opacity: 0 } to { transform: none; opacity: 1 } }
.dock-in { animation: dock-in 300ms ease-out both }
@keyframes dock-sheet { from { transform: translateY(100%) } to { transform: translateY(0) } }
.dock-sheet { animation: dock-sheet 280ms cubic-bezier(.2,.8,.2,1) both }
@keyframes dock-blink { 50% { opacity: .35 } }
.dock-blink { animation: dock-blink 1.6s ease-in-out infinite }
`

function useIsDesktop() {
  const [v, setV] = useState<boolean | null>(null)
  useEffect(() => {
    const mq = window.matchMedia(LG)
    const on = () => setV(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return v
}

function useStopwatch(visible: boolean) {
  const [running, setRunning] = useState(false)
  const [ms, setMs] = useState(0)
  const base = useRef(0)
  useEffect(() => {
    if (!visible) setRunning(false)
  }, [visible])
  useEffect(() => {
    if (!running) return
    base.current = Date.now() - ms
    const t = setInterval(() => setMs(Date.now() - base.current), 250)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])
  const s = Math.floor(ms / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const label = s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
  return { running, toggle: () => setRunning((r) => !r), label }
}

function Ring({ pct, size, stroke }: { pct: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#fcd34d"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * Math.max(pct, pct > 0 ? 0.02 : 0)} ${c}`}
        className="transition-[stroke-dasharray] duration-700"
      />
    </svg>
  )
}

const Icon = {
  sliders: (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
      <circle cx="13" cy="6" r="2" />
      <circle cx="7" cy="14" r="2" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M7 5h10M7 10h10M7 15h10" />
      <circle cx="3.5" cy="5" r=".9" fill="currentColor" />
      <circle cx="3.5" cy="10" r=".9" fill="currentColor" />
      <circle cx="3.5" cy="15" r=".9" fill="currentColor" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m7 5 5 5-5 5" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  ),
}

export default function Dock(p: GameShellProps) {
  const { LINES } = useConfig()
  const desktop = useIsDesktop()
  const vv = useVisualViewport()
  const groups = useMemo(() => groupLines(LINES), [LINES])

  const [sheet, setSheet] = useState<SheetTab | null>(null)
  // desktop right panel: starts open once there is something to list
  const [panelPick, setPanel] = useState<'found' | 'settings' | null | undefined>(undefined)
  const panel = panelPick === undefined ? (p.found.length > 0 ? 'found' : null) : panelPick
  const [aboutOpen, setAboutOpen] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [pulse, setPulse] = useState<{ keys: string[]; at: number } | null>(null)
  const watch = useStopwatch(p.showTimer)
  const dockRef = useRef<HTMLDivElement>(null)

  // ---- progress (lines in play only; counted in stations, not station×line)
  const stationTotals = useMemo(() => {
    const all = new Set<string>()
    p.idMap.forEach((f) => all.add(f.properties.name))
    const got = new Set<string>()
    p.found.forEach((id) => {
      const f = p.idMap.get(id)
      if (f) got.add(f.properties.name)
    })
    return { found: got.size, total: all.size }
  }, [p.idMap, p.found])
  const pct = p.foundProportion
  const pctLabel = `${Math.floor(pct * 100)}%`

  // ---- map hints: one 3-way control over the two map toggles
  const hints: Hints = !p.showAllStations ? 'clean' : p.showFoundLabels ? 'names' : 'dots'
  const setHints = (h: Hints) => {
    p.setShowAllStations(h !== 'clean')
    p.setShowFoundLabels(h === 'names')
  }

  const toggleLine = useCallback(
    (k: string) => {
      const next = { ...p.enabledLines, [k]: !p.enabledLines[k] }
      if (!Object.keys(LINES).some((x) => next[x])) return
      p.setEnabledLines(next)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.enabledLines, p.setEnabledLines, LINES],
  )

  // ---- feedback: a toast after each guess. Hits are derived by watching
  // p.found change right after a submit (so line toggles / reveal-all, which
  // also change p.found, never toast).
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  const showToast = useCallback((t: ToastData) => {
    setToast(t)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])
  const submittedAt = useRef(0)
  const streak = useRef({ n: 0, at: 0 })
  const prevFound = useRef<Set<number> | null>(null)
  useEffect(() => {
    const prev = prevFound.current
    prevFound.current = new Set(p.found)
    if (!prev || Date.now() - submittedAt.current > 3000) return
    submittedAt.current = 0
    const fresh = p.found.filter((id) => !prev.has(id))
    if (!fresh.length || fresh.length > 12) return
    const first = p.idMap.get(fresh[0])
    if (!first) return
    const lines = Array.from(new Set(fresh.map((id) => p.idMap.get(id)?.properties.line).filter(Boolean) as string[])).sort(
      (a, b) => (LINES[a]?.order ?? 99) - (LINES[b]?.order ?? 99),
    )
    const completed = lines.filter((l) => p.stationsPerLine[l] > 0 && p.foundStationsPerLine[l] === p.stationsPerLine[l])
    const now = Date.now()
    streak.current = { n: now - streak.current.at < 20000 ? streak.current.n + 1 : 1, at: now }
    showToast({ id: now, kind: 'hit', name: first.properties.name, lines, streak: streak.current.n, completed })
    setPulse({ keys: lines, at: now })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.found])
  const onHit = useCallback(() => {
    submittedAt.current = Date.now()
  }, [])
  const onMiss = useCallback(
    (kind: Miss, name: string) => {
      if (kind !== 'already') streak.current = { n: 0, at: 0 }
      showToast({ id: Date.now(), kind, name })
    },
    [showToast],
  )

  // ---- framing. GamePage pads the map for its own top input bar; replace
  // that with padding for this layout's chrome (rails / HUD / dock + toast),
  // so the map's centre, fly-tos and zooms land in the uncovered part. The
  // phone keyboard is handled per fly-to (offset) rather than by re-padding,
  // so the map doesn't jump every time the keyboard opens or closes.
  const padded = useRef(false)
  useEffect(() => {
    const m = p.map
    if (!m || desktop == null) return
    const dockH = dockRef.current?.offsetHeight ?? 130
    const padding = desktop
      ? { top: 16, left: 16 + RAIL_W, right: panel ? PANEL_W + 16 : 0, bottom: dockH + 110 }
      : { top: 56, left: 0, right: 0, bottom: dockH + 70 }
    if (!padded.current) m.jumpTo({ padding } as any)
    else m.easeTo({ padding, duration: 350 })
    padded.current = true
  }, [p.map, desktop, panel])

  // phones: the map credit starts collapsed to its (i) button (MapLibre opens
  // it expanded), so it doesn't sit across the top of the map
  useEffect(() => {
    if (!p.map || desktop !== false) return
    p.map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
  }, [p.map, desktop])

  const flyOffset = useCallback((): [number, number] => {
    if (desktop) return [0, 0]
    return [0, -(vv?.keyboard ?? 0) / 2]
  }, [desktop, vv])

  const pick = useCallback(
    (id: number) => {
      const f = p.idMap.get(id) as Feature<Point> | undefined
      if (!p.map || !f || f.geometry.type !== 'Point') return p.zoomToFeature(id)
      setSheet(null)
      // wait a frame so the offset sees the closed sheet
      requestAnimationFrame(() =>
        p.map!.flyTo({ center: f.geometry.coordinates as [number, number], zoom: 14, duration: 700, offset: flyOffset() }),
      )
    },
    [p.idMap, p.map, p.zoomToFeature, flyOffset],
  )

  const openSheet = (t: SheetTab) => {
    p.inputRef.current?.blur()
    setSheet(t)
  }

  // ---- desktop: any letter (or "/") focuses the field
  useEffect(() => {
    if (!desktop) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') {
        e.preventDefault()
        p.inputRef.current?.focus()
      } else if (/^[a-z0-9']$/i.test(e.key)) p.inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desktop, p.inputRef])

  const placeholder = p.isNewPlayer ? 'Try: Bank' : desktop ? 'Name a station…' : 'Name a station'

  const input = (
    <DockInput
      matcher={p.matcher}
      found={p.knownFound}
      setFound={p.setFound}
      setIsNewPlayer={p.setIsNewPlayer}
      inputRef={p.inputRef}
      map={p.map}
      idMap={p.idMap}
      flyOffset={flyOffset}
      onMiss={onMiss}
      onHit={onHit}
      placeholder={placeholder}
      large={!!desktop}
    />
  )

  const hint = p.isNewPlayer && !toast && (
    <div className="dock-in pointer-events-auto flex max-w-full items-start gap-3 rounded-2xl bg-amber-300 px-3.5 py-2.5 text-zinc-900 shadow-xl">
      <div className="min-w-0 text-[13px] leading-snug">
        <div className="font-black">Name any London station you remember.</div>
        <div className="font-semibold text-zinc-800">
          {desktop ? (
            <>
              Type it and press <kbd className="rounded bg-zinc-900/10 px-1 font-sans font-bold">Enter</kbd>.{' '}
            </>
          ) : null}
          Not sure where to start? Try{' '}
          <button
            type="button"
            className="font-black underline decoration-2 underline-offset-2"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const el = p.inputRef.current
              if (!el) return
              const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
              set?.call(el, 'Bank')
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.focus()
            }}
          >
            Bank
          </button>
          .
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss hint"
        onClick={() => p.setIsNewPlayer(false)}
        className="-mr-1 mt-0.5 rounded-full p-1 text-zinc-900/60 hover:bg-zinc-900/10 hover:text-zinc-900"
      >
        {Icon.close}
      </button>
    </div>
  )

  const timerChip = p.showTimer && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        watch.toggle()
      }}
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums ${
        watch.running ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/70'
      }`}
      aria-label={watch.running ? 'Pause timer' : 'Start timer'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${watch.running ? 'dock-blink bg-emerald-300' : 'bg-white/50'}`} />
      {watch.label}
    </button>
  )

  const linesProps = {
    groups,
    LINES,
    found: p.foundStationsPerLine,
    total: p.stationsPerLine,
    enabled: p.enabledLines,
    setEnabled: p.setEnabledLines,
  }
  const settings = (
    <SettingsPanel
      hints={hints}
      setHints={setHints}
      showTimer={p.showTimer}
      setShowTimer={p.setShowTimer}
      onReset={p.onReset}
      revealAll={p.revealAll}
      openAbout={() => setAboutOpen(true)}
    />
  )
  const foundPanel = (
    <FoundPanel found={p.found} idMap={p.idMap} LINES={LINES} hoveredId={p.hoveredId} setHoveredId={p.setHoveredId} onPick={pick} />
  )

  return (
    <div className="fixed inset-0 overflow-hidden bg-zinc-100">
      <style>{CSS}</style>
      {/* map attribution: out from under the chrome (top-right under the
          settings button on phones, left of the found panel on desktop) */}
      <style>
        {desktop
          ? `.maplibregl-ctrl-bottom-right{right:${panel ? PANEL_W + 24 : 8}px!important;bottom:2px!important}.maplibregl-ctrl-attrib{font-size:10px;background:rgba(255,255,255,.55)!important}`
          : `.maplibregl-ctrl-bottom-right{top:calc(max(env(safe-area-inset-top),12px) + 46px)!important;bottom:auto!important;right:4px!important}.maplibregl-ctrl-attrib{font-size:9px;background:rgba(255,255,255,.55)!important}.maplibregl-ctrl-attrib:not(.maplibregl-compact-show) .maplibregl-ctrl-attrib-inner{display:none}.maplibregl-ctrl-attrib:not(.maplibregl-compact-show){background:transparent!important;min-height:24px}`}
      </style>
      <div className="relative h-full w-full">{p.mapSlot}</div>

      {desktop === true && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* ---------------- left: line key ---------------- */}
          <aside
            className="pointer-events-auto absolute bottom-4 left-4 top-4 flex flex-col overflow-hidden rounded-[22px] bg-zinc-950/[0.93] text-white shadow-2xl ring-1 ring-white/10 backdrop-blur"
            style={{ width: RAIL_W }}
          >
            <div className="flex items-center gap-3 px-4 pb-3 pt-4">
              <div className="relative">
                <Ring pct={pct} size={54} stroke={5} />
                <span className="absolute inset-0 flex items-center justify-center text-[13px] font-black tabular-nums">{pctLabel}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">London Rail Memory</div>
                <div className="text-lg font-black leading-tight tabular-nums">
                  {stationTotals.found}
                  <span className="text-white/40"> / {stationTotals.total}</span>
                </div>
                <div className="text-xs font-semibold text-white/45">stations on lines in play</div>
              </div>
              {timerChip}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-color:rgba(255,255,255,.15)_transparent] [scrollbar-width:thin]">
              <LinesList {...linesProps} dense />
            </div>
          </aside>

          {/* ---------------- right: found + settings ---------------- */}
          {panel ? (
            <aside
              className="dock-in pointer-events-auto absolute right-4 top-4 flex max-h-[calc(100%-32px)] flex-col overflow-hidden rounded-[22px] bg-zinc-950/[0.93] text-white shadow-2xl ring-1 ring-white/10 backdrop-blur"
              style={{ width: PANEL_W }}
            >
              <div className="flex items-center gap-2 px-3 pb-3 pt-3">
                <Segmented
                  value={panel}
                  onChange={setPanel}
                  options={[
                    { v: 'found', label: 'Found', count: stationTotals.found },
                    { v: 'settings', label: 'Settings' },
                  ]}
                />
                <button
                  type="button"
                  aria-label="Collapse panel"
                  onClick={() => setPanel(null)}
                  className="ml-auto rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  {Icon.chevron}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-color:rgba(255,255,255,.15)_transparent] [scrollbar-width:thin]">
                {panel === 'found' ? foundPanel : settings}
              </div>
            </aside>
          ) : (
            <div className="pointer-events-auto absolute right-4 top-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPanel('found')}
                className="flex items-center gap-2 rounded-full bg-zinc-950/90 py-2 pl-3 pr-3.5 text-sm font-bold text-white shadow-xl ring-1 ring-white/10 backdrop-blur hover:bg-zinc-900"
              >
                {Icon.list}
                Found <span className="tabular-nums text-white/50">{stationTotals.found}</span>
              </button>
              <button
                type="button"
                aria-label="Settings"
                onClick={() => setPanel('settings')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-950/90 text-white shadow-xl ring-1 ring-white/10 backdrop-blur hover:bg-zinc-900"
              >
                {Icon.sliders}
              </button>
            </div>
          )}

          {/* ---------------- bottom centre: the dock ---------------- */}
          <div
            className="absolute bottom-9 flex justify-center px-6"
            style={{ left: 16 + RAIL_W, right: panel ? PANEL_W + 16 : 0 }}
          >
            <div className="flex w-full max-w-[600px] flex-col items-center gap-2.5">
              <div className="pointer-events-none flex min-h-0 w-full flex-col items-center">
                {toast ? <Toast key={toast.id} t={toast} LINES={LINES} maxWidth={520} /> : hint}
              </div>
              <div
                ref={dockRef}
                className="pointer-events-auto w-full rounded-[22px] bg-zinc-950/[0.93] p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur"
              >
                {input}
                <div className="flex items-center justify-between px-2 pb-0.5 pt-1.5 text-[11.5px] font-semibold text-white/45 [&_kbd]:font-sans">
                  <span>
                    <kbd className="rounded bg-white/10 px-1 text-white/55">Enter</kbd> to guess ·{' '}
                    <kbd className="rounded bg-white/10 px-1 text-white/55">Esc</kbd> clears
                  </span>
                  <span>Click a line in the key to take it in or out of play</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {desktop === false && vv && (
        <div className="pointer-events-none fixed left-0 z-10 w-full" style={{ top: vv.top, height: vv.height }}>
          {/* ---------------- top: progress pill + settings ---------------- */}
          <div className="absolute inset-x-3 flex items-start justify-between" style={{ top: 'max(env(safe-area-inset-top), 12px)' }}>
            <button
              type="button"
              onClick={() => openSheet('lines')}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-zinc-950/90 py-1.5 pl-1.5 pr-3 text-white shadow-xl ring-1 ring-white/10 backdrop-blur"
              aria-label={`${pctLabel} found. Open lines`}
            >
              <Ring pct={pct} size={28} stroke={3.5} />
              <span className="text-[15px] font-black tabular-nums">{pctLabel}</span>
              <span className="text-xs font-semibold tabular-nums text-white/50">
                {stationTotals.found}/{stationTotals.total}
              </span>
              {timerChip}
            </button>
            <button
              type="button"
              aria-label="Settings"
              onClick={() => openSheet('settings')}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-950/90 text-white shadow-xl ring-1 ring-white/10 backdrop-blur"
            >
              {Icon.sliders}
            </button>
          </div>

          {/* ---------------- bottom: toast, strip, input ---------------- */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <div className="pointer-events-none mb-2 flex w-full flex-col items-center px-3">
              {toast ? <Toast key={toast.id} t={toast} LINES={LINES} maxWidth={Math.min(window.innerWidth - 24, 420)} /> : hint}
            </div>
            <div
              ref={dockRef}
              className="pointer-events-auto w-full rounded-t-[24px] bg-zinc-950/[0.94] shadow-[0_-8px_30px_rgba(0,0,0,0.25)] ring-1 ring-white/10 backdrop-blur"
            >
              <Handle onOpen={() => openSheet('lines')} />
              <Strip
                groups={groups}
                LINES={LINES}
                found={p.foundStationsPerLine}
                total={p.stationsPerLine}
                enabled={p.enabledLines}
                toggle={toggleLine}
                pulse={pulse}
              />
              <div
                className="flex items-center gap-2 px-3 pt-2"
                style={{ paddingBottom: vv.keyboard > 0 ? 8 : 'max(env(safe-area-inset-bottom), 12px)' }}
              >
                <button
                  type="button"
                  aria-label="Found stations"
                  onClick={() => openSheet('found')}
                  className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] text-white/80"
                >
                  {Icon.list}
                  {stationTotals.found > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-amber-300 px-1 text-center text-[10px] font-black leading-[18px] text-zinc-900 tabular-nums">
                      {stationTotals.found}
                    </span>
                  )}
                </button>
                {input}
              </div>
            </div>
          </div>

          {sheet && (
            <Sheet
              tab={sheet}
              setTab={setSheet}
              onClose={() => setSheet(null)}
              counts={{ found: stationTotals.found }}
            >
              {sheet === 'lines' ? <LinesList {...linesProps} /> : sheet === 'found' ? foundPanel : settings}
            </Sheet>
          )}
        </div>
      )}

      <AboutModal open={aboutOpen} setOpen={setAboutOpen} />
    </div>
  )
}

// Drag handle on top of the dock: tap or swipe up to pull the sheet up.
function Handle({ onOpen }: { onOpen: () => void }) {
  const start = useRef<number | null>(null)
  return (
    <button
      type="button"
      aria-label="Open lines, found and settings"
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => (start.current = e.clientY)}
      onPointerMove={(e) => {
        if (start.current != null && start.current - e.clientY > 24) {
          start.current = null
          onOpen()
        }
      }}
      onClick={onOpen}
      className="flex h-5 w-full touch-none items-center justify-center"
    >
      <span className="h-1 w-10 rounded-full bg-white/25" />
    </button>
  )
}

function Sheet({
  tab,
  setTab,
  onClose,
  counts,
  children,
}: {
  tab: SheetTab
  setTab: (t: SheetTab) => void
  onClose: () => void
  counts: { found: number }
  children: React.ReactNode
}) {
  const [dy, setDy] = useState(0)
  const start = useRef<number | null>(null)
  return (
    <div className="pointer-events-auto absolute inset-0 z-20">
      <div className="absolute inset-0 bg-zinc-950/30" onClick={onClose} />
      <div
        className="dock-sheet absolute inset-x-0 bottom-0 flex h-[78%] flex-col rounded-t-[26px] bg-zinc-950 text-white shadow-2xl ring-1 ring-white/10"
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none', animation: 'none' } : undefined}
      >
        <div
          className="touch-none"
          onPointerDown={(e) => {
            start.current = e.clientY
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => start.current != null && setDy(Math.max(0, e.clientY - start.current))}
          onPointerUp={() => {
            if (dy > 90) onClose()
            start.current = null
            setDy(0)
          }}
        >
          <div className="flex h-6 items-center justify-center">
            <span className="h-1 w-10 rounded-full bg-white/25" />
          </div>
          <div className="flex items-center gap-2 px-4 pb-3">
            <Segmented
              wide
              value={tab}
              onChange={setTab}
              options={[
                { v: 'lines', label: 'Lines' },
                { v: 'found', label: 'Found', count: counts.found },
                { v: 'settings', label: 'Settings' },
              ]}
            />
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70"
            >
              {Icon.close}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),20px)]">{children}</div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameShellProps } from '@/components/GamePage'
import { useConfig } from '@/lib/configContext'
import { serif } from './fonts'
import Field, { Command } from './Field'
import IndexPanel, { MapMode, Tab } from './IndexPanel'
import { fmtInt } from './atlasLines'

// Atlas: the map is the page. One field (top centre), a quiet score and one
// "Index" door to everything else (lines, found list, settings).
const PAPER = '#f3eee4'

const css = `
.atlas .font-serif{font-family:var(--atlas-serif),'Iowan Old Style',Georgia,serif;font-optical-sizing:auto}
@keyframes atlas-fade{0%{opacity:0;transform:translateY(-3px)}8%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0}}
.atlas-fade{animation:atlas-fade 3.2s ease-out forwards}
.atlas .maplibregl-ctrl-attrib{background:transparent!important;font-size:10px;opacity:.55}
`

export default function Atlas(p: GameShellProps) {
  const { LINES } = useConfig()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('lines')
  const [typed, setTyped] = useState(false)
  const [isPhone, setIsPhone] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const on = () => setIsPhone(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // paper basemap: warm ground, slate water, faint sage parks
  useEffect(() => {
    const m = p.map
    if (!m) return
    const paint = () => {
      if (!(m as any).style) return // map removed meanwhile
      const set = (id: string, prop: string, v: string) => m.getLayer(id) && m.setPaintProperty(id, prop as any, v)
      set('background', 'background-color', PAPER)
      for (const id of ['landcover', 'park_national_park', 'park_nature_reserve', 'landuse']) set(id, 'fill-color', 'rgba(190, 200, 170, 0.32)')
      set('water', 'fill-color', '#d3dcdc')
      set('waterway', 'line-color', '#d3dcdc')
    }
    if (m.isStyleLoaded() && m.getSource('features')) paint()
    else m.once('idle', paint)
    return () => {
      m.off('idle', paint)
    }
  }, [p.map])

  const mapMode: MapMode = !p.showAllStations ? 'clean' : p.showFoundLabels ? 'names' : 'dots'
  const setMapMode = (mm: MapMode) => {
    p.setShowAllStations(mm !== 'clean')
    p.setShowFoundLabels(mm === 'names')
  }

  const openIndex = (t?: Tab) => {
    if (t) setTab(t)
    setOpen(true)
  }
  const closeIndex = () => {
    setOpen(false)
    if (!isPhone) p.inputRef.current?.focus()
  }

  // Esc closes the Index; typing anywhere goes to the field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) return closeIndex()
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) p.inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const total = useMemo(
    () => Object.keys(LINES).reduce((s, k) => s + (p.enabledLines[k] ? p.stationsPerLine[k] || 0 : 0), 0),
    [LINES, p.enabledLines, p.stationsPerLine],
  )
  const raw = p.foundProportion * 100
  const pct = raw > 0 && raw < 10 ? (Math.floor(raw * 10) / 10).toFixed(1) : String(Math.floor(raw))
  const uniqueStations = useMemo(() => {
    const names = new Set<string>()
    p.idMap.forEach((f) => names.add(f.properties.name))
    return names.size
  }, [p.idMap])

  const commands: Command[] = [
    { cmd: 'lines', label: 'Lines and progress', hint: `${pct}%`, run: () => openIndex('lines') },
    { cmd: 'found', label: 'Stations found', hint: fmtInt(p.found.length), run: () => openIndex('found') },
    { cmd: 'settings', label: 'Settings', run: () => openIndex('settings') },
    { cmd: 'clean', label: 'Map: clean', hint: mapMode === 'clean' ? 'on' : '', run: () => setMapMode('clean') },
    { cmd: 'dots', label: 'Map: dots', hint: mapMode === 'dots' ? 'on' : '', run: () => setMapMode('dots') },
    { cmd: 'names', label: 'Map: dots and names', hint: mapMode === 'names' ? 'on' : '', run: () => setMapMode('names') },
    { cmd: 'timer', label: p.showTimer ? 'Hide the timer' : 'Show the timer', run: () => p.setShowTimer(!p.showTimer) },
    { cmd: 'reveal', label: 'Reveal all stations…', run: p.revealAll },
    { cmd: 'restart', label: 'Start over…', run: p.onReset },
  ]

  const showTitle = p.isNewPlayer && p.knownFound.length === 0 && !typed

  const score = (
    <button
      type="button"
      onClick={() => openIndex('lines')}
      title={`${fmtInt(p.found.length)} of ${fmtInt(total)} stations`}
      className="flex items-baseline gap-1.5 whitespace-nowrap text-[#1d1b17] hover:opacity-70"
    >
      <span className="font-serif text-[22px] tabular-nums leading-none">
        {pct}
        <span className="text-[15px] text-[#1d1b17]/45">%</span>
      </span>
      <span className="hidden text-[11px] tabular-nums tracking-wide text-[#1d1b17]/45 xl:inline">
        {fmtInt(p.found.length)} / {fmtInt(total)}
      </span>
    </button>
  )

  const indexBtn = (
    <button
      type="button"
      onClick={() => (open ? closeIndex() : openIndex())}
      aria-expanded={open}
      className="flex h-[46px] shrink-0 items-center gap-2 rounded-[3px] border border-[#1d1b17]/15 bg-[#fbf9f4]/95 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[#1d1b17] shadow-[0_12px_32px_-14px_rgba(29,27,23,0.35)] backdrop-blur hover:border-[#1d1b17]/40 sm:h-[54px] lg:h-auto lg:border-0 lg:bg-transparent lg:px-0 lg:shadow-none lg:backdrop-blur-0 lg:hover:opacity-70"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
        <path d="M2 4h12M2 8h12M2 12h8" strokeLinecap="round" />
      </svg>
      Index
    </button>
  )

  return (
    <div className={`atlas ${serif.variable} relative h-[100dvh] w-full overflow-hidden`} style={{ background: PAPER }}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="absolute inset-0">
        {p.mapSlot}
        {/* a whisper of paper over the tiles; lines stay true */}
        <div className="pointer-events-none absolute inset-0 bg-[#efe6d2] mix-blend-multiply" style={{ opacity: 0.35 }} />
        {/* soft vignette under the controls */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#f3eee4]/80 to-transparent" />
      </div>

      {/* top: wordmark · field · score + Index */}
      <header
        className={`absolute inset-x-0 top-0 z-30 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] transition-[right] duration-300 sm:px-6 lg:grid lg:grid-cols-[1fr_minmax(0,560px)_1fr] lg:items-start lg:gap-8 lg:px-8 lg:pt-7 ${
          open ? 'lg:right-[420px]' : 'lg:right-0'
        }`}
      >
        <div className="hidden pt-3 lg:block">
          <div
            className={`whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.2em] text-[#1d1b17]/55 transition-opacity duration-700 ${showTitle ? 'opacity-0' : 'opacity-100'}`}
          >
            London Rail Memory
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Field
            p={p}
            commands={commands}
            onFirstKey={() => setTyped(true)}
            placeholder={isPhone ? 'Name a station' : 'Name a London station'}
            trailing={
              <div className="flex items-center gap-2 pr-2 lg:hidden">
                {p.showTimer && isPhone && <Stopwatch />}
                {score}
              </div>
            }
          />
          <div className="lg:hidden">{indexBtn}</div>
        </div>
        <div className="hidden items-center justify-end gap-6 pt-2.5 lg:flex">
          {p.showTimer && !isPhone && <Stopwatch />}
          {score}
          <span className="h-4 w-px bg-[#1d1b17]/15" />
          {indexBtn}
        </div>
      </header>

      {/* first run: a title on the map, gone at the first keypress */}
      <div
        aria-hidden={!showTitle}
        className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6 transition-opacity duration-700 ${showTitle ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(243,238,228,0.94)_0%,rgba(243,238,228,0.82)_38%,rgba(243,238,228,0.45)_75%)]" />
        <div className="relative -mt-[18vh] text-center lg:-mt-10">
          <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.24em] text-[#1d1b17]/50">A memory game</div>
          <h1 className="font-serif text-[52px] font-light leading-[0.95] tracking-[-0.01em] text-[#1d1b17] sm:text-[80px] lg:text-[96px]">
            London
            <br />
            <span className="italic">Rail Memory</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[22em] font-serif text-[18px] italic leading-snug text-[#1d1b17]/65 sm:text-[21px]">
            How many of London&rsquo;s {fmtInt(uniqueStations)} stations can you name? Start typing.
          </p>
        </div>
      </div>

      <IndexPanel
        p={p}
        open={open}
        onClose={closeIndex}
        tab={tab}
        setTab={setTab}
        mapMode={mapMode}
        setMapMode={setMapMode}
        isPhone={isPhone}
      />
    </div>
  )
}

// Quiet count-up; click to start or pause.
function Stopwatch() {
  const [running, setRunning] = useState(false)
  const [ms, setMs] = useState(0)
  const base = useRef(0)
  useEffect(() => {
    if (!running) return
    base.current = performance.now() - ms
    const t = setInterval(() => setMs(performance.now() - base.current), 250)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])
  const s = Math.floor(ms / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const txt = s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
  return (
    <button
      type="button"
      onClick={() => setRunning(!running)}
      title={running ? 'Pause' : 'Start'}
      className="flex items-center gap-1.5 whitespace-nowrap text-[13px] tabular-nums text-[#1d1b17]/60 hover:text-[#1d1b17]"
    >
      <span aria-hidden className="text-[9px]">{running ? '❚❚' : '▶'}</span>
      {txt}
    </button>
  )
}

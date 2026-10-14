'use client'

import { useMemo, useState } from 'react'
import type { GameShellProps } from '@/components/GamePage'
import type { DataFeature } from '@/lib/types'
import { useConfig } from '@/lib/configContext'
import { Bar, lineFill } from './Bar'
import { TOTAL_PER_LINE, foundPerLine, fmtInt, groupLines } from './atlasLines'

export type Tab = 'lines' | 'found' | 'settings'
export type MapMode = 'clean' | 'dots' | 'names'

const INK = 'text-[#1d1b17]'
const Caps = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`text-[11px] font-medium uppercase tracking-[0.14em] text-[#1d1b17]/50 ${className}`}>{children}</span>
)

export default function IndexPanel({
  p,
  open,
  onClose,
  tab,
  setTab,
  mapMode,
  setMapMode,
  isPhone,
}: {
  p: GameShellProps
  open: boolean
  onClose: () => void
  tab: Tab
  setTab: (t: Tab) => void
  mapMode: MapMode
  setMapMode: (m: MapMode) => void
  isPhone: boolean
}) {
  const { LINES } = useConfig()
  const modes = useMemo(() => groupLines(LINES), [LINES])
  const fpl = useMemo(() => foundPerLine(p.knownFound), [p.knownFound])
  const inPlay = Object.keys(LINES).filter((k) => p.enabledLines[k])
  const total = inPlay.reduce((s, k) => s + (p.stationsPerLine[k] || 0), 0)
  const raw = p.foundProportion * 100
  const pct = raw > 0 && raw < 10 ? (Math.floor(raw * 10) / 10).toFixed(1) : String(Math.floor(raw))

  return (
    <aside
      aria-label="Index"
      aria-hidden={!open}
      className={`absolute z-40 flex flex-col bg-[#f8f5ee] ${INK} transition-transform duration-300 ease-out
        inset-x-0 bottom-0 top-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[420px] lg:border-l lg:border-[#1d1b17]/12 lg:shadow-[-24px_0_48px_-32px_rgba(29,27,23,0.45)]
        ${open ? 'translate-y-0 lg:translate-x-0' : 'pointer-events-none translate-y-full lg:translate-x-full lg:translate-y-0'}`}
    >
      {/* masthead */}
      <div className="px-6 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))] lg:px-8 lg:pt-7">
        <div className="flex items-start justify-between">
          <Caps>London Rail Memory · Index</Caps>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1.5 rounded-[3px] px-2 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#1d1b17]/60 hover:bg-[#1d1b17]/5 hover:text-[#1d1b17]"
          >
            Close <span className="ml-1 hidden font-mono normal-case tracking-normal text-[#1d1b17]/35 lg:inline">esc</span>
          </button>
        </div>
        <div className="mt-3 flex items-end gap-4">
          <div className="font-serif text-[64px] font-light leading-[0.85] tabular-nums tracking-tight">
            {pct}
            <span className="text-[36px] text-[#1d1b17]/45">%</span>
          </div>
          <div className="pb-1 font-serif text-[15px] italic leading-snug text-[#1d1b17]/65">
            {fmtInt(p.found.length)} of {fmtInt(total)} stations
            <br />
            on {inPlay.length} of {Object.keys(LINES).length} lines in play
          </div>
        </div>
        {/* the whole game as one stacked bar, in line colours */}
        <div className="mt-4 flex h-[5px] w-full overflow-hidden bg-[#1d1b17]/[0.07]">
          {total > 0 &&
            modes.flatMap((m) =>
              m.keys
                .filter((k) => p.enabledLines[k] && (p.foundStationsPerLine[k] || 0) > 0)
                .map((k) => (
                  <span key={k} style={{ width: `${((p.foundStationsPerLine[k] || 0) / total) * 100}%`, ...lineFill(LINES[k]) }} />
                )),
            )}
        </div>
        <nav className="mt-5 flex gap-6 border-b border-[#1d1b17]/12" role="tablist">
          {(['lines', 'found', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 pb-2 font-serif text-[19px] capitalize transition-colors ${
                tab === t ? 'border-[#1d1b17] text-[#1d1b17]' : 'border-transparent text-[#1d1b17]/45 hover:text-[#1d1b17]/80'
              }`}
            >
              {t}
              {t === 'found' && <span className="ml-1.5 text-[12px] tabular-nums text-[#1d1b17]/40">{fmtInt(p.found.length)}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(2rem,env(safe-area-inset-bottom))] lg:px-8">
        {tab === 'lines' && <Lines p={p} modes={modes} fpl={fpl} />}
        {tab === 'found' && <Found p={p} onPick={(id) => { p.zoomToFeature(id); if (isPhone) onClose() }} />}
        {tab === 'settings' && <Settings p={p} mapMode={mapMode} setMapMode={setMapMode} />}
      </div>
    </aside>
  )
}

function Lines({ p, modes, fpl }: { p: GameShellProps; modes: ReturnType<typeof groupLines>; fpl: Record<string, number> }) {
  const { LINES } = useConfig()
  const set = (keys: string[], v: boolean) => {
    const next = { ...p.enabledLines }
    keys.forEach((k) => (next[k] = v))
    p.setEnabledLines(next)
  }
  return (
    <div className="pt-2">
      <p className="mb-1 mt-3 font-serif text-[14px] italic text-[#1d1b17]/55">Tap a line to put it in or out of play.</p>
      {modes.map((m) => {
        const on = m.keys.filter((k) => p.enabledLines[k]).length
        return (
          <section key={m.id} className="mt-6">
            <div className="mb-1 flex items-baseline justify-between border-b border-[#1d1b17]/10 pb-1.5">
              <Caps className="!text-[#1d1b17]/75">{m.title}</Caps>
              <span className="flex items-baseline gap-3 text-[12px] tabular-nums text-[#1d1b17]/45">
                {on} of {m.keys.length} in play
                <button
                  type="button"
                  onClick={() => set(m.keys, on < m.keys.length)}
                  className="font-serif text-[14px] italic text-[#1d1b17]/70 underline decoration-[#1d1b17]/25 underline-offset-2 hover:decoration-[#1d1b17]"
                >
                  {on < m.keys.length ? 'all' : 'none'}
                </button>
              </span>
            </div>
            <ul>
              {m.keys.map((k) => {
                const line = LINES[k]
                const enabled = !!p.enabledLines[k]
                const n = TOTAL_PER_LINE[k] || p.stationsPerLine[k] || 0
                const f = Math.min(fpl[k] || 0, n)
                const done = n > 0 && f >= n
                return (
                  <li key={k}>
                    <button
                      type="button"
                      aria-pressed={enabled}
                      onClick={() => set([k], !enabled)}
                      className="group grid w-full grid-cols-[14px_1fr_auto] items-center gap-x-3 rounded-[3px] py-[7px] text-left hover:bg-[#1d1b17]/[0.035]"
                    >
                      <span
                        aria-hidden
                        className={`ml-0.5 h-[11px] w-[11px] rounded-full border transition-colors ${enabled ? 'border-transparent' : 'border-[#1d1b17]/30 bg-transparent'}`}
                        style={enabled ? { background: line.color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' } : undefined}
                      />
                      <span className={`truncate font-serif text-[17px] leading-tight ${enabled ? 'text-[#1d1b17]' : 'text-[#1d1b17]/35'}`}>
                        {line.name}
                        {!enabled && <span className="ml-2 text-[10px] uppercase not-italic tracking-[0.14em] text-[#1d1b17]/35">out of play</span>}
                      </span>
                      <span className={`text-[12px] tabular-nums ${enabled ? 'text-[#1d1b17]/60' : 'text-[#1d1b17]/30'}`}>
                        {done ? <span className="text-[#1d1b17]">✓ {n}</span> : <>{f}<span className="text-[#1d1b17]/30">/{n}</span></>}
                      </span>
                      <span className="col-start-2 col-end-4 mt-[5px] block h-[5px] w-full overflow-hidden bg-[#1d1b17]/[0.07]">
                        <span
                          className={`block h-full transition-[width] duration-500 ${enabled ? '' : 'opacity-25 grayscale'}`}
                          style={{ width: n ? `${(f / n) * 100}%` : 0, ...lineFill(line) }}
                        />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function Found({ p, onPick }: { p: GameShellProps; onPick: (id: number) => void }) {
  const { LINES } = useConfig()
  const [sort, setSort] = useState<'recent' | 'az'>('recent')
  const [filter, setFilter] = useState('')
  const groups = useMemo(() => {
    const byName = new Map<string, DataFeature[]>()
    const order: string[] = []
    for (let i = 0; i < p.found.length; i++) {
      const f = p.idMap.get(p.found[i])
      if (!f) continue
      const n = f.properties.name
      if (!byName.has(n)) {
        byName.set(n, [])
        order.push(n)
      }
      byName.get(n)!.push(f)
    }
    const s = filter.trim().toLowerCase()
    let names = s ? order.filter((n) => n.toLowerCase().includes(s)) : order
    if (sort === 'az') names = names.slice().sort((a, b) => a.localeCompare(b))
    return names.map((n) => ({
      name: n,
      features: byName.get(n)!.slice().sort((a, b) => (LINES[a.properties.line!]?.order ?? 99) - (LINES[b.properties.line!]?.order ?? 99)),
    }))
  }, [p.found, p.idMap, filter, sort, LINES])

  if (p.found.length === 0)
    return <p className="mt-10 text-center font-serif text-[18px] italic text-[#1d1b17]/50">Nothing yet. Every station you name is listed here.</p>

  return (
    <div className="pt-4">
      <div className="sticky top-0 z-10 -mx-1 flex items-center gap-3 bg-[#f8f5ee] px-1 pb-2 pt-1">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter"
          className="min-w-0 flex-1 border-b border-[#1d1b17]/15 bg-transparent py-1 font-serif text-[16px] outline-none placeholder:italic placeholder:text-[#1d1b17]/35 focus:border-[#1d1b17]/50"
        />
        <div className="flex gap-3 text-[11px] font-medium uppercase tracking-[0.14em]">
          {(['recent', 'az'] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)} className={sort === s ? 'text-[#1d1b17]' : 'text-[#1d1b17]/35 hover:text-[#1d1b17]/70'}>
              {s === 'recent' ? 'Recent' : 'A–Z'}
            </button>
          ))}
        </div>
      </div>
      <ol>
        {groups.map((g) => {
          const id = g.features[0].id as number
          const hovered = g.features.some((f) => f.id === p.hoveredId)
          return (
            <li key={g.name}>
              <button
                type="button"
                onClick={() => onPick(id)}
                onMouseEnter={() => p.setHoveredId(id)}
                onMouseLeave={() => p.setHoveredId(null)}
                className={`flex w-full items-center gap-3 border-b border-[#1d1b17]/[0.06] py-[7px] text-left ${hovered ? 'bg-[#1d1b17]/[0.04]' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate font-serif text-[17px] leading-tight">{g.name}</span>
                <span className="flex shrink-0 gap-[3px]">
                  {g.features.map((f) => (
                    <Bar key={f.id as number} line={LINES[f.properties.line!]} w={12} h={4} />
                  ))}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {groups.length === 0 && <p className="mt-6 font-serif italic text-[#1d1b17]/50">No match.</p>}
    </div>
  )
}

function Settings({ p, mapMode, setMapMode }: { p: GameShellProps; mapMode: MapMode; setMapMode: (m: MapMode) => void }) {
  const [about, setAbout] = useState(false)
  const Row = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-4 border-b border-[#1d1b17]/10 py-4">
      <div>
        <div className="font-serif text-[18px] leading-tight">{title}</div>
        {note && <div className="mt-0.5 font-serif text-[14px] italic leading-snug text-[#1d1b17]/50">{note}</div>}
      </div>
      {children}
    </div>
  )
  const modeNote = { clean: 'Only the stations you have named', dots: 'Every station as a dot, names hidden', names: 'Dots, with names of found stations' }[mapMode]
  return (
    <div className="pt-2">
      <Row title="Map" note={modeNote}>
        <div role="radiogroup" className="flex shrink-0 rounded-[3px] border border-[#1d1b17]/20 p-[2px]">
          {(['clean', 'dots', 'names'] as MapMode[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mapMode === m}
              onClick={() => setMapMode(m)}
              className={`rounded-[2px] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
                mapMode === m ? 'bg-[#1d1b17] text-[#f8f5ee]' : 'text-[#1d1b17]/55 hover:text-[#1d1b17]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </Row>
      <Row title="Timer" note="A quiet stopwatch beside the score">
        <button
          role="switch"
          aria-checked={p.showTimer}
          onClick={() => p.setShowTimer(!p.showTimer)}
          className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors ${p.showTimer ? 'bg-[#1d1b17]' : 'bg-[#1d1b17]/20'}`}
        >
          <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-[#f8f5ee] transition-all ${p.showTimer ? 'left-[21px]' : 'left-[3px]'}`} />
          <span className="sr-only">Timer</span>
        </button>
      </Row>
      <div className="border-b border-[#1d1b17]/10 py-4">
        <button onClick={() => setAbout(!about)} className="flex w-full items-baseline justify-between text-left">
          <span className="font-serif text-[18px]">How to play &amp; about</span>
          <span className="text-[12px] text-[#1d1b17]/40">{about ? '−' : '+'}</span>
        </button>
        {about && (
          <div className="mt-2 space-y-2 font-serif text-[15px] leading-relaxed text-[#1d1b17]/75">
            <p>Type the name of any station on the lines in play and press Enter. It lights up on the map, on every line that calls there. Your progress is saved in this browser.</p>
            <p>Type <span className="font-mono text-[13px]">/</span> in the field for shortcuts.</p>
            <p className="text-[#1d1b17]/55">
              By AJ Taggart, based on{' '}
              <a className="underline decoration-[#1d1b17]/25 underline-offset-2" href="https://github.com/benjamintd/metro-memory.com" target="_blank" rel="noreferrer">
                metro-memory.com
              </a>{' '}
              by Benjamin Tran Dinh (MIT). Line data: TfL Open Data and OpenStreetMap contributors.
            </p>
          </div>
        )}
      </div>
      <div className="mt-10 flex gap-6">
        <button onClick={p.revealAll} className="font-serif text-[16px] italic text-[#1d1b17]/60 underline decoration-[#1d1b17]/20 underline-offset-4 hover:text-[#1d1b17]">
          Reveal all stations
        </button>
        <button onClick={p.onReset} className="font-serif text-[16px] italic text-[#1d1b17] underline decoration-[#1d1b17]/30 underline-offset-4 hover:decoration-[#1d1b17]">
          Start over
        </button>
      </div>
    </div>
  )
}

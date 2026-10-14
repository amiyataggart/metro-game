'use client'

import classNames from 'classnames'
import { useMemo, useState } from 'react'
import type { GameShellProps } from '@/components/GamePage'
import type { Line } from '@/lib/types'
import type { KeyGroup, GroupId } from './groups'
import { GroupPip, LinePip, LineStripe, LineDots, fmtInt, hexA } from './parts'

type Common = {
  p: GameShellProps
  LINES: Record<string, Line>
  groups: KeyGroup[]
  pulse: Set<string>
  markLines: Set<string>
  setIsolate: (keys: string[] | null) => void
  afterToggle: () => void
  touch: boolean
}

/* ------------------------------------------------------------------ */
/* The grouped key                                                     */
/* ------------------------------------------------------------------ */

export function KeyGroups(c: Common) {
  const { p, groups } = c
  const [open, setOpen] = useState<Partial<Record<GroupId, boolean>>>({})
  return (
    <div className="flex flex-col">
      {groups.map((g) => {
        const anyOn = g.keys.some((k) => p.enabledLines[k])
        const isOpen = open[g.id] ?? anyOn
        return (
          <Group
            key={g.id}
            {...c}
            g={g}
            open={isOpen}
            setOpen={(v) => setOpen((o) => ({ ...o, [g.id]: v }))}
          />
        )
      })}
    </div>
  )
}

function Group({
  p,
  LINES,
  g,
  open,
  setOpen,
  pulse,
  markLines,
  setIsolate,
  afterToggle,
  touch,
}: Common & { g: KeyGroup; open: boolean; setOpen: (v: boolean) => void }) {
  const on = g.keys.filter((k) => p.enabledLines[k])
  const state: 'all' | 'some' | 'none' = on.length === g.keys.length ? 'all' : on.length ? 'some' : 'none'
  const total = on.reduce((s, k) => s + (p.stationsPerLine[k] || 0), 0)
  const got = on.reduce((s, k) => s + (p.foundStationsPerLine[k] || 0), 0)
  const toggleGroup = () => {
    const next = { ...p.enabledLines }
    const v = state !== 'all'
    g.keys.forEach((k) => (next[k] = v))
    p.setEnabledLines(next)
    if (v) setOpen(true)
    afterToggle()
  }
  return (
    <section className="border-t border-zinc-900/90 first:border-t-0">
      <div
        className="group/h flex items-center gap-2.5 px-5 pb-1.5 pt-3"
        onMouseEnter={() => !touch && setIsolate(g.keys)}
        onMouseLeave={() => !touch && setIsolate(null)}
      >
        <button
          type="button"
          onClick={toggleGroup}
          className="-m-1.5 rounded-full p-1.5 hover:bg-zinc-200/70"
          aria-label={state === 'all' ? `Take all ${g.name} lines out of play` : `Put all ${g.name} lines in play`}
          title={state === 'all' ? 'Take all out of play' : 'Put all in play'}
        >
          <GroupPip state={state} />
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 grow items-center gap-1.5 text-left"
          aria-expanded={open}
        >
          <span className="truncate text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-900">{g.name}</span>
          <svg viewBox="0 0 10 10" className={classNames('h-2.5 w-2.5 shrink-0 text-zinc-400 transition-transform', open ? 'rotate-0' : '-rotate-90')}>
            <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums text-zinc-500">
            {state === 'none' ? (
              <span className="rounded border border-dashed border-zinc-400 px-1.5 py-px text-[10px] uppercase tracking-wider text-zinc-500">off</span>
            ) : (
              <>
                <span className="text-zinc-900">{fmtInt(got)}</span>
                <span className="text-zinc-400"> / {fmtInt(total)}</span>
              </>
            )}
          </span>
        </button>
      </div>
      {/* summary bar: one segment per in-play line, width ∝ its stations */}
      <button type="button" onClick={() => setOpen(!open)} className="block w-full px-5 pb-2.5" tabIndex={-1} aria-hidden>
        {state === 'none' ? (
          <div className="h-[5px] rounded-full border border-dashed border-zinc-300" />
        ) : (
          <div className="flex h-[5px] gap-[2px] overflow-hidden rounded-full">
            {on.map((k) => {
              const t = p.stationsPerLine[k] || 1
              const f = (p.foundStationsPerLine[k] || 0) / t
              return (
                <div key={k} className="relative h-full" style={{ flexGrow: t, flexBasis: 0, background: hexA(LINES[k].color, 0.2) }}>
                  <div className="absolute inset-y-0 left-0" style={{ width: `${f * 100}%`, background: LINES[k].color, transition: 'width 600ms' }} />
                </div>
              )
            })}
          </div>
        )}
      </button>
      {open && (
        <ul className="pb-2">
          {g.keys.map((k) => (
            <LineRow
              key={k}
              k={k}
              line={LINES[k]}
              p={p}
              pulse={pulse.has(k)}
              mark={markLines.has(k)}
              setIsolate={setIsolate}
              afterToggle={afterToggle}
              touch={touch}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function LineRow({
  k,
  line,
  p,
  pulse,
  mark,
  setIsolate,
  afterToggle,
  touch,
}: {
  k: string
  line: Line
  p: GameShellProps
  pulse: boolean
  mark: boolean
  setIsolate: (keys: string[] | null) => void
  afterToggle: () => void
  touch: boolean
}) {
  const on = !!p.enabledLines[k]
  const total = p.stationsPerLine[k] || 0
  const got = p.foundStationsPerLine[k] || 0
  const frac = total ? got / total : 0
  const done = on && total > 0 && got >= total
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          p.setEnabledLines({ ...p.enabledLines, [k]: !on })
          if (!touch) setIsolate([k])
          afterToggle()
        }}
        onMouseEnter={() => !touch && setIsolate([k])}
        onMouseLeave={() => !touch && setIsolate(null)}
        title={on ? `${line.name}: click to take out of play` : `${line.name}: click to put in play`}
        aria-pressed={on}
        className={classNames(
          'group/r relative flex w-full items-center gap-3 px-5 text-left transition-colors duration-700',
          touch ? 'h-11' : 'h-[34px]',
          pulse ? 'bg-amber-100 duration-0' : mark ? 'bg-zinc-200/60' : 'hover:bg-zinc-900/[0.045]',
        )}
      >
        {mark && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r" style={{ background: line.color }} />}
        <LinePip color={line.color} on={on} />
        <LineStripe line={line} frac={frac} on={on} width={touch ? 56 : 64} />
        <span
          className={classNames(
            'min-w-0 grow truncate text-[14.5px] leading-tight',
            on ? 'font-bold text-zinc-900' : 'text-zinc-400',
          )}
        >
          {line.name}
        </span>
        <span className="shrink-0 text-right text-[12.5px] tabular-nums">
          {!on ? (
            <span className="text-zinc-400 group-hover/r:hidden">off</span>
          ) : done ? (
            <span className="inline-flex items-center gap-1 font-bold text-zinc-900">
              <svg viewBox="0 0 12 12" className="h-3 w-3 text-amber-500" fill="currentColor"><path d="M6 .8l1.6 3.4 3.7.4-2.8 2.5.8 3.7L6 9 2.7 10.8l.8-3.7L.7 4.6l3.7-.4z" /></svg>
              {total}
            </span>
          ) : (
            <span className="group-hover/r:hidden">
              <span className="font-bold text-zinc-900">{got}</span>
              <span className="text-zinc-400">/{total}</span>
            </span>
          )}
          {!touch && !done && (
            <span className="hidden text-[11px] font-bold uppercase tracking-wider text-zinc-500 group-hover/r:inline">
              {on ? 'remove' : 'add'}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Recent finds                                                        */
/* ------------------------------------------------------------------ */

export function Recent({ p, LINES, touch, limit = 12 }: { p: GameShellProps; LINES: Record<string, Line>; touch: boolean; limit?: number }) {
  const items = useMemo(() => {
    const out: { name: string; ids: number[]; lines: string[] }[] = []
    const byName = new Map<string, { name: string; ids: number[]; lines: string[] }>()
    p.found.forEach((id) => {
      const f = p.idMap.get(id)
      if (!f) return
      const name = f.properties.name
      let e = byName.get(name)
      if (!e) {
        e = { name, ids: [], lines: [] }
        byName.set(name, e)
        out.push(e)
      }
      e.ids.push(id)
      const l = f.properties.line
      if (l && !e.lines.includes(l)) e.lines.push(l)
    })
    const top = out.slice(0, limit)
    top.forEach((e) => e.lines.sort((a, b) => (LINES[a]?.order ?? 99) - (LINES[b]?.order ?? 99)))
    return top
  }, [p.found, p.idMap, LINES, limit])

  return (
    <section className="border-t border-zinc-900/90 px-5 pb-4 pt-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-900">Recent</h3>
        <span className="text-[12px] tabular-nums text-zinc-400">{fmtInt(p.found.length)} found</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] leading-snug text-zinc-400">Your finds will appear here, newest first.</p>
      ) : (
        <ol className="-mx-2">
          {items.map((e) => (
            <li key={e.name}>
              <button
                type="button"
                onClick={() => p.zoomToFeature(e.ids[0])}
                onMouseEnter={() => !touch && p.setHoveredId(e.ids[0])}
                onMouseLeave={() => !touch && p.setHoveredId(null)}
                className={classNames(
                  'flex w-full items-center gap-2 rounded-md px-2 text-left hover:bg-zinc-900/[0.045]',
                  touch ? 'h-10' : 'h-7',
                  p.hoveredId != null && e.ids.includes(p.hoveredId) && 'bg-zinc-900/[0.06]',
                )}
              >
                <LineDots lines={e.lines} LINES={LINES} />
                <span className="min-w-0 grow truncate text-[14px] text-zinc-800">{e.name}</span>
                <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-zinc-300" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="6" cy="6" r="4" />
                  <path d="M6 0v2.5M6 9.5V12M0 6h2.5M9.5 6H12" />
                </svg>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Settings: one place                                                 */
/* ------------------------------------------------------------------ */

export type Detail = 'clean' | 'dots' | 'names'

export function detailOf(p: GameShellProps): Detail {
  if (p.showFoundLabels) return 'names'
  if (p.showAllStations) return 'dots'
  return 'clean'
}

export function setDetail(p: GameShellProps, d: Detail) {
  p.setShowAllStations(d !== 'clean')
  p.setShowFoundLabels(d === 'names')
}

export function MapDetail({ p, touch }: { p: GameShellProps; touch: boolean }) {
  const d = detailOf(p)
  const opts: { id: Detail; label: string; icon: React.ReactNode }[] = [
    {
      id: 'clean',
      label: 'Clean',
      icon: <path d="M2 10c3-6 9-6 12 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
    },
    {
      id: 'dots',
      label: 'Dots',
      icon: (
        <>
          <path d="M2 10c3-6 9-6 12 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".35" />
          <circle cx="4" cy="7.4" r="1.8" fill="currentColor" />
          <circle cx="8" cy="5.5" r="1.8" fill="currentColor" />
          <circle cx="12" cy="7.4" r="1.8" fill="currentColor" />
        </>
      ),
    },
    {
      id: 'names',
      label: 'Names',
      icon: (
        <>
          <circle cx="4" cy="10" r="1.8" fill="currentColor" />
          <rect x="7" y="4" width="8" height="2" rx="1" fill="currentColor" />
          <rect x="7" y="9" width="6" height="2" rx="1" fill="currentColor" />
        </>
      ),
    },
  ]
  return (
    <div role="radiogroup" aria-label="Map detail" className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-200/70 p-1">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={d === o.id}
          onClick={() => setDetail(p, o.id)}
          className={classNames(
            'flex items-center justify-center gap-1.5 rounded-md text-[13px] font-bold transition-colors',
            touch ? 'h-10' : 'h-8',
            d === o.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
          )}
        >
          <svg viewBox="0 0 16 14" className="h-3.5 w-4">{o.icon}</svg>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsBar({
  p,
  touch,
  openAbout,
}: {
  p: GameShellProps
  touch: boolean
  openAbout: () => void
}) {
  const btn = classNames(
    'inline-flex items-center justify-center gap-1.5 rounded-md px-2 text-[12.5px] font-bold transition-colors',
    touch ? 'h-10' : 'h-8',
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="w-12 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Map</span>
        <div className="grow">
          <MapDetail p={p} touch={touch} />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => p.setShowTimer(!p.showTimer)}
          aria-pressed={p.showTimer}
          className={classNames(btn, p.showTimer ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-200/70')}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="8" cy="9" r="5.5" />
            <path d="M8 6.2V9l1.8 1.2M6.5 1.5h3" strokeLinecap="round" />
          </svg>
          Timer
        </button>
        <button type="button" onClick={openAbout} className={classNames(btn, 'text-zinc-600 hover:bg-zinc-200/70')}>
          About
        </button>
        <span className="grow" />
        <button type="button" onClick={p.revealAll} className={classNames(btn, 'text-zinc-600 hover:bg-zinc-200/70')}>
          Reveal all
        </button>
        <button type="button" onClick={p.onReset} className={classNames(btn, 'text-red-700 hover:bg-red-50')}>
          Start over
        </button>
      </div>
    </div>
  )
}

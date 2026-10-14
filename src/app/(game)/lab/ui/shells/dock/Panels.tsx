'use client'

import { useMemo, useState } from 'react'
import type { Line, DataFeature } from '@/lib/types'
import LineSwatch from '@/components/LineSwatch'
import { defaultEnabledLines } from '@/lib/defaultEnabledLines'
import { LineGroup, isDarkColor, modeOf, uiColor } from './lines'

type LineStats = {
  LINES: Record<string, Line>
  found: Record<string, number>
  total: Record<string, number>
  enabled: Record<string, boolean>
  setEnabled: (v: Record<string, boolean>) => void
}

// ---------------------------------------------------------------- Lines

export function LinesList({
  groups,
  LINES,
  found,
  total,
  enabled,
  setEnabled,
  dense,
}: LineStats & { groups: LineGroup[]; dense?: boolean }) {
  const keys = Object.keys(LINES)
  const apply = (next: Record<string, boolean>) => {
    if (!keys.some((k) => next[k])) return // never leave nothing in play
    setEnabled(next)
  }
  const toggle = (k: string) => apply({ ...enabled, [k]: !enabled[k] })
  const presets: { id: string; label: string; v: Record<string, boolean> }[] = [
    { id: 'tfl', label: 'TfL', v: Object.fromEntries(keys.map((k) => [k, modeOf(k, LINES[k]) !== 'rail'])) },
    { id: 'def', label: 'TfL + Thameslink', v: defaultEnabledLines(LINES) },
    { id: 'all', label: 'Everything', v: Object.fromEntries(keys.map((k) => [k, true])) },
  ]
  const same = (v: Record<string, boolean>) => keys.every((k) => !!v[k] === !!enabled[k])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => apply(p.v)}
            className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
              same(p.v) ? 'bg-amber-300 text-zinc-900' : 'bg-white/[0.07] text-white/70 hover:bg-white/15'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {groups.map((g) => {
        const onKeys = g.keys.filter((k) => enabled[k])
        const n = onKeys.reduce((s, k) => s + (found[k] ?? 0), 0)
        const N = onKeys.reduce((s, k) => s + (total[k] ?? 0), 0)
        const allOn = onKeys.length === g.keys.length
        return (
          <section key={g.mode.id}>
            <header className="mb-1.5 flex items-baseline gap-2 border-b border-white/10 pb-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{g.mode.name}</h3>
              {N > 0 && (
                <span className="text-[11px] font-semibold tabular-nums text-white/35">
                  {Math.round((n / N) * 100)}% · {n}/{N}
                </span>
              )}
              <button
                type="button"
                onClick={() => apply({ ...enabled, ...Object.fromEntries(g.keys.map((k) => [k, !allOn])) })}
                className="ml-auto text-[11px] font-bold text-white/45 hover:text-amber-300"
              >
                {allOn ? 'All off' : 'All on'}
              </button>
            </header>
            <ul className={dense ? 'space-y-0' : 'space-y-0.5'}>
              {g.keys.map((k) => {
                const line = LINES[k]
                const on = !!enabled[k]
                const a = found[k] ?? 0
                const b = total[k] ?? 0
                const done = on && b > 0 && a === b
                return (
                  <li key={k}>
                    <button
                      type="button"
                      onClick={() => toggle(k)}
                      aria-pressed={on}
                      className={`group flex w-full items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-white/[0.06] ${dense ? 'py-1' : 'py-1.5'}`}
                    >
                      <span className={`flex rounded-full ${isDarkColor(line.color) ? 'ring-1 ring-white/40' : ''} ${on ? '' : 'opacity-40 grayscale'}`}>
                        <LineSwatch line={line} size="md" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`flex items-baseline gap-2 text-sm font-bold ${on ? 'text-white' : 'text-white/40'}`}>
                          <span className="truncate">{line.name}</span>
                          <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-white/55">
                            {on ? (done ? `★ ${a}/${b}` : `${a}/${b}`) : 'not in play'}
                          </span>
                        </span>
                        {on && (
                          <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-white/10">
                            <span
                              className="block h-full rounded-full transition-[width] duration-700"
                              style={{ width: `${b ? (a / b) * 100 : 0}%`, background: uiColor(line) }}
                            />
                          </span>
                        )}
                      </span>
                      <span
                        aria-hidden
                        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? 'bg-white/80' : 'bg-white/15 group-hover:bg-white/25'}`}
                      >
                        <span
                          className={`absolute top-0.5 h-3 w-3 rounded-full transition-[left] ${on ? 'left-[14px] bg-zinc-900' : 'left-0.5 bg-white/50'}`}
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

// ---------------------------------------------------------------- Found

export function FoundPanel({
  found,
  idMap,
  LINES,
  hoveredId,
  setHoveredId,
  onPick,
}: {
  found: number[]
  idMap: Map<number, DataFeature>
  LINES: Record<string, Line>
  hoveredId: number | null
  setHoveredId: (id: number | null) => void
  onPick: (id: number) => void
}) {
  const [sort, setSort] = useState<'recent' | 'az'>('recent')
  const [q, setQ] = useState('')
  // One row per station name (an interchange is one row with all its lines).
  const rows = useMemo(() => {
    const byName = new Map<string, { id: number; name: string; lines: string[] }>()
    const order: string[] = []
    found.forEach((id) => {
      const f = idMap.get(id)
      if (!f) return
      const name = f.properties.name
      let r = byName.get(name)
      if (!r) {
        r = { id, name, lines: [] }
        byName.set(name, r)
        order.push(name)
      }
      const l = f.properties.line
      if (l && !r.lines.includes(l)) r.lines.push(l)
    })
    const list = order.map((n) => byName.get(n)!)
    list.forEach((r) => r.lines.sort((a, b) => (LINES[a]?.order ?? 99) - (LINES[b]?.order ?? 99)))
    if (sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [found, idMap, LINES, sort])
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : rows

  if (rows.length === 0)
    return (
      <div className="px-2 py-10 text-center text-sm text-white/45">
        Nothing yet. Every station you name lands here.
      </div>
    )

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { v: 'recent', label: 'Recent' },
            { v: 'az', label: 'A–Z' },
          ]}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter found"
          aria-label="Filter found stations"
          className="h-8 min-w-0 flex-1 rounded-full bg-white/[0.07] px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-amber-300/60"
        />
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {shown.map((r) => (
          <li key={r.name}>
            <button
              type="button"
              onClick={() => onPick(r.id)}
              onMouseEnter={() => setHoveredId(r.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`flex w-full items-center gap-3 rounded-md px-1.5 py-2 text-left transition-colors hover:bg-white/[0.06] ${
                hoveredId === r.id ? 'bg-white/[0.06]' : ''
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{r.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {r.lines.map((l) => (
                  <span key={l} className={`flex rounded-full ${LINES[l] && isDarkColor(LINES[l].color) ? 'ring-1 ring-white/40' : ''}`}>
                    <LineSwatch line={LINES[l]} size="xs" />
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------- Settings

export type Hints = 'clean' | 'dots' | 'names'

export function SettingsPanel({
  hints,
  setHints,
  showTimer,
  setShowTimer,
  onReset,
  revealAll,
  openAbout,
}: {
  hints: Hints
  setHints: (h: Hints) => void
  showTimer: boolean
  setShowTimer: (v: boolean) => void
  onReset: () => void
  revealAll: () => void
  openAbout: () => void
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Map hints</h3>
        <p className="mb-2.5 text-xs text-white/40">How much the map gives away.</p>
        <Segmented
          wide
          value={hints}
          onChange={setHints}
          options={[
            { v: 'clean', label: 'Clean' },
            { v: 'dots', label: 'Dots' },
            { v: 'names', label: 'Dots + names' },
          ]}
        />
      </section>
      <section>
        <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Timer</h3>
        <button
          type="button"
          onClick={() => setShowTimer(!showTimer)}
          aria-pressed={showTimer}
          className="flex w-full items-center justify-between rounded-xl bg-white/[0.05] px-3 py-2.5 text-sm font-bold text-white"
        >
          Show a stopwatch in the progress pill
          <span className={`relative h-6 w-10 rounded-full transition-colors ${showTimer ? 'bg-amber-300' : 'bg-white/20'}`}>
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${showTimer ? 'left-[18px]' : 'left-0.5'}`}
            />
          </span>
        </button>
      </section>
      <section>
        <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Game</h3>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={revealAll} className="rounded-xl bg-white/[0.05] px-2 py-2.5 text-sm font-bold text-white/80 hover:bg-white/10">
            Reveal all
          </button>
          <button type="button" onClick={onReset} className="rounded-xl bg-red-500/20 px-2 py-2.5 text-sm font-bold text-red-300 ring-1 ring-red-400/30 hover:bg-red-500/30">
            Start over
          </button>
          <button type="button" onClick={openAbout} className="rounded-xl bg-white/[0.05] px-2 py-2.5 text-sm font-bold text-white/80 hover:bg-white/10">
            About
          </button>
        </div>
      </section>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  wide,
}: {
  value: T
  onChange: (v: T) => void
  options: { v: T; label: string; count?: number }[]
  wide?: boolean
}) {
  return (
    <div role="tablist" className={`flex rounded-full bg-white/[0.07] p-0.5 ${wide ? 'w-full' : ''}`}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="tab"
          aria-selected={value === o.v}
          onClick={() => onChange(o.v)}
          className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-bold transition-colors ${
            wide ? 'flex-1' : ''
          } ${value === o.v ? 'bg-white text-zinc-900 shadow' : 'text-white/60 hover:text-white'}`}
        >
          {o.label}
          {o.count != null && (
            <span className={`text-[11px] tabular-nums ${value === o.v ? 'text-zinc-500' : 'text-white/35'}`}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

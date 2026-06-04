'use client'

import { useState } from 'react'
import { useConfig } from '@/lib/configContext'
import LineSwatch from './LineSwatch'

// Operator umbrellas. Toggling a group flips all its lines; expanding it lets
// you pick individual lines. Order matches how a Londoner thinks about them.
const GROUPS: { name: string; lines: string[] }[] = [
  {
    name: 'London Underground',
    lines: [
      'Bakerloo', 'Central', 'Circle', 'District', 'HammersmithAndCity',
      'Jubilee', 'Metropolitan', 'Northern', 'Piccadilly', 'Victoria',
      'WaterlooAndCity',
    ],
  },
  {
    name: 'London Overground',
    lines: ['Liberty', 'Lioness', 'Mildmay', 'Suffragette', 'Weaver', 'Windrush'],
  },
  { name: 'Elizabeth Line (Crossrail)', lines: ['ElizabethLine'] },
  { name: 'Docklands Light Railway (DLR)', lines: ['DLR'] },
  { name: 'London Trams', lines: ['Tramlink'] },
  { name: 'Thameslink', lines: ['Thameslink'] },
  {
    name: 'National Rail',
    // alphabetical by display name (c2c, Chiltern Railways, East Midlands…)
    lines: [
      'C2c', 'Chiltern', 'EastMidlandsRailway', 'GatwickExpress', 'GreatNorthern',
      'GreatWesternRailway', 'GreaterAnglia', 'HeathrowExpress', 'SouthWesternRailway',
      'Southeastern', 'SoutheasternHighSpeed', 'Southern',
    ],
  },
]

export default function LinePicker({
  enabledLines,
  setEnabledLines,
}: {
  enabledLines: Record<string, boolean>
  setEnabledLines: (next: Record<string, boolean>) => void
}) {
  const { LINES } = useConfig()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const groups = GROUPS.map((g) => ({
    ...g,
    lines: g.lines.filter((l) => LINES[l]),
  })).filter((g) => g.lines.length)

  const isOn = (l: string) => !!enabledLines[l]
  const setLines = (lines: string[], value: boolean) => {
    const next = { ...enabledLines }
    for (const l of lines) next[l] = value
    setEnabledLines(next)
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Choose visible lines"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-500 shadow hover:text-gray-800"
      >
        {/* tune / filter icon */}
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="7" x2="20" y2="7" />
          <circle cx="9" cy="7" r="2.2" fill="white" />
          <line x1="4" y1="14" x2="20" y2="14" />
          <circle cx="15" cy="14" r="2.2" fill="white" />
          <line x1="4" y1="21" x2="20" y2="21" />
          <circle cx="8" cy="21" r="2.2" fill="white" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-lg bg-white p-2 text-left shadow-xl ring-1 ring-black/5">
          <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Lines shown
          </p>
          {groups.map((g) => {
            const onCount = g.lines.filter(isOn).length
            const allOn = onCount === g.lines.length
            const isSingle = g.lines.length === 1
            const open = expanded === g.name
            return (
              <div key={g.name} className="border-t border-gray-100 first:border-t-0">
                <div className="flex items-center gap-1 py-1.5">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = onCount > 0 && !allOn
                    }}
                    onChange={() => setLines(g.lines, !allOn)}
                    className="h-4 w-4 rounded border-gray-300 text-zinc-700 focus:ring-zinc-500"
                  />
                  <span className="flex-1 truncate text-sm font-medium text-gray-900">
                    {g.name}
                    {!isSingle && (
                      <span className="ml-1 text-xs font-normal text-gray-400">
                        {onCount}/{g.lines.length}
                      </span>
                    )}
                  </span>
                  {!isSingle && (
                    <button
                      type="button"
                      aria-label="Expand"
                      onClick={() => setExpanded(open ? null : g.name)}
                      className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor">
                        <path d="M5.5 7.5L10 12l4.5-4.5z" />
                      </svg>
                    </button>
                  )}
                </div>
                {open && !isSingle && (
                  <div className="pb-1 pl-5">
                    {g.lines.map((l) => (
                      <label
                        key={l}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={isOn(l)}
                          onChange={() => setLines([l], !isOn(l))}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-zinc-700 focus:ring-zinc-500"
                        />
                        <LineSwatch line={LINES[l]} size="sm" />
                        <span className="truncate text-sm text-gray-800">
                          {LINES[l].name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

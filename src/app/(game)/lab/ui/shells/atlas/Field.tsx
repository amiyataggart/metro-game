'use client'

import { useCallback, useEffect, useMemo, useRef, useState, KeyboardEventHandler } from 'react'
import maplibregl from 'maplibre-gl'
import type { Feature, Point } from 'geojson'
import type { GameShellProps } from '@/components/GamePage'
import { useConfig } from '@/lib/configContext'
import { selectNewIds } from '@/lib/matching'
import { Bar } from './Bar'

export type Command = { cmd: string; label: string; hint?: string; run: () => void }

type Feedback =
  | { kind: 'found'; name: string; lines: string[]; first: boolean }
  | { kind: 'already'; name: string }
  | { kind: 'none'; q: string }
  | { kind: 'ambiguous'; q: string }

// The single field: guesses stations; a leading "/" turns it into a command list.
export default function Field({
  p,
  commands,
  onFirstKey,
  trailing,
  placeholder,
}: {
  p: GameShellProps
  commands: Command[]
  onFirstKey: () => void
  trailing?: React.ReactNode
  placeholder: string
}) {
  const { LINES } = useConfig()
  const [q, setQ] = useState('')
  const [fb, setFb] = useState<Feedback | null>(null)
  const [shake, setShake] = useState(false)
  const [sel, setSel] = useState(0)
  const fbTimer = useRef<ReturnType<typeof setTimeout>>()

  const say = useCallback((f: Feedback, ms: number) => {
    clearTimeout(fbTimer.current)
    setFb(f)
    fbTimer.current = setTimeout(() => setFb(null), ms)
  }, [])
  useEffect(() => () => clearTimeout(fbTimer.current), [])

  const isCmd = q.startsWith('/')
  const matches = useMemo(() => {
    if (!isCmd) return []
    const s = q.slice(1).trim().toLowerCase()
    return commands.filter((c) => c.cmd.startsWith(s) || c.label.toLowerCase().includes(s))
  }, [q, isCmd, commands])
  useEffect(() => setSel(0), [q])

  const flyTo = useCallback(
    (id: number) => {
      const map = p.map
      const f = p.idMap.get(id) as Feature<Point> | undefined
      if (!map || !f) return
      const [lng, lat] = f.geometry.coordinates
      // keyboard-aware: keep the station above an on-screen keyboard
      const vv = window.visualViewport
      const kb = vv ? Math.max(0, window.innerHeight - vv.height) : 0
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13), duration: 600, offset: kb > 0 ? [0, -kb / 2] : [0, 0] })
    },
    [p.map, p.idMap],
  )

  const run = (c: Command) => {
    setQ('')
    c.run()
  }

  const onKeyDown: KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (isCmd) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSel((s) => Math.min(s + 1, matches.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSel((s) => Math.max(s - 1, 0))
      } else if (e.key === 'Escape') {
        setQ('')
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (matches[sel]) run(matches[sel])
      }
      return
    }
    if (e.key !== 'Enter' || !q.trim()) return
    e.preventDefault()
    const result = p.matcher(q)
    if (result.kind === 'ambiguous') return say({ kind: 'ambiguous', q }, 2200)
    if (result.kind === 'none') {
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return say({ kind: 'none', q }, 1800)
    }
    const { fresh, allFound } = selectNewIds(result.ids, p.knownFound || [])
    if (allFound) {
      const name = p.idMap.get(result.ids[0])?.properties.name ?? q
      flyTo(result.ids[0])
      setQ('')
      return say({ kind: 'already', name }, 2000)
    }
    const first = p.knownFound.length === 0
    const map = p.map
    if (map) {
      const src = map.getSource('hovered') as maplibregl.GeoJSONSource | undefined
      src?.setData({ type: 'FeatureCollection', features: fresh.map((id) => p.idMap.get(id)!).filter(Boolean) as any })
      setTimeout(() => src?.setData({ type: 'FeatureCollection', features: [] }), 1500)
    }
    flyTo(fresh[0])
    p.setFound([...fresh, ...(p.knownFound || [])])
    p.setIsNewPlayer(false)
    const name = p.idMap.get(fresh[0])?.properties.name ?? q
    const lines = Array.from(new Set(fresh.map((id) => p.idMap.get(id)?.properties.line).filter(Boolean) as string[])).sort(
      (a, b) => (LINES[a]?.order ?? 99) - (LINES[b]?.order ?? 99),
    )
    say({ kind: 'found', name, lines, first }, first ? 6000 : 3200)
    setQ('')
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div
        className={`flex items-center gap-3 rounded-[3px] border border-[#1d1b17]/15 bg-[#fbf9f4]/95 pl-4 pr-2 shadow-[0_1px_0_rgba(29,27,23,0.04),0_12px_32px_-14px_rgba(29,27,23,0.35)] backdrop-blur transition-colors focus-within:border-[#1d1b17]/45 ${shake ? 'animate-shake' : ''}`}
      >
        <input
          ref={p.inputRef}
          id="input"
          type="text"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="go"
          aria-label="Name a station"
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            if (!q && e.target.value) onFirstKey()
            setQ(e.target.value)
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-3 font-serif text-[1.375rem] leading-none text-[#1d1b17] caret-[#1d1b17] outline-none placeholder:italic placeholder:text-[#1d1b17]/40 sm:py-[0.9rem] sm:text-[1.5rem]"
        />
        {!q && (
          <kbd className="hidden select-none rounded-[3px] border border-[#1d1b17]/15 px-1.5 font-sans text-[11px] leading-5 text-[#1d1b17]/40 lg:block" title="Type / for commands">
            /
          </kbd>
        )}
        {trailing}
      </div>

      {/* command list */}
      {isCmd && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-[3px] border border-[#1d1b17]/15 bg-[#fbf9f4] py-1 shadow-[0_18px_40px_-18px_rgba(29,27,23,0.45)]">
          {matches.length === 0 && <li className="px-4 py-2 font-serif italic text-[#1d1b17]/50">No such command</li>}
          {matches.map((c, i) => (
            <li key={c.cmd}>
              <button
                type="button"
                onMouseEnter={() => setSel(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(c)}
                className={`flex w-full items-baseline gap-3 px-4 py-1.5 text-left ${i === sel ? 'bg-[#1d1b17]/[0.06]' : ''}`}
              >
                <span className="w-20 shrink-0 font-mono text-[12px] text-[#1d1b17]/45">/{c.cmd}</span>
                <span className="font-serif text-[17px] text-[#1d1b17]">{c.label}</span>
                {c.hint && <span className="ml-auto text-[12px] tabular-nums text-[#1d1b17]/45">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* one transient line of feedback */}
      <div aria-live="polite" className="pointer-events-none absolute left-0 right-0 top-full mt-2 flex justify-center">
        {fb && !isCmd && (
          <div key={JSON.stringify(fb)} className="atlas-fade max-w-full rounded-[3px] bg-[#fbf9f4]/90 px-3 py-1 text-center backdrop-blur">
            {fb.kind === 'found' && (
              <>
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5">
                  <span className="w-full font-serif text-[18px] leading-snug text-[#1d1b17] sm:w-auto">{fb.name}</span>
                  {fb.lines.map((l) => (
                    <span key={l} className="flex items-center gap-1.5 text-[10px] font-medium uppercase leading-5 tracking-[0.1em] text-[#1d1b17]/65">
                      <Bar line={LINES[l]} w={14} h={4} />
                      {LINES[l]?.name}
                    </span>
                  ))}
                </div>
                {fb.first && (
                  <div className="font-serif text-[14px] italic text-[#1d1b17]/55">
                    {fb.lines.length > 1 ? 'One station, several lines. ' : ''}Progress and lines are in the Index.
                  </div>
                )}
              </>
            )}
            {fb.kind === 'already' && (
              <span className="font-serif text-[16px] italic text-[#1d1b17]/70">{fb.name}: already on the map</span>
            )}
            {fb.kind === 'none' && (
              <span className="font-serif text-[16px] italic text-[#1d1b17]/60">Not a station on the lines in play</span>
            )}
            {fb.kind === 'ambiguous' && (
              <span className="font-serif text-[16px] italic text-[#1d1b17]/70">Several stations match; be more specific</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

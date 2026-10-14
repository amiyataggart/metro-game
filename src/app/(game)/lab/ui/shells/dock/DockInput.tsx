'use client'

import { useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { Feature, Point } from 'geojson'
import type { DataFeature } from '@/lib/types'
import { Resolution, selectNewIds } from '@/lib/matching'

export type Miss = 'wrong' | 'already' | 'ambiguous'

// The guess field. Same behaviour as @/components/Input (Enter submits, the
// `found` passed is knownFound, fresh ids are prepended, the map flies to the
// find and flashes it) but styled for the dock, keeps focus after every
// submit, and reports misses to the shell so they show in the toast slot.
export default function DockInput({
  matcher,
  found,
  setFound,
  setIsNewPlayer,
  inputRef,
  map,
  idMap,
  flyOffset,
  onMiss,
  onHit,
  placeholder,
  large,
}: {
  matcher: (q: string) => Resolution
  found: number[]
  setFound: (found: number[]) => void
  setIsNewPlayer: (v: boolean) => void
  inputRef: React.MutableRefObject<HTMLInputElement | null>
  map: maplibregl.Map | null
  idMap: Map<number, DataFeature>
  /** pixel offset that centres a find in the visible band of the map */
  flyOffset: () => [number, number]
  onMiss: (kind: Miss, text: string) => void
  onHit: () => void
  placeholder: string
  large?: boolean
}) {
  const [search, setSearch] = useState('')
  const [state, setState] = useState<'idle' | 'wrong' | 'hit'>('idle')

  const flash = (s: 'wrong' | 'hit', ms: number) => {
    setState(s)
    setTimeout(() => setState('idle'), ms)
  }

  const submit = useCallback(() => {
    const q = search.trim()
    if (!q) return
    const result = matcher(q)
    if (result.kind === 'ambiguous') {
      onMiss('ambiguous', q)
      flash('wrong', 500)
      return
    }
    if (result.kind === 'none' || result.ids.length === 0) {
      onMiss('wrong', q)
      flash('wrong', 500)
      return
    }
    const { fresh, allFound } = selectNewIds(result.ids, found || [])
    if (allFound) {
      onMiss('already', idMap.get(result.ids[0])?.properties.name ?? q)
      setSearch('')
      if (map && result.ids[0] != null) fly(result.ids[0], false)
      return
    }
    onHit()
    flash('hit', 450)
    if (map) {
      const src = map.getSource('hovered') as maplibregl.GeoJSONSource | undefined
      src?.setData({
        type: 'FeatureCollection',
        features: fresh.map((id) => idMap.get(id)!).filter(Boolean) as any,
      })
      setTimeout(() => src?.setData({ type: 'FeatureCollection', features: [] }), 1500)
      fly(fresh[0], true)
    }
    setFound([...fresh, ...(found || [])])
    setIsNewPlayer(false)
    setSearch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, matcher, found, setFound, setIsNewPlayer, map, idMap, onHit, onMiss, flyOffset])

  function fly(id: number, zoomIn: boolean) {
    if (!map) return
    const f = idMap.get(id) as Feature<Point> | undefined
    if (!f || f.geometry.type !== 'Point') return
    map.flyTo({
      center: f.geometry.coordinates as [number, number],
      zoom: zoomIn ? Math.max(map.getZoom(), 13) : map.getZoom(),
      duration: 450,
      offset: flyOffset(),
    })
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        id="input"
        type="text"
        value={search}
        placeholder={placeholder}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          } else if (e.key === 'Escape') {
            setSearch('')
          }
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        aria-label="Station name"
        className={[
          'w-full rounded-2xl bg-white pl-4 pr-14 font-bold text-zinc-900 caret-zinc-900 shadow-[inset_0_-2px_0_rgba(0,0,0,0.08)] outline-none ring-2 transition-[box-shadow,ring-color] duration-200 placeholder:font-semibold placeholder:text-zinc-400',
          large ? 'h-14 text-xl' : 'h-12 text-[17px]',
          state === 'wrong'
            ? 'animate-shake ring-red-500'
            : state === 'hit'
              ? 'ring-emerald-400'
              : 'ring-transparent focus:ring-amber-300',
        ].join(' ')}
      />
      <button
        type="button"
        aria-label="Submit guess"
        // keep the keyboard up: don't let the tap steal focus from the field
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          submit()
          inputRef.current?.focus()
        }}
        className={[
          'absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-xl transition-colors',
          large ? 'h-11 w-11' : 'h-9 w-9',
          search.trim() ? 'bg-zinc-900 text-amber-300' : 'bg-zinc-100 text-zinc-400',
        ].join(' ')}
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4v6a3 3 0 0 1-3 3H4" />
          <path d="M7.5 9.5 4 13l3.5 3.5" />
        </svg>
      </button>
    </div>
  )
}

'use client'

import classNames from 'classnames'
import { useCallback, useState, KeyboardEventHandler } from 'react'
import type maplibregl from 'maplibre-gl'
import type { Feature, Point } from 'geojson'
import type { DataFeature } from '@/lib/types'
import { Resolution, selectNewIds } from '@/lib/matching'

export type GuessResult =
  | { kind: 'found'; name: string; ids: number[]; t: number }
  | { kind: 'already'; name: string; t: number }
  | { kind: 'ambiguous'; q: string; t: number }
  | { kind: 'wrong'; q: string; t: number }

// Same behaviour as @/components/Input (Enter submits, flash + fly to the
// find, `found` = knownFound), restyled as a key-panel field, and reporting
// each outcome upward so the key can show which lines a find belongs to.
export default function KeyInput({
  matcher,
  found,
  setFound,
  setIsNewPlayer,
  inputRef,
  map,
  idMap,
  onResult,
  size = 'lg',
  onFocus,
}: {
  matcher: (q: string) => Resolution
  found: number[]
  setFound: (found: number[]) => void
  setIsNewPlayer: (v: boolean) => void
  inputRef: React.MutableRefObject<HTMLInputElement | null>
  map: maplibregl.Map | null
  idMap: Map<number, DataFeature>
  onResult: (r: GuessResult) => void
  size?: 'lg' | 'md'
  onFocus?: () => void
}) {
  const [search, setSearch] = useState('')
  const [shake, setShake] = useState(false)

  const zoomToStation = useCallback(
    (id: number) => {
      if (!map) return
      const feature = idMap.get(id) as Feature<Point> | undefined
      if (!feature) return
      const [lng, lat] = feature.geometry.coordinates
      const vv = typeof window !== 'undefined' ? window.visualViewport : null
      const keyboard = vv ? Math.max(0, window.innerHeight - vv.height) : 0
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(13, Math.min(map.getZoom(), 14)),
        duration: 300,
        offset: keyboard > 0 ? [0, -keyboard / 2] : [0, 0],
      })
    },
    [map, idMap],
  )

  const onKeyDown: KeyboardEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (e.key !== 'Enter' || !search) return
      e.preventDefault()
      const t = Date.now()
      const result = matcher(search)
      if (result.kind === 'ambiguous') {
        onResult({ kind: 'ambiguous', q: search, t })
        return
      }
      if (result.kind === 'none') {
        setShake(true)
        setTimeout(() => setShake(false), 500)
        onResult({ kind: 'wrong', q: search, t })
        return
      }
      const { fresh, allFound } = selectNewIds(result.ids, found || [])
      const name = idMap.get(result.ids[0])?.properties.name ?? search
      if (allFound) {
        onResult({ kind: 'already', name, t })
        setSearch('')
        return
      }
      if (map) {
        const src = map.getSource('hovered') as maplibregl.GeoJSONSource | undefined
        src?.setData({
          type: 'FeatureCollection',
          features: fresh.map((id) => idMap.get(id)!).filter(Boolean) as any,
        })
        setTimeout(() => src?.setData({ type: 'FeatureCollection', features: [] }), 1500)
      }
      zoomToStation(fresh[0])
      setFound([...fresh, ...(found || [])])
      setIsNewPlayer(false)
      setSearch('')
      onResult({ kind: 'found', name, ids: fresh, t })
    },
    [search, matcher, found, setFound, setIsNewPlayer, map, idMap, zoomToStation, onResult],
  )

  return (
    <div className="relative w-full">
      <svg
        viewBox="0 0 20 20"
        className={classNames(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-zinc-400',
          size === 'lg' ? 'left-4 h-5 w-5' : 'left-3.5 h-[18px] w-[18px]',
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M12.6 12.6l4.4 4.4" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        id="input"
        type="text"
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="go"
        placeholder="Name a station…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className={classNames(
          shake && 'animate-shake',
          'w-full rounded-xl border-2 border-zinc-900 bg-white font-bold text-zinc-900 caret-[#0019a8] outline-none transition-shadow placeholder:font-normal placeholder:text-zinc-400 focus:shadow-[0_0_0_4px_rgba(0,25,168,0.15)]',
          size === 'lg' ? 'h-14 pl-12 pr-16 text-xl' : 'h-12 pl-11 pr-14 text-[17px]',
        )}
      />
      <kbd
        className={classNames(
          'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 font-sans text-xs text-zinc-400',
          !search && 'opacity-0',
        )}
      >
        Enter ⏎
      </kbd>
    </div>
  )
}

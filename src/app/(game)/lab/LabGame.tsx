'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import GamePage, { LabSizing, MorphConfig, RouteLevel } from '@/components/GamePage'
import { DataFeatureCollection, RoutesFeatureCollection } from '@/lib/types'
import type { LabVariant } from './variants'

// Sizing tests (?size=…). 12.4 = MAP_CONFIG.zoom, the opening view.
const SIZINGS: Record<string, { label: string; sizing?: LabSizing }> = {
  current: { label: 'current' },
  // half the z12.4 size at z11.4 (= map scale there), linear up to z12.4;
  // station markers keep shrinking linearly to today's z6 size (minZoom)
  clamp: { label: 'clamped z11.4–12.4', sizing: { kind: 'clamp', min: 11.4, max: 12.4, minScale: 0.5, stationFloor: 6 } },
  map: { label: 'scales with the map', sizing: { kind: 'map', ref: 12.4 } },
  // staging1 only (forced): clamp above z11.4, map scale for everything below
  staging: { label: 'clamped z11.4–12.4, scales with the map below z11.4', sizing: { kind: 'clamp', min: 11.4, max: 12.4, minScale: 0.5, mapBelow: true } },
}
const SWITCHABLE = ['current', 'clamp', 'map']

export type Scorecard = Record<string, { overlapKm: number; twists: number; widthM: number }>

// GamePage plus a small lab panel: variant, live zoom, active level, scorecard.
export default function LabGame({
  variant,
  fc,
  routes,
  routeLevels,
  morph,
  maskData,
  cityData,
  score,
  baseline,
  forceSize,
}: {
  variant: LabVariant
  fc: DataFeatureCollection
  routes?: RoutesFeatureCollection
  routeLevels?: RouteLevel[]
  morph?: MorphConfig
  maskData?: any
  cityData?: any
  score: Scorecard
  baseline: Scorecard
  forceSize?: string
}) {
  const [zoom, setZoom] = useState<number | null>(null)
  // Sizing test from ?size= (current | clamp | map), read before the map mounts
  // (map init only runs once). `forceSize`: variants built for one sizing.
  const [size, setSize] = useState<string | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('size') || 'current'
    setSize(forceSize ?? (SWITCHABLE.includes(q) ? q : 'current'))
  }, [forceSize])
  const [open, setOpen] = useState(true)
  const onMap = useCallback((m: maplibregl.Map) => {
    ;(window as any).__labMap = m // debugging hook for /lab
    setZoom(m.getZoom())
    // readout only: throttled to one update per animation frame
    let raf = 0
    m.on('zoom', () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; setZoom(m.getZoom()) })
    })
  }, [])
  // The game is memoised so the zoom readout above (state in this component)
  // never re-renders the whole GamePage on every zoom frame.
  const game = useMemo(
    () =>
      size != null ? (
        <GamePage fc={fc} routes={routes} routeLevels={routeLevels} morph={morph} onMap={onMap} sizing={SIZINGS[size].sizing} maskData={maskData} cityData={cityData} />
      ) : null,
    [size, fc, routes, routeLevels, morph, onMap, maskData, cityData],
  )
  const level =
    zoom != null && routeLevels
      ? routeLevels.find((l) => zoom >= (l.minzoom ?? 0) && zoom < (l.maxzoom ?? 99))?.id
      : null
  const phase =
    zoom != null && morph
      ? zoom <= morph.zCoarse ? 'bundled' : zoom >= morph.zFine ? 'true track' : 'blending'
      : null
  return (
    <>
      {game}
      <div className="fixed bottom-3 left-3 z-50 max-w-[calc(100vw-24px)] rounded-lg bg-white/95 p-3 text-xs text-zinc-800 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900/95 dark:text-zinc-100 dark:ring-zinc-700">
        <div className="flex items-center gap-2">
          <a href="/lab" className="font-bold text-blue-600 hover:underline dark:text-blue-400">Lab</a>
          <span className="font-bold">/ {variant.title}</span>
          <span className="ml-auto tabular-nums">
            z{zoom != null ? zoom.toFixed(2) : '–'}
            {level ? ` · level ${level}` : ''}
            {phase ? ` · ${phase}` : ''}
          </span>
          <button onClick={() => setOpen(!open)} className="ml-1 rounded px-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Toggle details">
            {open ? '–' : '+'}
          </button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-zinc-500">Sizing:</span>
          {forceSize ? (
            <span className="font-bold">{SIZINGS[forceSize].label} (built for it)</span>
          ) : (
            SWITCHABLE.map((k) => [k, SIZINGS[k]] as const).map(([k, v], i) => (
              <span key={k} className="flex items-center gap-2">
                {i > 0 && <span className="text-zinc-400">|</span>}
                <a href={k === 'current' ? '?' : `?size=${k}`} className={size === k ? 'font-bold' : 'text-blue-600 hover:underline dark:text-blue-400'}>{v.label}</a>
              </span>
            ))
          )}
        </div>
        {open && (
          <>
            <p className="mt-1 max-w-sm text-zinc-600 dark:text-zinc-400">{variant.blurb}</p>
            <table className="mt-2 w-full tabular-nums">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="pr-2 font-normal">zoom</th>
                  <th className="pr-2 font-normal">overlap km</th>
                  <th className="font-normal">crossings</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(score).map((z) => (
                  <tr key={z}>
                    <td className="pr-2">z{z}</td>
                    <td className="pr-2">{score[z].overlapKm} <span className="text-zinc-400">({baseline[z].overlapKm})</span></td>
                    <td>{score[z].twists} <span className="text-zinc-400">({baseline[z].twists})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-zinc-400">(in brackets: current /london{forceSize === 'map' ? ", measured at the same map-scale width" : forceSize ? ", measured at the same sizing" : ""})</p>
          </>
        )}
      </div>
    </>
  )
}

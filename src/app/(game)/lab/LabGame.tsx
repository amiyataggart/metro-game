'use client'

import { useEffect, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import GamePage, { MorphConfig, RouteLevel } from '@/components/GamePage'
import { DataFeatureCollection, RoutesFeatureCollection } from '@/lib/types'
import type { LabVariant } from './variants'

const FIXED_SIZE_ZOOM = 12.4 // = MAP_CONFIG.zoom, the opening view

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
}) {
  const [zoom, setZoom] = useState<number | null>(null)
  // Sizing test: ?size=fixed freezes every zoom-dependent size at the opening
  // zoom (12.4), so lines, stations and labels all keep one on-screen size.
  // Read before the map mounts (map init only runs once).
  const [fixedSize, setFixedSize] = useState<boolean | null>(null)
  useEffect(() => setFixedSize(new URLSearchParams(window.location.search).get('size') === 'fixed'), [])
  const [open, setOpen] = useState(true)
  const onMap = (m: maplibregl.Map) => {
    ;(window as any).__labMap = m // debugging hook for /lab
    setZoom(m.getZoom())
    m.on('zoom', () => setZoom(m.getZoom()))
  }
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
      {fixedSize != null && (
        <GamePage fc={fc} routes={routes} routeLevels={routeLevels} morph={morph} onMap={onMap} fixedSizeZoom={fixedSize ? FIXED_SIZE_ZOOM : undefined} maskData={maskData} cityData={cityData} />
      )}
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
          <a href="?" className={fixedSize ? 'text-blue-600 hover:underline dark:text-blue-400' : 'font-bold'}>grows with zoom</a>
          <span className="text-zinc-400">|</span>
          <a href="?size=fixed" className={fixedSize ? 'font-bold' : 'text-blue-600 hover:underline dark:text-blue-400'}>fixed (as at z12.4)</a>
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
            <p className="mt-1 text-zinc-400">(in brackets: current /london)</p>
          </>
        )}
      </div>
    </>
  )
}

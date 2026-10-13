'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useLocalStorageValue } from '@react-hookz/web'
import maplibregl from 'maplibre-gl'
import { coordEach } from '@turf/meta'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'react-circular-progressbar/dist/styles.css'
import MenuComponent from '@/components/Menu'
import IntroModal from '@/components/IntroModal'
import FoundSummary from '@/components/FoundSummary'
import Timer from '@/components/Timer'
import {
  DataFeatureCollection,
  DataFeature,
  RoutesFeatureCollection,
} from '@/lib/types'
import Input from '@/components/Input'
import SettingsModal from '@/components/SettingsModal'
import { useConfig } from '@/lib/configContext'
import { smoothRoutes } from '@/lib/smoothRoutes'
import useTranslation from '@/hooks/useTranslation'
import FoundList from '@/components/FoundList'
import { addFound, createMatcher, EMPTY_ALIASES, filterKnownIds, restrictToEnabled } from '@/lib/matching'
import { defaultEnabledLines } from '@/lib/defaultEnabledLines'
import { detectCelebrations } from '@/lib/completion'
import { flashLines } from '@/lib/mapFlash'
import { useCelebration } from '@/hooks/useCelebration'

// Parallel-ribbon separation + base line width, shared by the ribbon layers
// (map init) and the completion flash (lib/mapFlash) so the glow tracks the
// real offset ribbon. Static expressions → module scope.
const LINE_OFFSET_EXPR = [
  'interpolate', ['linear'], ['zoom'],
  8.763, ['*', ['coalesce', ['get', 'laneOff'], 0], 2.925],
  13, ['*', ['coalesce', ['get', 'laneOff'], 0], 5.0625],
  18, ['*', ['coalesce', ['get', 'laneOff'], 0], 8.4375],
  22, ['*', ['coalesce', ['get', 'laneOff'], 0], 10.125],
] as unknown as maplibregl.ExpressionSpecification
const LINE_WIDTH_EXPR = [
  'interpolate', ['linear'], ['zoom'],
  8.763, 2.925, 13, 5.0625, 18, 8.4375, 22, 10.125,
] as unknown as maplibregl.ExpressionSpecification
// 'triple' stripe (London Cable Car): the ribbon is split into fifths —
// colour / white / colour / white / colour — so it reads as three thin
// coloured lines with white infill. Each white line is W/5 wide, offset ±W/5
// from the ribbon centre (on top of the lane offset). Same zoom stops as
// LINE_WIDTH_EXPR (zoom must stay the top-level interpolate input).
const WIDTH_STOPS: [number, number][] = [[8.763, 2.925], [13, 5.0625], [18, 8.4375], [22, 10.125]]
const TRIPLE_STRIPE_WIDTH_EXPR = [
  'interpolate', ['linear'], ['zoom'],
  ...WIDTH_STOPS.flatMap(([z, w]) => [z, w / 5]),
] as unknown as maplibregl.ExpressionSpecification
const tripleStripeOffsetExpr = (side: -1 | 1) =>
  [
    'interpolate', ['linear'], ['zoom'],
    ...WIDTH_STOPS.flatMap(([z, w]) => [
      z, ['+', ['*', ['coalesce', ['get', 'laneOff'], 0], w], (side * w) / 5],
    ]),
  ] as unknown as maplibregl.ExpressionSpecification

// ---- /lab track-geometry experiments (unused by /london) ----
// A route level is one geometry set shown over a zoom range; the finer level
// (later in the list) fades in over the coarser one across ±LEVEL_FADE zoom.
export type RouteLevel = {
  id: string
  routes: RoutesFeatureCollection
  minzoom?: number
  maxzoom?: number
}
// Morph: features carry `dm` (m to the same line's bundled corridor, + = right)
// and `lc` (bundled lane); line-offset blends from bundled (z <= zCoarse) to
// true track + `laneOff` (z >= zFine). Must match scripts/lab/score.js.
export type MorphConfig = { zCoarse: number; zFine: number }
const LEVEL_FADE = 0.25
const widthAt = (z: number) => {
  if (z <= WIDTH_STOPS[0][0]) return WIDTH_STOPS[0][1]
  for (let i = 1; i < WIDTH_STOPS.length; i++)
    if (z <= WIDTH_STOPS[i][0]) {
      const [z0, w0] = WIDTH_STOPS[i - 1]
      const [z1, w1] = WIDTH_STOPS[i]
      return w0 + ((w1 - w0) * (z - z0)) / (z1 - z0)
    }
  return WIDTH_STOPS[WIDTH_STOPS.length - 1][1]
}
// metres per CSS pixel (512-px tiles) at London's latitude
const mppAt = (z: number) => (78271.517 * Math.cos((51.5 * Math.PI) / 180)) / 2 ** z
// line-offset for morph mode; `widthFrac` adds ±W/5 for the triple stripe
// The blend is linear in GROUND space between bundled and true positions
// (t linear in zoom), sampled every half zoom level across the blend.
const morphOffsetExpr = (cfg: MorphConfig, widthFrac = 0, wAt: (z: number) => number = widthAt) => {
  const lf = ['coalesce', ['get', 'laneOff'], 0]
  const blend: number[] = []
  for (let z = cfg.zCoarse; z < cfg.zFine; z += 0.5) blend.push(z)
  const stops = Array.from(new Set([6, 7, 8, 9, 10, 11, ...blend, cfg.zFine, 18, 22])).sort((a, b) => a - b)
  return [
    'interpolate', ['linear'], ['zoom'],
    ...stops.flatMap((z) => {
      const t = Math.max(0, Math.min(1, (z - cfg.zCoarse) / (cfg.zFine - cfg.zCoarse)))
      const w = wAt(z)
      return [
        z,
        ['+',
          ['*', ['coalesce', ['get', 'dm'], 0], (1 - t) / mppAt(z)],
          ['*', ['coalesce', ['get', 'lc'], lf], (1 - t) * w],
          ['*', lf, t * w],
          widthFrac * w],
      ]
    }),
  ] as unknown as maplibregl.ExpressionSpecification
}
// Per-level opacity: fade in at minzoom (over the coarser level), out at maxzoom.
const levelOpacity = (lv: RouteLevel, op: number) => {
  const stops: number[] = []
  if (lv.minzoom != null && lv.minzoom > 0) stops.push(lv.minzoom - LEVEL_FADE, 0, lv.minzoom + LEVEL_FADE, op)
  if (lv.maxzoom != null && lv.maxzoom < 24) {
    if (!stops.length) stops.push(lv.maxzoom - LEVEL_FADE, op)
    stops.push(lv.maxzoom + LEVEL_FADE, op) // stay opaque under the finer level's fade-in
  }
  return stops.length
    ? (['interpolate', ['linear'], ['zoom'], ...stops] as unknown as maplibregl.ExpressionSpecification)
    : op
}
const levelZoomRange = (lv: RouteLevel) => ({
  ...(lv.minzoom != null && lv.minzoom > 0 ? { minzoom: lv.minzoom - LEVEL_FADE } : {}),
  ...(lv.maxzoom != null && lv.maxzoom < 24 ? { maxzoom: lv.maxzoom + LEVEL_FADE } : {}),
})
const levelPrefix = (lv: RouteLevel) => (lv.id ? `lines-${lv.id}` : 'lines')

// /lab sizing tests (`sizing`) for the game's own layers' SIZES (line width and
// lane offset, stripes, station radius/stroke, pies; not label text):
//  - map: pinned to the MAP — the value at `ref`, doubled per zoom level up
//    (halved down), like the streets (hover glow too);
//  - clamp: today's size at `max`, scaled by `minScale` at `min` (0.5 = what
//    map scale gives one zoom out), linear in zoom between, held outside —
//    except station markers (stations-* layers), which keep shrinking
//    linearly below `min` to today's size at `stationFloor` (widest zoom).
// Opacity fades (/lab/levels) and the morph blend are unchanged.
export type LabSizing =
  | { kind: 'map'; ref: number }
  | { kind: 'clamp'; min: number; max: number; minScale: number; stationFloor?: number }
const SIZE_PROPS = ['line-width', 'line-offset', 'circle-radius', 'circle-stroke-width', 'icon-size']
const clampScaled = (e: unknown, min: number, max: number, minScale: number, floorZ?: number): unknown => {
  if (!Array.isArray(e) || e[0] !== 'interpolate') return e // constants stay
  const hi = atZoom(e, max)
  const lo = typeof hi === 'number' ? hi * minScale : ['*', minScale, hi]
  const floor = floorZ != null && floorZ < min ? [floorZ, atZoom(e, floorZ)] : []
  return ['interpolate', ['linear'], ['zoom'], ...floor, min, lo, max, hi]
}
const sizeAt = (sz: LabSizing | undefined) => (z: number) =>
  !sz ? widthAt(z) : sz.kind === 'map' ? widthAt(sz.ref) * 2 ** (z - sz.ref)
    : widthAt(sz.max) * (sz.minScale + (1 - sz.minScale) * Math.max(0, Math.min(1, (z - sz.min) / (sz.max - sz.min))))
const resize = (e: unknown, sz: LabSizing, station = false) =>
  sz.kind === 'map' ? mapScaled(e, sz.ref) : clampScaled(e, sz.min, sz.max, sz.minScale, station ? sz.stationFloor : undefined)
const mapScaled = (e: unknown, ref: number): unknown => {
  const v = atZoom(e, ref)
  const k0 = 2 ** -ref, k1 = 2 ** (24 - ref)
  const mul = (k: number) => (typeof v === 'number' ? v * k : ['*', k, v])
  return ['interpolate', ['exponential', 2], ['zoom'], 0, mul(k0), 24, mul(k1)]
}
const atZoom = (e: unknown, z: number): unknown => {
  if (!Array.isArray(e) || e[0] !== 'interpolate' || !Array.isArray(e[2]) || e[2][0] !== 'zoom') return e
  const st = e.slice(3)
  const n = st.length / 2
  if (z <= st[0]) return st[1]
  for (let i = 1; i < n; i++)
    if (z <= st[2 * i]) {
      const z0 = st[2 * i - 2], z1 = st[2 * i], a = st[2 * i - 1], b = st[2 * i + 1]
      const t = (z - z0) / (z1 - z0)
      if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t
      return ['+', ['*', 1 - t, a], ['*', t, b]]
    }
  return st[2 * n - 1]
}

export default function GamePage({
  fc,
  routes,
  routeLevels,
  morph,
  onMap,
  sizing,
  maskData,
  cityData,
}: {
  fc: DataFeatureCollection
  routes?: RoutesFeatureCollection
  /** /lab only: several geometry sets by zoom (overrides `routes`). */
  routeLevels?: RouteLevel[]
  /** /lab only: zoom-blended line-offset (needs `dm`/`lc` on features). */
  morph?: MorphConfig
  /** /lab only: called once the map is ready (e.g. for a zoom readout). */
  onMap?: (m: maplibregl.Map) => void
  /** /lab only: sizing test (see LabSizing). */
  sizing?: LabSizing
  maskData?: any
  cityData?: any
}) {
  const { CITY_NAME, MAP_CONFIG, LINES, MATCHING } = useConfig()
  const { t } = useTranslation()

  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)

  const { celebrateLines, celebrateFinale } = useCelebration()
  // Completion-celebration baseline. We diff the previous *real play state*
  // against the current one; the first hydrated state is recorded silently
  // (baselineReadyRef) so reloading a finished game never celebrates, and
  // Reveal-all sets suppressCelebrationRef to skip its mass completion.
  const prevPerLineRef = useRef<Record<string, number>>({})
  const prevFoundCountRef = useRef<number>(0)
  const baselineReadyRef = useRef<boolean>(false)
  const suppressCelebrationRef = useRef<boolean>(false)

  // Settings — persisted to localStorage.
  const allLineKeys = useMemo(() => Object.keys(LINES), [LINES])
  // All TfL rail + Thameslink + Cable Car on; Trams and the other National
  // Rail lines off (see defaultEnabledLines). Changing it bumps the key below.
  const defaultEnabled = useMemo(() => defaultEnabledLines(LINES), [LINES])

  const { value: storedEnabled, set: setEnabledLines } = useLocalStorageValue<
    Record<string, boolean>
  >(`${CITY_NAME}-enabled-lines-v7`, {
    defaultValue: defaultEnabled,
    initializeWithValue: false,
  })
  const enabledLines = useMemo(() => {
    const next: Record<string, boolean> = { ...defaultEnabled }
    if (storedEnabled) {
      // Respect any stored choice (on OR off); unknown/new lines keep default.
      for (const k of allLineKeys) {
        if (storedEnabled[k] !== undefined) next[k] = storedEnabled[k]
      }
    }
    return next
  }, [storedEnabled, defaultEnabled, allLineKeys])

  const { value: showAllStations, set: setShowAllStations } =
    useLocalStorageValue<boolean>(`${CITY_NAME}-show-all-stations`, {
      defaultValue: true,
      initializeWithValue: false,
    })
  const { value: showFoundLabels, set: setShowFoundLabels } =
    useLocalStorageValue<boolean>(`${CITY_NAME}-show-found-labels`, {
      defaultValue: true,
      initializeWithValue: false,
    })
  // Whether the draggable stopwatch shows over the map. Off by default.
  const { value: showTimer, set: setShowTimer } =
    useLocalStorageValue<boolean>(`${CITY_NAME}-show-timer`, {
      defaultValue: false,
      initializeWithValue: false,
    })
  // EXPLORATORY: render-time line smoothing (centripetal Catmull-Rom). Curves
  // the path around bends without moving any data — see lib/smoothRoutes.ts.
  const { value: smoothLines, set: setSmoothLines } =
    useLocalStorageValue<boolean>(`${CITY_NAME}-smooth-lines`, {
      defaultValue: false,
      initializeWithValue: false,
    })

  // The geometry actually fed to the 'lines' source: original, or a smoothed
  // copy. Memoised so we only recompute when the toggle flips (routes is static).
  const displayRoutes = useMemo(
    () => (smoothLines && routes ? smoothRoutes(routes) : routes),
    [smoothLines, routes],
  )

  // Subsets restricted to enabled lines.
  const enabledFeatures = useMemo(
    () => fc.features.filter((f) => enabledLines[f.properties.line || '']),
    [fc.features, enabledLines],
  )

  const idMap = useMemo(() => {
    const map = new Map<number, DataFeature>()
    for (const feature of enabledFeatures) {
      map.set(feature.id! as number, feature)
    }
    return map
  }, [enabledFeatures])

  const stationsPerLine = useMemo(() => {
    const r: Record<string, number> = {}
    for (const f of enabledFeatures) {
      const l = f.properties.line
      if (!l) continue
      r[l] = (r[l] || 0) + 1
    }
    return r
  }, [enabledFeatures])

  const { value: localFound, set: setFound } = useLocalStorageValue<
    number[] | null
  >(`${CITY_NAME}-stations`, {
    defaultValue: null,
    initializeWithValue: false,
  })

  const { value: isNewPlayer, set: setIsNewPlayer } =
    useLocalStorageValue<boolean>(`${CITY_NAME}-stations-is-new-player`, {
      defaultValue: true,
      initializeWithValue: false,
    })

  // Stored progress may hold ids of stations that no longer exist (scope or
  // service-table changes); drop those before any use.
  const knownIds = useMemo(
    () => new Set(fc.features.map((f) => f.id as number)),
    [fc.features],
  )
  const knownFound: number[] = useMemo(
    () => filterKnownIds(localFound || [], knownIds),
    [localFound, knownIds],
  )

  // Found set restricted to currently-enabled lines (score reflects active selection).
  const found: number[] = useMemo(() => {
    return knownFound.filter((f) => idMap.has(f))
  }, [knownFound, idMap])

  const onReset = useCallback(() => {
    if (confirm(t('restartWarning'))) {
      setFound([])
      setIsNewPlayer(true)
    }
  }, [setFound, setIsNewPlayer, t])

  const foundStationsPerLine = useMemo(() => {
    const r: Record<string, number> = {}
    for (const id of found) {
      const f = idMap.get(id)
      if (!f) continue
      const l = f.properties.line
      if (!l) continue
      r[l] = (r[l] || 0) + 1
    }
    return r
  }, [found, idMap])

  // Every station name on the map (all lines, enabled or not) is a decoy, so
  // a station on a disabled line is never typo-matched onto an enabled one.
  const allStationNames = useMemo(
    () => Array.from(new Set(fc.features.map((f) => f.properties.name))),
    [fc],
  )
  // One matcher over EVERY station (all lines), so curated groups and aliases
  // (King's Cross / St Pancras, St Margarets, ...) work whatever the line
  // selection; each result is then restricted to the enabled stations, and a
  // match with none enabled is `none` (a guess for a disabled line is wrong).
  const allStationsMatcher = useMemo(
    () =>
      createMatcher(
        fc.features.map((f) => ({
          id: Number(f.properties.id),
          name: f.properties.name,
          alternate_names: f.properties.alternate_names,
        })),
        MATCHING?.aliases ?? EMPTY_ALIASES,
        [...(MATCHING?.decoyNames ?? []), ...allStationNames],
      ),
    [fc.features, MATCHING, allStationNames],
  )
  const enabledNames = useMemo(
    () => new Map(enabledFeatures.map((f) => [Number(f.properties.id), f.properties.name] as [number, string])),
    [enabledFeatures],
  )
  const matcher = useCallback(
    (q: string) => restrictToEnabled(allStationsMatcher(q), enabledNames),
    [allStationsMatcher, enabledNames],
  )

  const foundProportion =
    enabledFeatures.length > 0 ? found.length / enabledFeatures.length : 0

  // Build a MapLibre filter expression keeping only features whose line is enabled.
  const lineFilter = useMemo(() => {
    const allowed = allLineKeys.filter((k) => enabledLines[k])
    return ['in', ['get', 'line'], ['literal', allowed]] as unknown as maplibregl.FilterSpecification
  }, [allLineKeys, enabledLines])

  // Category z-bands, BOTTOM → TOP. Each band is drawn as its own base line layer
  // plus its white-stripe layer(s) stacked immediately above it, so a line's dashes
  // stay at that line's depth instead of floating over lower categories. Desired
  // stacking: Underground (top) > Elizabeth > DLR > Overground > Thameslink/National
  // Rail (bottom) — so e.g. Thameslink (and its dashes) pass UNDER the tube ribbons.
  const zBands = useMemo(() => {
    const ug = allLineKeys.filter((k) => (LINES[k].order ?? 99) <= 10)
    const bands = [
      {
        id: 'nr',
        keys: [
          'Thameslink',
          'SouthWesternRailway', 'C2c', 'GreaterAnglia', 'Southeastern',
          'SoutheasternHighSpeed', 'Southern', 'GreatNorthern', 'GatwickExpress',
          'Chiltern', 'EastMidlandsRailway', 'GreatWesternRailway', 'HeathrowExpress',
          'LondonNorthwestern',
        ],
      },
      { id: 'og', keys: ['Lioness', 'Mildmay', 'Windrush', 'Weaver', 'Suffragette', 'Liberty'] },
      { id: 'dlr', keys: ['DLR'] },
      { id: 'eliz', keys: ['ElizabethLine'] },
      { id: 'tram', keys: ['Tramlink'] },
      { id: 'cable', keys: ['CableCar'] },
      { id: 'ug', keys: ug },
    ]
    // Any line not named in a band would never be drawn: drop it into the
    // National Rail band so a newly added line is always visible.
    const banded = new Set(bands.flatMap((b) => b.keys))
    bands[0].keys.push(...allLineKeys.filter((k) => !banded.has(k)))
    return bands
      .map((b) => ({ ...b, keys: b.keys.filter((k) => allLineKeys.includes(k)) }))
      .filter((b) => b.keys.length)
  }, [allLineKeys, LINES])

  // -------- Map setup --------
  useEffect(() => {
    const m = new maplibregl.Map({ ...MAP_CONFIG, container: 'map' })
    if (sizing) {
      const add = m.addLayer.bind(m)
      m.addLayer = ((layer: any, before?: string) => {
        // only the game's own layers (lines-*, stations-*), not the basemap
        // or the boundary outlines
        if (!/^(lines|stations)/.test(layer.id)) return add(layer, before)
        const L = { ...layer, paint: { ...(layer.paint || {}) }, layout: { ...(layer.layout || {}) } }
        for (const part of [L.paint, L.layout])
          for (const k of SIZE_PROPS)
            if (k in part && !(morph && k === 'line-offset')) part[k] = resize(part[k], sizing, layer.id.startsWith('stations'))
        return add(L, before)
      }) as typeof m.addLayer
    }
    // morph keeps its zoom blend; its lane spacing follows the resized width
    const mWidth = sizeAt(sizing)
    // Drop the centre below the top control bar so the configured centre
    // (Charing Cross) sits midway between the entry box and the page bottom,
    // not the page centre. Set before first paint so there's no flash.
    const inputEl = document.getElementById('input')
    m.setPadding({
      top: inputEl ? inputEl.getBoundingClientRect().bottom + 8 : 180,
      bottom: 0,
      left: 0,
      right: 0,
    })

    m.on('load', () => {
      // Recolour the Carto Positron basemap: greener parks, bluer water.
      const GREEN = 'rgba(180, 222, 170, 0.7)'
      const BLUE = 'rgba(150, 200, 235, 0.85)'
      for (const id of ['landcover', 'park_national_park', 'park_nature_reserve', 'landuse']) {
        if (m.getLayer(id)) m.setPaintProperty(id, 'fill-color', GREEN)
      }
      if (m.getLayer('water')) m.setPaintProperty('water', 'fill-color', BLUE)
      if (m.getLayer('waterway')) m.setPaintProperty('waterway', 'line-color', BLUE)

      m.addSource('features', { type: 'geojson', data: fc, promoteId: 'id' })
      m.addSource('hovered', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Boundary overlays (added before the network so lines/stations sit on
      // top). maskData is a polygon = world rectangle with a Greater London
      // hole, so filling it greys everything OUTSIDE Greater London.
      if (maskData) {
        m.addSource('gl-mask', { type: 'geojson', data: maskData })
        m.addLayer({
          id: 'gl-mask-fill',
          type: 'fill',
          source: 'gl-mask',
          paint: { 'fill-color': '#64748b', 'fill-opacity': 0.13 },
        })
        // Grey Greater London border = the polygon's inner ring.
        const glRing =
          maskData.geometry &&
          maskData.geometry.coordinates &&
          maskData.geometry.coordinates[1]
        if (glRing) {
          m.addSource('gl-border', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: glRing },
            } as any,
          })
          m.addLayer({
            id: 'gl-border-line',
            type: 'line',
            source: 'gl-border',
            paint: {
              'line-color': '#64748b',
              'line-width': 1.5,
              'line-dasharray': [2, 2],
            },
          })
        }
      }
      // City of London: red dashed outline only (no fill / no shading).
      if (cityData) {
        m.addSource('city-of-london', { type: 'geojson', data: cityData })
        m.addLayer({
          id: 'city-border-line',
          type: 'line',
          source: 'city-of-london',
          paint: {
            'line-color': '#dc2626',
            'line-width': 1.6,
            'line-dasharray': [2, 1.5],
          },
        })
      }

      const levels: RouteLevel[] = routeLevels ?? (routes ? [{ id: '', routes }] : [])
      if (levels.length) {
        // PARALLEL RIBBONS (offset mode). build-ribbons.js --mode offset places
        // every co-running line on a SHARED corridor centreline (so their
        // geometries coincide and their tangents match) and stamps each output
        // segment with a signed `laneOff` (in lane units). The separation is
        // applied here at render time via `line-offset` (below) = laneOff ×
        // line-width(zoom). Because the centrelines coincide, the runtime offset
        // pushes co-runners along the SAME normal — so they stay exactly
        // parallel, never flip across zoom (the failure that made the original
        // build bake offsets into coords), AND separate by a CONSTANT screen
        // amount at every zoom, so the lower line is never hidden when zoomed
        // out and the geometry stays on the true track.

        for (const lv of levels) m.addSource(levelPrefix(lv), { type: 'geojson', data: lv.routes })
        // Render-time parallel-ribbon separation, shared by every base + stripe
        // layer: each feature carries a signed `laneOff` (lane units); we offset by
        // laneOff × the zoom-scaled line width so adjacent ribbons sit one width
        // apart — a CONSTANT screen amount at every zoom (never hide when zoomed
        // out) while geometry stays on the true track. +offset = right of line dir.
        const lineOffset = morph ? morphOffsetExpr(morph, 0, mWidth) : LINE_OFFSET_EXPR
        // ~50% thicker than the previous pass; white stripes ~1/3 of that.
        const lineWidth = LINE_WIDTH_EXPR
        const stripeWidth = [
          'interpolate', ['linear'], ['zoom'],
          8.763, 1.0125, 13, 1.6875, 18, 2.8125, 22, 3.375,
        ] as unknown as maplibregl.ExpressionSpecification
        // Resolve colour from LINES config so map, legend, and found list stay in
        // lockstep — `routes.json` ships baked colours that can drift.
        const lineColor = [
          'match', ['get', 'line'],
          ...allLineKeys.flatMap((line) => [[line], LINES[line].color]),
          '#888',
        ] as unknown as maplibregl.ExpressionSpecification
        // Within a band, higher config `order` draws on top (matters where lines
        // genuinely cross at interchanges). Cross-band order is set by the band stack.
        const sortKey = ['get', 'order'] as unknown as maplibregl.ExpressionSpecification
        // …except inside the Underground band, where the SUBSURFACE (cut-and-cover)
        // lines must draw ABOVE the deep-tube lines. Boost their sort-key by 100 so
        // all subsurface lines outrank every deep-tube line (config order kept within
        // each group). Underground as a whole still sits above Elizabeth/DLR/etc.
        const SUBSURFACE = ['Circle', 'District', 'HammersmithAndCity', 'Metropolitan']
        const ugSortKey = [
          '+', ['get', 'order'], ['match', ['get', 'line'], SUBSURFACE, 100, 0],
        ] as unknown as maplibregl.ExpressionSpecification
        const inKeys = (keys: string[]) =>
          ['in', ['get', 'line'], ['literal', keys]] as unknown as maplibregl.FilterSpecification

        // Draw bands BOTTOM → TOP; within each band, the base line then its white
        // stripe(s) immediately above it. This keeps a line's dashes at the line's
        // own depth, so (e.g.) Thameslink and its dashes pass UNDER the tube ribbons
        // instead of the dashes floating on top of them.
        // (/lab/levels: within each band, coarser levels first so the finer one
        // fades in on top.)
        for (const band of zBands) for (const lv of levels) {
          const bandSortKey = band.id === 'ug' ? ugSortKey : sortKey
          const src = levelPrefix(lv)
          const zr = levelZoomRange(lv)
          m.addLayer({
            id: `${src}-${band.id}`,
            type: 'line',
            source: src,
            ...zr,
            filter: inKeys(band.keys),
            paint: {
              'line-color': lineColor,
              'line-opacity': levelOpacity(lv, 0.95),
              'line-width': lineWidth,
              'line-offset': lineOffset,
            },
            layout: { 'line-sort-key': bandSortKey, 'line-cap': 'round', 'line-join': 'round' },
          })
          const solids = band.keys.filter((k) => LINES[k].stripe === 'solid')
          const dashes = band.keys.filter((k) => LINES[k].stripe === 'dashed')
          if (solids.length) {
            m.addLayer({
              id: `${src}-${band.id}-stripe-solid`,
              type: 'line',
              source: src,
            ...zr,
              filter: inKeys(solids),
              paint: { 'line-color': '#ffffff', 'line-width': stripeWidth, 'line-offset': lineOffset, 'line-opacity': levelOpacity(lv, 1) },
              layout: { 'line-sort-key': bandSortKey, 'line-cap': 'round', 'line-join': 'round' },
            })
          }
          if (dashes.length) {
            // White core by default; lines with a stripeColor (Southeastern
            // high speed → yellow) override per-feature.
            const dashColor = [
              'match', ['get', 'line'],
              ...dashes.flatMap((k) => [[k], LINES[k].stripeColor ?? '#ffffff']),
              '#ffffff',
            ] as unknown as maplibregl.ExpressionSpecification
            m.addLayer({
              id: `${src}-${band.id}-stripe-dashed`,
              type: 'line',
              source: src,
            ...zr,
              filter: inKeys(dashes),
              paint: {
                'line-color': dashColor,
                'line-width': stripeWidth,
                'line-dasharray': [3, 2.5],
                'line-offset': lineOffset,
                'line-opacity': levelOpacity(lv, 1),
              },
              layout: { 'line-sort-key': bandSortKey, 'line-cap': 'butt', 'line-join': 'round' },
            })
          }
          const triples = band.keys.filter((k) => LINES[k].stripe === 'triple')
          if (triples.length) {
            for (const [suffix, side] of [['a', -1], ['b', 1]] as const) {
              m.addLayer({
                id: `${src}-${band.id}-stripe-triple-${suffix}`,
                type: 'line',
                source: src,
            ...zr,
                filter: inKeys(triples),
                paint: {
                  'line-color': '#ffffff',
                  'line-width': TRIPLE_STRIPE_WIDTH_EXPR,
                  'line-offset': morph ? morphOffsetExpr(morph, side / 5, mWidth) : tripleStripeOffsetExpr(side),
                  'line-opacity': levelOpacity(lv, 1),
                },
                layout: { 'line-sort-key': bandSortKey, 'line-cap': 'butt', 'line-join': 'round' },
              })
            }
          }
        }
      }

      // Always-visible base layer: hollow circle for every un-found station,
      // hidden once that station is found so the colored stations-circles
      // takes over cleanly. Radii here and on stations-circles are kept in
      // lockstep so the colored marker exactly replaces the empty one.
      m.addLayer({
        id: 'stations-base',
        type: 'circle',
        source: 'features',
        layout: { visibility: 'visible' },
        paint: {
          // Markers shrink hard as you scroll OUT. z12 and up are pinned to the
          // OLD curve's values (z12 = its old interpolated 5.7), so regular play
          // zoom is unchanged; only the scroll-out range below z12 is affected.
          // ~half-size by z9 (whole network in frame — the most you can scroll
          // out within maxBounds) and smaller still below. (Old: 6→1.3, 9→3.6,
          // 13→6.4 — the shrink used to barely register in reach.)
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, 0.6,
            9, 1.8,
            12, 5.7,
            13, 6.4,
            16, 9.6,
            22, 16,
          ],
          // Found stations: collapse to a 0-radius dot (and 0 stroke). Won't
          // be visible — the colored stations-circles renders on top.
          'circle-color': '#ffffff',
          'circle-stroke-color': '#1d2835',
          // The zoom interpolator MUST be the outermost expression; nesting it
          // inside `case` makes MapLibre reject the whole layer (which is why
          // the empty markers never rendered). Found stations collapse to a
          // 0-width stroke via the per-stop case.
          // Stroke shrinks with the radius below z12 (so the ring is genuinely
          // ~half-WIDTH when scrolled out, not just half-radius). z12→z22 sits
          // on the OLD z8→z22 line, so regular zoom is unchanged.
          'circle-stroke-width': [
            'interpolate', ['linear'], ['zoom'],
            6, ['case', ['to-boolean', ['feature-state', 'found']], 0, 0.4],
            9, ['case', ['to-boolean', ['feature-state', 'found']], 0, 0.75],
            12, ['case', ['to-boolean', ['feature-state', 'found']], 0, 1.8],
            22, ['case', ['to-boolean', ['feature-state', 'found']], 0, 2.8],
          ],
          'circle-opacity': [
            'case',
            ['to-boolean', ['feature-state', 'found']],
            0,
            1,
          ],
          'circle-stroke-opacity': [
            'case',
            ['to-boolean', ['feature-state', 'found']],
            0,
            1,
          ],
        },
      })

      m.addLayer({
        id: 'stations-hovered',
        type: 'circle',
        source: 'hovered',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 16,
          'circle-color': '#fde047',
          'circle-blur': 1,
        },
      })

      // Found-state layer: colored dot, only renders when feature-state.found.
      // Single-line stations only — multi-line interchanges use the pie layer.
      m.addLayer({
        id: 'stations-circles',
        type: 'circle',
        source: 'features',
        filter: ['!', ['get', 'interchange']] as unknown as maplibregl.FilterSpecification,
        paint: {
          // Matches stations-base's curve (z12 = its old interpolated 5.1):
          // unchanged at z12+, ~half by z9, smaller below.
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, ['case', ['to-boolean', ['feature-state', 'found']], 0.6, 0],
            9, ['case', ['to-boolean', ['feature-state', 'found']], 1.8, 0],
            12, ['case', ['to-boolean', ['feature-state', 'found']], 5.1, 0],
            13, ['case', ['to-boolean', ['feature-state', 'found']], 5.6, 0],
            16, ['case', ['to-boolean', ['feature-state', 'found']], 8.8, 0],
            22, ['case', ['to-boolean', ['feature-state', 'found']], 14.4, 0],
          ],
          'circle-color': [
            'match',
            ['get', 'line'],
            ...allLineKeys.flatMap((line) => [[line], LINES[line].color]),
            '#888',
          ] as unknown as maplibregl.ExpressionSpecification,
          // Identical border to the empty (uncomplete) marker: same dark colour
          // (#1d2835) and same zoom-interpolated thickness, so a station's ring
          // looks the same whether or not it's been found.
          'circle-stroke-color': '#1d2835',
          'circle-stroke-width': [
            'interpolate', ['linear'], ['zoom'],
            6, ['case', ['to-boolean', ['feature-state', 'found']], 0.4, 0],
            9, ['case', ['to-boolean', ['feature-state', 'found']], 0.75, 0],
            12, ['case', ['to-boolean', ['feature-state', 'found']], 1.8, 0],
            22, ['case', ['to-boolean', ['feature-state', 'found']], 2.8, 0],
          ],
        },
      })

      // Segmented-pie markers for multi-line interchanges: one circle split
      // into equal wedges, one per serving line colour — SAME diameter as the
      // single-line found dots (size is independent of how many lines meet).
      // A circle layer can't draw wedges, so we generate one icon per distinct
      // colour set (keyed by pieKey) and render it via a symbol layer.
      const PIE_PX = 64
      const drawPie = (colors: string[]) => {
        const cv = document.createElement('canvas')
        cv.width = PIE_PX
        cv.height = PIE_PX
        const ctx = cv.getContext('2d')!
        const cx = PIE_PX / 2
        const cy = PIE_PX / 2
        const r = PIE_PX / 2 - 3
        const n = colors.length
        if (n <= 1) {
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, 2 * Math.PI)
          ctx.fillStyle = colors[0] || '#888'
          ctx.fill()
        } else {
          for (let i = 0; i < n; i++) {
            const a0 = -Math.PI / 2 + (i / n) * 2 * Math.PI
            const a1 = -Math.PI / 2 + ((i + 1) / n) * 2 * Math.PI
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.arc(cx, cy, r, a0, a1)
            ctx.closePath()
            ctx.fillStyle = colors[i]
            ctx.fill()
            // Stroke each wedge in its OWN colour (was white). Adjacent canvas
            // fills leave a faint anti-aliased seam where they meet; a matching-
            // colour stroke covers that seam so segments meet flush, with no
            // white divider lines between them.
            ctx.lineWidth = 1.5
            ctx.strokeStyle = colors[i]
            ctx.stroke()
          }
        }
        // No baked outer ring — the matching border is drawn by the
        // 'stations-interchange-ring' circle layer (identical to the station
        // circles' border), so a baked stroke that scales with icon-size can't
        // make the interchange ring thinner/thicker than a normal station's.
        return ctx.getImageData(0, 0, PIE_PX, PIE_PX)
      }
      const pieSeen = new Set<string>()
      for (const f of fc.features) {
        const p = f.properties as any
        if (!p.interchange || !p.pieKey || pieSeen.has(p.pieKey)) continue
        pieSeen.add(p.pieKey)
        if (!m.hasImage(p.pieKey)) {
          m.addImage(p.pieKey, drawPie(p.pieColors as string[]), { pixelRatio: 2 })
        }
      }

      m.addLayer({
        id: 'stations-interchange-pie',
        type: 'symbol',
        source: 'features',
        filter: ['get', 'interchange'] as unknown as maplibregl.FilterSpecification,
        layout: {
          'icon-image': ['get', 'pieKey'] as unknown as maplibregl.ExpressionSpecification,
          // Sized so the pie disc radius matches the station-circle radius
          // (disc r ≈ 14.5px per icon-size unit), so the ring layer aligns.
          // Same curve as the circle layers ÷14.5, so the pie shrinks on
          // scroll-out in lockstep with the rings: unchanged at z12+, ~half by
          // z9, smaller below.
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            6, 0.041,
            9, 0.124,
            12, 0.352,
            13, 0.386,
            16, 0.607,
            22, 0.993,
          ] as unknown as maplibregl.ExpressionSpecification,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-opacity': [
            'case',
            ['to-boolean', ['feature-state', 'found']],
            1,
            0,
          ],
        },
      })

      // Interchange border — same colour/thickness/radius as the station
      // circles, drawn on top of the pie wedges so the ring matches exactly.
      m.addLayer({
        id: 'stations-interchange-ring',
        type: 'circle',
        source: 'features',
        filter: ['get', 'interchange'] as unknown as maplibregl.FilterSpecification,
        paint: {
          // Matches stations-base's curve (z12 = its old interpolated 5.1):
          // unchanged at z12+, ~half by z9, smaller below.
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, ['case', ['to-boolean', ['feature-state', 'found']], 0.6, 0],
            9, ['case', ['to-boolean', ['feature-state', 'found']], 1.8, 0],
            12, ['case', ['to-boolean', ['feature-state', 'found']], 5.1, 0],
            13, ['case', ['to-boolean', ['feature-state', 'found']], 5.6, 0],
            16, ['case', ['to-boolean', ['feature-state', 'found']], 8.8, 0],
            22, ['case', ['to-boolean', ['feature-state', 'found']], 14.4, 0],
          ],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#1d2835',
          'circle-stroke-width': [
            'interpolate', ['linear'], ['zoom'],
            6, ['case', ['to-boolean', ['feature-state', 'found']], 0.4, 0],
            9, ['case', ['to-boolean', ['feature-state', 'found']], 0.75, 0],
            12, ['case', ['to-boolean', ['feature-state', 'found']], 1.8, 0],
            22, ['case', ['to-boolean', ['feature-state', 'found']], 2.8, 0],
          ],
        },
      })

      m.addLayer({
        id: 'stations-labels',
        type: 'symbol',
        source: 'features',
        minzoom: 11,
        layout: {
          'text-field': ['to-string', ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-anchor': 'bottom',
          // Raise text bottom by ~0.8× the current circle diameter (1.5em on
          // a ~12px label ≈ 18px lift) so the label clears the marker.
          'text-offset': [0, -1.5],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 12, 22, 14],
        },
        paint: {
          'text-color': [
            'case',
            ['to-boolean', ['feature-state', 'found']],
            'rgb(29, 40, 53)',
            'rgba(0, 0, 0, 0)',
          ],
          'text-halo-color': [
            'case',
            ['to-boolean', ['feature-state', 'found']],
            'rgba(255, 255, 255, 0.85)',
            'rgba(0, 0, 0, 0)',
          ],
          'text-halo-blur': 1,
          'text-halo-width': 1,
        },
      })

      m.addLayer({
        id: 'hover-label-point',
        type: 'symbol',
        source: 'hovered',
        filter: ['==', '$type', 'Point'],
        paint: {
          'text-halo-color': 'rgb(255, 255, 255)',
          'text-halo-width': 2,
          'text-halo-blur': 1,
          'text-color': 'rgb(29, 40, 53)',
        },
        layout: {
          'text-field': ['to-string', ['get', 'name']],
          'text-font': ['Noto Sans Bold'],
          'text-anchor': 'bottom',
          'text-offset': [0, -0.6],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 14, 22, 16],
        },
      })

      // No fitBounds here — the initial view (Charing Cross / Zone 1) comes
      // from MAP_CONFIG center+zoom. Fitting to the routes bbox would flash the
      // camera out to the whole network on load.

      m.once('idle', () => {
        setMap((prev) => (prev === null ? m : prev))
        onMap?.(m)
        m.on('mousemove', 'stations-circles', (e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features.find((f) => f.state.found && f.id)
            if (feature && feature.id) return setHoveredId(feature.id as number)
          }
          setHoveredId(null)
        })
        m.on('mouseleave', 'stations-circles', () => setHoveredId(null))
        m.on('mousemove', 'stations-interchange-pie', (e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features.find((f) => f.state.found && f.id)
            if (feature && feature.id) return setHoveredId(feature.id as number)
          }
          setHoveredId(null)
        })
        m.on('mouseleave', 'stations-interchange-pie', () => setHoveredId(null))
      })
    })

    return () => {
      m.remove()
    }
    // We deliberately depend only on fc/routes/MAP_CONFIG so settings changes
    // don't tear the map down — they're applied via setFilter/setLayoutProperty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fc, routes, MAP_CONFIG])

  // Apply line filter whenever enabled lines change.
  useEffect(() => {
    if (!map) return
    for (const layer of ['stations-base', 'stations-labels']) {
      if (map.getLayer(layer)) map.setFilter(layer, lineFilter)
    }
    // Found markers split: single-line stations -> colored dot; multi-line
    // interchanges -> segmented pie. Keep each in lockstep with enabled lines.
    if (map.getLayer('stations-circles'))
      map.setFilter('stations-circles', [
        'all', lineFilter, ['!', ['get', 'interchange']],
      ] as unknown as maplibregl.FilterSpecification)
    for (const layer of ['stations-interchange-pie', 'stations-interchange-ring']) {
      if (map.getLayer(layer))
        map.setFilter(layer, [
          'all', lineFilter, ['get', 'interchange'],
        ] as unknown as maplibregl.FilterSpecification)
    }
    // Per-band line + stripe layers: each keeps the enabled-lines filter AND its
    // own band-key (and stripe-type) filter, so toggling lines hides them in place.
    const allowed = allLineKeys.filter((k) => enabledLines[k])
    const allowedIn = ['in', ['get', 'line'], ['literal', allowed]]
    const prefixes = routeLevels ? routeLevels.map(levelPrefix) : ['lines']
    for (const band of zBands) for (const src of prefixes) {
      const solids = band.keys.filter((k) => LINES[k].stripe === 'solid')
      const dashes = band.keys.filter((k) => LINES[k].stripe === 'dashed')
      const set = (id: string, keys: string[]) => {
        if (map.getLayer(id))
          map.setFilter(id, [
            'all',
            allowedIn,
            ['in', ['get', 'line'], ['literal', keys]],
          ] as unknown as maplibregl.FilterSpecification)
      }
      set(`${src}-${band.id}`, band.keys)
      if (solids.length) set(`${src}-${band.id}-stripe-solid`, solids)
      if (dashes.length) set(`${src}-${band.id}-stripe-dashed`, dashes)
      const triples = band.keys.filter((k) => LINES[k].stripe === 'triple')
      if (triples.length) {
        set(`${src}-${band.id}-stripe-triple-a`, triples)
        set(`${src}-${band.id}-stripe-triple-b`, triples)
      }
    }
  }, [map, lineFilter, allLineKeys, enabledLines, zBands, LINES, routeLevels])

  // Toggle base layer visibility. `undefined` (pre-localStorage hydration)
  // is treated as the default (visible) — otherwise the layer briefly hides
  // until the LS read resolves.
  useEffect(() => {
    if (!map || !map.getLayer('stations-base')) return
    map.setLayoutProperty(
      'stations-base',
      'visibility',
      showAllStations === false ? 'none' : 'visible',
    )
  }, [map, showAllStations])

  // Toggle found-station map labels (same default-true treatment).
  useEffect(() => {
    if (!map || !map.getLayer('stations-labels')) return
    map.setLayoutProperty(
      'stations-labels',
      'visibility',
      showFoundLabels === false ? 'none' : 'visible',
    )
  }, [map, showFoundLabels])

  // Swap the line geometry between original and smoothed without re-initialising
  // the map. Runs once after the source exists (applying the stored toggle) and
  // again whenever the toggle flips. `line-offset`/`laneOff` separation is
  // re-applied by the existing paint expressions to the new geometry.
  useEffect(() => {
    if (!map || !displayRoutes) return
    const src = map.getSource('lines') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData(displayRoutes as any)
  }, [map, displayRoutes])

  // Hovered source.
  useEffect(() => {
    if (!map) return
    const src = map.getSource('hovered') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: hoveredId && idMap.get(hoveredId) ? [idMap.get(hoveredId)!] : [],
    })
  }, [map, hoveredId, idMap])

  // Found feature-state.
  useEffect(() => {
    if (!map) return
    map.removeFeatureState({ source: 'features' })
    for (const id of found) {
      map.setFeatureState({ source: 'features', id }, { found: true })
    }
  }, [found, map])

  // Completion celebrations: confetti + on-map flash when a line (or the whole
  // visible network) hits 100% through genuine in-session play. See lib/completion.
  useEffect(() => {
    // Not hydrated from localStorage yet — nothing to compare against.
    if (localFound == null) return

    const advanceBaseline = () => {
      prevPerLineRef.current = foundStationsPerLine
      prevFoundCountRef.current = found.length
    }

    // First hydrated state (possibly an already-complete game): record a silent
    // baseline and never celebrate it.
    if (!baselineReadyRef.current) {
      advanceBaseline()
      baselineReadyRef.current = true
      return
    }
    // Reveal-all: skip the mass completion but keep the baseline current.
    if (suppressCelebrationRef.current) {
      advanceBaseline()
      suppressCelebrationRef.current = false
      return
    }

    const { newlyCompleteLines, allJustCompleted } = detectCelebrations({
      prevPerLine: prevPerLineRef.current,
      perLine: foundStationsPerLine,
      totals: stationsPerLine,
      prevFoundCount: prevFoundCountRef.current,
      foundCount: found.length,
    })

    // Fire confetti over the top-middle of the MAP element (so it isn't centred
    // under the desktop sidebar), in window-normalised coords.
    const region = (() => {
      const el = typeof document !== 'undefined' ? document.getElementById('map') : null
      const w = typeof window !== 'undefined' ? window.innerWidth : 1
      const h = typeof window !== 'undefined' ? window.innerHeight : 1
      if (!el) return undefined
      const r = el.getBoundingClientRect()
      return {
        centerX: (r.left + r.width / 2) / w,
        leftX: (r.left + r.width * 0.12) / w,
        rightX: (r.left + r.width * 0.88) / w,
        // Mid-map so the burst fills vertical space rather than hugging the top.
        originY: (r.top + r.height * 0.55) / h,
      }
    })()

    const flashExpr = {
      lineOffset: (sizing ? resize(LINE_OFFSET_EXPR, sizing) : LINE_OFFSET_EXPR) as maplibregl.ExpressionSpecification,
      lineWidth: (sizing ? resize(LINE_WIDTH_EXPR, sizing) : LINE_WIDTH_EXPR) as maplibregl.ExpressionSpecification,
    }
    const flashWidthAt = sizing ? sizeAt(sizing) : undefined
    if (newlyCompleteLines.length) {
      celebrateLines(newlyCompleteLines.map((k) => LINES[k]), region)
      if (map) flashLines(map, newlyCompleteLines, flashExpr, { widthAt: flashWidthAt })
    }
    if (allJustCompleted) {
      const visible = Object.keys(stationsPerLine).filter((k) => stationsPerLine[k] > 0)
      celebrateFinale(visible.map((k) => LINES[k]), region)
      if (map) flashLines(map, visible, flashExpr, { finale: true, widthAt: flashWidthAt })
    }

    // Always advance, even when nothing fired (e.g. a line toggled off), so the
    // next real find diffs against an accurate baseline.
    advanceBaseline()
  }, [
    localFound,
    foundStationsPerLine,
    stationsPerLine,
    found.length,
    map,
    LINES,
    celebrateLines,
    celebrateFinale,
    sizing,
  ])

  const revealAll = useCallback(() => {
    if (!confirm('Reveal every station on enabled lines? (Use "Start over" to reset.)'))
      return
    const ids: number[] = []
    for (const f of enabledFeatures) {
      if (typeof f.id === 'number') ids.push(f.id)
    }
    // Mass completion — don't celebrate. The detection effect sees this flag,
    // advances the baseline, and clears it.
    suppressCelebrationRef.current = true
    // keep finds on disabled lines
    setFound(addFound(ids, knownFound))
    setIsNewPlayer(false)
  }, [enabledFeatures, knownFound, setFound, setIsNewPlayer])

  const zoomToFeature = useCallback(
    (id: number) => {
      if (!map) return
      const feature = idMap.get(id)
      if (!feature) return
      if (feature.geometry.type === 'Point') {
        map.flyTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: 14,
        })
      } else {
        const bounds = new maplibregl.LngLatBounds()
        coordEach(feature, (coord) => bounds.extend(coord as [number, number]))
        map.fitBounds(bounds, { padding: 100 })
      }
    },
    [map, idMap],
  )

  return (
    <div className="flex h-screen flex-row items-top justify-between">
      <div className="relative flex h-screen grow justify-center">
        <div className="absolute left-0 top-0 h-screen w-full" id="map" />
        <Timer hidden={!(showTimer ?? false)} />
        <div className="absolute top-4 h-12 w-96 max-w-full px-1 lg:top-32">
          <FoundSummary
            className="mb-4 rounded-lg bg-white p-4 shadow-md lg:hidden"
            foundProportion={foundProportion}
            foundStationsPerLine={foundStationsPerLine}
            stationsPerLine={stationsPerLine}
            defaultDensity="small"
            minimizable
            enabledLines={enabledLines}
            setEnabledLines={setEnabledLines}
            showTimer={showTimer ?? false}
            setShowTimer={setShowTimer}
          />
          <div className="flex gap-2 lg:gap-4">
            <Input
              matcher={matcher}
              // all stored finds (not just enabled lines): Input writes
              // [...fresh, ...found] back, which must keep disabled lines' finds
              found={knownFound}
              setFound={setFound}
              setIsNewPlayer={setIsNewPlayer}
              inputRef={inputRef}
              map={map}
              idMap={idMap}
            />
            <MenuComponent
              onReset={onReset}
              openSettings={() => setSettingsOpen(true)}
            />
          </div>
        </div>
      </div>
      <div className="z-10 hidden h-full overflow-y-auto bg-zinc-50 p-6 shadow-lg lg:block lg:w-96 xl:w-[32rem]">
        <FoundSummary
          foundProportion={foundProportion}
          foundStationsPerLine={foundStationsPerLine}
          stationsPerLine={stationsPerLine}
          minimizable
          defaultDensity="full"
          enabledLines={enabledLines}
          setEnabledLines={setEnabledLines}
          showTimer={showTimer ?? false}
          setShowTimer={setShowTimer}
        />
        <hr className="my-4 w-full border-b border-zinc-100" />
        <FoundList
          found={found}
          idMap={idMap}
          setHoveredId={setHoveredId}
          hoveredId={hoveredId}
          hideLabels={!showFoundLabels}
          zoomToFeature={zoomToFeature}
        />
      </div>
      <IntroModal
        inputRef={inputRef}
        open={isNewPlayer}
        setOpen={setIsNewPlayer}
      >
        {t('introInstruction')} ⏎
      </IntroModal>
      <SettingsModal
        open={settingsOpen}
        setOpen={setSettingsOpen}
        enabledLines={enabledLines}
        setEnabledLines={setEnabledLines}
        showAllStations={showAllStations ?? true}
        setShowAllStations={setShowAllStations}
        showFoundLabels={showFoundLabels ?? true}
        setShowFoundLabels={setShowFoundLabels}
        smoothLines={smoothLines ?? false}
        setSmoothLines={setSmoothLines}
        revealAll={revealAll}
      />
    </div>
  )
}

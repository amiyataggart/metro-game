'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Fuse from 'fuse.js'
import { useLocalStorageValue } from '@react-hookz/web'
import maplibregl from 'maplibre-gl'
import { coordEach } from '@turf/meta'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'react-circular-progressbar/dist/styles.css'
import MenuComponent from '@/components/Menu'
import IntroModal from '@/components/IntroModal'
import FoundSummary from '@/components/FoundSummary'
import {
  DataFeatureCollection,
  DataFeature,
  RoutesFeatureCollection,
} from '@/lib/types'
import Input from '@/components/Input'
import SettingsModal from '@/components/SettingsModal'
import { useConfig } from '@/lib/configContext'
import useTranslation from '@/hooks/useTranslation'
import FoundList from '@/components/FoundList'
import useNormalizeString from '@/hooks/useNormalizeString'
import { bbox } from '@turf/turf'

export default function GamePage({
  fc,
  routes,
}: {
  fc: DataFeatureCollection
  routes?: RoutesFeatureCollection
}) {
  const { CITY_NAME, MAP_CONFIG, LINES } = useConfig()
  const { t } = useTranslation()

  const normalizeString = useNormalizeString()

  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)

  // Settings — persisted to localStorage.
  const allLineKeys = useMemo(() => Object.keys(LINES), [LINES])
  const defaultEnabled = useMemo(() => {
    const o: Record<string, boolean> = {}
    for (const k of allLineKeys) o[k] = true
    return o
  }, [allLineKeys])

  const { value: storedEnabled, set: setEnabledLines } = useLocalStorageValue<
    Record<string, boolean>
  >(`${CITY_NAME}-enabled-lines`, {
    defaultValue: defaultEnabled,
    initializeWithValue: false,
  })
  const enabledLines = useMemo(() => {
    // Merge stored state with defaults so newly added lines default to enabled.
    const next: Record<string, boolean> = { ...defaultEnabled }
    if (storedEnabled) {
      for (const k of allLineKeys) {
        if (storedEnabled[k] === false) next[k] = false
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

  // Found set restricted to currently-enabled lines (score reflects active selection).
  const found: number[] = useMemo(() => {
    return (localFound || []).filter((f) => idMap.has(f))
  }, [localFound, idMap])

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

  const fuse = useMemo(
    () =>
      new Fuse(enabledFeatures, {
        includeScore: true,
        includeMatches: true,
        keys: [
          'properties.name',
          'properties.long_name',
          'properties.short_name',
          'properties.alternate_names',
        ],
        minMatchCharLength: 2,
        threshold: 0.15,
        distance: 10,
        getFn: (obj, path) => {
          const value = Fuse.config.getFn(obj, path)
          if (value === undefined) return ''
          if (Array.isArray(value)) return value.map((el) => normalizeString(el))
          return normalizeString(value as string)
        },
      }),
    [enabledFeatures, normalizeString],
  )

  const foundProportion =
    enabledFeatures.length > 0 ? found.length / enabledFeatures.length : 0

  // Build a MapLibre filter expression keeping only features whose line is enabled.
  const lineFilter = useMemo(() => {
    const allowed = allLineKeys.filter((k) => enabledLines[k])
    return ['in', ['get', 'line'], ['literal', allowed]] as unknown as maplibregl.FilterSpecification
  }, [allLineKeys, enabledLines])

  const solidStripeLineKeys = useMemo(
    () => allLineKeys.filter((k) => LINES[k].stripe === 'solid'),
    [allLineKeys, LINES],
  )
  const dashedStripeLineKeys = useMemo(
    () => allLineKeys.filter((k) => LINES[k].stripe === 'dashed'),
    [allLineKeys, LINES],
  )

  // -------- Map setup --------
  useEffect(() => {
    const m = new maplibregl.Map({ ...MAP_CONFIG, container: 'map' })

    m.on('load', () => {
      m.addSource('features', { type: 'geojson', data: fc, promoteId: 'id' })
      m.addSource('hovered', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      if (routes) {
        // Offset per feature for parallel-ribbon rendering. MapLibre requires
        // the zoom interpolator to be the OUTERMOST expression in a
        // data-driven paint property.
        const offsetExpr = [
          'interpolate', ['linear'], ['zoom'],
          8.763, ['*', ['coalesce', ['get', 'offset'], 0], 2.6],
          13, ['*', ['coalesce', ['get', 'offset'], 0], 5],
          18, ['*', ['coalesce', ['get', 'offset'], 0], 8],
          22, ['*', ['coalesce', ['get', 'offset'], 0], 11],
        ] as unknown as maplibregl.ExpressionSpecification

        m.addSource('lines', { type: 'geojson', data: routes })
        m.addLayer({
          id: 'lines',
          type: 'line',
          source: 'lines',
          paint: {
            // Thinner than the previous pass — clearer separation when 3-4
            // lines run in parallel and easier to read when zoomed in.
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8.763, 2.6,
              13, 4.5,
              18, 7.5,
              22, 9,
            ],
            // Resolve from LINES config so map, legend, and found list stay
            // in lockstep — `routes.json` ships baked colours that can drift.
            'line-color': [
              'match',
              ['get', 'line'],
              ...allLineKeys.flatMap((line) => [[line], LINES[line].color]),
              '#888',
            ] as unknown as maplibregl.ExpressionSpecification,
            'line-opacity': 0.95,
            'line-offset': offsetExpr,
          },
          layout: {
            // Higher-order lines render on top. Underground tube lines (order
            // 0-10) sit beneath Elizabeth/DLR/Overground/Thameslink/National
            // Rail (11-22), so where Thameslink runs alongside Met/Circle/H&C
            // it stays visible instead of being buried.
            'line-sort-key': ['get', 'order'],
            'line-cap': 'round',
            'line-join': 'round',
          },
        })

        // White core stripe (solid) — Overground / Elizabeth / DLR / etc.
        m.addLayer({
          id: 'lines-stripe-solid',
          type: 'line',
          source: 'lines',
          filter: [
            'in',
            ['get', 'line'],
            ['literal', solidStripeLineKeys],
          ] as unknown as maplibregl.FilterSpecification,
          paint: {
            // ~1/3 of the colored line-width.
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8.763, 0.9,
              13, 1.5,
              18, 2.5,
              22, 3,
            ],
            'line-color': '#ffffff',
            'line-offset': offsetExpr,
          },
          layout: {
            'line-sort-key': ['get', 'order'],
            'line-cap': 'round',
            'line-join': 'round',
          },
        })

        // White core stripe (dashed) — Thameslink / Gatwick Express. Gaps
        // reveal the line color through the dashes.
        m.addLayer({
          id: 'lines-stripe-dashed',
          type: 'line',
          source: 'lines',
          filter: [
            'in',
            ['get', 'line'],
            ['literal', dashedStripeLineKeys],
          ] as unknown as maplibregl.FilterSpecification,
          paint: {
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8.763, 0.9,
              13, 1.5,
              18, 2.5,
              22, 3,
            ],
            'line-color': '#ffffff',
            'line-dasharray': [3, 2.5],
            'line-offset': offsetExpr,
          },
          layout: {
            'line-sort-key': ['get', 'order'],
            'line-cap': 'butt',
            'line-join': 'round',
          },
        })
      }

      // Always-visible base layer: solid-white circle (with neutral outline)
      // for every un-found station. Sized noticeably larger than the colored
      // line widths so the marker punches through. Hidden once a station is
      // found so the colored stations-circles takes over cleanly.
      m.addLayer({
        id: 'stations-base',
        type: 'circle',
        source: 'features',
        layout: { visibility: 'visible' },
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            9, 4.5,
            13, 8,
            16, 12,
            22, 20,
          ],
          'circle-color': '#ffffff',
          'circle-stroke-color': 'rgb(110, 110, 110)',
          'circle-stroke-width': [
            'case',
            ['to-boolean', ['feature-state', 'found']],
            0,
            [
              'interpolate', ['linear'], ['zoom'],
              8, 1.2,
              22, 2.4,
            ],
          ],
          'circle-opacity': [
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
      m.addLayer({
        id: 'stations-circles',
        type: 'circle',
        source: 'features',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            9, ['case', ['to-boolean', ['feature-state', 'found']], 4.5, 0],
            13, ['case', ['to-boolean', ['feature-state', 'found']], 7, 0],
            16, ['case', ['to-boolean', ['feature-state', 'found']], 11, 0],
            22, ['case', ['to-boolean', ['feature-state', 'found']], 18, 0],
          ],
          'circle-color': [
            'match',
            ['get', 'line'],
            ...allLineKeys.flatMap((line) => [[line], LINES[line].color]),
            '#888',
          ] as unknown as maplibregl.ExpressionSpecification,
          'circle-stroke-color': [
            'match',
            ['get', 'line'],
            ...allLineKeys.flatMap((line) => [
              [line],
              LINES[line].backgroundColor,
            ]),
            '#444',
          ] as unknown as maplibregl.ExpressionSpecification,
          'circle-stroke-width': [
            'case',
            ['to-boolean', ['feature-state', 'found']],
            1,
            0,
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
          'text-offset': [0, -0.5],
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

      if (routes) {
        const box = bbox(routes)
        m.fitBounds(
          [
            [box[0], box[1]],
            [box[2], box[3]],
          ],
          { padding: 60, duration: 0 },
        )
      }

      m.once('idle', () => {
        setMap((prev) => (prev === null ? m : prev))
        m.on('mousemove', 'stations-circles', (e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features.find((f) => f.state.found && f.id)
            if (feature && feature.id) return setHoveredId(feature.id as number)
          }
          setHoveredId(null)
        })
        m.on('mouseleave', 'stations-circles', () => setHoveredId(null))
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
    for (const layer of ['stations-base', 'stations-circles', 'stations-labels']) {
      if (map.getLayer(layer)) map.setFilter(layer, lineFilter)
    }
    if (map.getLayer('lines')) map.setFilter('lines', lineFilter)
    // Stripe layers keep both the enabled-lines filter AND their stripe-type filter.
    const allowed = allLineKeys.filter((k) => enabledLines[k])
    if (map.getLayer('lines-stripe-solid')) {
      map.setFilter('lines-stripe-solid', [
        'all',
        ['in', ['get', 'line'], ['literal', allowed]],
        ['in', ['get', 'line'], ['literal', solidStripeLineKeys]],
      ] as unknown as maplibregl.FilterSpecification)
    }
    if (map.getLayer('lines-stripe-dashed')) {
      map.setFilter('lines-stripe-dashed', [
        'all',
        ['in', ['get', 'line'], ['literal', allowed]],
        ['in', ['get', 'line'], ['literal', dashedStripeLineKeys]],
      ] as unknown as maplibregl.FilterSpecification)
    }
  }, [
    map,
    lineFilter,
    allLineKeys,
    enabledLines,
    solidStripeLineKeys,
    dashedStripeLineKeys,
  ])

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

  const revealAll = useCallback(() => {
    if (!confirm('Reveal every station on enabled lines? (Use "Start over" to reset.)'))
      return
    const ids: number[] = []
    for (const f of enabledFeatures) {
      if (typeof f.id === 'number') ids.push(f.id)
    }
    setFound(ids)
    setIsNewPlayer(false)
  }, [enabledFeatures, setFound, setIsNewPlayer])

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
        <div className="absolute top-4 h-12 w-96 max-w-full px-1 lg:top-32">
          <FoundSummary
            className="mb-4 rounded-lg bg-white p-4 shadow-md lg:hidden"
            foundProportion={foundProportion}
            foundStationsPerLine={foundStationsPerLine}
            stationsPerLine={stationsPerLine}
            defaultMinimized
            minimizable
          />
          <div className="flex gap-2 lg:gap-4">
            <Input
              fuse={fuse}
              found={found}
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
          defaultMinimized
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
        revealAll={revealAll}
      />
    </div>
  )
}

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
import Timer from '@/components/Timer'
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

export default function GamePage({
  fc,
  routes,
  maskData,
  cityData,
}: {
  fc: DataFeatureCollection
  routes?: RoutesFeatureCollection
  maskData?: any
  cityData?: any
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
    // Everything on by default (Underground, Overground, Elizabeth, DLR)
    // except Thameslink, which starts off and is toggled on via the picker.
    const o: Record<string, boolean> = {}
    for (const k of allLineKeys) o[k] = k !== 'Thameslink'
    return o
  }, [allLineKeys])

  const { value: storedEnabled, set: setEnabledLines } = useLocalStorageValue<
    Record<string, boolean>
  >(`${CITY_NAME}-enabled-lines-v4`, {
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

      if (routes) {
        // BAKED OFFSETS. The parallel-ribbon separation is baked directly into
        // routes.json coordinates at BUILD time (true geometric parallel offset
        // along per-vertex miter normals — see scripts/bake-offsets.js). The
        // runtime `line-offset` paint property — which pushes each line along
        // its OWN local tangent and therefore diverges / flips order where
        // co-running geometries differ even slightly — is set to a constant 0.
        // What renders is purely the baked geometry, so co-running lines stay
        // exactly parallel and never reorder across zoom. Tradeoff: the offset
        // is in GROUND units, so ribbon spacing reads tighter when zoomed out
        // and wider when zoomed in (vs the old screen-pixel offset).

        m.addSource('lines', { type: 'geojson', data: routes })
        m.addLayer({
          id: 'lines',
          type: 'line',
          source: 'lines',
          paint: {
            // Thinner than the previous pass — clearer separation when 3-4
            // lines run in parallel and easier to read when zoomed in.
            // Widths reduced 25% from the previous pass for a lighter map.
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              8.763, 1.95,
              13, 3.375,
              18, 5.625,
              22, 6.75,
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
            'line-offset': 0,
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
              8.763, 0.675,
              13, 1.125,
              18, 1.875,
              22, 2.25,
            ],
            'line-color': '#ffffff',
            'line-offset': 0,
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
              8.763, 0.675,
              13, 1.125,
              18, 1.875,
              22, 2.25,
            ],
            'line-color': '#ffffff',
            'line-dasharray': [3, 2.5],
            'line-offset': 0,
          },
          layout: {
            'line-sort-key': ['get', 'order'],
            'line-cap': 'butt',
            'line-join': 'round',
          },
        })
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
        <Timer />
        <div className="absolute top-4 h-12 w-96 max-w-full px-1 lg:top-32">
          <FoundSummary
            className="mb-4 rounded-lg bg-white p-4 shadow-md lg:hidden"
            foundProportion={foundProportion}
            foundStationsPerLine={foundStationsPerLine}
            stationsPerLine={stationsPerLine}
            defaultMinimized
            minimizable
            enabledLines={enabledLines}
            setEnabledLines={setEnabledLines}
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
          enabledLines={enabledLines}
          setEnabledLines={setEnabledLines}
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

'use client'

import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'

export type Theme = 'light' | 'dark'

// Dark basemap, applied at runtime on top of the Carto Positron style (as the
// Atlas shell does for its paper look). Only the basemap is touched: the
// `background` layer and layers drawn from a vector/raster source. GamePage's
// own layers (lines*, stations*, labels, mask, borders) all use GeoJSON
// sources, so they are never recoloured. The original paint values are saved
// the first time a layer is changed and restored exactly for light mode.
const BG = '#23252a'
// station names: light text on a dark halo in dark mode (dark text on a light
// halo read as doubled, embossed lettering on the dark basemap)
const HALO: { id: string; prop: 'text-color' | 'text-halo-color' | 'text-halo-width' | 'text-halo-blur'; dark: string | number }[] = [
  { id: 'stations-labels', prop: 'text-color', dark: '#eceef1' },
  { id: 'stations-labels', prop: 'text-halo-color', dark: 'rgba(20, 21, 24, 0.9)' },
  { id: 'stations-labels', prop: 'text-halo-width', dark: 1.4 },
  { id: 'stations-labels', prop: 'text-halo-blur', dark: 0.2 },
]
const COLOR_PROPS = ['background-color', 'fill-color', 'fill-outline-color', 'line-color'] as const

function darkColor(id: string, prop: string): string | null {
  if (id === 'background') return BG
  if (id === 'water' || id === 'waterway') return '#151d25'
  if (id === 'water_shadow') return null
  if (id === 'landuse_residential') return 'rgba(255, 255, 255, 0.022)'
  if (/^(landcover|landuse|park_)/.test(id)) return 'rgba(92, 120, 92, 0.16)'
  if (id === 'building') return '#2a2c31'
  if (id === 'building-top') return prop === 'fill-outline-color' ? '#2a2c31' : '#2e3035'
  if (/^boundary/.test(id)) return '#3a3337'
  if (/^aeroway/.test(id)) return '#2d3035'
  if (/rail_dash$/.test(id)) return '#23252a'
  if (/rail$/.test(id)) return '#3a3d44'
  if (/path$/.test(id)) return '#33363b'
  if (/_case/.test(id)) return '#1c1e22'
  if (/^tunnel_.*_fill$/.test(id)) return '#2c2f34'
  if (/(service|minor)_fill/.test(id)) return '#2f3237'
  if (/_fill/.test(id)) return '#34373d'
  return '#2e3136' // unknown basemap layer: a neutral dark tone
}

function basemapLayerIds(m: maplibregl.Map): string[] {
  const style = m.getStyle()
  if (!style?.layers) return []
  return style.layers
    .filter((l) => {
      if (l.type === 'background') return true
      const src = (l as { source?: string }).source
      const t = src ? (style.sources?.[src] as { type?: string } | undefined)?.type : undefined
      return t === 'vector' || t === 'raster'
    })
    .map((l) => l.id)
}

export default function useMapTheme(map: maplibregl.Map | null, theme: Theme) {
  // layer id -> prop -> original value (undefined = was unset)
  const saved = useRef(new Map<string, Record<string, unknown>>())

  useEffect(() => {
    const m = map
    if (!m) return
    const apply = () => {
      if (!(m as any).style || !m.getLayer('background')) return false
      const ids = basemapLayerIds(m)
      ids.forEach((id) => {
        const layer = m.getLayer(id)
        if (!layer) return
        const props = COLOR_PROPS.filter((pr) => pr.startsWith(layer.type) && m.getPaintProperty(id, pr) !== undefined)
        if (!props.length) return
        if (theme === 'dark') {
          let orig = saved.current.get(id)
          if (!orig) {
            orig = {}
            props.forEach((pr) => (orig![pr] = m.getPaintProperty(id, pr)))
            saved.current.set(id, orig)
          }
          props.forEach((pr) => {
            const v = darkColor(id, pr)
            if (v != null) m.setPaintProperty(id, pr, v)
          })
        } else {
          const orig = saved.current.get(id)
          if (!orig) return
          Object.keys(orig).forEach((pr) => m.setPaintProperty(id, pr, orig[pr] as any))
        }
      })
      // station names: swap to light-on-dark in dark mode (see HALO)
      HALO.forEach(({ id, prop, dark }) => {
        if (!m.getLayer(id)) return
        const key = `${id}|${prop}`
        if (theme === 'dark') {
          if (!saved.current.has(key)) saved.current.set(key, { v: m.getPaintProperty(id, prop) })
          m.setPaintProperty(id, prop, dark)
        } else {
          const orig = saved.current.get(key)
          if (orig) m.setPaintProperty(id, prop, orig.v as any)
        }
      })
      return true
    }
    if (apply()) return
    // style not ready yet: try again once it is
    const retry = () => {
      if (apply()) {
        m.off('styledata', retry)
        m.off('load', retry)
      }
    }
    m.on('styledata', retry)
    m.on('load', retry)
    return () => {
      m.off('styledata', retry)
      m.off('load', retry)
    }
  }, [map, theme])

  // keep the map container's own background in step (visible before tiles draw)
  useEffect(() => {
    const el = map?.getContainer()
    if (el) el.style.background = theme === 'dark' ? BG : ''
  }, [map, theme])
}

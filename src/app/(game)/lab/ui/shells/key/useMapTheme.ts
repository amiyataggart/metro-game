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
const BG = '#111214' // off-black, so the basemap's outlines read (Google Maps-dark-like)
const LIGHT_BG = '#ffffff' // light mode: plain white ground, not Positron's off-white
// station names: light text on a dark halo in dark mode (dark text on a light
// halo read as doubled, embossed lettering on the dark basemap)
// GamePage hides an unfound station's name by colouring it transparent
// (`case found -> colour, else transparent`), so the dark values keep that
// rule and only swap the found colours.
const found = (yes: string) => ['case', ['to-boolean', ['feature-state', 'found']], yes, 'rgba(0, 0, 0, 0)']
const HALO: { id: string; prop: 'text-color' | 'text-halo-color' | 'text-halo-width' | 'text-halo-blur'; dark: unknown }[] = [
  { id: 'stations-labels', prop: 'text-color', dark: found('#eceef1') },
  { id: 'stations-labels', prop: 'text-halo-color', dark: found('rgba(0, 0, 0, 0.9)') },
  { id: 'stations-labels', prop: 'text-halo-width', dark: 1.4 },
  { id: 'stations-labels', prop: 'text-halo-blur', dark: 0.2 },
  // the hovered station's name (its own layer, found stations only)
  { id: 'hover-label-point', prop: 'text-color', dark: '#ffffff' },
  { id: 'hover-label-point', prop: 'text-halo-color', dark: 'rgba(0, 0, 0, 0.95)' },
]
const COLOR_PROPS = ['background-color', 'fill-color', 'fill-outline-color', 'line-color'] as const

function darkColor(id: string, prop: string): string | null {
  if (id === 'background') return BG
  if (id === 'water' || id === 'waterway') return '#17263c'
  if (id === 'water_shadow') return null
  if (id === 'landuse_residential') return 'rgba(255, 255, 255, 0.035)'
  if (/^(landcover|landuse|park_)/.test(id)) return 'rgba(70, 125, 80, 0.32)'
  if (id === 'building') return '#1d1e21'
  if (id === 'building-top') return prop === 'fill-outline-color' ? '#1d1e21' : '#222326'
  if (/^boundary/.test(id)) return '#3a3b3f'
  if (/^aeroway/.test(id)) return '#26272a'
  if (/rail_dash$/.test(id)) return '#111214'
  if (/rail$/.test(id)) return '#45464b'
  if (/path$/.test(id)) return '#2c2d31'
  if (/_case/.test(id)) return '#1a1b1e'
  if (/^tunnel_.*_fill$/.test(id)) return '#2a2b2f'
  if (/(service|minor)_fill/.test(id)) return '#303136'
  if (/_fill/.test(id)) return '#3c3d43'
  return '#2a2b2f' // unknown basemap layer: a neutral dark tone
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
      if (theme === 'light') m.setPaintProperty('background', 'background-color', LIGHT_BG)
      // the Northern line turns white in dark mode, as on the Night Tube map:
      // swap its entry in the game's line/marker colour matches
      ;(m.getStyle()?.layers || []).forEach((l) => {
        if (ids.includes(l.id)) return
        for (const pr of ['line-color', 'circle-color'] as const) {
          if (!pr.startsWith(l.type)) continue
          const key = `${l.id}|${pr}|northern`
          const cur = m.getPaintProperty(l.id, pr) as unknown
          if (theme === 'dark') {
            if (saved.current.has(key) || !Array.isArray(cur) || cur[0] !== 'match') continue
            const at = cur.findIndex((v, i) => i > 1 && Array.isArray(v) && v.includes('Northern'))
            if (at < 0) continue
            saved.current.set(key, { v: cur })
            const next = cur.slice()
            next[at + 1] = '#ffffff'
            m.setPaintProperty(l.id, pr, next as any)
          } else {
            const orig = saved.current.get(key)
            if (!orig) continue
            m.setPaintProperty(l.id, pr, orig.v as any)
            saved.current.delete(key)
          }
        }
      })
      // the white cores of striped lines (Overground, Elizabeth, DLR, Cable
      // Car, National Rail) turn black at night; custom stripe colours stay
      ;(m.getStyle()?.layers || []).forEach((l) => {
        if (!/-stripe-/.test(l.id)) return
        const key = `${l.id}|line-color|stripe`
        const cur = m.getPaintProperty(l.id, 'line-color') as unknown
        const isWhite = (v: unknown) => typeof v === 'string' && /^(#fff(fff)?|white)$/i.test(v)
        if (theme === 'dark') {
          if (saved.current.has(key)) return
          const next = Array.isArray(cur) ? cur.map((v) => (isWhite(v) ? '#000000' : v)) : isWhite(cur) ? '#000000' : cur
          if (JSON.stringify(next) === JSON.stringify(cur)) return
          saved.current.set(key, { v: cur })
          m.setPaintProperty(l.id, 'line-color', next as any)
        } else {
          const orig = saved.current.get(key)
          if (!orig) return
          m.setPaintProperty(l.id, 'line-color', orig.v as any)
          saved.current.delete(key)
        }
      })
      // station names: swap to light-on-dark in dark mode (see HALO)
      HALO.forEach(({ id, prop, dark }) => {
        if (!m.getLayer(id)) return
        const key = `${id}|${prop}`
        if (theme === 'dark') {
          if (!saved.current.has(key)) saved.current.set(key, { v: m.getPaintProperty(id, prop) })
          m.setPaintProperty(id, prop, dark as any)
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

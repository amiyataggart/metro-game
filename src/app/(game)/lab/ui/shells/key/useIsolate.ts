'use client'

import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'

const DIM = 0.1

// Hovering a key row isolates its line(s) on the map: every other line's
// layers drop to DIM opacity. Works on GamePage's own route layers (any line
// layer whose source starts with "lines"), found at runtime, and restores the
// original paint values exactly (they may be zoom expressions on /lab levels).
export default function useIsolate(map: maplibregl.Map | null, keys: string[] | null) {
  const saved = useRef(new Map<string, unknown>())
  const sig = keys ? keys.join(',') : ''

  useEffect(() => {
    if (!map) return
    const restore = () => {
      saved.current.forEach((v, id) => {
        if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', v as any)
      })
      saved.current.clear()
    }
    if (!sig) {
      restore()
      return
    }
    let ids: string[] = []
    try {
      ids = map.getLayersOrder().filter((id) => {
        const l = map.getLayer(id) as any
        return l && l.type === 'line' && typeof l.source === 'string' && l.source.startsWith('lines')
      })
    } catch {
      return
    }
    const cond = ['in', ['get', 'line'], ['literal', sig.split(',')]]
    const dimValue = (v: unknown): unknown => {
      if (typeof v === 'number') return ['case', cond, v, v * DIM]
      if (Array.isArray(v) && v[0] === 'interpolate' && Array.isArray(v[2]) && v[2][0] === 'zoom') {
        const out = v.slice(0, 3)
        for (let i = 3; i < v.length; i += 2) {
          const val = v[i + 1]
          out.push(v[i], typeof val === 'number' ? ['case', cond, val, val * DIM] : val)
        }
        return out
      }
      return v
    }
    ids.forEach((id) => {
      if (!saved.current.has(id)) {
        const orig = map.getPaintProperty(id, 'line-opacity')
        saved.current.set(id, orig === undefined ? 1 : orig)
      }
      try {
        map.setPaintProperty(id, 'line-opacity', dimValue(saved.current.get(id)) as any)
      } catch {
        /* ignore an expression we cannot wrap */
      }
    })
  }, [map, sig])

  // restore on unmount
  useEffect(() => {
    const s = saved.current
    return () => {
      if (!map) return
      s.forEach((v, id) => {
        try {
          if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', v as any)
        } catch {}
      })
      s.clear()
    }
  }, [map])
}

'use client'

import { useEffect, useState } from 'react'

export type ViewportBox = { top: number; height: number; keyboard: number }

// The visible part of the page. On phones the on-screen keyboard shrinks the
// visual viewport (and iOS may scroll it), so the chrome layer is pinned to
// it: the dock then always sits just above the keyboard. The map itself stays
// full-window (no MapLibre resize on every keyboard frame); finds are framed
// into the visible band with a fly-to offset instead.
export default function useVisualViewport(): ViewportBox | null {
  const [box, setBox] = useState<ViewportBox | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    const update = () => {
      const h = vv ? vv.height : window.innerHeight
      const top = vv ? vv.offsetTop : 0
      setBox({ top, height: h, keyboard: Math.max(0, window.innerHeight - h - top) })
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return box
}

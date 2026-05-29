'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// Draggable count-up timer. Grab the 6-dot handle to move it anywhere over the
// map (clamped inside the map area, never over the sidebar). Layout: handle,
// Start/Stop, then the time. Starts near the top, level with "% stations found".
const MARGIN = 12 // px inset from the map edges while dragging
const TOP_INIT = 24 // px from the top — matches the "% stations found" offset

export default function Timer() {
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0) // ms
  const baseRef = useRef(0)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const dragOff = useRef<{ x: number; y: number } | null>(null)

  // tick
  useEffect(() => {
    if (!running) return
    baseRef.current = performance.now() - elapsed
    let raf = 0
    const tick = () => {
      setElapsed(performance.now() - baseRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  // initial position: horizontally centred in the map area, near the top
  useEffect(() => {
    if (pos || !ref.current) return
    const parent = ref.current.offsetParent as HTMLElement | null
    const pw = parent ? parent.clientWidth : window.innerWidth
    const w = ref.current.offsetWidth || 160
    setPos({ left: Math.max(MARGIN, (pw - w) / 2), top: TOP_INIT })
  }, [pos])

  const onHandleDown = useCallback((e: React.PointerEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    dragOff.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
    const move = (ev: PointerEvent) => {
      if (!dragOff.current || !ref.current) return
      const parent = ref.current.offsetParent as HTMLElement | null
      const pr = parent
        ? parent.getBoundingClientRect()
        : ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight } as DOMRect)
      const w = ref.current.offsetWidth
      const h = ref.current.offsetHeight
      let left = ev.clientX - pr.left - dragOff.current.x
      let top = ev.clientY - pr.top - dragOff.current.y
      left = Math.max(MARGIN, Math.min(left, pr.width - w - MARGIN))
      top = Math.max(MARGIN, Math.min(top, pr.height - h - MARGIN))
      setPos({ left, top })
    }
    const up = () => {
      dragOff.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  const fmt = (ms: number) => {
    const total = Math.floor(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
  }

  return (
    <div
      ref={ref}
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : { left: '50%', top: TOP_INIT, transform: 'translateX(-50%)' }
      }
      className="absolute z-30 flex items-center gap-1.5 rounded-full bg-white px-2 py-1.5 shadow-md"
    >
      <button
        type="button"
        aria-label="Move timer"
        onPointerDown={onHandleDown}
        className="flex cursor-grab touch-none items-center px-0.5 text-gray-400 hover:text-gray-600 active:cursor-grabbing"
      >
        {/* 2x3 dots; vertical gap (5) a touch tighter than horizontal (6) for
            optical balance — numerically-equal spacing reads as too tall. */}
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
          <circle cx="5" cy="3" r="1.4" />
          <circle cx="5" cy="8" r="1.4" />
          <circle cx="5" cy="13" r="1.4" />
          <circle cx="11" cy="3" r="1.4" />
          <circle cx="11" cy="8" r="1.4" />
          <circle cx="11" cy="13" r="1.4" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => {
          // On Start/Resume (currently not running), focus the station box so
          // you can type immediately. The click is a user gesture, so this also
          // brings up the keyboard on mobile.
          if (!running) document.getElementById('input')?.focus()
          setRunning((r) => !r)
        }}
        className={`rounded-full px-3 py-1 text-sm font-bold text-white transition-colors ${
          running ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        {running ? 'Stop' : elapsed > 0 ? 'Resume' : 'Start'}
      </button>
      <span className="min-w-[3.25rem] px-1 text-center font-mono text-lg font-bold tabular-nums text-zinc-900">
        {fmt(elapsed)}
      </span>
      {!running && elapsed > 0 && (
        <button
          type="button"
          onClick={() => {
            setRunning(false)
            setElapsed(0)
          }}
          className="pr-1 text-sm font-semibold text-zinc-500 hover:text-zinc-800"
        >
          Reset
        </button>
      )}
    </div>
  )
}

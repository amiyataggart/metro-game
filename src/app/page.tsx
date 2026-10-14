'use client'

import { useEffect } from 'react'

// Static-export friendly home redirect (server `redirect()` is unavailable in
// `output: 'export'`). Sends visitors straight to the game.
export default function Home() {
  useEffect(() => {
    window.location.replace('/play')
  }, [])
  return (
    <a href="/play" style={{ padding: 16, display: 'inline-block' }}>
      Play London Rail Memory →
    </a>
  )
}

'use client'

import { useEffect } from 'react'

// Static-export friendly home redirect (server `redirect()` is unavailable in
// `output: 'export'`). Sends visitors straight to the London map.
export default function Home() {
  useEffect(() => {
    window.location.replace('/london')
  }, [])
  return (
    <a href="/london" style={{ padding: 16, display: 'inline-block' }}>
      Go to the London rail map →
    </a>
  )
}

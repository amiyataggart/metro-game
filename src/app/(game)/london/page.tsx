'use client'

import { useEffect } from 'react'

// /london moved to /play (Oct 2026); the previous page is archived at /old2.
// Client-side redirect (static export has no server redirects); keeps any hash.
export default function London() {
  useEffect(() => {
    window.location.replace('/play' + window.location.hash)
  }, [])
  return (
    <a href="/play" style={{ padding: 16, display: 'inline-block' }}>
      London Rail Memory has moved to /play →
    </a>
  )
}

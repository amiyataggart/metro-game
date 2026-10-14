'use client'

import type { GameShellProps } from '@/components/GamePage'

// placeholder: replaced by the Atlas layout
export default function Atlas(p: GameShellProps) {
  return <div className="relative h-screen w-full">{p.mapSlot}</div>
}

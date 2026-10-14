'use client'

import type { GameShellProps } from '@/components/GamePage'

// placeholder: replaced by the Dock layout
export default function Dock(p: GameShellProps) {
  return <div className="relative h-screen w-full">{p.mapSlot}</div>
}

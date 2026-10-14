'use client'

import type { GameShellProps } from '@/components/GamePage'

// placeholder: replaced by the Key layout
export default function Key(p: GameShellProps) {
  return <div className="relative h-screen w-full">{p.mapSlot}</div>
}

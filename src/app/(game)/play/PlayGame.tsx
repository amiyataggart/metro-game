'use client'

import GamePage, { LabSizing, RouteLevel } from '@/components/GamePage'
import { DataFeatureCollection } from '@/lib/types'
import Key from '../lab/ui/shells/key/Key'

// The game in the Key layout (a GamePage Shell). Client side so the Shell
// component can be passed to GamePage.
export default function PlayGame(props: {
  fc: DataFeatureCollection
  routeLevels: RouteLevel[]
  sizing: LabSizing
  maskData?: any
  cityData?: any
}) {
  return <GamePage {...props} Shell={Key} />
}

'use client'

import GamePage, { GameShellProps, LabSizing, RouteLevel } from '@/components/GamePage'
import { DataFeatureCollection } from '@/lib/types'
import type { UiSlug } from './uiVariants'
import Classic from './shells/Classic'
import Key from './shells/key/Key'
import Dock from './shells/dock/Dock'
import Atlas from './shells/atlas/Atlas'

const SHELLS: Record<UiSlug, React.ComponentType<GameShellProps>> = {
  classic: Classic,
  key: Key,
  dock: Dock,
  atlas: Atlas,
}

export default function UiLab({
  slug,
  ...rest
}: {
  slug: UiSlug
  fc: DataFeatureCollection
  routeLevels: RouteLevel[]
  sizing: LabSizing
  maskData?: any
  cityData?: any
}) {
  return <GamePage {...rest} Shell={SHELLS[slug]} />
}

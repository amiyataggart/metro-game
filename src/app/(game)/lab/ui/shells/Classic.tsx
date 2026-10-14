'use client'

import { useState } from 'react'
import type { GameShellProps } from '@/components/GamePage'
import MenuComponent from '@/components/Menu'
import IntroModal from '@/components/IntroModal'
import FoundSummary from '@/components/FoundSummary'
import Timer from '@/components/Timer'
import Input from '@/components/Input'
import SettingsModal from '@/components/SettingsModal'
import FoundList from '@/components/FoundList'
import useTranslation from '@/hooks/useTranslation'

// Baseline: the /london layout (GamePage's own JSX) rebuilt from GameShellProps.
export default function Classic(p: GameShellProps) {
  const { t } = useTranslation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const summary = {
    foundProportion: p.foundProportion,
    foundStationsPerLine: p.foundStationsPerLine,
    stationsPerLine: p.stationsPerLine,
    enabledLines: p.enabledLines,
    setEnabledLines: p.setEnabledLines,
    showTimer: p.showTimer,
    setShowTimer: p.setShowTimer,
  }
  return (
    <div className="flex h-screen flex-row items-top justify-between">
      <div className="relative flex h-screen grow justify-center">
        {p.mapSlot}
        <Timer hidden={!p.showTimer} />
        <div className="absolute top-4 h-12 w-96 max-w-full px-1 lg:top-32">
          <FoundSummary className="mb-4 rounded-lg bg-white p-4 shadow-md lg:hidden" defaultDensity="small" minimizable {...summary} />
          <div className="flex gap-2 lg:gap-4">
            <Input
              matcher={p.matcher}
              found={p.knownFound}
              setFound={p.setFound}
              setIsNewPlayer={p.setIsNewPlayer}
              inputRef={p.inputRef}
              map={p.map}
              idMap={p.idMap}
            />
            <MenuComponent onReset={p.onReset} openSettings={() => setSettingsOpen(true)} />
          </div>
        </div>
      </div>
      <div className="z-10 hidden h-full overflow-y-auto bg-zinc-50 p-6 shadow-lg lg:block lg:w-96 xl:w-[32rem]">
        <FoundSummary minimizable defaultDensity="full" {...summary} />
        <hr className="my-4 w-full border-b border-zinc-100" />
        <FoundList
          found={p.found}
          idMap={p.idMap}
          setHoveredId={p.setHoveredId}
          hoveredId={p.hoveredId}
          hideLabels={!p.showFoundLabels}
          zoomToFeature={p.zoomToFeature}
        />
      </div>
      <IntroModal inputRef={p.inputRef} open={p.isNewPlayer} setOpen={p.setIsNewPlayer}>
        {t('introInstruction')} ⏎
      </IntroModal>
      <SettingsModal
        open={settingsOpen}
        setOpen={setSettingsOpen}
        enabledLines={p.enabledLines}
        setEnabledLines={p.setEnabledLines}
        showAllStations={p.showAllStations}
        setShowAllStations={p.setShowAllStations}
        showFoundLabels={p.showFoundLabels}
        setShowFoundLabels={p.setShowFoundLabels}
        smoothLines={p.smoothLines}
        setSmoothLines={p.setSmoothLines}
        revealAll={p.revealAll}
      />
    </div>
  )
}

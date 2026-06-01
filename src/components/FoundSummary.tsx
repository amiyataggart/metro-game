'use client'

import classNames from 'classnames'
import { useState } from 'react'
import ProgressBars, { LegendDensity } from './ProgressBars'
import LinePicker from './LinePicker'
import { MaximizeIcon } from './MaximizeIcon'
import { MinimizeIcon } from './MinimizeIcon'
import useTranslation from '@/hooks/useTranslation'

// One button cycles the legend density. full → large → small → full: the first
// two clicks contract (show the Minimize glyph), and from the smallest form the
// next click expands all the way back (Maximize glyph).
const CYCLE: Record<LegendDensity, LegendDensity> = {
  full: 'large',
  large: 'small',
  small: 'full',
}

const FoundSummary = ({
  className,
  foundStationsPerLine,
  stationsPerLine,
  foundProportion,
  minimizable = false,
  defaultMinimized = false,
  enabledLines,
  setEnabledLines,
  showTimer,
  setShowTimer,
}: {
  className?: string
  foundStationsPerLine: Record<string, number>
  stationsPerLine: Record<string, number>
  foundProportion: number
  minimizable?: boolean
  defaultMinimized?: boolean
  enabledLines?: Record<string, boolean>
  setEnabledLines?: (next: Record<string, boolean>) => void
  showTimer?: boolean
  setShowTimer?: (v: boolean) => void
}) => {
  const { t } = useTranslation()
  const [density, setDensity] = useState<LegendDensity>(
    defaultMinimized ? 'large' : 'full',
  )

  const hasTimerToggle = showTimer !== undefined && setShowTimer

  return (
    <div className={classNames(className, '@container')}>
      <div className="mb-2">
        {/* Header row: progress text on the left, controls aligned right. */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <p>
            <span className="text-lg font-bold @md:text-2xl">
              {((foundProportion || 0) * 100).toFixed(1)}
            </span>{' '}
            <span className="mr-2 text-lg @md:text-xl">%</span>
            <span className="text-sm">{t('stationsFound')}</span>
          </p>
          {(minimizable || hasTimerToggle || (enabledLines && setEnabledLines)) && (
            <div className="flex shrink-0 items-center gap-1">
              {enabledLines && setEnabledLines && (
                <LinePicker
                  enabledLines={enabledLines}
                  setEnabledLines={setEnabledLines}
                />
              )}
              {hasTimerToggle && (
                <button
                  aria-label={showTimer ? 'Hide timer' : 'Show timer'}
                  title={showTimer ? 'Hide timer' : 'Show timer'}
                  onClick={() => setShowTimer!(!showTimer)}
                  className={classNames(
                    'flex h-8 w-8 items-center justify-center rounded-full shadow',
                    showTimer
                      ? 'bg-zinc-700 text-white'
                      : 'bg-white text-gray-500',
                  )}
                >
                  <StopwatchIcon className="h-4 w-4" off={!showTimer} />
                </button>
              )}
              {minimizable && (
                <button
                  aria-label={density === 'small' ? 'Expand legend' : 'Contract legend'}
                  title={density === 'small' ? 'Expand legend' : 'Contract legend'}
                  onClick={() => setDensity(CYCLE[density])}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-500 shadow"
                >
                  {density === 'small' ? (
                    <MaximizeIcon className="h-4 w-4" />
                  ) : (
                    <MinimizeIcon className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
        <ProgressBars
          density={density}
          foundStationsPerLine={foundStationsPerLine}
          stationsPerLine={stationsPerLine}
        />
      </div>
    </div>
  )
}

// Stopwatch glyph; `off` adds a diagonal strike to read as "hidden".
const StopwatchIcon = ({
  className,
  off,
}: {
  className?: string
  off?: boolean
}) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className={className} aria-hidden>
    <line x1="6.5" y1="1.4" x2="9.5" y2="1.4" strokeWidth="1.4" strokeLinecap="round" />
    <line x1="8" y1="1.4" x2="8" y2="3.2" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="9.2" r="5" strokeWidth="1.4" />
    <line x1="8" y1="9.2" x2="8" y2="6.4" strokeWidth="1.4" strokeLinecap="round" />
    {off && (
      <line x1="2.5" y1="14" x2="13.5" y2="2.5" strokeWidth="1.4" strokeLinecap="round" />
    )}
  </svg>
)

export default FoundSummary

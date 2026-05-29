'use client'

import classNames from 'classnames'
import { useState } from 'react'
import ProgressBars from './ProgressBars'
import LinePicker from './LinePicker'
import { MaximizeIcon } from './MaximizeIcon'
import { MinimizeIcon } from './MinimizeIcon'
import useTranslation from '@/hooks/useTranslation'

const FoundSummary = ({
  className,
  foundStationsPerLine,
  stationsPerLine,
  foundProportion,
  minimizable = false,
  defaultMinimized = false,
  enabledLines,
  setEnabledLines,
}: {
  className?: string
  foundStationsPerLine: Record<string, number>
  stationsPerLine: Record<string, number>
  foundProportion: number
  minimizable?: boolean
  defaultMinimized?: boolean
  enabledLines?: Record<string, boolean>
  setEnabledLines?: (next: Record<string, boolean>) => void
}) => {
  const { t } = useTranslation()
  const [minimized, setMinimized] = useState<boolean>(defaultMinimized)

  return (
    <div
      className={classNames(className, '@container', {
        relative: minimizable,
      })}
    >
      <div className="mb-2">
        <p className="mb-2">
          <span className="text-lg font-bold @md:text-2xl">
            {((foundProportion || 0) * 100).toFixed(1)}
          </span>{' '}
          <span className="mr-2 text-lg @md:text-xl">%</span>
          <span className="text-sm">{t('stationsFound')}</span>
        </p>
        <ProgressBars
          minimized={minimized}
          foundStationsPerLine={foundStationsPerLine}
          stationsPerLine={stationsPerLine}
        />
      </div>
      {(minimizable || (enabledLines && setEnabledLines)) && (
        <div className="absolute bottom-0 right-0 flex flex-col items-end">
          {enabledLines && setEnabledLines && (
            <div className="mx-2 my-1">
              <LinePicker
                enabledLines={enabledLines}
                setEnabledLines={setEnabledLines}
              />
            </div>
          )}
          {minimizable && (
            <button
              onClick={() => setMinimized(!minimized)}
              className="mx-2 my-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-500 shadow"
            >
              {minimized ? (
                <MaximizeIcon className="h-4 w-4" />
              ) : (
                <MinimizeIcon className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default FoundSummary

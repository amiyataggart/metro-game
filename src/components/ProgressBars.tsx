'use client'

import classNames from 'classnames'
import { useConfig } from '@/lib/configContext'
import { Line } from '@/lib/types'
import { roundelSvg } from '@/lib/roundel'

// Three display densities, cycled by the legend's single expand/contract button:
//   full  — labelled 2-column list (roundel + line name)
//   large — roundels only, 32px, wrapping to fill the available width
//   small — roundels only, 22px, wrapping to fill the available width
// Both contracted forms wrap onto new lines (no horizontal scroll) and reflow
// as the sidebar width changes.
export type LegendDensity = 'full' | 'large' | 'small'

const ProgressBars = ({
  foundStationsPerLine,
  stationsPerLine,
  density = 'full',
}: {
  foundStationsPerLine: Record<string, number>
  stationsPerLine: Record<string, number>
  density?: LegendDensity
}) => {
  const { LINES } = useConfig()
  const lines = Object.keys(LINES).filter((line) => stationsPerLine[line])
  const full = density === 'full'
  return (
    <div
      className={classNames('@container', {
        'grid grid-cols-2 gap-2': full,
        'flex flex-wrap gap-2': density === 'large',
        'flex flex-wrap gap-1.5': density === 'small',
      })}
    >
      {lines.map((key) => {
        const line = LINES[key]
        const total = stationsPerLine[key]
        const found = foundStationsPerLine[key] || 0
        const title = `${line.name} — ${found}/${total}`
        return (
          <div key={key} className="flex items-center gap-2">
            <LegendRoundel
              title={title}
              line={line}
              found={found}
              total={total}
              size={density === 'small' ? 22 : 32}
            />
            {full && (
              <p className="truncate whitespace-nowrap text-sm">{title}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

const LegendRoundel = ({
  title,
  line,
  found,
  total,
  size = 32,
}: {
  title: string
  line: Line
  found: number
  total: number
  size?: number
}) => {
  const pct = total > 0 ? Math.min(1, found / total) : 0

  // Geometry lives in lib/roundel.ts (shared with the completion confetti, where
  // each particle is a line's roundel) so the two can never drift. The legend
  // passes the live progress fraction; the ring draws a clockwise arc from 12
  // o'clock that fills out 0→100% as the line is completed.
  return (
    <div
      title={title}
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: roundelSvg(line, { pct, px: size }) }}
    />
  )
}

export default ProgressBars

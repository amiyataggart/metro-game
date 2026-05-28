'use client'

import classNames from 'classnames'
import { useConfig } from '@/lib/configContext'
import { Line } from '@/lib/types'

const ProgressBars = ({
  foundStationsPerLine,
  stationsPerLine,
  minimized = false,
}: {
  foundStationsPerLine: Record<string, number>
  stationsPerLine: Record<string, number>
  minimized?: boolean
}) => {
  const { LINES } = useConfig()
  const lines = Object.keys(LINES).filter((line) => stationsPerLine[line])
  return (
    <div
      className={classNames('grid gap-2 @container', {
        'grid-cols-[repeat(8,min-content)]': minimized,
        'grid-cols-2': !minimized,
      })}
    >
      {lines.map((key) => {
        const line = LINES[key]
        const total = stationsPerLine[key]
        const found = foundStationsPerLine[key] || 0
        const title = `${line.name} — ${found}/${total}`
        return (
          <div key={key} className="flex items-center gap-2">
            <LegendRoundel title={title} line={line} found={found} total={total} />
            {!minimized && (
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
}: {
  title: string
  line: Line
  found: number
  total: number
}) => {
  const pct = total > 0 ? Math.min(1, found / total) : 0

  // Geometry — viewBox in arbitrary units; component is sized in CSS.
  const S = 32
  const cx = S / 2
  const cy = S / 2
  // Service-line bar — half the previous thickness.
  const barH = S * 0.17
  const stripeW = Math.max(1, barH / 3)
  // Hollow progress ring sits inside the bar: outer diameter = 80% of the
  // bar width, stroke width = bar thickness. Looks like a TFL roundel at
  // 100% (ring around bar).
  const ringStroke = barH
  const ringOuterR = (S * 0.8) / 2
  const ringR = ringOuterR - ringStroke / 2
  const circumference = 2 * Math.PI * ringR
  // Hollow circle that "fills out" as progress goes 0→100%. The stroke
  // draws an arc starting at 12 o'clock and sweeping clockwise.
  const dashOffset = circumference * (1 - pct)

  return (
    <div
      title={title}
      className="relative h-8 w-8 shrink-0"
    >
      <svg
        viewBox={`0 0 ${S} ${S}`}
        width="100%"
        height="100%"
        aria-label={title}
      >
        {/* Progress ring — outline only, fills out as the line is completed. */}
        <circle
          cx={cx}
          cy={cy}
          r={ringR}
          fill="none"
          stroke={line.color}
          strokeWidth={ringStroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
        />

        {/* Horizontal bar — anchored to the start and end of the swatch
            regardless of progress, styled to match how the line renders on
            the map (solid / hollow with white stripe / hollow with dashed
            white stripe). */}
        <rect
          x={0}
          y={cy - barH / 2}
          width={S}
          height={barH}
          fill={line.color}
        />
        {line.stripe === 'solid' && (
          <line
            x1={0}
            x2={S}
            y1={cy}
            y2={cy}
            stroke="#ffffff"
            strokeWidth={stripeW}
            strokeLinecap="butt"
          />
        )}
        {line.stripe === 'dashed' && (
          <line
            x1={0}
            x2={S}
            y1={cy}
            y2={cy}
            stroke="#ffffff"
            strokeWidth={stripeW}
            strokeDasharray={`${stripeW * 2.4} ${stripeW * 1.8}`}
            strokeLinecap="butt"
          />
        )}
      </svg>
    </div>
  )
}

export default ProgressBars

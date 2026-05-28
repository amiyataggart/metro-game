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
  const ringStroke = 2.5
  const ringR = cx - ringStroke / 2
  const discR = ringR - ringStroke / 2
  const barH = S * 0.34
  const stripeW = Math.max(1.4, barH / 3)
  const circumference = 2 * Math.PI * ringR
  // start arc at 12 o'clock, sweep clockwise
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
        {/* Disc behind the bar — fades 0→1 as the line is completed, so the
            swatch grows from a bare bar into a roundel. */}
        <circle cx={cx} cy={cy} r={discR} fill={line.color} opacity={pct} />

        {/* Progress ring — completes around the circle in line colour. */}
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

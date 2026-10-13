import { Line } from '@/lib/types'

/**
 * Horizontal bar swatch matching how the line renders on the map:
 *   - Underground tube lines: solid colored bar
 *   - Overground / Elizabeth / DLR: colored bar with a thin solid white
 *     stripe down the middle
 *   - Thameslink: colored bar with a dashed white stripe down the middle
 *     (gaps reveal the line color)
 *   - London Cable Car: two thin white lines, so the bar reads as three thin
 *     colored lines with white infill
 */
export default function LineSwatch({
  line,
  size = 'md',
  className,
}: {
  line: Line | undefined
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  if (!line) return null

  const dims = {
    xs: { w: 14, h: 5 },
    sm: { w: 18, h: 6 },
    md: { w: 24, h: 7 },
  }[size]

  const { w, h } = dims
  const stripeW = Math.max(1.2, h / 3)
  const cy = h / 2

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      style={{
        verticalAlign: 'middle',
        flexShrink: 0,
        overflow: 'visible',
      }}
      aria-label={line.name}
    >
      <rect x="0" y="0" width={w} height={h} rx={h / 2} fill={line.color} />
      {line.stripe === 'solid' && (
        <line
          x1="0"
          y1={cy}
          x2={w}
          y2={cy}
          stroke="#ffffff"
          strokeWidth={stripeW}
          strokeLinecap="round"
        />
      )}
      {line.stripe === 'dashed' && (
        <line
          x1="0"
          y1={cy}
          x2={w}
          y2={cy}
          stroke={line.stripeColor ?? '#ffffff'}
          strokeWidth={stripeW}
          strokeDasharray={`${stripeW * 2.4} ${stripeW * 1.8}`}
          strokeLinecap="butt"
        />
      )}
      {line.stripe === 'triple' &&
        [-1, 1].map((s) => (
          <line
            key={s}
            x1="0"
            y1={cy + (s * h) / 5}
            x2={w}
            y2={cy + (s * h) / 5}
            stroke="#ffffff"
            strokeWidth={h / 5}
            strokeLinecap="butt"
          />
        ))}
    </svg>
  )
}

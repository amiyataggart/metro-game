import type { Line } from '@/lib/types'

// Fill style of a line as drawn on the map: solid, white-cored (Overground,
// Elizabeth, DLR, Trams), dash-cored (National Rail) or triple (Cable Car).
export function lineFill(line: Line | undefined): React.CSSProperties {
  if (!line) return {}
  const c = line.color
  const core = line.stripeColor ?? '#ffffff'
  switch (line.stripe) {
    case 'solid':
      return { background: `linear-gradient(${c} 0 34%, ${core} 34% 66%, ${c} 66%)` }
    case 'dashed':
      return {
        background: `linear-gradient(${c} 0 34%, transparent 34% 66%, ${c} 66%), repeating-linear-gradient(90deg, ${core} 0 5px, ${c} 5px 9px)`,
      }
    case 'triple':
      return {
        background: `linear-gradient(${c} 0 20%, #fff 20% 40%, ${c} 40% 60%, #fff 60% 80%, ${c} 80%)`,
      }
    default:
      return { background: c }
  }
}

export function Bar({ line, w, h }: { line: Line | undefined; w: number; h: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-[1px]" style={{ width: w, height: h, ...lineFill(line) }} />
}

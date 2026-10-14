'use client'
// The carriage strip (../lines/strip), imported as is, for the Route tab (one
// service) and the Test tab (the same strip, stations as blanks). The strip
// draws with CSS variables (--fg, --muted, ...): they are set here from the
// Learn page's light/dark theme, and the strip's fixed white interchange rings
// are re-inked for dark mode below (CSS beats SVG presentation attributes).
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { StripDiagram, StripList, type StopInfo } from '../lines/strip/StripDiagram'
import type { StripLine } from '../lines/strip/StripDemo'
import type { LineInfo } from './data'
import { SHORT } from './short'

const PHONE = 640 // narrower than this, the strip turns into the vertical list (as the strip demo)

export const ROUTE_CSS = `
.lr-route{--fg:#18181b;--muted:#18181b;--faint:#c9c9cf;--card:#fff;--soft:#f4f4f5;--chip:#e4e4e7;--ring:#e4e4e7;
  --accent:#0019a8;--blank:#ececef;--blank-ink:#71717a;--revealed:#0019a8;--found:#059669;
  --ix-fill:#fff;--ix-ink:#18181b;--ghost:#71717a}
.dark .lr-route{--fg:#fafafa;--muted:#fafafa;--faint:#52525b;--card:#000;--soft:#18181b;--chip:#27272a;--ring:#27272a;
  --accent:#8fb4ff;--blank:#232326;--blank-ink:#a1a1aa;--revealed:#8fb4ff;--found:#34d399;
  --ix-fill:#000;--ix-ink:#f4f4f5;--ghost:#a1a1aa}
.dark .lr-route circle[fill="#fff"][stroke="#18181b"]{fill:#000;stroke:#f4f4f5}
.dark .lr-route span[class*="border-[#18181b]"]{background:#000;border-color:#f4f4f5}
.lr-test{--revealed:var(--fg);--accent:#f59e0b;--cur:#fef3c7;--cur-ink:#92400e;--cur-row:rgba(254,243,199,.55)}
.dark .lr-test{--revealed:var(--fg);--accent:#f59e0b;--cur:rgba(245,158,11,.22);--cur-ink:#fcd34d;--cur-row:rgba(245,158,11,.1)}
.lr-route svg{overflow:visible}
.lr-route .strip-stop{cursor:pointer}
.lr-route .strip-stop:hover .strip-label{fill:var(--accent)}
.lr-route .strip-stop:focus{outline:none}
.lr-route .strip-stop:focus-visible .strip-hit{stroke:var(--accent);stroke-width:2}
`

type StripProps = {
  line: LineInfo
  stops: string[]
  /** lines as drawn in the current theme */
  lineOf: (k: string) => LineInfo
  linesAt: Record<string, string[]>
  /** found in the game: true/false, null when the station is not in the game on this line */
  isFound: (name: string) => boolean | null
  touch: boolean
  fontFamily: string
}

const toStrip = (l: LineInfo): StripLine => ({
  key: l.key,
  name: l.name,
  color: l.color,
  stripe: l.stripe,
  stripeColor: l.stripeColor,
  group: '',
})

/** the stops as the strip wants them, with the lines it draws (other lines go by their chip label, as elsewhere on the page) */
export function useStripStops({ line, stops, lineOf, linesAt, isFound }: Pick<StripProps, 'line' | 'stops' | 'lineOf' | 'linesAt' | 'isFound'>) {
  const stripLines = useMemo(() => {
    const out: Record<string, StripLine> = {}
    const keys = new Set<string>([line.key])
    stops.forEach((n) => (linesAt[n] ?? []).forEach((k) => keys.add(k)))
    keys.forEach((k) => {
      const l = lineOf(k)
      if (l) out[k] = k === line.key ? toStrip(l) : { ...toStrip(l), name: SHORT[k] ?? l.name }
    })
    return out
  }, [line.key, stops, linesAt, lineOf])
  const info: StopInfo[] = useMemo(
    () =>
      stops.map((name) => {
        const others = (linesAt[name] ?? []).filter((k) => k !== line.key && stripLines[k])
        others.sort((a, b) => lineOf(a).order - lineOf(b).order)
        const f = isFound(name)
        return { name, others, near: [], nearLines: [], inGame: f !== null, found: !!f }
      }),
    [stops, linesAt, line.key, stripLines, lineOf, isFound],
  )
  return { stripLine: stripLines[line.key] ?? toStrip(line), stripLines, info }
}

/** the strip, horizontal on wide screens and the vertical list on phones (as the strip demo) */
export function StripView({
  touch,
  fontFamily,
  ...common
}: Omit<React.ComponentProps<typeof StripList>, never> & { touch: boolean; fontFamily: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const vertical = touch || (width > 0 && width < PHONE)
  return (
    <div ref={box} className="w-full">
      {width > 0 &&
        (vertical ? (
          <StripList {...common} />
        ) : (
          // the strip sizes its spacing from the names, but a blank can be wider
          // than a short name (Bank): keep a margin and let that spill into it
          <StripDiagram {...common} width={common.learning ? width - 40 : width} fontFamily={fontFamily} />
        ))}
    </div>
  )
}

/** Route: one service, found stations ticked, unfound names optionally hidden (tap to reveal) */
export default function Route({
  hideNames,
  chipList,
  ...p
}: StripProps & {
  hideNames: boolean
  chipList: (name: string) => ReactNode
}) {
  const { line, stops } = p
  const { stripLine, stripLines, info } = useStripStops(p)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<string | null>(null)

  const routeKey = `${line.key}|${stops.join('|')}`
  useEffect(() => {
    setRevealed(new Set())
    setSelected(null)
  }, [routeKey, hideNames])

  const onStop = (name: string) => {
    const s = info.find((x) => x.name === name)
    if (hideNames && !s?.found && !revealed.has(name)) setRevealed((r) => new Set(r).add(name))
    else setSelected((cur) => (cur === name ? null : name))
  }
  const sel = selected ? info.findIndex((s) => s.name === selected) : -1
  const nHidden = hideNames ? info.filter((s) => s.inGame && !s.found && !revealed.has(s.name)).length : 0

  return (
    <div className="lr-route">
      {hideNames && (
        <RevealBar nHidden={nHidden} onAll={() => setRevealed(new Set(stops))} onNone={revealed.size ? () => setRevealed(new Set()) : undefined} />
      )}
      <StripView
        touch={p.touch}
        fontFamily={p.fontFamily}
        line={stripLine}
        stops={info}
        lineOf={stripLines}
        learning={hideNames}
        progress
        revealed={revealed}
        selected={selected}
        onStop={onStop}
      />
      {sel >= 0 && (
        <StationCard name={info[sel].name} detail={`stop ${sel + 1} of ${info.length}${sel === 0 || sel === info.length - 1 ? ' · terminus' : ''}${
          info[sel].inGame ? (info[sel].found ? ' · found ✓' : ' · not found yet') : ' · not in the game'}`} chips={chipList(info[sel].name)} hasChips={info[sel].others.length > 0} />
      )}
    </div>
  )
}

export function RevealBar({ nHidden, onAll, onNone }: { nHidden: number; onAll: () => void; onNone?: () => void }) {
  const btn = 'font-bold text-zinc-900 underline decoration-zinc-400 underline-offset-2 dark:text-zinc-100'
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 text-[13px] text-zinc-600 dark:text-zinc-400">
      <span>
        Unfound names are hidden: tap a blank to reveal it. <b className="tabular-nums text-zinc-900 dark:text-zinc-100">{nHidden}</b> still hidden.
      </span>
      <button className={btn} onClick={onAll}>
        Reveal all
      </button>
      {onNone && (
        <button className={btn} onClick={onNone}>
          Hide again
        </button>
      )}
    </div>
  )
}

export function StationCard({ name, detail, chips, hasChips }: { name: string; detail: string; chips: ReactNode; hasChips: boolean }) {
  return (
    <div className="mx-3 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border-2 border-zinc-900 px-4 py-2.5 text-[13.5px] dark:border-zinc-600">
      <b className="text-[15px]">{name}</b>
      <span className="text-zinc-500 dark:text-zinc-400">{detail}</span>
      {hasChips && <span className="text-zinc-500 dark:text-zinc-400">Change for</span>}
      {chips}
    </div>
  )
}

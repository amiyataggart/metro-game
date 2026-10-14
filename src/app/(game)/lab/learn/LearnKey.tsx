'use client'
// The Learn page's line list, in the Key's visual language (lab/ui/shells/key):
// grouped like the Key, one row per line (full roundel, regular weight name).
// A row selects the line, which then opens in place to list its distinct
// routes ("All lines" first when they branch): they choose what the main area shows. No progress
// counts here: the list is for picking what to learn.
import classNames from 'classnames'
import { useState } from 'react'
import type { KeyGroup, GroupId } from '../ui/shells/key/groups'
import { KeyRoundel } from '../ui/shells/key/parts'
import { ThemeButton } from '../ui/shells/key/KeyBody'
import type { Theme } from '../ui/shells/key/useMapTheme'
import type { LineInfo } from './data'

export const PAPER = 'bg-white dark:bg-black'
// heavy "key" rules: black on paper, a soft grey on dark
export const RULE = 'border-zinc-900 dark:border-zinc-600'

/** one of the selected line's distinct routes: its index in the line's services */
export type ServiceRow = { i: number; name: string; stops: number }

function luminance(hex: string) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}
/** Text on a line-coloured fill: dark ink on the light fills dark mode uses (white Northern). */
export function inkOn(l: LineInfo): LineInfo {
  return luminance(l.color) > 0.75 && luminance(l.textColor || '#fff') > 0.6 ? { ...l, textColor: '#000000' } : l
}

export function KeyLines({
  groups,
  lineOf,
  selected,
  onSelect,
  services,
  allLines,
  wholeCount,
  svc,
  onService,
  touch,
}: {
  groups: KeyGroup[]
  /** the line as drawn in the current theme */
  lineOf: (k: string) => LineInfo
  selected: string
  onSelect: (k: string) => void
  /** the selected line's distinct routes, listed under it (none when it has just one) */
  services: ServiceRow[]
  /** offer "All lines" first (lines whose routes branch) */
  allLines: boolean
  /** stations on the selected line (for the "All lines" row) */
  wholeCount: number
  svc: number
  onService: (i: number) => void
  touch: boolean
}) {
  const [open, setOpen] = useState<Partial<Record<GroupId, boolean>>>({})
  return (
    <div className="flex flex-col">
      {groups.map((g) => {
        const isOpen = open[g.id] ?? (g.id !== 'nr' || g.keys.includes(selected))
        return (
          <section key={g.id} className="border-t border-zinc-900/90 first:border-t-0 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}
              className="flex w-full min-w-0 items-center gap-1.5 px-5 pb-1.5 pt-3 text-left"
              aria-expanded={isOpen}
            >
              <span className="truncate text-[12px] font-bold uppercase tracking-[0.14em] text-zinc-900 dark:text-zinc-100">{g.name}</span>
              <svg viewBox="0 0 10 10" className={classNames('h-2.5 w-2.5 shrink-0 text-zinc-400 transition-transform', isOpen ? 'rotate-0' : '-rotate-90')}>
                <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen && (
              <ul className="pb-2">
                {g.keys.map((k) => (
                  <LineRow
                    key={k}
                    line={lineOf(k)}
                    sel={k === selected}
                    onClick={() => onSelect(k)}
                    touch={touch}
                    services={k === selected ? services : undefined}
                    allLines={allLines}
                    wholeCount={wholeCount}
                    svc={svc}
                    onService={onService}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function LineRow({
  line,
  sel,
  onClick,
  touch,
  services,
  allLines,
  wholeCount,
  svc,
  onService,
}: {
  line: LineInfo
  sel: boolean
  onClick: () => void
  touch: boolean
  services?: ServiceRow[]
  allLines: boolean
  wholeCount: number
  svc: number
  onService: (i: number) => void
}) {
  // a line with a single route has no sub-rows: selecting the line selects it
  const rows: { i: number; name: string; meta: string }[] =
    services && services.length > 1
      ? [
          ...(allLines ? [{ i: -1, name: 'All lines', meta: `${wholeCount} stations` }] : []),
          ...services.map((s) => ({ i: s.i, name: s.name, meta: `${s.stops} stops` })),
        ]
      : []
  const R = touch ? 26 : 24
  const cx = 20 + R / 2 // the roundel's centre: the services hang off it
  return (
    <li className={classNames('relative', sel && 'bg-zinc-900/[0.06] pb-1.5 dark:bg-white/[0.08]')}>
      {sel && <span className="absolute inset-y-1 left-0 z-10 w-1 rounded-r" style={{ background: line.color }} />}
      <button
        type="button"
        onClick={onClick}
        data-line={line.key}
        aria-current={sel || undefined}
        aria-expanded={sel && rows.length > 0}
        title={`Learn the ${line.name}`}
        className={classNames(
          'relative flex w-full items-center gap-3 px-5 text-left transition-colors',
          touch ? 'h-11' : 'h-[34px]',
          !sel && 'hover:bg-zinc-900/[0.045] dark:hover:bg-white/[0.05]',
        )}
      >
        <KeyRoundel line={line} pct={1} on size={R} />
        <span className={classNames('min-w-0 grow truncate text-[14.5px] leading-tight text-zinc-900 dark:text-zinc-100', sel ? 'font-bold' : 'font-normal')}>
          {line.name}
        </span>
      </button>
      {rows.length > 0 && (
        <ul className="relative" aria-label={`${line.name} services`}>
          {/* the rail the services hang off */}
          <span
            aria-hidden
            className="absolute top-0 w-[3px] -translate-x-1/2 rounded-b-full opacity-60"
            style={{ left: cx, bottom: touch ? 20 : 15, background: line.color }}
          />
          {rows.map((r) => {
            const on = r.i === svc
            return (
              <li key={r.i}>
                <button
                  type="button"
                  onClick={() => onService(r.i)}
                  aria-current={on || undefined}
                  className={classNames(
                    'group relative flex w-full items-start gap-2 pr-4 text-left transition-colors',
                    touch ? 'min-h-[40px] py-2.5' : 'min-h-[30px] py-[6px]',
                    on ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
                  )}
                  style={{ paddingLeft: 20 + R + 12 }}
                >
                  <span
                    aria-hidden
                    className="absolute h-[11px] w-[11px] -translate-x-1/2 rounded-full border-[2.5px] bg-white dark:bg-black"
                    style={{ left: cx, top: touch ? 15 : 10.5, borderColor: line.color, background: on ? line.color : undefined }}
                  />
                  <span className={classNames('min-w-0 grow text-[13px] leading-[18px]', on ? 'font-bold' : 'font-normal')}>
                    {r.name}
                  </span>
                  <span className="shrink-0 pt-px text-[11.5px] leading-[18px] tabular-nums text-zinc-400 dark:text-zinc-500">{r.meta}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

export function KeyFooter({ theme, setTheme, touch }: { theme: Theme; setTheme: (t: Theme) => void; touch: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grow" />
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">{theme === 'dark' ? 'Dark' : 'Light'}</span>
      <ThemeButton theme={theme} setTheme={setTheme} touch={touch} />
    </div>
  )
}

export function Spine({
  groups,
  lineOf,
  selected,
  onOpen,
}: {
  groups: KeyGroup[]
  lineOf: (k: string) => LineInfo
  selected: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Open the line list"
      aria-label="Open the line list"
      className={classNames('z-10 flex h-full w-[68px] shrink-0 flex-col items-center gap-3 border-r-2 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900', RULE, PAPER)}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3.5L10.5 8 6 12.5" />
      </svg>
      <KeyRoundel line={lineOf(selected)} pct={1} on size={30} />
      <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden pt-1">
        {groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-[3px]">
            {g.keys.map((k) => (
              <div
                key={k}
                title={lineOf(k).name}
                className={classNames('h-[7px] w-10 rounded-full', k === selected && 'outline outline-2 outline-offset-1 outline-zinc-900 dark:outline-zinc-100')}
                style={{ background: lineOf(k).color }}
              />
            ))}
          </div>
        ))}
      </div>
    </button>
  )
}

export function PhoneSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onClose}
        className={classNames(
          'absolute inset-0 z-30 bg-zinc-900/25 transition-opacity duration-200 dark:bg-black/50',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <div
        className={classNames(
          'absolute inset-x-0 bottom-0 z-40 flex max-h-[88%] flex-col rounded-t-2xl border-x-2 border-t-2 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out',
          RULE,
          PAPER,
          open ? 'translate-y-0' : 'pointer-events-none translate-y-full',
        )}
        aria-hidden={!open}
      >
        <div className="flex justify-center pb-1 pt-2">
          <span className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
        </div>
        <div className="min-h-0 grow overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </>
  )
}

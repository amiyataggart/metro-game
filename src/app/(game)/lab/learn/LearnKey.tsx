'use client'
// The Learn page's line list, in the Key's visual language (lab/ui/shells/key):
// grouped like the Key, one row per line (roundel = progress ring, regular
// weight name, found/total). A row selects the line; there are no in-play
// toggles here.
import classNames from 'classnames'
import Link from 'next/link'
import { useState } from 'react'
import type { KeyGroup, GroupId } from '../ui/shells/key/groups'
import { KeyRoundel, fmtInt, hexA } from '../ui/shells/key/parts'
import { ThemeButton } from '../ui/shells/key/KeyBody'
import type { Theme } from '../ui/shells/key/useMapTheme'
import type { LineInfo } from './data'

export const PAPER = 'bg-white dark:bg-black'
// heavy "key" rules: black on paper, a soft grey on dark
export const RULE = 'border-zinc-900 dark:border-zinc-600'

export type Count = { got: number; total: number }

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
  count,
  groupCount,
  selected,
  onSelect,
  touch,
}: {
  groups: KeyGroup[]
  /** the line as drawn in the current theme */
  lineOf: (k: string) => LineInfo
  count: (k: string) => Count
  groupCount: Partial<Record<GroupId, Count>>
  selected: string
  onSelect: (k: string) => void
  touch: boolean
}) {
  const [open, setOpen] = useState<Partial<Record<GroupId, boolean>>>({})
  return (
    <div className="flex flex-col">
      {groups.map((g) => {
        const isOpen = open[g.id] ?? (g.id !== 'nr' || g.keys.includes(selected))
        const { got, total } = groupCount[g.id] ?? { got: 0, total: 0 }
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
              <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums text-zinc-500">
                <span className="text-zinc-900 dark:text-zinc-100">{fmtInt(got)}</span>
                <span className="text-zinc-400 dark:text-zinc-500"> / {fmtInt(total)}</span>
              </span>
            </button>
            {isOpen && (
              <ul className="pb-2">
                {g.keys.map((k) => (
                  <LineRow key={k} line={lineOf(k)} c={count(k)} sel={k === selected} onClick={() => onSelect(k)} touch={touch} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function LineRow({ line, c, sel, onClick, touch }: { line: LineInfo; c: Count; sel: boolean; onClick: () => void; touch: boolean }) {
  const frac = c.total ? c.got / c.total : 0
  const done = c.total > 0 && c.got >= c.total
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        data-line={line.key}
        aria-current={sel || undefined}
        title={`Learn the ${line.name}`}
        className={classNames(
          'relative flex w-full items-center gap-3 px-5 text-left transition-colors',
          touch ? 'h-11' : 'h-[34px]',
          sel ? 'bg-zinc-900/[0.07] dark:bg-white/[0.09]' : 'hover:bg-zinc-900/[0.045] dark:hover:bg-white/[0.05]',
        )}
      >
        {sel && <span className="absolute inset-y-1 left-0 w-1 rounded-r" style={{ background: line.color }} />}
        <KeyRoundel line={line} pct={frac} on size={touch ? 26 : 24} />
        <span className="min-w-0 grow truncate text-[14.5px] font-normal leading-tight text-zinc-900 dark:text-zinc-100">{line.name}</span>
        <span className="shrink-0 text-right text-[12.5px] tabular-nums">
          {done ? (
            <span className="inline-flex items-center gap-1 font-bold text-zinc-900 dark:text-zinc-100">
              <svg viewBox="0 0 12 12" className="h-3 w-3 text-amber-500" fill="currentColor">
                <path d="M6 .8l1.6 3.4 3.7.4-2.8 2.5.8 3.7L6 9 2.7 10.8l.8-3.7L.7 4.6l3.7-.4z" />
              </svg>
              {c.total}
            </span>
          ) : (
            <>
              <span className="font-bold text-zinc-900 dark:text-zinc-100">{c.got}</span>
              <span className="text-zinc-400 dark:text-zinc-500">/{c.total}</span>
            </>
          )}
        </span>
      </button>
    </li>
  )
}

/** "46.2%" for the selected line, as the Key's header shows the whole game's. */
export function pctText(c: Count) {
  const pct = c.total ? (c.got / c.total) * 100 : 0
  return pct >= 100 ? '100' : pct.toFixed(1)
}

export function KeyFooter({ theme, setTheme, touch }: { theme: Theme; setTheme: (t: Theme) => void; touch: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/lab/ui/key"
        className={classNames(
          'inline-flex items-center gap-1.5 rounded-md px-2 text-[12.5px] font-bold text-zinc-600 transition-colors hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800',
          touch ? '-ml-2 h-10' : '-ml-2 h-8',
        )}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3.5L5.5 8l4.5 4.5" />
        </svg>
        Back to the game
      </Link>
      <span className="grow" />
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">{theme === 'dark' ? 'Dark' : 'Light'}</span>
      <ThemeButton theme={theme} setTheme={setTheme} touch={touch} />
    </div>
  )
}

export function Spine({
  groups,
  lineOf,
  count,
  selected,
  onOpen,
}: {
  groups: KeyGroup[]
  lineOf: (k: string) => LineInfo
  count: (k: string) => Count
  selected: string
  onOpen: () => void
}) {
  const c = count(selected)
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
      <KeyRoundel line={lineOf(selected)} pct={c.total ? c.got / c.total : 0} on size={30} />
      <span className="text-[17px] font-bold leading-none tabular-nums">
        {Math.floor(parseFloat(pctText(c)))}
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">%</span>
      </span>
      <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
        {groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-[3px]">
            {g.keys.map((k) => {
              const color = lineOf(k).color
              const n = count(k)
              return (
                <div
                  key={k}
                  title={lineOf(k).name}
                  className={classNames('relative h-[7px] w-10 overflow-hidden rounded-full', k === selected && 'outline outline-2 outline-offset-1 outline-zinc-900 dark:outline-zinc-100')}
                  style={{ background: hexA(color, 0.2) }}
                >
                  <div className="absolute inset-y-0 left-0" style={{ width: `${(n.total ? n.got / n.total : 0) * 100}%`, background: color }} />
                </div>
              )
            })}
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

'use client'

import classNames from 'classnames'

// Play | Learn: the two pages of the site, styled like the Key's Clean / Dots
// slider. They are separate pages (each loads only what it needs), so the
// options are plain links: the current one is highlighted, the other navigates.
export const PLAY_HREF = '/play'
export const LEARN_HREF = '/learn'

export default function PlayLearnSwitch({ current, touch = false }: { current: 'play' | 'learn'; touch?: boolean }) {
  const opts = [
    { id: 'play' as const, label: 'Play', href: PLAY_HREF },
    { id: 'learn' as const, label: 'Learn', href: LEARN_HREF },
  ]
  return (
    <nav aria-label="Play or learn" className="relative grid w-[124px] shrink-0 grid-cols-2 rounded-full bg-zinc-200/80 p-1 dark:bg-zinc-800">
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)] dark:bg-zinc-600"
        style={{ transform: current === 'learn' ? 'translateX(100%)' : 'translateX(0)' }}
      />
      {opts.map((o) => {
        const sel = o.id === current
        const cls = classNames(
          'relative z-10 flex items-center justify-center rounded-full text-[13px] font-bold transition-colors',
          touch ? 'h-9' : 'h-7',
          sel ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200',
        )
        return sel ? (
          <span key={o.id} aria-current="page" className={cls}>
            {o.label}
          </span>
        ) : (
          <a key={o.id} href={o.href} className={cls}>
            {o.label}
          </a>
        )
      })}
    </nav>
  )
}

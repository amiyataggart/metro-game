'use client'

import type { Line } from '@/lib/types'
import { isDarkColor, shortName } from './lines'

export type ToastData =
  | { id: number; kind: 'hit'; name: string; lines: string[]; streak: number; completed: string[] }
  | { id: number; kind: 'wrong' | 'already' | 'ambiguous'; name: string }

export const TOAST_MS = 2600

// Feedback after each guess. A find flips in like a departure board
// (split-flap tiles), then names the lines it scored on, in their colours.
export default function Toast({ t, LINES, maxWidth }: { t: ToastData; LINES: Record<string, Line>; maxWidth: number }) {
  if (t.kind !== 'hit') {
    const text =
      t.kind === 'already' ? (
        <>
          Already found <span className="text-white">{t.name}</span>
        </>
      ) : t.kind === 'ambiguous' ? (
        <>Be more specific</>
      ) : (
        <>
          <span className="text-white">“{t.name}”</span> isn’t a station in play
        </>
      )
    const dot = t.kind === 'wrong' ? 'bg-red-400' : t.kind === 'already' ? 'bg-emerald-400' : 'bg-amber-300'
    return (
      <div className="dock-toast flex max-w-full items-center gap-2 rounded-full bg-zinc-950/90 px-3.5 py-2 text-[13px] font-semibold text-white/65 shadow-xl ring-1 ring-white/10 backdrop-blur">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{text}</span>
      </div>
    )
  }

  const letters = t.name.toUpperCase().split('')
  // tiles shrink for long names so the board never wraps
  const tile = Math.max(11, Math.min(22, Math.floor((maxWidth - 40) / Math.max(letters.length, 1)) - 2))
  return (
    <div className="dock-toast max-w-full rounded-2xl bg-zinc-950/95 px-3 pb-2.5 pt-2.5 shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex gap-[2px] [perspective:400px]" aria-label={t.name}>
          {letters.map((ch, i) => (
            <span
              key={i}
              className="dock-flap flex items-center justify-center rounded-[3px] font-mono font-bold text-amber-200"
              style={{
                width: tile,
                height: Math.round(tile * 1.35),
                fontSize: Math.round(tile * 0.78),
                animationDelay: `${i * 28}ms`,
                background: ch === ' ' ? 'transparent' : 'linear-gradient(to bottom,#2a2a2e 0 49%,#0b0b0d 49% 52%,#1d1d21 52% 100%)',
              }}
            >
              {ch}
            </span>
          ))}
        </div>
        {t.streak >= 3 && (
          <span className="ml-auto shrink-0 rounded-full bg-amber-300 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-zinc-900">
            ×{t.streak}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {t.lines.map((k) => {
          const l = LINES[k]
          if (!l) return null
          return (
            <span
              key={k}
              className={`rounded-full px-2 py-[3px] text-[11px] font-bold leading-none ${isDarkColor(l.color) ? 'ring-1 ring-white/40' : ''}`}
              style={{ background: l.color, color: l.textColor }}
            >
              {t.completed.includes(k) ? '★ ' : ''}
              {shortName(k, l)}
            </span>
          )
        })}
        <span className="ml-auto pl-2 text-[12px] font-bold text-emerald-300">
          +{t.lines.length} {t.lines.length === 1 ? 'line' : 'lines'}
        </span>
      </div>
      {t.completed.length > 0 && (
        <div className="mt-1.5 text-[12px] font-bold text-amber-200">
          ★ {t.completed.map((k) => LINES[k]?.name).join(', ')} complete
        </div>
      )}
    </div>
  )
}

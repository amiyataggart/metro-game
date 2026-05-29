'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useConfig } from '@/lib/configContext'
import LineSwatch from './LineSwatch'

type Toggle = { id: string; label: string; description?: string; value: boolean }

export default function SettingsModal({
  open,
  setOpen,
  enabledLines,
  setEnabledLines,
  showAllStations,
  setShowAllStations,
  showFoundLabels,
  setShowFoundLabels,
  smoothLines,
  setSmoothLines,
  revealAll,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  enabledLines: Record<string, boolean>
  setEnabledLines: (next: Record<string, boolean>) => void
  showAllStations: boolean
  setShowAllStations: (v: boolean) => void
  showFoundLabels: boolean
  setShowFoundLabels: (v: boolean) => void
  smoothLines: boolean
  setSmoothLines: (v: boolean) => void
  revealAll: () => void
}) {
  const { LINES } = useConfig()
  const lineKeys = Object.keys(LINES).sort(
    (a, b) => (LINES[a].order ?? 0) - (LINES[b].order ?? 0),
  )

  const toggleAll = (value: boolean) => {
    const next: Record<string, boolean> = {}
    for (const k of lineKeys) next[k] = value
    setEnabledLines(next)
  }

  const displayToggles: Toggle[] = [
    {
      id: 'showAllStations',
      label: 'Show empty markers for all stations',
      description:
        'Display a small circle for every station — useful for seeing where the ones you still need are.',
      value: showAllStations,
    },
    {
      id: 'showFoundLabels',
      label: 'Show names of stations you have found',
      description:
        'When off, found stations show their dot but not their name on the map or sidebar.',
      value: showFoundLabels,
    },
    {
      id: 'smoothLines',
      label: 'Smooth line curves (experimental)',
      description:
        'Round off sharp bends in the rail lines with curves. Purely visual — station and line positions are unchanged.',
      value: smoothLines,
    },
  ]

  const onToggle = (id: string) => {
    if (id === 'showAllStations') setShowAllStations(!showAllStations)
    if (id === 'showFoundLabels') setShowFoundLabels(!showFoundLabels)
    if (id === 'smoothLines') setSmoothLines(!smoothLines)
  }

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={setOpen}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-left shadow-xl transition-all sm:my-8">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-bold leading-6 text-gray-900"
                >
                  Settings
                </Dialog.Title>

                <div className="mt-4 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Display
                  </h4>
                  {displayToggles.map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-start gap-3"
                    >
                      <input
                        type="checkbox"
                        checked={t.value}
                        onChange={() => onToggle(t.id)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-zinc-600 focus:ring-zinc-500"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-gray-900">
                          {t.label}
                        </span>
                        {t.description && (
                          <span className="block text-xs text-gray-500">
                            {t.description}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Lines
                    </h4>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleAll(true)}
                        className="text-zinc-600 underline hover:text-zinc-900"
                      >
                        Enable all
                      </button>
                      <span className="text-gray-300">•</span>
                      <button
                        type="button"
                        onClick={() => toggleAll(false)}
                        className="text-zinc-600 underline hover:text-zinc-900"
                      >
                        Disable all
                      </button>
                    </div>
                  </div>
                  <p className="mb-3 text-xs text-gray-500">
                    Disabled lines are hidden from the map and removed from
                    the score.
                  </p>
                  <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                    {lineKeys.map((line) => {
                      const enabled = enabledLines[line] !== false
                      return (
                        <label
                          key={line}
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() =>
                              setEnabledLines({
                                ...enabledLines,
                                [line]: !enabled,
                              })
                            }
                            className="h-4 w-4 rounded border-gray-300 text-zinc-600 focus:ring-zinc-500"
                          />
                          <LineSwatch line={LINES[line]} size="sm" />
                          <span className="truncate text-sm text-gray-900">
                            {LINES[line].name}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
                    onClick={() => {
                      revealAll()
                      setOpen(false)
                    }}
                  >
                    Reveal every station
                  </button>
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-zinc-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-600"
                    onClick={() => setOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

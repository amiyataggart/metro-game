'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useConfig } from '@/lib/configContext'
import useTranslation from '@/hooks/useTranslation'

export default function AboutModal({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { METADATA } = useConfig()
  const { t } = useTranslation()
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={setOpen}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:p-6">
                <div>
                  <div className="mt-3 text-center sm:mt-5">
                    <Dialog.Title
                      as="h3"
                      className="text-base font-bold leading-6 text-gray-900"
                    >
                      {METADATA.title as string}
                    </Dialog.Title>
                    <div className="mt-2 space-y-2">
                      <p className="text-sm text-gray-500">
                        Developed by <strong>AJ Taggart</strong> — extended with
                        Thameslink and the 2024 Overground line names
                        (Lioness, Mildmay, Windrush, Weaver, Suffragette,
                        Liberty).
                      </p>
                      <p className="text-sm text-gray-500">
                        Based on{' '}
                        <a
                          href="https://github.com/benjamintd/metro-memory.com"
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-600 underline hover:text-zinc-500"
                        >
                          metro-memory.com
                        </a>{' '}
                        by{' '}
                        <a
                          href="https://twitter.com/_benjamintd"
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-600 underline hover:text-zinc-500"
                        >
                          Benjamin Tran Dinh
                        </a>{' '}
                        (MIT-licensed).
                      </p>
                      <p className="text-xs text-gray-400">
                        Line data: TfL Open Data (Powered by TfL Open Data) and
                        OpenStreetMap contributors.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-6">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-zinc-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-600"
                    onClick={() => setOpen(false)}
                  >
                    {t('backToTheGame')}
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

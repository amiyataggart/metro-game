'use client'

import classNames from 'classnames'
import { useState, KeyboardEventHandler, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { DataFeature } from '@/lib/types'
import { Transition } from '@headlessui/react'
import { Feature, Point } from 'geojson'
import useTranslation from '@/hooks/useTranslation'
import { Resolution, selectNewIds } from '@/lib/matching'
import usePushEvent from '@/hooks/usePushEvent'

const Input = ({
  matcher,
  found,
  setFound,
  setIsNewPlayer,
  inputRef,
  map,
  idMap,
}: {
  matcher: (q: string) => Resolution
  found: number[]
  setFound: (found: number[]) => void
  setIsNewPlayer: (isNewPlayer: boolean) => void
  inputRef: React.RefObject<HTMLInputElement>
  map: maplibregl.Map | null
  idMap: Map<number, DataFeature>
}) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState<string>('')
  const [wrong, setWrong] = useState<boolean>(false)
  const [success, setSuccess] = useState<boolean>(false)
  const [alreadyFound, setAlreadyFound] = useState<boolean>(false)
  const [ambiguous, setAmbiguous] = useState<boolean>(false)
  const pushEvent = usePushEvent()

  const zoomToStation = useCallback(
    (id: number) => {
      if (map) {
        const feature = idMap.get(id) as Feature<Point>

        if (!feature) return
        const [lng, lat] = feature.geometry.coordinates
        // On mobile the on-screen keyboard covers the lower part of the map, so
        // a plainly-centred marker lands behind it. The visualViewport shrinks
        // by the keyboard height when it's open; shift the fly-to target up by
        // half that so the marker sits midway between the keyboard top and the
        // top of the screen. On desktop (no keyboard) this is a no-op.
        const vv = typeof window !== 'undefined' ? window.visualViewport : null
        const keyboard = vv ? Math.max(0, window.innerHeight - vv.height) : 0
        map.flyTo({
          center: [lng, lat],
          zoom: 13,
          duration: 200,
          offset: keyboard > 0 ? [0, -keyboard / 2] : [0, 0],
        })
      }
    },
    [map, idMap],
  )

  const onKeyDown: KeyboardEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (e.key !== 'Enter') return
      if (!search) return

      e.preventDefault()

      const result = matcher(search)
      if (result.kind === 'ambiguous') {
        setAmbiguous(true)
        setTimeout(() => setAmbiguous(false), 1500)
        return
      }
      if (result.kind === 'none') {
        setWrong(true)
        setTimeout(() => setWrong(false), 500)
        return
      }
      const { fresh, allFound } = selectNewIds(result.ids, found || [])
      if (allFound) {
        setAlreadyFound(true)
        setTimeout(() => setAlreadyFound(false), 1200)
        setSearch('')
        return
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 250)
      if (map) {
        ;(map.getSource('hovered') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: fresh.map((id) => idMap.get(id)!).filter(Boolean),
        })
        setTimeout(() => {
          ;(map.getSource('hovered') as maplibregl.GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: [],
          })
        }, 1500)
      }
      zoomToStation(fresh[0])
      setFound([...fresh, ...(found || [])])
      setIsNewPlayer(false)
      setSearch('')
      pushEvent(fresh)
    },
    [
      search,
      setSearch,
      matcher,
      found,
      setFound,
      setWrong,
      setIsNewPlayer,
      map,
      idMap,
      zoomToStation,
      pushEvent,
    ],
  )

  return (
    <div className="relative grow">
      <input
        className={classNames(
          {
            'animate animate-shake': wrong,
            'shadow-md !shadow-yellow-500': success,
          },
          'relative z-40 w-full rounded-full px-4 py-2 text-lg font-bold text-zinc-900 caret-current shadow-lg outline-none ring-zinc-800 transition-shadow duration-300 focus:ring-2',
        )}
        ref={inputRef}
        placeholder={t('inputPlaceholder')}
        value={search}
        onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
        id="input"
        type="text"
        autoFocus
        onKeyDown={onKeyDown}
      ></input>
      <Transition
        show={alreadyFound}
        as="div"
        className="pointer-events-none absolute right-0 top-0 z-50 my-auto mt-1 flex h-auto items-center"
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-500"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="my-1 mr-2 flex items-center justify-center rounded-full border-green-400 bg-green-200 px-2 py-1 text-sm font-bold text-green-800">
          {t('alreadyFound')}
        </div>
      </Transition>
      <Transition
        show={ambiguous}
        as="div"
        className="pointer-events-none absolute right-0 top-0 z-50 my-auto mt-1 flex h-auto items-center"
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-500"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="my-1 mr-2 flex items-center justify-center rounded-full border-amber-400 bg-amber-100 px-2 py-1 text-sm font-bold text-amber-800">
          {t('beMoreSpecific')}
        </div>
      </Transition>
    </div>
  )
}

export default Input

'use client'

import { ReactNode, createContext, useContext } from 'react'
import { Config } from './types'

const POSITRON_STYLE =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

export const ConfigContext = createContext<Config>({
  LOCALE: 'en',
  BEG_THRESHOLD: 1,
  CITY_NAME: 'default',
  MAP_CONFIG: {
    container: 'map',
    style: POSITRON_STYLE,
    bounds: [
      [-0.619997, 51.323273],
      [0.35504, 51.68869],
    ],
    minZoom: 6,
    fadeDuration: 50,
  },
  METADATA: {
    title: 'London Rail Memory',
    description:
      'How many London Underground, Overground, Thameslink, Elizabeth line and DLR stations can you name from memory?',
  },
  LINES: {},
})

export const useConfig = () => useContext(ConfigContext)
export const Provider = ({
  children,
  value,
}: {
  children: ReactNode
  value: Config
}) => {
  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  )
}

export default Provider

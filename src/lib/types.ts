import { FeatureCollection, MultiLineString, LineString, Point } from 'geojson'
import type { MapOptions } from 'maplibre-gl'
import { Metadata } from 'next'

export type SortOptionType = 'order' | 'name' | 'line'

export type DataFeatureCollection = FeatureCollection<
  LineString | MultiLineString | Point,
  {
    name: string
    id?: number | null
    long_name?: string
    short_name?: string
    line?: string
    alternate_names?: string[]
  }
>

export type RoutesFeatureCollection = FeatureCollection<
  LineString | MultiLineString,
  {
    color: string
  }
>

export type DataFeature = DataFeatureCollection['features'][number]

export interface SortOption {
  name: string
  id: SortOptionType
  shortName: React.ReactNode
}

export interface Line {
  name: string
  color: string
  backgroundColor: string
  textColor: string
  order: number
  // Lines that use a "white core" stripe treatment on the map and a
  // white-center ring in the legend. 'solid' draws a continuous white core
  // (Overground, Elizabeth, DLR); 'dashed' draws an interrupted white core so
  // the line's own color shows through the gaps (Thameslink).
  stripe?: 'solid' | 'dashed'
}

export interface Config {
  MAP_FROM_DATA?: boolean
  GAUGE_COLORS?: 'inverted' | 'default'
  LOCALE: string
  CITY_NAME: string
  MAP_CONFIG: Omit<MapOptions, 'container'> & { container?: string }
  METADATA: Metadata
  LINES: { [key: string]: Line }
  BEG_THRESHOLD?: number
}

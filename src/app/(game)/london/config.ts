import { Metadata } from 'next'
import type { MapOptions } from 'maplibre-gl'
import { Config, Line } from '@/lib/types'

export const LINES: {
  [name: string]: Line
} = {
  Bakerloo: {
    name: 'Bakerloo',
    color: '#b36305',
    backgroundColor: '#5e2f00',
    textColor: '#fff',
    order: 0,
  },
  Central: {
    name: 'Central',
    color: '#e32017',
    backgroundColor: '#7f0f00',
    textColor: '#fff',
    order: 1,
  },
  Circle: {
    name: 'Circle',
    color: '#ffd329',
    backgroundColor: '#7f6d00',
    textColor: '#222',
    order: 2,
  },
  District: {
    name: 'District',
    color: '#00782a',
    backgroundColor: '#00441b',
    textColor: '#fff',
    order: 3,
  },
  HammersmithAndCity: {
    name: 'Hammersmith & City',
    color: '#f3a9bb',
    backgroundColor: '#b41f43',
    textColor: '#222',
    order: 4,
  },
  Jubilee: {
    name: 'Jubilee',
    color: '#a0a5a9',
    backgroundColor: '#4c4f52',
    textColor: '#fff',
    order: 5,
  },
  Metropolitan: {
    name: 'Metropolitan',
    color: '#9b0056',
    backgroundColor: '#4f002d',
    textColor: '#fff',
    order: 6,
  },
  Northern: {
    name: 'Northern',
    color: '#000000',
    backgroundColor: '#444',
    textColor: '#fff',
    order: 7,
  },
  Piccadilly: {
    name: 'Piccadilly',
    color: '#003688',
    backgroundColor: '#001e62',
    textColor: '#fff',
    order: 8,
  },
  Victoria: {
    name: 'Victoria',
    color: '#0098d4',
    backgroundColor: '#005785',
    textColor: '#fff',
    order: 9,
  },
  WaterlooAndCity: {
    name: 'Waterloo & City',
    color: '#84CAB3',
    backgroundColor: '#005b44',
    textColor: '#222',
    order: 10,
  },
  ElizabethLine: {
    name: 'Elizabeth line',
    color: '#6950A1',
    backgroundColor: '#2b1d4d',
    textColor: '#fff',
    order: 11,
    stripe: 'solid',
  },
  DLR: {
    name: 'DLR',
    color: '#00afad',
    backgroundColor: '#006d6b',
    textColor: '#fff',
    order: 12,
    stripe: 'solid',
  },
  // 2024 Overground line renames — rendered with white-stripe styling
  Lioness: {
    name: 'Lioness',
    color: '#FAA61A',
    backgroundColor: '#9b5a00',
    textColor: '#222',
    order: 13,
    stripe: 'solid',
  },
  Mildmay: {
    name: 'Mildmay',
    color: '#3DB6E1',
    backgroundColor: '#1a4f70',
    textColor: '#222',
    order: 14,
    stripe: 'solid',
  },
  Windrush: {
    name: 'Windrush',
    color: '#DA291C',
    backgroundColor: '#76140d',
    textColor: '#fff',
    order: 15,
    stripe: 'solid',
  },
  Weaver: {
    name: 'Weaver',
    color: '#823065',
    backgroundColor: '#3f1631',
    textColor: '#fff',
    order: 16,
    stripe: 'solid',
  },
  Suffragette: {
    name: 'Suffragette',
    color: '#5BBD72',
    backgroundColor: '#1f5b30',
    textColor: '#222',
    order: 17,
    stripe: 'solid',
  },
  Liberty: {
    name: 'Liberty',
    color: '#7C878E',
    backgroundColor: '#3a4348',
    textColor: '#fff',
    order: 18,
    stripe: 'solid',
  },
  Thameslink: {
    name: 'Thameslink',
    color: '#7E5B95',
    backgroundColor: '#3f2d4a',
    textColor: '#fff',
    order: 19,
    stripe: 'dashed',
  },
  GreatNorthern: {
    name: 'Great Northern',
    color: '#E8A33A',
    backgroundColor: '#7a5419',
    textColor: '#222',
    order: 20,
    stripe: 'solid',
  },
  Southern: {
    name: 'Southern',
    color: '#3FA34D',
    backgroundColor: '#1f5226',
    textColor: '#fff',
    order: 21,
    stripe: 'solid',
  },
  GatwickExpress: {
    name: 'Gatwick Express',
    color: '#1C1C1C',
    backgroundColor: '#000000',
    textColor: '#fff',
    order: 22,
    stripe: 'dashed',
  },
}

export const METADATA: Metadata = {
  title: 'London Rail Memory',
  description:
    'How many London Underground, Overground, Thameslink, Elizabeth line and DLR stations can you name from memory?',
  openGraph: {
    title: 'London Rail Memory',
    description:
      'How many London Underground, Overground, Thameslink, Elizabeth line and DLR stations can you name from memory?',
    type: 'website',
    locale: 'en_GB',
  },
}

// Free, no-token MapLibre style. Carto Positron WITHOUT labels — keeps the
// basemap from giving away station names.
export const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json'

export const MAP_CONFIG: Omit<MapOptions, 'container'> = {
  style: MAP_STYLE,
  bounds: [
    [-0.619997, 51.323273],
    [0.35504, 51.68869],
  ],
  maxBounds: [
    [-2.058488, 50.738554],
    [1.841659, 52.201223],
  ],
  minZoom: 6,
  fadeDuration: 50,
}

export const CITY_NAME = 'london'
export const LOCALE = 'en'
export const GAUGE_COLORS = 'inverted'

const config: Config = {
  GAUGE_COLORS,
  LOCALE,
  CITY_NAME,
  MAP_CONFIG,
  METADATA,
  LINES,
  MAP_FROM_DATA: true,
}

export default config

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
    color: '#D182A0',
    backgroundColor: '#6c3d51',
    textColor: '#fff',
    order: 19,
    stripe: 'dashed',
  },
  // ---- National Rail TOCs ----
  // Colours match TfL's "London's rail & tube services" map. All are dashed
  // (white core) like Thameslink; Southeastern high speed uses yellow dashes.
  // State-owned National Rail
  SouthWesternRailway: {
    name: 'South Western Railway',
    color: '#C63834',
    backgroundColor: '#6e1d1b',
    textColor: '#fff',
    order: 20,
    stripe: 'dashed',
  },
  C2c: {
    name: 'c2c',
    color: '#C62F7C',
    backgroundColor: '#6e1944',
    textColor: '#fff',
    order: 21,
    stripe: 'dashed',
  },
  GreaterAnglia: {
    name: 'Greater Anglia',
    color: '#828795',
    backgroundColor: '#44474e',
    textColor: '#fff',
    order: 22,
    stripe: 'dashed',
  },
  Southeastern: {
    name: 'Southeastern',
    color: '#2B65A0',
    backgroundColor: '#173456',
    textColor: '#fff',
    order: 23,
    stripe: 'dashed',
  },
  SoutheasternHighSpeed: {
    name: 'Southeastern high speed',
    color: '#2B65A0',
    backgroundColor: '#173456',
    textColor: '#fff',
    order: 24,
    stripe: 'dashed',
    stripeColor: '#F4D04D',
  },
  Southern: {
    name: 'Southern',
    color: '#439752',
    backgroundColor: '#245029',
    textColor: '#fff',
    order: 25,
    stripe: 'dashed',
  },
  GreatNorthern: {
    name: 'Great Northern',
    color: '#BB9767',
    backgroundColor: '#5e4a30',
    textColor: '#222',
    order: 26,
    stripe: 'dashed',
  },
  GatwickExpress: {
    name: 'Gatwick Express',
    color: '#1A1919',
    backgroundColor: '#000000',
    textColor: '#fff',
    order: 27,
    stripe: 'dashed',
  },
  // Privately-owned National Rail
  Chiltern: {
    name: 'Chiltern Railways',
    color: '#A382AA',
    backgroundColor: '#4d3a52',
    textColor: '#fff',
    order: 28,
    stripe: 'dashed',
  },
  EastMidlandsRailway: {
    name: 'East Midlands Railway',
    color: '#4F9AB3',
    backgroundColor: '#285060',
    textColor: '#fff',
    order: 29,
    stripe: 'dashed',
  },
  GreatWesternRailway: {
    name: 'Great Western Railway',
    color: '#2A2D74',
    backgroundColor: '#15163a',
    textColor: '#fff',
    order: 30,
    stripe: 'dashed',
  },
  HeathrowExpress: {
    name: 'Heathrow Express',
    color: '#75BAB1',
    backgroundColor: '#3a5d5a',
    textColor: '#222',
    order: 31,
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
  // Default view: centred on Charing Cross with most of Zone 1 in frame.
  // (The user can still zoom/pan out to the full network within maxBounds.)
  center: [-0.1247, 51.5085],
  zoom: 12.4,
  // Fit the currently-visible network with a slight margin. Thameslink sets the
  // N–S extent (Peterborough ≈ 52.58°N to Brighton ≈ 50.83°N); the Elizabeth
  // line (Reading ≈ -0.97°W) sets the western edge.
  maxBounds: [
    [-1.1, 50.75],
    [0.73, 52.66],
  ],
  minZoom: 6,
  fadeDuration: 50,
}

// Lines + stations are fetched and stored in full (e.g. National Rail routes
// run far past London), but only the portion inside this box is displayed and
// playable — see visibility.ts. Defaults to the camera maxBounds; widen this
// (no re-fetch needed) to reveal more of the stored network later.
export const DISPLAY_BOUNDS: [[number, number], [number, number]] =
  MAP_CONFIG.maxBounds as [[number, number], [number, number]]

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

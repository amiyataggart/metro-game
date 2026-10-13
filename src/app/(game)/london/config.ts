import { Metadata } from 'next'
import type { MapOptions } from 'maplibre-gl'
import { Config, Line } from '@/lib/types'
import { LONDON_ALIASES, EXTRA_DECOYS } from './data/aliases'
import GB_STATION_NAMES from './data/gb-station-names.json'

// Entry order == legend roundel order (ProgressBars uses Object.keys insertion
// order); the `order` field == found-list sort order and on-map stacking key.
// Both are kept in one canonical sequence, matching the line-picker grouping:
// London Underground, London Overground, Elizabeth line, DLR, Thameslink,
// London Trams, National Rail — services alphabetical within each group.
export const LINES: {
  [name: string]: Line
} = {
  // ---- London Underground ----
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
  // ---- London Overground (2024 line names; white-stripe styling) ----
  Liberty: {
    name: 'Liberty',
    color: '#7C878E',
    backgroundColor: '#3a4348',
    textColor: '#fff',
    order: 11,
    stripe: 'solid',
  },
  Lioness: {
    name: 'Lioness',
    color: '#FAA61A',
    backgroundColor: '#9b5a00',
    textColor: '#222',
    order: 12,
    stripe: 'solid',
  },
  Mildmay: {
    name: 'Mildmay',
    color: '#3DB6E1',
    backgroundColor: '#1a4f70',
    textColor: '#222',
    order: 13,
    stripe: 'solid',
  },
  Suffragette: {
    name: 'Suffragette',
    color: '#5BBD72',
    backgroundColor: '#1f5b30',
    textColor: '#222',
    order: 14,
    stripe: 'solid',
  },
  Weaver: {
    name: 'Weaver',
    color: '#823065',
    backgroundColor: '#3f1631',
    textColor: '#fff',
    order: 15,
    stripe: 'solid',
  },
  Windrush: {
    name: 'Windrush',
    color: '#DA291C',
    backgroundColor: '#76140d',
    textColor: '#fff',
    order: 16,
    stripe: 'solid',
  },
  // ---- Elizabeth line, DLR ----
  ElizabethLine: {
    name: 'Elizabeth line',
    color: '#6950A1',
    backgroundColor: '#2b1d4d',
    textColor: '#fff',
    order: 17,
    stripe: 'solid',
  },
  DLR: {
    name: 'DLR',
    color: '#00afad',
    backgroundColor: '#006d6b',
    textColor: '#fff',
    order: 18,
    stripe: 'solid',
  },
  // ---- Thameslink ----
  Thameslink: {
    name: 'Thameslink',
    color: '#D182A0',
    backgroundColor: '#6c3d51',
    textColor: '#fff',
    order: 19,
    stripe: 'dashed',
  },
  // ---- London Trams (Tramlink) — hollow white-centre, TfL trams green ----
  Tramlink: {
    name: 'London Trams',
    color: '#80B253',
    backgroundColor: '#3a5226',
    textColor: '#222',
    order: 20,
    stripe: 'solid',
  },
  // ---- National Rail (alphabetical by name; dashed like Thameslink, white
  // core except Southeastern high speed which uses yellow dashes) ----
  C2c: {
    name: 'c2c',
    color: '#C62F7C',
    backgroundColor: '#6e1944',
    textColor: '#fff',
    order: 21,
    stripe: 'dashed',
  },
  Chiltern: {
    name: 'Chiltern Railways',
    color: '#A382AA',
    backgroundColor: '#4d3a52',
    textColor: '#fff',
    order: 22,
    stripe: 'dashed',
  },
  EastMidlandsRailway: {
    name: 'East Midlands Railway',
    color: '#4F9AB3',
    backgroundColor: '#285060',
    textColor: '#fff',
    order: 23,
    stripe: 'dashed',
  },
  GatwickExpress: {
    name: 'Gatwick Express',
    color: '#1A1919',
    backgroundColor: '#000000',
    textColor: '#fff',
    order: 24,
    stripe: 'dashed',
  },
  GreatNorthern: {
    name: 'Great Northern',
    color: '#BB9767',
    backgroundColor: '#5e4a30',
    textColor: '#222',
    order: 25,
    stripe: 'dashed',
  },
  GreatWesternRailway: {
    name: 'Great Western Railway',
    color: '#2A2D74',
    backgroundColor: '#15163a',
    textColor: '#fff',
    order: 26,
    stripe: 'dashed',
  },
  GreaterAnglia: {
    name: 'Greater Anglia',
    color: '#828795',
    backgroundColor: '#44474e',
    textColor: '#fff',
    order: 27,
    stripe: 'dashed',
  },
  HeathrowExpress: {
    name: 'Heathrow Express',
    color: '#75BAB1',
    backgroundColor: '#3a5d5a',
    textColor: '#222',
    order: 28,
    stripe: 'dashed',
  },
  SouthWesternRailway: {
    name: 'South Western Railway',
    color: '#C63834',
    backgroundColor: '#6e1d1b',
    textColor: '#fff',
    order: 29,
    stripe: 'dashed',
  },
  Southeastern: {
    name: 'Southeastern',
    color: '#2B65A0',
    backgroundColor: '#173456',
    textColor: '#fff',
    order: 30,
    stripe: 'dashed',
  },
  SoutheasternHighSpeed: {
    name: 'Southeastern high speed',
    color: '#2B65A0',
    backgroundColor: '#173456',
    textColor: '#fff',
    order: 31,
    stripe: 'dashed',
    stripeColor: '#F4D04D',
  },
  Southern: {
    name: 'Southern',
    color: '#439752',
    backgroundColor: '#245029',
    textColor: '#fff',
    order: 32,
    stripe: 'dashed',
  },
  LondonNorthwestern: {
    name: 'London Northwestern',
    color: '#00BF6F',
    backgroundColor: '#006b3c',
    textColor: '#222',
    order: 33,
    stripe: 'dashed',
  },
  Eurostar: {
    name: 'Eurostar',
    color: '#FFDE2A',
    backgroundColor: '#8a7600',
    textColor: '#222',
    order: 34,
    stripe: 'dashed',
  },
  CableCar: {
    name: 'London Cable Car',
    color: '#E21836',
    backgroundColor: '#7a0d1d',
    textColor: '#fff',
    order: 35,
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
  // The scoped network (scope.ts; clipped at build time) plus a ~10% margin:
  // Reading ≈ -0.97°W to Southend ≈ 0.79°E, Brighton ≈ 50.83°N to Cambridge
  // North ≈ 52.23°N (scope.data.test.ts checks the fit).
  maxBounds: [
    [-1.15, 50.69],
    [0.97, 52.37],
  ],
  minZoom: 6,
  fadeDuration: 50,
}

/**
 * @deprecated Legacy camera / render-clip box for /newtracks pages only.
 */
// LEGACY camera box / render-time clip box (pre-scope maxBounds), kept for the
// experimental /newtracks and /newtracks2 pages, which spread the default
// `config` below and use the legacy clip in visibility.ts. /london overrides
// MAP_CONFIG with the scoped one above (see page.tsx).
export const DISPLAY_BOUNDS: [[number, number], [number, number]] = [
  [-1.1, 50.75],
  [0.73, 52.66],
]

export const CITY_NAME = 'london'
export const LOCALE = 'en'
export const GAUGE_COLORS = 'inverted'

export const MATCHING = {
  aliases: LONDON_ALIASES,
  decoyNames: [...(GB_STATION_NAMES as string[]), ...EXTRA_DECOYS],
}

/** The /london game config: scoped camera box (MAP_CONFIG). */
export const londonConfig: Config = {
  GAUGE_COLORS,
  LOCALE,
  CITY_NAME,
  MAP_CONFIG,
  METADATA,
  LINES,
  MAP_FROM_DATA: true,
  MATCHING,
}

/**
 * @deprecated Legacy config for the experimental /newtracks and /newtracks2
 * pages only (they spread it): it carries the pre-scope camera box
 * DISPLAY_BOUNDS. /london uses `londonConfig`.
 */
const config: Config = { ...londonConfig, MAP_CONFIG: { ...MAP_CONFIG, maxBounds: DISPLAY_BOUNDS } }

export default config

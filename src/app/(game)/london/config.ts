import { Metadata } from 'next'
import type { MapOptions } from 'maplibre-gl'
import { Config, Line } from '@/lib/types'

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

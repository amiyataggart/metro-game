import data from '../london/data/features.json'
import maskData from '../london/data/london-mask.json'
import cityData from '../london/data/city-of-london.json'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'react-circular-progressbar/dist/styles.css'
import { DataFeatureCollection } from '@/lib/types'
import { londonConfig } from '../london/config'
import {
  scopedStationFeatures,
  visibleLines,
} from '../london/visibility'
import { annotateInterchanges } from '../london/interchanges'
import GamePage, { LabSizing, RouteLevel } from '@/components/GamePage'
import { Provider } from '@/lib/configContext'
import Main from '@/components/Main'
import { Cabin } from 'next/font/google'

const font = Cabin({
  weight: ['400', '700'],
  style: ['normal'],
  subsets: ['latin'],
  display: 'swap',
})

// Hidden services are filtered out here (server side) so they never reach the
// client or MapLibre — see ./visibility.ts. Scope trimming is done at build time.
const visLines = visibleLines(londonConfig.LINES)
const visConfig = { ...londonConfig, LINES: visLines }

// annotateInterchanges stamps lineCount / interchange on each station so the
// map can size multi-line interchanges larger than single-line stops.
const fc = annotateInterchanges(
  {
    ...data,
    features: scopedStationFeatures(
      data.features.filter((f) => !!visLines[f.properties.line]) as any,
    ),
  } as unknown as DataFeatureCollection,
  visLines,
)

// Line geometry (promoted from /lab/staging3, Oct 2026): Graph 7 from z11.4 in
// (surface lines routed over the real OSM tracks, tube/DLR from their raw OSM
// centrelines; see CLAUDE.md "Lab"), Graph 5 below z11.4 (baked offsets,
// sizes scale with the map). Packed static files in public/london-data/,
// fetched and parsed by MapLibre's worker. To update: rebuild the lab
// (build-lab-v2.js + pack-staging.js), check /lab/staging3, then copy
// public/lab-data/staging3/graph{5,7}.json to public/london-data/.
const routeLevels: RouteLevel[] = [
  { id: 'graph5', routes: '/london-data/graph5.json', minzoom: 0, maxzoom: 11.4, source: { maxzoom: 12, buffer: 64 } },
  { id: 'graph7', routes: '/london-data/graph7.json', minzoom: 11.4, maxzoom: 24, source: { maxzoom: 15, buffer: 64 } },
]
// Lines / stations: half their z12.4 size at z11.4 growing linearly to full at
// z12.4 (fixed above); below z11.4 they scale with the map. Labels unchanged.
const sizing: LabSizing = { kind: 'clamp', min: 11.4, max: 12.4, minScale: 0.5, mapBelow: true }

// /old2: the Oct 2026 /london page (Classic layout), archived when /play
// replaced it. Same saved progress as /play (CITY_NAME london).
export const metadata = { ...londonConfig.METADATA, title: 'London Rail Memory (old map 2)' }

export default function Old2() {
  return (
    <Provider value={visConfig}>
      <Main className={`${font.className} min-h-screen`}>
        <GamePage
          fc={fc}
          routeLevels={routeLevels}
          sizing={sizing}
          maskData={maskData}
          cityData={cityData}
        />
      </Main>
    </Provider>
  )
}

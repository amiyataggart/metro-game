import data from '../london/data/features.json'
import routesData from '../london/data/routes.json'
import maskData from '../london/data/london-mask.json'
import cityData from '../london/data/city-of-london.json'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'react-circular-progressbar/dist/styles.css'
import { DataFeatureCollection, RoutesFeatureCollection } from '@/lib/types'
import { londonConfig } from '../london/config'
import {
  scopedStationFeatures,
  scopedRouteFeatures,
  visibleLines,
} from '../london/visibility'
import { annotateInterchanges } from '../london/interchanges'
import GamePage from '@/components/GamePage'
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
// Own CITY_NAME: separate saved progress from the new /london.
const visConfig = { ...londonConfig, LINES: visLines, CITY_NAME: 'london-old-oct-26' }

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

const routes = {
  ...(routesData as object),
  features: scopedRouteFeatures((routesData as any).features),
} as unknown as RoutesFeatureCollection

// The /london line geometry as it was until October 2026 (ribbons from
// scripts/build-ribbons.js -> london/data/routes.json), kept for comparison.
export const metadata = { ...londonConfig.METADATA, title: 'London Rail Memory (old map 1)' }

export default function LondonOldOct26() {
  return (
    <Provider value={visConfig}>
      <Main className={`${font.className} min-h-screen`}>
        <GamePage
          fc={fc}
          routes={routes}
          maskData={maskData}
          cityData={cityData}
        />
      </Main>
    </Provider>
  )
}

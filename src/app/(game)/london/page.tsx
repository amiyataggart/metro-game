import data from './data/features.json'
import routesData from './data/routes.json'
import maskData from './data/london-mask.json'
import cityData from './data/city-of-london.json'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'react-circular-progressbar/dist/styles.css'
import { DataFeatureCollection, RoutesFeatureCollection } from '@/lib/types'
import config from './config'
import {
  visibleStationFeatures,
  visibleRouteFeatures,
  visibleLines,
} from './visibility'
import { annotateInterchanges } from './interchanges'
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

// Hidden services / trimmed Thameslink tails are filtered out here (server
// side) so they never reach the client or MapLibre — see ./visibility.ts.
const visLines = visibleLines(config.LINES)
const visConfig = { ...config, LINES: visLines }

// annotateInterchanges stamps lineCount / interchange on each station so the
// map can size multi-line interchanges larger than single-line stops.
const fc = annotateInterchanges(
  {
    ...data,
    features: visibleStationFeatures(
      data.features.filter((f) => !!visLines[f.properties.line]) as any,
    ),
  } as unknown as DataFeatureCollection,
  visLines,
)

const routes = {
  ...(routesData as object),
  features: visibleRouteFeatures((routesData as any).features),
} as unknown as RoutesFeatureCollection

export const metadata = config.METADATA

export default function London() {
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

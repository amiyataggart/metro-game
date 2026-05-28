import data from './data/features.json'
import routesData from './data/routes.json'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'react-circular-progressbar/dist/styles.css'
import { DataFeatureCollection, RoutesFeatureCollection } from '@/lib/types'
import config from './config'
import {
  visibleStationFeatures,
  visibleRouteFeatures,
  visibleLines,
} from './visibility'
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

const fc = {
  ...data,
  features: visibleStationFeatures(
    data.features.filter((f) => !!visLines[f.properties.line]) as any,
  ),
} as unknown as DataFeatureCollection

const routes = {
  ...(routesData as object),
  features: visibleRouteFeatures((routesData as any).features),
} as unknown as RoutesFeatureCollection

export const metadata = config.METADATA

export default function London() {
  return (
    <Provider value={visConfig}>
      <Main className={`${font.className} min-h-screen`}>
        <GamePage fc={fc} routes={routes} />
      </Main>
    </Provider>
  )
}

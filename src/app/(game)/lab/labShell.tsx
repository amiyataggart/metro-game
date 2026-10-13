import data from '../london/data/features.json'
import maskData from '../london/data/london-mask.json'
import cityData from '../london/data/city-of-london.json'
import scores from './data/scores.json'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'react-circular-progressbar/dist/styles.css'
import { DataFeatureCollection, RoutesFeatureCollection } from '@/lib/types'
import { londonConfig } from '../london/config'
import { scopedStationFeatures, scopedRouteFeatures, visibleLines } from '../london/visibility'
import { annotateInterchanges } from '../london/interchanges'
import { Provider } from '@/lib/configContext'
import Main from '@/components/Main'
import type { MorphConfig, RouteLevel } from '@/components/GamePage'
import LabGame, { Scorecard } from './LabGame'
import { VARIANTS, LabVariant } from './variants'
import { Cabin } from 'next/font/google'

const font = Cabin({ weight: ['400', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

// Same stations / lines / camera as /london; only the line geometry differs.
// CITY_NAME is per variant so each keeps its own localStorage game state.
const visLines = visibleLines(londonConfig.LINES)
const fc = annotateInterchanges(
  {
    ...data,
    features: scopedStationFeatures(data.features.filter((f) => !!visLines[f.properties.line]) as any),
  } as unknown as DataFeatureCollection,
  visLines,
)
export const scoped = (r: unknown) =>
  ({ ...(r as object), features: scopedRouteFeatures((r as any).features) }) as unknown as RoutesFeatureCollection

export function LabShell({
  slug,
  routes,
  routeLevels,
  morph,
  forceMapScale,
}: {
  slug: LabVariant['slug']
  routes?: RoutesFeatureCollection
  routeLevels?: RouteLevel[]
  morph?: MorphConfig
  forceMapScale?: boolean
}) {
  const variant = VARIANTS.find((v) => v.slug === slug)!
  const cards = scores as unknown as Record<string, Scorecard>
  return (
    <Provider value={{ ...londonConfig, LINES: visLines, CITY_NAME: `lab-${slug}` }}>
      <Main className={`${font.className} min-h-screen`}>
        <LabGame
          variant={variant}
          fc={fc}
          routes={routes}
          routeLevels={routeLevels}
          morph={morph}
          maskData={maskData}
          cityData={cityData}
          score={cards[slug]}
          baseline={forceMapScale ? cards['london-map'] : cards.london}
          forceMapScale={forceMapScale}
        />
      </Main>
    </Provider>
  )
}

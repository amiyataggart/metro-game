import data from '../../london/data/features.json'
import maskData from '../../london/data/london-mask.json'
import cityData from '../../london/data/city-of-london.json'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'react-circular-progressbar/dist/styles.css'
import { DataFeatureCollection } from '@/lib/types'
import { londonConfig } from '../../london/config'
import { scopedStationFeatures, visibleLines } from '../../london/visibility'
import { annotateInterchanges } from '../../london/interchanges'
import type { LabSizing, RouteLevel } from '@/components/GamePage'
import { Provider } from '@/lib/configContext'
import Main from '@/components/Main'
import UiLab from './UiLab'
import type { UiSlug } from './uiVariants'
import { Cabin } from 'next/font/google'

const font = Cabin({ weight: ['400', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

// /lab/ui/*: the real /london game (same stations, lines, geometry, sizing),
// laid out by a different Shell. All UI variants share one saved game
// (CITY_NAME `lab-ui`) so progress carries over when comparing layouts.
const visLines = visibleLines(londonConfig.LINES)
const config = { ...londonConfig, LINES: visLines, CITY_NAME: 'lab-ui' }
const fc = annotateInterchanges(
  {
    ...data,
    features: scopedStationFeatures(data.features.filter((f) => !!visLines[f.properties.line]) as any),
  } as unknown as DataFeatureCollection,
  visLines,
)
const routeLevels: RouteLevel[] = [
  { id: 'graph5', routes: '/london-data/graph5.json', minzoom: 0, maxzoom: 11.4, source: { maxzoom: 12, buffer: 64 } },
  { id: 'graph7', routes: '/london-data/graph7.json', minzoom: 11.4, maxzoom: 24, source: { maxzoom: 15, buffer: 64 } },
]
const sizing: LabSizing = { kind: 'clamp', min: 11.4, max: 12.4, minScale: 0.5, mapBelow: true }

export default function UiLabPage({ slug }: { slug: UiSlug }) {
  return (
    <Provider value={config}>
      <Main className={`${font.className} min-h-screen`}>
        <UiLab slug={slug} fc={fc} routeLevels={routeLevels} sizing={sizing} maskData={maskData} cityData={cityData} />
      </Main>
    </Provider>
  )
}

import data from '../london/data/features.json'
import maskData from '../london/data/london-mask.json'
import cityData from '../london/data/city-of-london.json'
import 'maplibre-gl/dist/maplibre-gl.css'
import 'react-circular-progressbar/dist/styles.css'
import { DataFeatureCollection } from '@/lib/types'
import { londonConfig } from '../london/config'
import { scopedStationFeatures, visibleLines } from '../london/visibility'
import { annotateInterchanges } from '../london/interchanges'
import type { LabSizing, RouteLevel } from '@/components/GamePage'
import { Provider } from '@/lib/configContext'
import Main from '@/components/Main'
import PlayGame from './PlayGame'
import { Cabin } from 'next/font/google'

const font = Cabin({ weight: ['400', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

// /play: the game (stations, lines and geometry as /old2, the previous
// /london) in the Key layout, which grew out of /lab/ui/key. CITY_NAME stays
// `london`, so players keep the progress they had on /london.
const visLines = visibleLines(londonConfig.LINES)
const visConfig = { ...londonConfig, LINES: visLines }
const fc = annotateInterchanges(
  {
    ...data,
    features: scopedStationFeatures(data.features.filter((f) => !!visLines[f.properties.line]) as any),
  } as unknown as DataFeatureCollection,
  visLines,
)
// Promoted lab Staging 3 geometry (see CLAUDE.md): Graph 5 below z11.4, Graph 7 from z11.4.
const routeLevels: RouteLevel[] = [
  { id: 'graph5', routes: '/london-data/graph5.json', minzoom: 0, maxzoom: 11.4, source: { maxzoom: 12, buffer: 64 } },
  { id: 'graph7', routes: '/london-data/graph7.json', minzoom: 11.4, maxzoom: 24, source: { maxzoom: 15, buffer: 64 } },
]
const sizing: LabSizing = { kind: 'clamp', min: 11.4, max: 12.4, minScale: 0.5, mapBelow: true }

export const metadata = londonConfig.METADATA

export default function Play() {
  return (
    <Provider value={visConfig}>
      <Main className={`${font.className} min-h-screen`}>
        <PlayGame fc={fc} routeLevels={routeLevels} sizing={sizing} maskData={maskData} cityData={cityData} />
      </Main>
    </Provider>
  )
}

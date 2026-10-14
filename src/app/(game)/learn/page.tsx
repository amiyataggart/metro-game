import { Cabin } from 'next/font/google'
import Learn from '../lab/learn/Learn'
import { learnData } from '../lab/learn/data'
import { londonConfig } from '../london/config'

const font = Cabin({ weight: ['400', '500', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

// /learn: line-by-line learning (route strips, all-branch diagrams, tests),
// grown out of /lab/learn. Reads the game's saved progress (london-stations)
// but never writes it.
export const metadata = {
  ...londonConfig.METADATA,
  title: 'Learn · London Rail Memory',
  description: 'Learn London’s rail lines route by route, then test yourself stop by stop.',
  openGraph: {
    ...londonConfig.METADATA.openGraph,
    title: 'Learn · London Rail Memory',
    description: 'Learn London’s rail lines route by route, then test yourself stop by stop.',
  },
}

export default function LearnPage() {
  return <Learn data={learnData()} fontClass={font.className} fontFamily={font.style.fontFamily} />
}

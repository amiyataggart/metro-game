import { Cabin } from 'next/font/google'
import Learn from './Learn'
import { learnData } from './data'

const font = Cabin({ weight: ['400', '500', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

export const metadata = {
  title: 'Lab: Learn · London Rail Memory',
  description: 'Learn a line: browse its stations as a line diagram, follow one route as a carriage strip, then test yourself stop by stop.',
}

export default function LearnPage() {
  return <Learn data={learnData()} fontClass={font.className} fontFamily={font.style.fontFamily} />
}

import { Cabin } from 'next/font/google'
import Learn from './Learn'
import { learnData } from './data'

const font = Cabin({ weight: ['400', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

export const metadata = {
  title: 'Lab: Learn · London Rail Memory',
  description: 'Learn a line: browse its stations as a line diagram, then test yourself stop by stop.',
}

export default function LearnPage() {
  return <Learn data={learnData()} fontClass={font.className} />
}

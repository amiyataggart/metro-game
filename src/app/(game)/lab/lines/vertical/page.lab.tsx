import { Cabin } from 'next/font/google'
import NextStops from './NextStops'
import { verticalData } from './data'

const font = Cabin({ weight: ['400', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

export const metadata = {
  title: 'Lab lines: Next stops · London Rail Memory',
  description: 'A vertical, phone-first line diagram with your progress, and a Line Run practice mode.',
}

export default function NextStopsPage() {
  return <NextStops data={verticalData()} fontClass={font.className} />
}

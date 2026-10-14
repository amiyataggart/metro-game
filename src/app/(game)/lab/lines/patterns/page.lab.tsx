import { Cabin } from 'next/font/google'
import PatternsApp from './PatternsApp'

const font = Cabin({ weight: ['400', '500', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

export const metadata = {
  title: 'Lab lines: Stopping patterns · London Rail Memory',
  description: 'Which trains stop where: every service of a line side by side, fastest first.',
}

export default function Page() {
  return (
    <div className={font.className}>
      <PatternsApp />
    </div>
  )
}

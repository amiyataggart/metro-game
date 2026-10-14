import { Newsreader } from 'next/font/google'

// The one serif of the Atlas layout: titles, station names, figures.
export const serif = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--atlas-serif',
})

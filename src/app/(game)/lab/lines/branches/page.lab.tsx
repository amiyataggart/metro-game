import Link from 'next/link'
import { Cabin } from 'next/font/google'
import { LINES } from '../lineData'
import { buildDiagram, GROUPS } from './graphLayout'
import WholeLine, { type LineMeta } from './WholeLine'

const font = Cabin({
  weight: ['400', '500', '700'],
  style: ['normal'],
  subsets: ['latin'],
  display: 'swap',
})

export const metadata = {
  title: 'Lab lines: Whole-line diagram · London Rail Memory',
  description:
    'Every branch of a line laid out schematically from its services.',
}

// Layouts are computed here at build time; the client only draws them.
const DIAGRAMS = Object.fromEntries(
  GROUPS.flatMap((g) => g.keys).map((k) => [k, buildDiagram(k)]),
)
const META: Record<string, LineMeta> = Object.fromEntries(
  Object.entries(LINES).map(([k, l]) => [k, { name: l.name, color: l.color }]),
)

export default function Page() {
  return (
    <main
      className={`${font.className} min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:py-10`}
    >
      <div className="mx-auto max-w-6xl">
        <Link
          href="/lab/lines"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Line diagrams
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Whole-line diagram</h1>
        <p className="mt-2 max-w-3xl text-zinc-600 dark:text-zinc-400">
          One diagram per line with all of its branches, laid out automatically
          from the line’s services: shared stations are merged, the busiest
          through-route becomes the trunk, and every branch peels off below it.
        </p>
        <WholeLine diagrams={DIAGRAMS} groups={GROUPS} lines={META} />
      </div>
    </main>
  )
}

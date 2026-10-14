import Link from 'next/link'
import { UI_VARIANTS } from './uiVariants'
import { Cabin } from 'next/font/google'

const font = Cabin({ weight: ['400', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

export const metadata = {
  title: 'Lab: UI layouts · London Rail Memory',
  description: 'Alternative layouts of London Rail Memory around the same map.',
}

// /lab/ui lander. Every layout is the real /london game; they share one saved
// game (separate from /london's), so progress carries over between them.
export default function UiLab() {
  return (
    <main className={`${font.className} min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">UI layouts</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          The same game and map, laid out in different ways. All layouts share one saved game (separate from the real
          one), so you can switch between them mid-game. <Link href="/lab" className="text-blue-600 hover:underline dark:text-blue-400">Back to the lab</Link>.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {UI_VARIANTS.map((v) => (
            <Link
              key={v.slug}
              href={`/lab/ui/${v.slug}`}
              className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:shadow-md hover:ring-blue-400 dark:bg-zinc-900 dark:ring-zinc-800"
            >
              <div className="text-lg font-bold">{v.title}</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{v.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}

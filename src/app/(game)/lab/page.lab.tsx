import Link from 'next/link'
import scores from './data/scores.json'
import { VARIANTS } from './variants'
import { Cabin } from 'next/font/google'

const font = Cabin({ weight: ['400', '700'], style: ['normal'], subsets: ['latin'], display: 'swap' })

export const metadata = {
  title: 'Lab · London Rail Memory',
  description: 'Experimental versions of the London Rail Memory map.',
}

type Card = Record<string, { overlapKm: number; twists: number }>

// /lab lander: pick an experimental map variant. Kept live in production.
export default function Lab() {
  const cards = scores as unknown as Record<string, Card>
  const zooms = Object.keys(cards.london)
  const Row = ({ name, card }: { name: string; card: Card }) => (
    <tr className="border-t border-zinc-100 dark:border-zinc-800">
      <td className="py-1 pr-3 font-bold">{name}</td>
      {zooms.map((z) => (
        <td key={z} className="py-1 pr-3 tabular-nums">
          {card[z].overlapKm} / {card[z].twists}
        </td>
      ))}
    </tr>
  )
  return (
    <main className={`${font.className} min-h-screen bg-zinc-50 px-4 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">Lab</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Experimental versions of the map. Each is the full game with its own saved progress; only how the lines are
          drawn differs. <Link href="/london" className="text-blue-600 hover:underline dark:text-blue-400">Back to the game</Link>.
        </p>

        <Link
          href="/lab/ui"
          className="mt-8 block rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:shadow-md hover:ring-blue-400 dark:bg-zinc-900 dark:ring-zinc-800"
        >
          <div className="text-lg font-bold">UI layouts →</div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Different ways of laying out the site around the same map.</p>
        </Link>

        <Link
          href="/lab/lines"
          className="mt-4 block rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:shadow-md hover:ring-blue-400 dark:bg-zinc-900 dark:ring-zinc-800"
        >
          <div className="text-lg font-bold">Line diagrams →</div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Simplified train-style line maps for learning the network.</p>
        </Link>

        <h2 className="mt-10 text-lg font-bold">Line geometry</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {VARIANTS.map((v) => (
            <Link
              key={v.slug}
              href={`/lab/${v.slug}`}
              className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 transition hover:shadow-md hover:ring-blue-400 dark:bg-zinc-900 dark:ring-zinc-800"
            >
              <div className="text-lg font-bold">{v.title}</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{v.blurb}</p>
            </Link>
          ))}
        </div>

        <h2 className="mt-10 text-lg font-bold">Scorecard</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Kilometres where different lines draw on top of each other / times two parallel lines cross over (the
          “twisting” look), measured on the lines as drawn at each zoom. Lower is better.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-zinc-500">
                <th className="pr-3 font-normal"></th>
                {zooms.map((z) => (
                  <th key={z} className="pr-3 font-normal">z{z}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row name="Current game" card={cards.london} />
              {VARIANTS.map((v) => (
                <Row key={v.slug} name={v.title} card={cards[v.slug]} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

// /lab/ui/*: alternative page layouts around the same game and map.
export const UI_VARIANTS = [
  { slug: 'classic', title: 'Classic', blurb: 'Today’s /london layout, rebuilt as a Shell: the baseline to compare against.' },
  { slug: 'key', title: 'Key', blurb: 'A diagram key you play: each line’s row is its legend entry, progress bar and on/off switch, grouped by mode.' },
  { slug: 'dock', title: 'Dock', blurb: 'Phone-first: the input docked at the bottom, a strip of line pills above it, details in a pull-up sheet.' },
  { slug: 'atlas', title: 'Atlas', blurb: 'Minimal: the map is the hero, one field for everything, one Index panel for progress, finds and settings.' },
] as const

export type UiSlug = (typeof UI_VARIANTS)[number]['slug']

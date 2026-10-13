// The /lab track-geometry experiments (built by scripts/lab/build-lab-tracks.js).
export type LabVariant = { slug: 'graph' | 'levels' | 'morph'; title: string; blurb: string }

export const VARIANTS: LabVariant[] = [
  {
    slug: 'graph',
    title: 'Graph',
    blurb:
      'Every line routed station-to-station over the real OSM track network, then bundled at one fixed level (neighbouring tracks within ~35 m share a corridor). Same look at every zoom: the baseline for the new model.',
  },
  {
    slug: 'levels',
    title: 'Levels',
    blurb:
      'Four precomputed bundling levels (true track → 35 m → 90 m → 220 m), one per zoom band, cross-fading over half a zoom step. Zoomed in you see the real tracks; zoomed out, nearby tracks merge into tidy parallel bundles.',
  },
  {
    slug: 'morph',
    title: 'Morph',
    blurb:
      'One geometry set on the true tracks that slides continuously into the 90 m bundles as you zoom out (z14.5 → z12), using only the GPU line offset — no jumps and no work in the browser while zooming. Known issue: mid-slide, some lines still pass through each other.',
  },
]

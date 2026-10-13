// The /lab track-geometry experiments (built by scripts/lab/build-lab-tracks.js).
export type LabVariant = { slug: 'graph' | 'graph2' | 'graph3' | 'levels' | 'morph'; title: string; blurb: string }

export const VARIANTS: LabVariant[] = [
  {
    slug: 'graph',
    title: 'Graph',
    blurb:
      'Every line routed station-to-station over the real OSM track network, then bundled at one fixed level (neighbouring tracks within ~35 m share a corridor). Same look at every zoom: the baseline for the new model.',
  },
  {
    slug: 'graph2',
    title: 'Graph 2',
    blurb:
      'Graph, fixed: only surface lines are routed over the track network (tube and DLR keep their own centreline), tunnels never bundle with surface track, your hand rules are back on, termini run into the platforms, lines peel off the side of a bundle they leave on, and lane changes ease in over ~160 m instead of jumping. (Its overlap score is higher than Graph’s mostly because tube tunnels and HS1 are now drawn at their true position under surface lines, which the scorecard counts as overlap.)',
  },
  {
    slug: 'graph3',
    title: 'Graph 3',
    blurb:
      'Graph 2 without the pre-bundling pass: the routed tracks go straight into the /london ribbon builder, so a line is either fully in a corridor or on its own true track: no partial pulls or wobbles, at the cost of some neighbouring tracks staying apart.',
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

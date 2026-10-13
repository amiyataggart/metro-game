// The /lab track-geometry experiments (built by scripts/lab/build-lab-tracks.js).
export type LabVariant = { slug: 'staging1' | 'graph' | 'graph2' | 'graph3' | 'graph4' | 'graph5' | 'levels' | 'morph'; title: string; blurb: string }

export const VARIANTS: LabVariant[] = [
  {
    slug: 'staging1',
    title: 'Staging 1',
    blurb:
      'Graph 4 from z11.4 in, with clamped sizing (lines and stations half their z12.4 size at z11.4, growing linearly to full size at z12.4, then fixed). Zoom out past z11.4 and it switches to Graph 5: its baked, smooth-split geometry, with everything scaling with the map (halving per zoom level). Sizes match at the switch; the geometry cross-fades over ±0.25 zoom.',
  },
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
    slug: 'graph4',
    title: 'Graph 4',
    blurb:
      'Graph 2 plus network-wide lane order: where a line passes from one shared corridor to the next, both corridors put it on the same side, so lane order agrees along the whole route instead of being chosen corridor by corridor (fewer crossings at hand-overs and junctions).',
  },
  {
    slug: 'graph5',
    title: 'Graph 5',
    blurb:
      'Everything, built for map-scale sizing (lines a fixed ~43 m wide, like the streets): tracks share a corridor only where they are within one line width; network-wide lane order; and lane offsets baked into the geometry as continuous curves, so a line holds its lane until its real track moves out past it, then peels off smoothly. Scorecard measured at that fixed width.',
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

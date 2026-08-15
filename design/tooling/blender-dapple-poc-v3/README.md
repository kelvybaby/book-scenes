# Blender dappled-light proof of concept — revision 3

Revision 3 addresses the two remaining structural problems: a readable receiver
cutoff and a shared motion curve that still felt too sinusoidal.

## Receiver

`scripts/blender/build_dapple_receiver_v3.py` creates an offline review receiver
whose upper transition follows a spatially perturbed foreground-shadow boundary.
It combines:

- a continuous foreground-shadow core;
- a broad 200+ pixel transition controlled by multiscale canopy structure;
- sparse correlated fringe fragments above and below the average boundary;
- tighter, heavily feathered exclusions for Florentino, bench, book, plants,
  curb, and genuinely sunlit road.

The final v3 receiver has about 166,000 active pixels, including approximately
36,000 low-weight fringe/transition pixels. It does not replace the current runtime v1
receiver and remains isolated inside this experiment.

The cyan/orange diagnostic overlays the exact receiver on the approved painting:
cyan indicates stronger core coverage; orange indicates low-weight transition and
fringe coverage.

## Motion

All nine physical occlusion layers inherit one shared gust transform. Its motion
uses unequal loopable harmonics rather than a dominant sine:

- five horizontal components and four vertical components;
- asymmetric reversals and one-sided holds;
- diagonal excursions;
- separate multiharmonic shear and compression;
- the same tiny relative rotations and local shape-key deformations retained
  from revision 2.

## Baseline-centered composite

`scripts/blender/build_dapple_review_composite.py` computes the temporal mean of
the complete Blender loop and treats it as zero lighting change. Positive
deviations recover restrained warm sunlight in linear color. Negative deviations
slightly deepen the painted shade multiplicatively, preserving source detail.

Current review strengths are 0.15 for warm recovery and 0.50 for shadow
deepening. Darkening needs the larger coefficient because multiplicative changes
inside already-dark paint are perceptually quieter than warm recovery. These are
review values, not runtime decisions.

Across the four representative phases, roughly 57,000–59,000 receiver pixels are
perceptibly brighter than the approved baseline and roughly 67,000–71,000 are
perceptibly darker. All pixels outside the receiver remain byte-identical.

The shared gust has six horizontal reversals during the loop, a 1.55:1 imbalance
between left and right extrema, and a sampled fast-to-slow speed ratio of 4.4:1.
The final-to-first illumination change remains inside the ordinary adjacent-frame
range, preserving the seamless loop.

## Commands

```sh
python3 scripts/blender/build_dapple_receiver_v3.py

/Applications/Blender.app/Contents/MacOS/Blender \
  --background --python scripts/blender/build_dapple_light.py -- --render-preview

python3 scripts/blender/build_dapple_review_composite.py
```

No asset in this directory is imported by the website.

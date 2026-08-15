# Blender dappled-light proof of concept

This directory preserves the superseded first pass for comparison. The active
generator now produces revision 2 under `design/tooling/blender-dapple-poc-v2`.

This experiment renders a standalone grayscale sunlight-reveal map. It does not
contain the approved painting, alter the website, or replace the existing strict
receiver mask.

The later integration equation is intentionally outside this proof:

```text
Blender illumination map × existing receiver mask × adjustable intensity
= permitted sunlight reveal
```

## Structure

- `dapple-light-poc.blend` — generated Blender 5.2 Eevee scene
- `preview/frames/` — the complete 240-frame grayscale loop
- `preview/representative-frames/` — 0%, 25%, 50%, and 75% phases
- `preview/contact-sheet.png` — the four representative phases
- `preview/difference-amplified.png` — amplified 0%-to-25% change
- `preview/dapple-light-preview.mp4` — 768 × 384, 30 fps, 8-second loop

The generator lives at `scripts/blender/build_dapple_light.py`.

## Build only

From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --python scripts/blender/build_dapple_light.py
```

## Build and render the review preview

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --python scripts/blender/build_dapple_light.py -- --render-preview
```

## Render a single inspection frame

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --python scripts/blender/build_dapple_light.py -- --render-frame 1
```

## Light choice

The selected setup uses a Sun light because its uniform directional projection
avoids center-to-edge falloff. Its angular diameter and the occluder-to-receiver
distances produce varied penumbra. An Area-light comparison remains available:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --python scripts/blender/build_dapple_light.py -- --light area --render-frame 1
```

## Motion and loop

Two broad canopy parents carry related occlusion fields together. Medium fields
move, rotate, and anisotropically stretch relative to those parents, reorganizing
overlaps. Two finer stable fields move faster to create continuous small glints.
No field generates unrelated noise per frame.

All transforms use integer sinusoidal harmonics over 240 frames. Frame 241 is
mathematically identical to frame 1 in image state and velocity; the delivered
loop samples frames 1–240 so the last-to-first step matches every other frame step.

The rendered seam check supports that contract: the mean absolute grayscale
change from frame 240 to frame 1 is 3.63 levels, within the ordinary adjacent-frame
range measured across the loop (2.30–4.39 levels in the sampled pairs).

## First-pass review note

The preview demonstrates coherent broad travel, relative overlap changes, and a
continuous fine field. It is not yet a close visual match to the supplied
reference: several apertures remain too broad, sparse, and clean-edged. The next
iteration should fragment those openings and increase localized fine twinkling
without adding per-frame noise or changing the receiver mask.

## Deliberate limits

- This is an approval preview, not a high-resolution production asset.
- It is rectangular and has not been perspective-warped to the painted ground.
- The existing receiver mask is neither copied into Blender nor regenerated.
- Nothing in this directory is imported by the web application.

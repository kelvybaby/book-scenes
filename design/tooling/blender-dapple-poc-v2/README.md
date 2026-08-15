# Blender dappled-light proof of concept — revision 2

This second isolated experiment addresses the visible-stencil behavior in the
first pass. It remains an offline review artifact and is not imported by the web
application.

## Revision

- One unified canopy parent supplies the dominant shared translation and shear.
- Relative layer rotation is limited to about 0.14°, roughly 85–90% below the
  first pass.
- Nine physical occlusion fields form three bands: two restrained broad fields,
  three medium mottled fields, and four dense fine fields.
- Every field is internally stable, but periodic shape-key warps and small local
  offsets reorganize overlaps. Fine twinkling does not use brightness pulsing or
  regenerated per-frame noise.
- Threshold fields use denser multiscale detail and two-frequency domain warping
  to fragment clean contours.

The render remains a neutral 768 × 384 illumination map at 30 fps for 8 seconds.
Across the four quarter phases, about 59–60% of the map remains below grayscale
32 and about 29–31% is strong reveal. The remainder is penumbra and weak reveal.

The final-to-first mean absolute change is 6.00 grayscale levels, within the
sampled ordinary adjacent-frame range of 5.18–9.66. Representative composite
phase comparisons found zero changed pixels outside the existing receiver mask.

## Generate and render

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --python scripts/blender/build_dapple_light.py -- --render-preview
```

## Temporary foreground composite

```sh
python3 scripts/blender/build_dapple_review_composite.py
```

The temporary composite uses the approved Study Q image plus its existing static
shadow-repair overlay. It perspective-warps the rectangular Blender map across
the foreground, then multiplies it by the existing receiver mask without
regenerating, broadening, or copying that mask into Blender. Light recovery is
performed in linear color.

The current temporary review intensity is 0.18. That value is intentionally
conservative and is not a runtime decision.

Files in `temporary-composite/` are review-only and are not runtime assets.

# Asset pipeline

## Principle

Choose the simplest representation that preserves the intended appearance, interaction, and performance. Do not force every asset into generated video, 3D geometry, or one giant flattened image.

## Representation guide

| Need | Preferred representation |
| --- | --- |
| Painted sky, distant city, house, and broad vegetation | Layered raster artwork |
| Transparent leaves, flowers, curtains, hands, book, and letter | Separate raster cutouts |
| Passage text and controls | Semantic HTML |
| Local focus, press, fold, or page interactions | CSS plus the primary motion library |
| Grain, humidity, light rays, or restrained distortion | Small shader or composited overlay after comparison |
| Insects or dust with responsive movement | Lightweight procedural particles or sprites |
| Complex camera travel or genuinely volumetric space | Three.js only after a rough prototype proves the need |
| Cinematic noninteractive atmospheric insert | Short optimized video only when live methods are insufficient |

## Approved source and asset preparation

Study Q is the current static frame; Study O remains the upstream master for protected regions and bounded repairs. See the [scene specification](scenes/under-the-almond-trees.md#status) for the approved references.

- Preserve the selected source image; use descriptive versioned names for experiments.
- For moving silhouettes, derive the final alpha from the approved source and retain its visible RGB pixels. Generated mattes are guides, not final silhouettes. Generated pixels may supply concealed underpainting.
- Extend stationary underpainting beyond the full movement range. Verify an exact resting composite and clean magnified edges at movement extremes; reject exposed gaps, doubled edges, or sliding ground surfaces.
- Keep quotations out of generated images. Reuse existing masters and layer partitions before generating new assets.
- Prepare framing for the target viewport; an authored mobile crop may need fewer layers. Explicit dimensions prevent layout shift.
- Compare opaque AVIF/WebP and transparent PNG/WebP at display size for compression and edge quality. Load the complete base frame before optional detail and effects.

## Verification and performance

For affected assets, inspect real display size, compression, transparent edges, movement extremes, and supported lighting states. Follow [repository verification](../AGENTS.md#verification) for application integration.

Working payload targets are approximately 3 MB for the initial desktop frame and below 10 MB for progressively loaded scene assets. Measure before sacrificing art quality; these are preferences, not release gates. Static fallbacks, visibility pausing, and the canvas pixel-ratio cap are requirements in `AGENTS.md`.

Store reusable generation prompts under `design/prompts/`, recording the source, changed variables, output filename, and why a result was retained or rejected.

## Grid-locked fine-detail repair

When ordinary generation cannot resolve a small distant detail without moving or deforming it:

1. Extract a square crop from the approved master and record its exact origin and dimensions.
2. Enlarge that crop on a fixed pixel grid and restore the detail in enough surrounding context to preserve anatomy, lighting, and edges.
3. Reduce the result by the exact inverse scale and return it to the recorded origin with no manual translation, rotation, or reframing.
4. Composite through a feathered mask that covers the complete defective structure, so no residual duplicate remains.
5. Verify the changed-pixel bounds, inspect both real display size and a magnified crop, and reject any doubled, floating, stretched, or misplaced feature.

Prefer this method to pasting isolated eyes, noses, mouths, hands, flowers, or other fine features onto a distant figure. Study O's Fermina repair is the reference example.

## Storage and references

- Runtime scene assets: `public/assets/scenes/under-the-almond-trees/`. Shared book assets: `public/assets/books/`. Add subdirectories only when needed.
- Source artwork and intermediate layers: `design/concepts/` and `design/layers/`.
- External links, extracted principles, and audio provenance: `design/references/README.md`.
- Raw third-party captures: outside Git. If using `design/references/raw/`, add an ignore rule before storing captures; that directory is not currently ignored.

Visual references inform composition and material grammar, not artwork to trace or reproduce. Audio assets may use licensed recordings with provenance recorded in the reference ledger. No CMS, asset database, video background, or full 3D reconstruction is needed for this slice.

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

## First-scene layer plan

Suggested layer groups, back to front:

1. Sky and broad atmospheric colour
2. Distant roofs, towers, and city haze
3. House mass and courtyard depth
4. Windows, shutters, doors, lamps, and telegraph wires
5. Midground square, paths, and trunks
6. Midground plants and flowers
7. Foreground vegetation and framing branches
8. Bench, book, letter, fabric, and partial waiting figure
9. Interactive-object states
10. Light, shadow, humidity, grain, and optional insects

Do not commit to this exact count if a simpler separation produces the same result.

## Production workflow

The concept phase is complete. [Study O](../design/concepts/under-the-almond-trees-study-o-gridlocked-face-v13.png) is the approved visual reference.

### 1. Browser blockout

- Use Study O intact as the complete static first frame.
- Establish desktop and mobile framing before producing final cutouts.
- Typeset one real passage in semantic HTML and test its relationship to a host object.
- Confirm the scene remains coherent with motion disabled.

### 2. Layer proof

- Test a small foreground, midground, and background separation using rough crops or temporary masks.
- Keep parallax offsets small and verify that no gaps or seams appear.
- Test pointer, keyboard, touch, and reduced-motion behavior.
- Decide whether CSS layers are sufficient before considering a spatial renderer.

### 3. Production art

- Create a high-resolution master composition.
- Preserve Study O's approved scene; regenerate or repair only bounded regions.
- Separate layers with clean overlap beyond their visible edges so parallax does not expose gaps.
- Create distinct closed, hinted, active, and opened states for interactive objects when needed.
- Avoid embedding quotation text in generated images.

### 4. Runtime preparation

- Use modern opaque formats such as AVIF or WebP when visual comparison supports them.
- Use optimized PNG or WebP for transparent assets based on edge quality and size.
- Provide explicit dimensions to prevent layout shift.
- Create desktop and mobile crops rather than scaling one composition indiscriminately.
- Load the first complete frame before optional foreground detail and effects.

### 5. Verification

- Inspect assets at their real display size, not only zoomed in.
- Check seams throughout the full parallax range.
- Verify transparent edges against day and evening states.
- Confirm interactive targets remain identifiable on touch screens.
- Check compression around foliage, grain, type surfaces, and shadows.
- Check that optional effects do not conceal the base artwork.

## Initial performance targets

These are targets, not excuses to degrade the art before measurement.

- Complete static first frame available without WebGL
- Initial desktop visual payload approximately 3 MB or less where practical
- Additional scene assets loaded progressively, with a working target below 10 MB total
- Heavy canvas device pixel ratio capped at 2
- No offscreen requestAnimationFrame loop
- No continuously animating hidden passage or scene
- Mobile receives fewer layers and lower-resolution assets when necessary

Because the project is local, perceived smoothness and thermal stability matter more than network scoring alone.

## Prompts and versions

Store important generation prompts under `design/prompts/`. For each retained result, record:

- Version and purpose
- Stable style preamble
- Variables changed from the prior version
- Negative constraints
- Output filename
- What succeeded
- What failed

Never overwrite a selected source image during experimentation. Use descriptive versioned names.

## Grid-locked fine-detail repair

When ordinary generation cannot resolve a small distant detail without moving or deforming it:

1. Extract a square crop from the approved master and record its exact origin and dimensions.
2. Enlarge that crop on a fixed pixel grid and restore the detail in enough surrounding context to preserve anatomy, lighting, and edges.
3. Reduce the result by the exact inverse scale and return it to the recorded origin with no manual translation, rotation, or reframing.
4. Composite through a feathered mask that covers the complete defective structure, so no residual duplicate remains.
5. Verify the changed-pixel bounds, inspect both real display size and a magnified crop, and reject any doubled, floating, stretched, or misplaced feature.

Prefer this method to pasting isolated eyes, noses, mouths, hands, flowers, or other fine features onto a distant figure. Study O's Fermina repair is the reference example.

## Reference handling

- Store external links and extracted principles in `design/references/README.md`.
- Raw screenshots, downloaded artwork, and private captures should live in a future gitignored `design/references/raw/` directory.
- References define visual grammar, not assets to trace or reproduce.
- Generated runtime assets should be original to this project.

## Expected future runtime structure

The exact structure should be created with the application, but use this direction:

```text
src/
  assets/
    scenes/
      under-the-almond-trees/
        background/
        layers/
        interactives/
        fallbacks/
  content/
    passages.ts
  scenes/
    under-the-almond-trees/
```

## Fallbacks

- WebGL or shader failure: show the static artwork without the effect.
- Reduced motion: show stable final states with ordinary transitions or no transition.
- Narrow mobile viewport: use an authored crop and simplified depth.
- Missing optional asset: preserve the scene without a broken placeholder.
- Slow load: display the complete base composition before detail layers.

## Not required for the first vertical slice

- Higgsfield subscription
- Full 3D architectural model
- Rigged characters
- Video background
- Asset database or CMS
- Automated image provenance system
- Multiple simultaneous shader libraries

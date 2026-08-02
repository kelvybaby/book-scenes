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

### 1. Concept studies

- Generate three materially different treatments using `design/prompts/park-concept-studies.md`.
- Hold the composition and narrative constant enough to compare them.
- Change medium, texture, light, and depth treatment—not merely colour.
- Inspect architecture, vegetation, hands, faces, perspective, object scale, and repeated AI artifacts.

### 2. Motion blockout

- Use rough crops or temporary painted shapes to establish depth.
- Test desktop and mobile framing before final asset production.
- Test one quotation interaction and reduced-motion state.
- Decide whether CSS layers are sufficient.

### 3. Production art

- Create a high-resolution master composition.
- Regenerate or repair small regions rather than rerolling the whole scene after composition approval.
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
      park-of-waiting/
        background/
        layers/
        interactives/
        fallbacks/
  content/
    passages.ts
  scenes/
    park-of-waiting/
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

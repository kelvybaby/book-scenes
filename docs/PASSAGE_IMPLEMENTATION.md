# Passage implementation

This document maps the current **Under the Almond Trees** passage prototype to its code. It is a technical reference, not approval of the current discovery cue, paper motion, or release choreography. The scene specification owns the intended experience; this file records implementation boundaries, invariants, known limitations, and verification needs.

## Current scope

The passage has two coordinated representations:

- React always authors the passage as semantic HTML. This is the readable, selectable, accessible source and the complete fallback.
- Three.js optionally renders the page surface, opening transition, and wind-driven release. Its canvas is decorative and `aria-hidden`.

The current book interaction is a working prototype. The discovery cue, settled-page behavior, paper rigidity, ground contact, and final release path remain subject to rendered approval.

## Component boundaries

| Path | Responsibility |
| --- | --- |
| [`src/content/passages.ts`](../src/content/passages.ts) | Stores the exact supplied passage text and minimal technical fields. |
| [`src/App.tsx`](../src/App.tsx) | Owns passage selection, page state, semantic HTML, the book target, scene veil, focus handoff, and parallax settling. |
| [`src/components/WindPage.tsx`](../src/components/WindPage.tsx) | Measures DOM anchors, creates and disposes Three.js resources, draws paper and quote textures, and bridges React state to opening and release motion. |
| [`src/motion/PaperSheet.ts`](../src/motion/PaperSheet.ts) | Simulates page vertices, constraints, aerodynamic response, authored trajectory guidance, and ground contact. |
| [`src/motion/WindField.ts`](../src/motion/WindField.ts) | Produces deterministic wind timing and spatial samples from a seed. |
| [`src/styles.css`](../src/styles.css) | Defines the semantic sheet, passage typography, scene-state styling, controls, focus treatment, and reduced-motion fallback. |

Dependencies should continue in this direction:

```text
passages.ts -> App.tsx -> WindPage.tsx -> PaperSheet.ts -> WindField.ts
                         -> styles.css
```

Keep layout measurement and rendering out of `PaperSheet` and `WindField`. Keep simulation formulas and Three.js resource management out of `App`.

## Data and accessibility invariants

- `src/content/passages.ts` is the only source of passage wording. Do not retype quotations in render or motion code.
- The HTML blockquote remains in the DOM when the decorative canvas is active.
- If WebGL, font loading, or motion initialization fails, the HTML sheet remains usable.
- The book target is a semantic button with a concise accessible name and a larger invisible hit area than the illustrated book.
- Reduced motion opens a stable semantic sheet without the nonessential flight or release animation.
- While a passage is active, scene parallax settles to neutral so the reading surface and background do not compete.

## State model

`App` currently owns five states:

| State | Behavior |
| --- | --- |
| `idle` | The scene is available and the book target can be activated. |
| `opening` | The authored page flight runs and scene parallax settles. |
| `open` | The quotation and folio controls are available. |
| `closing` | The wind release runs and the quotation fades. |
| `gone` | The page renderer is removed and temporary replay controls are available. |

The replay and restore controls are prototype aids, not final scene choreography.

## Motion responsibilities

### Opening

The opening is an authored correspondence from Florentino's book to the reading surface. `WindPage` measures both positions, moves a grouped page mesh between them, enlarges it, applies bounded surface ripples, and crossfades from an opaque leaf to the translucent reading treatment. It does not use the release wind simulation.

Keep opening constants together in `WindPage.tsx` and tune the gesture as one motion. Do not distribute competing position, scale, material, and text easings across unrelated components.

### Settled reading state

The intended reading state is visually stable enough for comfortable reading. The current implementation still advances the paper solver with low reading-phase energy; this is provisional behavior, not a design requirement. If visible motion distracts from the passage, pause or further constrain the settled page rather than documenting the movement as intentional.

### Release

The release inherits the open page's live world-space vertices, pose, and velocity so shrinking and descent remain continuous. Condensation and descent overlap so the page never pauses at the high anchor. It rotates quickly during the first falling beat with its lower edge toward the camera and its upper edge farther away and slightly raised; the pitch remains shallow enough that the face never collapses into an edge line. The scripted descent and segmented solver share one pitched support height, and the final landing ease settles the complete projected footprint into the middle of the visible road before the wind handoff. After contact, a projected corridor traced from both painted road edges affects only contacting vertices. Seeded gusts can then lift separated portions naturally while friction and damping remain local to contact. `PaperSheet` retains trajectory, material response, and contact ownership; the segmented solver supplies the paper's broad bending, curling, and edge flutter; `WindPage` updates their shared geometry and controls material opacity.

The production release uses the approved deterministic wind seed directly. It has no runtime solver, motion-variant, or tuning query parameters.

## Paper-model limitations

`PaperSheet` is a bounded position-based prototype, not a complete paper or cloth solver. It uses structural, diagonal, and longer-distance constraints plus a post-handoff co-rotational shape correction, but it does not implement true dihedral bending stiffness, self-collision, or general fold prevention.

The current `BEND_COMPLIANCE = 0` value is an experiment, not an approved material setting. Zero compliance makes those particular distance constraints rigid, but the separate shape correction is what now prevents most unconstrained collapse. Neither mechanism is a complete physical rigidity model, and both remain subject to rendered approval.

Broad ripples should preserve the recognizable plane of a sheet. If the page bunches, rolls into a tube, stands on its short edge, or folds through itself, treat that as a structural or force-balance problem rather than increasing visual ripple amplitude.

## Wind model

`WindField` separates wind authorship from page response. A seed selects bounded timing and force variation, including the current internal `hesitant`, `wandering`, and `decisive` profiles. Named envelopes organize the condensation, lift, lull, and exit beats; spatial flow modes keep neighboring triangles from receiving identical motion.

These profile names and values are implementation aids, not narrative categories or stable public API. Remove unused profile fields rather than documenting them as meaningful controls.

Future leaves or fabric may sample the same wind field, but each material must supply its own response model. Page-specific constraints, road guidance, and contact behavior belong in `PaperSheet`, not `WindField`.

## Rendering and cleanup

- The ghost, solid, and quote meshes share one page geometry.
- The quote texture is decorative and is generated from the same passage object used by the HTML.
- Renderer pixel ratio is capped at `2`.
- Resize handling keeps the camera, measured anchors, page placement, and simulation environment aligned.
- Hidden-document work pauses.
- Unmounting must cancel frames, disconnect observers and listeners, dispose geometry, materials, textures, and the renderer, and remove its canvas.

Do not expand Three.js into a scene-wide renderer without a separate bounded proof and decision.

## Open work

- Replace the rejected rectangular book cue with a noticeable cue that belongs to the painted scene.
- Decide whether the final settled page is completely static or merely imperceptibly alive; legibility takes precedence.
- Inspect the authored descent and post-handoff shape correction across representative seeds; tune only if the leaf still reads as cloth or as an unnaturally rigid board.
- Refine landing and ground contact only where rendered inspection shows the leaf leaving the approved roadway corridor.
- Obtain visual approval for the opening and release across representative fixed seeds.
- Add the final close contract, including `Escape`, unambiguous outside click where appropriate, and focus return to the book.
- Verify touch, mobile composition, reduced motion, hidden-tab behavior, asset requests, console output, and renderer cleanup.

## Tuning and verification

Change one or two variables per rendered comparison. Use a fixed seed while tuning a specific beat, then inspect multiple seeds before approval. Keep the static HTML fallback intelligible after every change.

Run the scripts that exist in `package.json`:

```text
npm run typecheck
npm run lint
npm run build
```

Then inspect the complete interaction at desktop and mobile widths, including keyboard and touch activation, both folios, reduced motion, focus behavior, failed assets, console errors, hidden-tab recovery, and cleanup after the page leaves.

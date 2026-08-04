# Current plan

Last updated: 2026-08-03

## Milestone

Build a rough but convincing living-painting prototype of **Under the Almond Trees** using the approved [Study Q](design/concepts/under-the-almond-trees-study-q-ground-fermina-v14.png) blockout derived from the [Study O](design/concepts/under-the-almond-trees-study-o-gridlocked-face-v13.png) master.

## Approved

- [x] Scene title, narrative boundary, and source-derived visual anchors
- [x] Wide park-to-house composition and painterly treatment
- [x] Florentino's placement, scale, black suit, book, and glasses
- [x] Fermina's doorway placement, embroidery, two chairs, gardenias, and restrained facial detail
- [x] Study O as the upstream visual master
- [x] Study Q as the final blockout reference for the passage-interaction stage

## Progress

- [x] Scaffold Vite, React, and TypeScript with the project scripts recorded in `AGENTS.md`
- [x] Build a responsive static first frame from the approved Study Q blockout
- [x] Create a small foreground/midground/background separation proof
- [x] Add restrained pointer depth with a stable reduced-motion state
- [x] Confirm that selective CSS layers are sufficient for the current depth prototype

The current browser blockout uses `public/assets/scenes/under-the-almond-trees/under-the-almond-trees-study-q.png` as the approved final frame for the passage-interaction stage. Study O remains the upstream source master for protected scene regions and future bounded repairs.

## Next

- [ ] Complete laptop framing QA for the passage interaction
- [ ] Implement one passage reveal using semantic HTML
- [ ] Test keyboard, touch, focus return, reduced motion, and the browser console
- [ ] Revisit mobile-specific composition after the full scene interaction is established

## Inputs still needed

- One exact passage or phrase for the first interaction
- Later, the remaining passage set and preferred object associations

Typography, final production layers, optional time progression, sound, and any shader remain later decisions. Three.js is not planned unless the CSS-layer prototype reveals a concrete limitation.

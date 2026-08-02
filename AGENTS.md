# Repository guidance

## Purpose

Build a private interactive literary commonplace book. The quality bar is a graceful, art-directed experience in which imagery, typography, motion, and interaction express the emotional logic of a book.

The current vertical slice is `The Park of Waiting`. Read `docs/ART_DIRECTION.md` and `docs/scenes/park-of-waiting.md` before changing its visuals or interactions.

## Priorities

1. Emotional and visual coherence
2. Legible, exact passage text
3. Deliberate interaction and motion
4. Responsive and accessible behavior
5. Performance and maintainability
6. Novel technology only when it serves the scene

## Working rules

- Art direction takes precedence over fashionable effects.
- Do not introduce generic SaaS components, glassmorphism, bento grids, glowing cursor blobs, gratuitous kinetic text, or decorative shaders.
- Give every movement a physical or narrative cause.
- Keep a complete static first frame. The scene must remain intelligible if animation, WebGL, or media playback is unavailable.
- Preserve supplied passage text exactly. Do not rewrite, complete, or invent quotations.
- Do not add plot details beyond the spoiler boundary in the active scene specification.
- Do not add paid services or production dependencies without a demonstrated need.
- Do not publish, deploy, add analytics, or make the repository public without explicit user authorization.
- Change one or two visual variables per concept iteration so comparisons remain meaningful.
- Keep uncertain visual choices provisional until they have been inspected in a rendered scene.

## Technical direction

- Prefer Vite, React, and TypeScript once the app is scaffolded.
- Use semantic DOM elements for passages, navigation, and controls.
- Use CSS for simple hover, focus, press, and reveal states.
- Use one primary animation system. Do not add multiple libraries that control the same properties.
- Use layered 2.5D artwork for the first scene unless a prototype proves insufficient.
- Use Three.js only for spatial behavior that CSS layers cannot express convincingly.
- Cap heavy-canvas device pixel ratio at 2, pause offscreen work, and clean up frames, observers, listeners, textures, geometries, materials, and renderers.
- Under `prefers-reduced-motion`, render stable final states and remove scrubbed, pinned, or continuous nonessential motion.
- Design touch behavior intentionally; do not treat hover as the only discovery mechanism.

## Assets and content

- Follow `docs/ASSET_PIPELINE.md` for representation, naming, generation, and fallbacks.
- Store final runtime assets under the application's scene asset directory once it exists.
- Store reusable generation prompts under `design/prompts/`.
- Keep raw third-party reference captures out of Git; record links and extracted principles in `design/references/README.md`.
- Store actual passage text in application data, not duplicated across planning documents.

## Verification

Before calling a visual change complete:

- Run the build, lint, typecheck, and test scripts that actually exist in `package.json`.
- Inspect the rendered result at desktop and mobile widths.
- Check keyboard, touch, visible focus, and reduced-motion behavior.
- Check the browser console and failed asset requests.
- Confirm hidden or offscreen animation work stops.
- Compare against the active scene's acceptance criteria.
- Review for generated-image artifacts, generic template patterns, illegible text, and unjustified motion.

Before the application is scaffolded, do not invent commands. Update this file with exact commands after `package.json` exists.

## Documentation discipline

- `README.md` is the human entry point.
- `AGENTS.md` contains durable repository rules, not a complete design manual.
- `PLANS.md` describes the current milestone and should remain short.
- `docs/DECISIONS.md` records decisions and their reasons.
- Each scene owns a specification under `docs/scenes/`.
- When the same mistake recurs, add the smallest concrete rule that would prevent it.

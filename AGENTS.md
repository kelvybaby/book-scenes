# Repository guidance

Build a private interactive literary commonplace book. Imagery, typography, motion, and interaction should express the emotional logic of the book; passage legibility and art direction take priority over technical novelty.

## Scope and authority

- Complete authorized work using reasonable assumptions for reversible choices. Pending visual approval means present a rendered candidate; it does not block requested prototyping or tuning. Ask only when missing input affects scope, protected content, or an explicit approval boundary below. Keep implementation and reporting focused on the request.
- Read [art direction](docs/ART_DIRECTION.md) and the [active scene specification](docs/scenes/under-the-almond-trees.md) before changing scene visuals or interactions. Read the [asset pipeline](docs/ASSET_PIPELINE.md), [passage reference](docs/PASSAGE_IMPLEMENTATION.md), or [sound reference](docs/SOUND_SYSTEM.md) when working on that area.
- Explicit user instructions govern the task. Scene requirements take precedence over general design preferences. Implementation snapshots, old decisions, prompts, references, and personal notes are context, not authorization to expand scope or restore superseded behavior.

## Requirements

- Preserve supplied passage wording exactly in `src/content/passages.ts`; never invent quotations. Keep visual-source excerpts in the scene specification and stay within its spoiler boundary.
- Keep the scene intelligible without animation, canvas, WebGL, or sound. Passages and controls remain semantic HTML; touch and keyboard must work without hover. Reduced motion removes nonessential continuous motion and retains usable stable states.
- Give motion a physical or narrative cause and follow the art direction’s explicit exclusions.
- Pause hidden or offscreen animation, dispose renderer resources on unmount, and cap heavy-canvas device pixel ratio at 2.
- Do not publish, deploy, add analytics, make the repository public, or incur paid-service costs without explicit user authorization.
- Edit the root `README.md` only with explicit approval for the proposed change. Keep `docs/my_notes.md` reader-owned and unedited unless the reader explicitly requests an edit.

## Design and implementation preferences

- Use the existing Vite/React/TypeScript stack, CSS for simple states, and layered raster artwork. Extend the localized renderers where needed; avoid multiple systems controlling the same properties. A scene-wide renderer needs a bounded proof of visual benefit.
- Prefer bounded repairs to approved artwork and small groups of visual variables per comparison. Add production dependencies only for a demonstrated need.

## Verification

- For application code changes, run `npm run build` and `npm run lint`. Build includes TypeScript checking; `npm run typecheck` is the standalone alternative. No test script currently exists.
- For visual changes, inspect desktop and mobile renders against the affected scene criteria, including text, image artifacts, console errors, and failed assets. For interaction or motion changes, also check keyboard, touch, focus, reduced motion, visibility pausing, and cleanup.
- For documentation-only changes, check the diff, references, and instruction consistency; no application build or browser pass is needed. Report any relevant checks that could not be performed.
- `npm run dev` starts development; `npm run preview` serves the production build.

## Documentation

Keep each concern in its existing owner: durable rules here, current milestone in `PLANS.md`, rationale in `docs/DECISIONS.md`, and scene requirements in `docs/scenes/`. Do not duplicate passage text or create parallel planning files. Generation prompts belong in `design/prompts/`; raw third-party captures stay out of Git, with provenance in `design/references/README.md`.

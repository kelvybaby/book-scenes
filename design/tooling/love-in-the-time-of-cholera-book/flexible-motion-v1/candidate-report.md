Candidate frozen for parent review, 2026-10-13. This is not final visual approval.

Capture cleanup, 2026-10-13: redundant raw animation frames and intermediate screenshots were deleted at the user's request. The compact before/after videos, final-forward-strip.jpg, seven final-review screenshots, measurements, source snapshots, scripts, diffs and change manifest remain. Raw frame references below describe the review history; those frame files are no longer present. Together with four temporary parent screenshots, cleanup removed 917 files (75.3 MiB). No application source, Blender models, textures or original user reference photos were deleted.

Capture cleanup, 2026-11-20: removed the before/after videos and `final-forward-strip.jpg`. The individual final-review screenshots and measurements remain.

Local viewer: http://127.0.0.1:5173/?bookPrototype=on#book-model-lab

Changed application files: `src/labs/book-model/EarlyPageOpenRig.ts`, `src/labs/book-model/BookModelLab.tsx`, `src/labs/book-model/bookModelLab.css`. Other pre-existing dirty files were preserved. `change-manifest.json` contains frozen SHA-256 values and links to the exact rig/viewer diffs against the restart snapshots. Original pre-task snapshots and original before captures remain here.

The rig is a kinematic strip approximation, not physical simulation. It integrates tangent angles along fixed material segments. Five leaves stay attached at distinct source intervals; root offsets rotate around a narrow finite binding fan so later leaves land above earlier leaves. The wrapper remains one finite back/spine/front mesh. Its top shoulder changes direction continuously, repairing the closed-cover paper protrusion. Paper uses travelling curl and restrained head/tail variation; card stock has a much shallower broad bend. Thickness follows local normals. Edge faces have separate normals/UVs; materials are selected by name rather than first slot. The final fore-edge UV correction is visible in `final-review/closed-front-final.jpg`.

Turning uses analytically solved critical damping in 1/120-second quanta, with bounded error and at most 0.25 seconds of catch-up. Target changes preserve velocity; idle input resets elapsed time. A single turn reaches 99% in approximately 1.75 seconds in the measured real-time run, then quietly settles. Rapid input queues the five authored leaves rather than inventing hundreds of sheets. Reduced motion takes the selected stable pose immediately.

Dragging is one roll-free spherical turntable. Horizontal movement always orbits world Y/the spine; vertical movement changes elevation; diagonal movement combines both. There are no direction/orientation heuristics or private OrbitControls internals. The poles stop 0.07 radians short of inversion. A 7-pixel click threshold accumulates the initial movement once; subsequent movement is incremental. Pointer capture handles outside release, cancellation/lost capture clears the grab, non-primary/second pointers are ignored, and effect cleanup releases capture. Touch uses the same mapping; the prototype surface owns touch drag rather than allowing vertical pan to cancel it. Home/reset and keyboard orbit remain available.

Historical motion captures (removed):

- `before-forward.mp4`: original actual renderer, 80 ms samples, encoded at 12.5 fps.
- `after-cover.mp4`, `after-forward.mp4`, `after-backward.mp4`, `after-reversal.mp4`: continuous actual-renderer samples every 50 ms, encoded at 20 fps. Geometry/timing match the frozen candidate; the last subsequent edits were fore-edge UV correction, multi-pointer guard, offscreen intersection threshold and cleanup.
- `final-forward-strip.jpg`: multiple moving phases, not just settled endpoints.

Retained review evidence:

- `final-review/closed-front-final.jpg`, `low-page-5-final.jpg`, `reset-final.jpg`: final source at desktop.
- `final-review/mobile-page-5.jpg`, `mobile-reduced-closed.jpg`, `mobile-touch-drag.jpg`: 390x844 mobile, stable reduced motion and real touch input.
- `final-review/last-checks.json`: final idle redraw count 225→225; offscreen count 40→40; canceled drag kept step 5→5 and cleared dragging.
- `final-review/finish-inspection.json`: real-time callback CPU/per-frame samples, earlier idle check, touch state and zero page errors/failed assets. Its earlier offscreen attempt did not fully scroll the book out; the explicit final check supersedes that attempt.

Measured geometry across 240 sampled poses: centerline width 125.273–126.114 mm (nominal 126.110; maximum shortening about 0.66% from parallel root offsets), thickness 0.060858–0.060887 mm, root Y drift zero at stored precision, minimum distinct root interval 0.060871 mm. Settled body centerline separation is at least 0.062693 mm; the tight binding fan minimum is 0.060580 mm. This is within 0.0003 mm of nominal thickness at the fan and is not a collision-proof guarantee. No NaN poses in the candidate. Original geometry inspection found 118.744–130.093 mm width and three nonfinite leaf poses near boundaries. See `geometry-measurements.json` and its measurement script; these are measurements, not a test suite.

Performance: 25,434 vertices, 41,612 triangles, seven dynamic meshes; about 29 material draw groups. Node geometry-only median/p95 posing was 6.78/7.83 ms. In the installed headless Chrome at 1440x1000 DPR 1, 592 observed rendering callbacks had median/p95 CPU time 5.3/6.7 ms and median interval 16.7 ms. CPU times include geometry and submission, not GPU execution; they do not guarantee performance on other devices. Rendering stops at idle and offscreen. Renderer/resources/listeners/observers are disposed on unmount; live GPU memory-leak measurement was not performed.

Validation: final `npm run build`, `npm run lint`, and `git diff --check` passed. Build retains the existing large-chunk warning. No test suites were added or run. Desktop live use covered long horizontal, reverse and diagonal drags; captured checks additionally covered pole/outside/reset/keyboard, touch and canceled drag. Browser visibility pause is implemented and inspected in code; document-hidden pause and simultaneous multi-touch were not directly exercised. The final multi-pointer guard was code-reviewed rather than captured with two simultaneous real contacts.

Remaining limitations for the approval gate: the fixed-length open leaves extend less far left than the stretched approved Blender endpoint (about 5 mm of horizontal profile difference); the approved free-edge height is restored to approximately 10 mm above BOTTOM. The root fan has high localized curvature and no general collision solver. The five physical leaves are only an approximation of the user's normalized 5/350 interval. Full mobile framing now fits with margin, but that makes the book smaller. Low-angle edge visibility is physically subtle and still needs the parent's visual judgment. The frozen candidate has no claimed final approval.

Capture constraints: the disk filled twice. The latest full PNG run completed cover/forward/backward/reversal, then failed midway through rapid input; `final-review/rapid/066.png` is an empty failed write. The compact finish run separately reached page 5 and completed the mobile/idle/touch checks. No unrelated files were deleted. The earlier `after/`, `candidate/`, and `review/` folders are intermediate evidence, not the frozen candidate.

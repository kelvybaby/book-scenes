# Decision log

This log preserves historical rationale. The active scene specification owns current requirements; later decisions supersede earlier ones where they conflict. Record material changes in direction with their reasons, not routine tuning or task progress. Preserve old reasoning when recording a superseding decision.

## 2026-08-01 — Keep the project private and local

**Status:** Accepted

**Context:** The project is a personal response to books and may contain copyrighted passages supplied by the reader.

**Decision:** Build for local, private, noncommercial use. Do not publish, deploy, add analytics, or make the future GitHub repository public without a new explicit decision.

**Consequences:** No backend, account, SEO, marketing, permissions workflow, or publication-oriented attribution system is required.

## 2026-08-01 — Start with the house and park

**Status:** Accepted

**Context:** The early journey offers landscape and motion, while the park and Fermina's house offer a stronger emotional and spatial center for the first scene.

**Decision:** Build the park-and-house scene first, then titled **The Park of Waiting**. Build **The Journey** second as a nature-led contrast.

**Consequences:** The first scene can also serve as a provisional book landing page. The road leaving the square may later connect the two scenes.

## 2026-08-01 — Use an emotionally truthful composite house

**Status:** Accepted

**Context:** A literal historical reconstruction would require evidence the project does not have and could narrow the scene's imaginative role.

**Decision:** Base the spatial relationship on the early book while designing the house and surrounding city as an original composite.

**Consequences:** Historical and regional research may inform materials and climate, but no real building is treated as the canonical model.

## 2026-08-01 — Prototype the first scene as layered 2.5D artwork

**Status:** Accepted for prototype; renderer remains revisable

**Context:** Generated video cannot respond naturally to input, and complete 3D would add cost and production complexity before the visual direction is proven.

**Decision:** Begin with separated raster layers, semantic HTML, CSS, and one motion system.

**Consequences:** Artwork requires careful overlap and mobile crops. Three.js may be added only if the rough prototype demonstrates a real spatial limitation.

## 2026-08-01 — Store only passage text as reader-facing content

**Status:** Accepted

**Context:** The reader does not want to maintain edition, translator, page, or analytical metadata.

**Decision:** Store the passage or phrase exactly as supplied. Permit only invisible technical fields necessary to place and operate it.

**Consequences:** The application will not behave as a scholarly citation archive. Passage text must not be invented or altered by the implementation.

## 2026-08-01 — Use a zero-cost-first tool strategy

**Status:** Accepted

**Context:** The project should look exceptional without accumulating subscriptions.

**Decision:** Use available image generation, open-source frontend libraries, local assets, and browser-native capabilities first. Higgsfield is not part of the initial pipeline.

**Consequences:** A paid tool may be considered for a specific unsolved asset only after a cheaper prototype fails and the purchase is explicitly approved.

## 2026-08-01 — Treat prompts and references as project assets

**Status:** Accepted

**Context:** Visual consistency requires more than conversational memory.

**Decision:** Version important prompts, keep a concise reference ledger, change only one or two variables per iteration, and record why a result was retained or rejected.

**Consequences:** Raw reference captures remain outside Git; durable visual principles live in project documents.

## 2026-08-01 — Keep agent guidance concise and evidence-based

**Status:** Accepted

**Context:** Large universal design rulebooks consume context and often impose unrelated taste.

**Decision:** Keep repository-wide rules in `AGENTS.md`, art direction in its own document, and scene-specific requirements in scene specifications. Create a reusable skill only after the workflow succeeds more than once.

**Consequences:** Documentation should grow in response to repeated friction, not hypothetical edge cases.

## 2026-08-01 — Keep both young figures subtly visible

**Status:** Accepted

**Context:** The first framing overidentified the park with Florentino's viewpoint and risked reducing Fermina to an absent object of attention.

**Decision:** Show both Fermina and Florentino in the initial frame with comparable subtlety and narrative weight. Use partial posture, clothing, hands, objects, reflections, or architectural framing rather than detailed portraits.

**Consequences:** Concept studies must preserve the distance between them while making each figure unmistakably present. The working title was later superseded by **Under the Almond Trees** because it better holds the park, house, threshold, and distance together.

## 2026-08-02 — Name the first scene Under the Almond Trees

**Status:** Accepted

**Context:** `The Park of Waiting` overemphasized Florentino's vigil, while `The First Meeting` and `Love at First Sight` felt too familiar and too literal for a scene that compresses several early moments.

**Decision:** Use **Under the Almond Trees** as the first scene title.

**Consequences:** Use the title for the scene specification, runtime asset directory, and future scene-specific code. It encompasses the concealed bench, Fermina at the doorway, falling leaves, shade, and the spatial relationship between house and park.

## 2026-08-02 — Separate character evidence from character visibility

**Status:** Accepted; supersedes the 2026-08-01 visibility decision where they conflict

**Context:** The first concept set treated detailed textual descriptions of Florentino and Fermina as a request to show more of them. The reader intended those details as context for any fragments that survived the composition.

**Decision:** Keep Florentino substantially more concealed than all three first studies: a deeply cropped silhouette, hand, clothing edge, book, or eyeglass glint rather than a readable head or torso. Show Fermina only slightly more clearly, seated alone at the doorway beneath almond trees, in the many-folded tunic and gardenia garland, partially screened by leaves, shadow, and distance. Do not include the aunt.

**Consequences:** Narrative balance must come from composition, light, and the space between the figures—not equal visibility. The next study combines Study A's painterly texture with a refined version of Study C's architecture; Study B's engraved treatment is not the primary direction.

## 2026-08-02 — Use a wider third-person park viewpoint

**Status:** Accepted; supersedes the 2026-08-02 character-visibility decision where they conflict

**Context:** Study D overcorrected Florentino from portrait-sized to nearly absent. Its close book-and-hand foreground still implied his point of view, while its dark tree shade and closed neighborhood repeated too much of Study A.

**Decision:** Observe Florentino from elsewhere in the park. Show his complete or nearly complete seated reading silhouette at a smaller scale, consciously visible but without readable face or costume detail. Open Fermina's house through arches and passageways, redesign the surrounding neighborhood, place substantial almond growth at the doorway, and retain colour and detail in shaded areas.

**Consequences:** Future studies must avoid both over-the-shoulder proximity and disembodied-hand concealment. Study E becomes the leading composition pending reader review.

## 2026-08-02 — Approve Study O for implementation

**Status:** Accepted as the upstream visual master; superseded as the current blockout reference by Study Q for the passage-interaction stage

**Context:** Studies E through I established the open neighborhood, crossable street, integrated park bench, interior dry fountain, two-chair embroidery arrangement, glasses, gardenias, and restrained facial detail. Successive full-frame edits softened the crisp rendering that the reader preferred in Studies E, F, and G. The reader confirmed Study O as satisfactory for the first scene.

**Decision:** Use `design/concepts/under-the-almond-trees-study-o-gridlocked-face-v13.png` as the approved visual reference and implementation authority. Study O preserves the selected full-frame composition, regional vegetation, and grid-locked facial correction without a free-positioned facial overlay.

**Consequences:** Stop full-scene concept iteration. Retain Study O as the source master for protected regions and future bounded repairs; use Study Q as the current static prototype frame for the passage-interaction stage.

## 2026-08-03 — Approve Study Q for passage interaction

**Status:** Accepted for the current implementation stage; supersedes Study O as the current blockout reference

**Context:** Study Q applies the accepted bounded park-ground treatment to the Study O composition and preserves the approved camera, house, figures, vegetation, and protected scene regions. The current browser blockout uses the resulting runtime asset and registered foreground layer assets for the first depth proof.

**Decision:** Treat Study Q as the final approved blockout for the next passage-interaction stage. Use it as the complete static frame and runtime base while retaining Study O as the upstream source master.

**Consequences:** Visual iteration for the current blockout is complete. Proceed to passage interaction, using Study Q as the scene surface and Study O only for provenance, protected pixels, and future bounded repairs.

## 2026-08-03 — Keep pointer parallax selective

**Status:** Accepted for the current prototype

**Context:** Moving broad vegetation-and-ground regions exposed visible cut boundaries and made the park surface behave like a sliding card. Registered tests showed that only genuine occluding silhouettes could move without weakening the scene.

**Decision:** Limit pointer-driven translation to the registered upper foreground canopy and the isolated upper silhouette of the lower-right plant cluster. Keep the road, path, soil, architecture, figures, vegetation rooted around Fermina's house, and shrubs behind Florentino static. Treat wind and changing light as separate, localized systems rather than additional translating depth planes.

**Consequences:** The current CSS depth stack is sufficient for the prototype. Do not add another sliding plane unless a bounded browser proof demonstrates a clean silhouette, concealed underpainting, exact resting composite, and a visible improvement when combined with passage, wind, and lighting behavior.

## 2026-08-08 — Limit Three.js to the passage page surface

**Status:** Accepted architectural boundary for the current prototype; visual behavior remains provisional

**Context:** The static scene and selective CSS layers are sufficient for the tableau and pointer depth. A bounded prototype showed that a localized mesh is useful for page deformation, material transition, wind response, and road contact, while semantic HTML remains better for readable passage content and fallback behavior.

**Decision:** Use Three.js only inside the passage interaction as a progressive page-surface enhancement. Keep the exact passage in semantic HTML, keep the scene layers and pointer parallax in CSS, and keep page physics and wind sampling separate from the renderer in `PaperSheet.ts` and `WindField.ts`.

**Consequences:** The passage may use a shared page mesh while retaining a complete no-WebGL fallback. The discovery cue, opening, settled state, rigidity model, landing, and release path still require visual approval. The renderer must cap pixel ratio, pause when hidden, observe layout changes, and dispose all resources on unmount. Do not expand Three.js into a scene-wide renderer without a new bounded proof and decision.

## 2026-08-09 — Permit a localized deforming-leaf proof

**Status:** Experimental bounded proof; supersedes the 2026-08-08 Three.js boundary only for the lower-right plant

**Context:** Rotating one isolated foreground region made the plant behave like a hinged card. The requested effect is persistent, relaxed movement within specific leaves while their bases and the surrounding painted background remain rooted.

**Decision:** Permit one transparent Three.js layer containing three separately traced, subdivided leaf meshes over an exact stationary remainder of the approved foreground. Drive the leaves and passage paper from the same calm scene-scale wind signal, but give each material its own response, damping, and limits. The leaf responder adds a slow continuous baseline sway so the base scene has no authored still interval. During reading, leaf motion continues at lower amplitude and speed. Retain the original foreground as the no-WebGL and reduced-motion fallback.

**Consequences:** This is not approval for a scene-wide renderer or simulated plant physics. The source partition must reconstruct the approved foreground exactly, and each additional plant requires its own traced assets, concealed overlaps, response tuning, and rendered proof. The current lower-right result remains subject to reader approval before the method expands elsewhere.

## 2026-08-09 — Expand the localized plant rig to the far-right flowers

**Status:** Accepted for the current prototype; supersedes the three-leaf scope of the earlier 2026-08-09 proof

**Context:** The reader approved the corrected three-leaf motion and requested a meticulous expansion within the lower cluster plus wind response in the far-right flowering pot. The flowers are flattened into Study Q and therefore require concealed background repair to move without leaving duplicates.

**Decision:** Use nine narrow, exact-pixel blade meshes in the lower cluster and five separately phased flower-branch meshes at the far right. Keep both dense plant bases and the terracotta pot rooted. Flower stems bend less and respond more slowly than the lower blades. Use generated pixels only inside the exact flower pixels removed from the flattened master; restore every visible resting pixel with Study Q cutouts and verify a zero-difference source reconstruction.

**Consequences:** The localized plant canvas now carries fourteen lightweight meshes but remains separate from the scene camera and passage renderer. The original Study Q frame and registered foreground remain the reduced-motion and no-WebGL fallbacks. Further vegetation expansion still requires its own traced partition, clean plate, material response, and rendered edge proof.

## 2026-08-12 — Add sparse falling leaves as a bounded 2D particle proof

**Status:** Experimental bounded proof; visual cadence remains subject to reader approval

**Context:** The reader first requested falling leaves from the doorway tree and the left tree behind Florentino, then clarified that sources should vary across real vegetation in the upper half of the scene. These objects travel through open image space and do not need the deformable geometry used by paper and rooted vegetation.

**Decision:** Render no more than four normal-scene falling leaves on a registered transparent 2D canvas. Build their small sprites from Study Q foliage texture inside authored almond-leaf silhouettes. Distribute six contained emission regions across actual upper-half foliage—the upper-left frame, central canopy, house crown, courtyard tree, doorway tree, and smaller left tree. Give every region an independent seeded clock and stagger their openings so the scene usually holds a descending leaf without repeatedly emitting from the same location. Emit one leaf normally and only rarely a pair. Use a lightweight per-leaf solver for gravity, terminal velocity, drag, lateral flutter, depth scale, face-on/edge-on tumble, rotation, and source-specific ground contact. Sample the existing calm `AmbientWindField` for shared air movement while retaining individual inertia. Keep motion during reading at reduced cadence and energy; render no falling leaves under reduced motion.

**Consequences:** The approved painting remains untouched and complete without canvas. The layer pauses when hidden and caps normal density and update rate. The later traveling ground gust may reuse landed-leaf visual language, but it should be a separate rare event and should not turn these sparse releases into a constant particle shower.

## 2026-08-29 — Couple falling-leaf glide, turning, and attitude

**Status:** Accepted implementation direction; visual tuning remains subject to reader approval

**Context:** The first falling-leaf solver applied a small oscillating lateral target to an otherwise downward fall and advanced rotation independently at a near-constant rate. At scene scale this read as tiny leaves descending in straight vertical lanes, with spin unrelated to the path. Cornell's falling-paper experiments distinguish a side-to-side flutter mode—with gliding between rapid attitude changes at cusp-like turns—from a rotating tumble with sideways drift.

**Decision:** Keep the registered transparent 2D canvas and the shared calm `AmbientWindField`, but replace the trajectory and attitude model. Sample starts from triangular distributions authored inside six foliage crowns; schedule them through a seeded shuffled source bag. Give each leaf a broad, slowly modulated glide, smooth low-frequency turbulence, turn-sensitive descent, and spring-coupled bank and pitch. Let only a minority transition into a delayed tumble. Preserve the Study Q texture and silhouette on both apparent faces, enlarge the rendered leaves by 1.55–1.95 times, and collect the principal artistic controls in `FALLING_LEAF_CONTROLS`.

**Consequences:** The result borrows observed qualitative relationships rather than claiming computational fluid dynamics or reproducing one laboratory trajectory. Starts, paths, turns, and attitudes remain individually seeded and non-repeating at the scene level. Normal density stays capped at four, reading mode remains calmer but active, reduced motion remains empty, and the complete static painting remains the fallback.

## 2026-08-30 — Protect the figure and bound falling-leaf travel

**Status:** Accepted implementation correction; cadence and speed remain available for reader tuning

**Context:** A dense deterministic audit found no stacking conflict with the active book light—the cue already renders above the leaf canvas—but one central-canopy trajectory entered the flattened Florentino-and-bench region. The same audit showed that accumulated lateral velocity could carry older leaves hundreds of pixels sideways and offscreen before they landed. Contact also stopped and rotated a leaf too abruptly, making the later fade difficult to distinguish from disappearance on impact.

**Decision:** Increase normal descent to 20–30 source pixels per second, release one leaf every 2.8–4.2 seconds, and permit five active leaves. Add a smooth predictive clearance ellipse around Florentino, his hands, the book, and its discovery light. Bound each path with a softly moving horizontal anchor so glides remain broad without runaway travel. On ground contact, retain a short decelerating slide and ease rotation and roll toward a resting attitude over 2.8–4.1 seconds; hold opacity through most of that interval and fade only near the end.

**Consequences:** The correction does not require a new mask, cutout asset, renderer, or collision system. Leaves curve around the flattened foreground figure instead of being abruptly erased, book-light stacking remains unchanged, more releases survive long enough to settle, and the static/reduced-motion fallback is unaffected. Runtime diagnostics are throttled and depth ordering is maintained at spawn rather than allocating and sorting a copy on every rendered frame.

## 2026-09-02 — Increase falling-leaf flow with staggered local groups

**Status:** Accepted implementation tuning; visual density remains available for reader review

**Context:** The five-leaf cap and 2.8–4.2-second event interval often left only one or two leaves visually apparent across the wide composition. Increasing only vertical velocity would shorten each leaf's visible lifetime and could make the scene feel emptier, while simultaneous scene-wide batches would resemble a particle shower.

**Decision:** Raise descent variation to 30–42 source pixels per second, shorten event spacing to 1.4–2.8 seconds, and allow up to twelve active leaves. Keep most events isolated, but give 32 percent of events a two-to-four-leaf group. Stagger members by 0.12–0.38 seconds and interpolate their spawn points toward one anchor inside a single authored foliage triangle, preserving spatial coherence without identical starts. Guarantee one staggered three-leaf group at initial scene entry so the effect becomes legible promptly.

**Consequences:** Flutter, glide, banking, tumbling, appearance, wind response, protected-area routing, and settling remain unchanged. The existing canvas, source bag, and leaf solver are retained; the only additional runtime state is a short pending-spawn queue capped by the active-leaf limit.

## 2026-08-12 — Permit a butterfly population only around the far-right flowers

**Status:** Experimental bounded proof; form and motion tuning remain subject to reader approval

**Context:** The supplied video establishes a restrained feeling, scale range, and local density for small yellow butterflies, but its environment is not an implementation template. This scene needs independent hovering, depth, and rapid wing articulation around one existing flowering plant while avoiding Fermina and the architecture. Eleven agents are too few to justify scene-wide particle infrastructure, and sprites would lose the hinged silhouette and banking that make them readable at this distance.

**Decision:** Use one registered transparent Three.js layer containing 11 desktop or 8 mobile butterfly groups. Share one body geometry, two wing geometries, and a small material set, but keep each group and wing transform independent rather than using `InstancedMesh`. Confine every initial position and changing target to one authored source-space habitat around the far-right flowering pot; do not create crossings, excursions, or other populations. Drive local steering from seeded changing targets, leaf approaches, hover pauses, smooth drift, separation, depth variation, and a weak sample of `AmbientWindField`. Use exact alpha from the already registered flower-branch cutouts as two depth-only vegetation masks. Keep the population visible but slower, quieter, and less opaque while reading. Render none under reduced motion.

**Consequences:** The effect remains removable without changing Study Q, and the motion solver remains independent of Three.js. The renderer adds roughly 35 normal render objects at the desktop maximum (three meshes per insect plus two depth masks), uses shared resources and a fixed DPR of 1, lowers its registered buffer scale on mobile, pauses when hidden, and cleans up on unmount. Settings and query diagnostics make population, habitat, paths, masks, seed, and fallback observable. Any population outside the far-right flowers, noticeable composition crossing, collision mesh, scene-wide renderer, or GPU-instanced version requires a new visual need and decision.

## 2026-08-30 — Replace butterfly glide with local burst states

**Status:** Accepted implementation correction; visual cadence remains subject to reader approval

**Context:** In the rendered Study Q scene, the first meshes inherited too much mustard, wall, and foliage colour; their large fold angle also made the wings nearly edge-on for much of the cycle, so individual agents read as flies or generic particles. The first solver steered continuously toward relatively distant targets with low-frequency value noise, producing smooth sliding paths. Close-interval inspection of the supplied reference shows a brighter warm-cream paired-wing silhouette and repeated near-pauses, short displacements, abrupt local heading changes, and active flap/body coupling.

**Decision:** Keep the same 11-desktop/8-mobile population, shared geometry, registered renderer, depth masks, and far-right-only scope. Broaden and shallowly notch each wing, reduce the body, cap the fold before either wing disappears, and use three unlit painted yellows instead of dark Lambert shading plus emissive compensation. Replace slow arrival/noise steering with a seeded five-state solver: hover, flutter-burst, short dart, leaf inspection, and local wander. Keep every target within 36 source pixels, refresh flutter targets and held course offsets at sub-second intervals, permit high acceleration but continuous integration, and couple flap energy, thrust modulation, and body bob to the active behavior. Tighten the existing habitat ellipse so the more energetic motion remains clearly inside the flowering vegetation rather than touching the adjacent wall.

**Consequences:** Motion now varies through discrete local decisions rather than a smooth rail or frame-random particle jitter. Wing activity becomes strongest during bursts and darts and softest during inspection, while per-agent frequency and phase remain independent. The change adds no render objects, textures, dependencies, or collision geometry; `MeshBasicMaterial` also removes the two butterfly-only lights. Reading attenuation, reduced-motion absence, mobile buffer scale, visibility pausing, resource cleanup, and exact plant occlusion remain unchanged. Behavior counts join the existing canvas diagnostics for tuning.

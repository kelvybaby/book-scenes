# Decision log

This file records decisions that affect the project beyond one implementation detail. New entries should state context, decision, and consequences. Do not rewrite old reasoning silently; append a superseding decision.

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

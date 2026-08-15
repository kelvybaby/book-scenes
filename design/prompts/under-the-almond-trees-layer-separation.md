# Under the Almond Trees layer separation

These prompts produced the provisional source material for the first clean canopy-depth proof. Generated pixels are used only as concealed underpainting; the visible canopy layer retains exact pixels from the upstream Study O visual master, while Study Q remains the current static frame and runtime base.

## Hidden background repair

```text
Use case: precise-object-edit
Asset type: hidden background plate for subtle 2.5D parallax in a literary website scene
Input image: the supplied approved scene is the edit target
Primary request: Remove ONLY the nearest dark foreground almond canopy and its thick upper-left framing branches across the top approximately 30 percent of the image. Reconstruct the pixels that would plausibly exist behind it: continuous pale blue late-afternoon sky and clouds on the left/center, and the already-present distant rooflines plus the upper portions of the weathered house and its more distant attached vegetation on the right. This is an underpainting plate; the original canopy will later cover almost all of the reconstructed region.
Composition/framing: preserve the exact 16:9 camera, crop, perspective, spatial registration, and geometry of every unchanged element.
Style/medium: match the original crisp, richly detailed painterly realism exactly.
Lighting/mood: preserve the original late-afternoon light, shadows, palette, contrast, and atmospheric depth.
Constraints: change only pixels belonging to the nearest upper foreground canopy/branches and the immediately hidden background beneath them. Keep the entire lower 70 percent pixel-aligned and visually unchanged. Keep Florentino, his glasses, bench and book unchanged. Keep Fermina, her face, gardenia garland, embroidery, chairs and doorway unchanged. Keep the house facade, arches, street, park, telegraph poles and wires, distant buildings, flowers, and all vegetation below the removed canopy unchanged. Do not invent new focal objects. No text, no watermark. Do not blur, soften, recolor, crop, reframe, or redesign the approved scene.
```

## Canopy matte source

```text
Use case: background-extraction
Asset type: registration matte source for a foreground foliage layer in a 2.5D website scene
Input image: the supplied approved scene is the exact placement and silhouette reference
Primary request: Isolate ONLY the nearest foreground almond tree that frames the scene: the thick dark trunk entering from the far left edge and its connected overhead branches and dense leaf canopy spanning across the top of the image. Reproduce that tree's placement, scale, branching silhouette, leaf clusters, openings, and outer contour as closely as possible to the input. Exclude the smaller park shrubs, all ground vegetation, telegraph poles and wires, distant street trees, and all vines or plants rooted at Fermina's house.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for background removal. The background must be one uniform color with no shadows, gradients, texture, reflections, or lighting variation.
Style/medium: preserve the original tree's crisp painterly pixels and detailed leaf edges; this will be used as a matte guide, not as redesigned artwork.
Composition/framing: exact same 1672×941 landscape canvas and exact registration as the input; do not crop, center, enlarge, rotate, or reposition the tree. Leave every non-tree area solid #ff00ff.
Constraints: no #ff00ff within the tree. No cast shadow, no ground plane, no text, no watermark. Do not add new branches, blossoms, fruit, birds, objects, or scenery. Preserve open sky holes between leaves rather than filling the canopy into a solid mass.
```

## Right foreground plant proof — Study Q

This second proof deliberately excludes the path, soil, curb, leaf litter, and every other continuous ground surface. Only the exposed upper silhouette of the lower-right plant cluster moves. Its lower cut is feathered and concealed inside the dense stationary plant base. The visible layer uses exact Study Q pixels; generated material is limited to a registration guide and deeply hidden underpainting.

### Plant matte source

```text
Use the supplied Study Q as an exact registration reference. On the identical 1672×941 canvas, isolate only the genuine foreground leaves and narrow blades in the lower-right plant cluster. Preserve their placement and openings. Exclude the path, road, curb, stones, soil, leaf litter, shadows, architecture, flowers by the house, figures, and every broad rectangular or ground-shaped region. Put the isolated plant silhouette on perfectly flat solid #ff00ff. Do not crop, move, enlarge, redesign, soften, or add vegetation. No text or watermark.
```

### Concealed repair source

```text
Use the supplied Study Q as the exact edit target. Remove only the lower-right foreground plant cluster identified in the reference while preserving the original 1672×941 crop and registration. Reconstruct the small area hidden directly behind it as a continuation of the adjacent dry park ground and dense low plant base. Keep the road, curb, path, house, figures, canopy, lighting, palette, texture, and every unrelated pixel unchanged. This is concealed underpainting, not a redesigned scene. No new objects, blur, text, or watermark.
```

Runtime rule: the generated matte is only a location guide. Rebuild the alpha from Study Q, retain Study Q RGB for every visible pixel, verify an exact rest composite, and reject the layer if either maximum shift reveals a duplicate edge. The foreground multiplier is `0.34` horizontally and `0.28` vertically relative to the canopy offset; do not create an independent motion loop.

## Far-right flowering plant underpainting — Study Q

The runtime flowers and attached leaves retain exact Study Q pixels. Generated pixels from this edit are sampled only beneath the traced branch masks and are therefore fully concealed in the resting composite. The registered source is [`design/layers/under-the-almond-trees-flower-underpaint-source-v1.png`](../layers/under-the-almond-trees-flower-underpaint-source-v1.png).

```text
Use case: precise-object-edit
Asset type: concealed underpainting plate for an animated layered painting
Input image: edit target; preserve its exact square composition and camera.
Primary request: Remove only the large flowering plant growing from the terracotta pot at the lower-right edge: remove its orange-red blossoms, green leaves, and stems above the pot. Keep the terracotta pot itself exactly in place. Reconstruct the small areas hidden behind that plant as a plausible continuation of the existing weathered plaster wall, deep doorway foliage/shadow, stone threshold, and ground already adjacent to those areas.
Style/medium: preserve the input's painterly late-afternoon illustration, brush texture, light direction, palette, and detail density.
Constraints: Fermina, her chair, the empty chair, doorway, architecture, window, pot, curb, road, all plants outside the specified rightmost potted flowering plant, framing, and lighting must remain unchanged. Do not add any new flowers, objects, people, text, blur, crop, camera shift, or redesign. This will be mostly concealed beneath exact source-pixel cutouts, so prioritize coherent neutral background directly behind the removed stems and blossoms.
```

The edit target was the exact Study Q crop `(1272, 360)–(1672, 760)`, enlarged to 1024×1024 for the edit and returned to its original 400×400 registration. `scripts/build_living_plant_assets.py` restricts the clean plate to the exact removed-pixel union and verifies a zero-difference resting reconstruction.

## Bounded cast-shadow repair — Study Q

Lighting audit: the façade illumination, foreground-tree value turn, and rightward ground projection support one high late-afternoon sun at camera-left/front-left. Ground shadows therefore travel generally right and slightly down in the image, with broad penumbrae from the elevated foreground canopy. Vegetation close to the façade makes smaller, crisper silhouettes on the vertical plaster. The original center-right road mark failed this logic because it read as a detached airbrushed streak rather than a continuation of the left canopy.

The first full shadow study was rejected because it darkened the road and façade globally. The retained generated source changes one variable only: the malformed ground-shadow region. It is stored at [`design/layers/under-the-almond-trees-ground-shadow-repair-source-v1.png`](../layers/under-the-almond-trees-ground-shadow-repair-source-v1.png).

```text
Use case: precise-object-edit
Asset type: bounded ground-shadow repair source for a 1672 × 941 painterly literary website scene
Input image: the supplied approved scene is the exact edit target and registration authority.
Primary request: Change ONLY the malformed cast-shadow smudge on the center-right park edge and street, approximately source pixels x 760–1160 and y 690–815. First restore the isolated gray-brown airbrushed streak into the surrounding warm stone/earth texture; then replace it with a restrained, physically plausible broken foliage shadow cast by the large almond tree rooted at the far left.
Lighting logic: one high late-afternoon sun from camera-left/front-left sends the shadow generally rightward and slightly downward across the horizontal ground. The replacement must be an elongated, irregular, perforated band made from overlapping branch and almond-leaf cluster silhouettes. It should remain visibly connected in direction and value to the established foreground shade on the left, but dissolve into small separated patches toward the right. Because the canopy is several meters above the ground, use soft penumbral edges and low-to-moderate contrast while keeping internal leaf/branch rhythm legible. Preserve warm reflected ochre and olive color inside shade.
Visual priority: keep the central street broadly luminous and crossable; the shadow is a quiet grounding detail, not a dark stripe and not a new focal point.
Style/medium: exact luminous painterly realism and brush texture of the source.
Constraints: make no changes outside x 760–1160, y 690–815. Within that region, alter only the malformed shadow and its replacement cast-shadow footprint; preserve curb geometry, street perspective, stones, cracks, leaf litter, plants, and all object edges. Keep every figure, chair, book, tree, plant, building, sky, wire, crop, color grade, and all other pixels visually unchanged. Exact original framing and registration. No text, no watermark.
Avoid: global darkening, broad road shadow, flat oval, horizontal smear, airbrush blur, repeated leaf stamps, hard decal edge, charcoal black, new objects, changed ground geometry, crop or camera shift.
```

`scripts/build_scene_shadow_overlay.py` registers that source back to Study Q, confines it to a feathered ground polygon, and builds the ground and wall silhouettes deterministically. The ground projection uses connected branch paths and irregular almond-leaf clusters with a soft penumbra; the wall projection uses smaller, crisper botanical shapes clipped to pale plaster while protecting arches, openings, the wall-side tree, Fermina, both chairs, Florentino, and the book. The final runtime file is `under-the-almond-trees-shadow-repair-v1.png`; the full registered QA composite is [`design/layers/under-the-almond-trees-shadow-repair-composite-v15.png`](../layers/under-the-almond-trees-shadow-repair-composite-v15.png).

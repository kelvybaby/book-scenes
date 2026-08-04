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

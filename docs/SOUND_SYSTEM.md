# Sound system

This document describes the current **Under the Almond Trees** sound implementation. It is a technical reference for maintaining the mix and connecting scene interactions to sound; the scene specification and art direction continue to own the intended experience.

## Design contract

- Sound is off by default and starts only from the visible sound button.
- The scene remains complete and usable in silence.
- The mix is environmental and material: foliage wind, birds, intermittent cicadas, page movement, writing, and released-paper flutter.
- There is no music, narration, or sound required to understand an interaction.
- Foreground sounds follow specific actions. Ambient sounds remain quiet and avoid a constant sequence of conspicuous events.

## Ownership and signal flow

| Path | Responsibility |
| --- | --- |
| [`src/components/SceneSoundscape.tsx`](../src/components/SceneSoundscape.tsx) | Creates the audio elements, owns playback and mix state, schedules ambient accents, exposes the sound toggle, and cleans up playback. |
| [`src/App.tsx`](../src/App.tsx) | Sends semantic events for the first book opening, first-time word reveals, reveal cancellation, and released-page motion. |
| [`src/components/WindPage.tsx`](../src/components/WindPage.tsx) | Reduces the paper simulation to normalized screen position, horizontal speed, lift, active, and post-contact values. It does not play audio directly. |
| [`design/references/README.md`](../design/references/README.md#under-the-almond-trees-audio-sources) | Records source, licence, edit, and usage provenance for each recording. |
| [`public/assets/scenes/under-the-almond-trees/audio/`](../public/assets/scenes/under-the-almond-trees/audio/) | Contains the edited runtime MP3 files. |

The dependency direction is:

```text
App interaction -----> SceneSoundscape
WindPage motion -----> SceneSoundscape -----> HTMLAudioElement instances
```

Keep interaction meaning in `App`, paper-motion calculations in `WindPage`, and audio scheduling and gain decisions in `SceneSoundscape`. A visual component should report a small semantic or normalized signal instead of reaching into an audio element.

`SceneSoundscapeHandle` is the current bridge:

```ts
playBookOpening()
playWordReveal(durationMs)
resetPageInteraction()
stopWordReveal()
updatePageFlutter({ active, afterGroundContact, horizontalPosition, horizontalSpeed, lift })
```

## Runtime layers

`SceneSoundscape` creates seven `HTMLAudioElement` instances from seven runtime files. The bird bed and bird-accent file derive from the same source recording, allowing the natural continuous ambience and the cleaned call clusters to overlap.

| Layer | File and duration | Playback behavior |
| --- | --- | --- |
| Foliage wind | `soft-foliage-wind-cc0.mp3`, 90 s | Continuous loop. Fades in over 1.4 s. Slow ambient gusts or released-page speed alter volume and playback rate. |
| Bird bed | `residential-birds-cc0.mp3`, 69 s | Continuous loop at a quiet fixed level after the initial fade. |
| Bird accents | `residential-bird-accents-cleaned-cc0.mp3`, 69 s | A cleaned derivative removes low rumble and reduces steady broadband noise. It selects authored 2.1–2.6 s call clusters, normally separated by 8–12 s. |
| Cicadas | `cicada-calls-user.mp3`, 29.1 s | Selects six authored 2.9–3.3 s phrases. Phrases advance in sequence, with variable 7–10 s gaps after each phrase. |
| Book page | `page-turn-cc0.mp3`, 1.81 s | One-shot on the first book-opening activation, provided sound was already enabled. |
| Writing | `fountain-pen-writing-cc0.mp3`, 20 s | Loop bounded to the calculated word-reveal duration, with a 180 ms attack and 260 ms release. It runs only the first time each passage is revealed during an opening session. |
| Released paper | `page-flutter-wind-cc0.mp3`, 4.44 s | Continuous loop while release motion is active. Target volume and playback rate follow normalized horizontal speed, lift, and whether first road contact has occurred. |

### Spatial field

When Web Audio is available, every media element is routed through one low-pass filter and one `StereoPannerNode`. The filters provide restrained distance cues; pan positions provide direction without hard-isolating a sound in one ear. The existing element-volume envelopes remain the gain authority.

| Layer | Pan behavior | Distance treatment |
| --- | --- | --- |
| Foliage wind | Two very slow overlapping drifts, approximately `-0.26…+0.26` | `9 kHz` low-pass; remains broad because the stereo recording is kept intact. |
| Bird bed | Stable at `+0.08`, subtly favoring the house side | `3.8 kHz` low-pass for the farthest layer. |
| Bird accents | 78% originate between `+0.18…+0.52`; occasional calls use `-0.28…+0.12` | The cleaned asset has a baked `5.2 kHz` ceiling; the spatial stage adds only a light `16 kHz` safety ceiling. Position changes only while the player is silent before its attack. |
| Cicadas | Each phrase holds one position between `-0.32…+0.22` | `4.8 kHz` low-pass. |
| Book page | Centered at `0` | Light `16 kHz` ceiling; reads as close. |
| Writing | Centered at `0` | `9 kHz` low-pass; close but softer than the page turn. |
| Released paper | Follows actual projected page center, mapping the full viewport to `-0.6…+0.6` | `12 kHz` low-pass; pan follows with a `0.12` per-frame coefficient. |

The page never reaches hard-left or hard-right (`-1` or `+1`). This keeps its trajectory legible on headphones while remaining coherent on speakers. If Web Audio is unavailable, playback retains the same timing and gain behavior without spatial processing.

### Mix calibration

All gains below use the browser's linear `HTMLAudioElement.volume` scale, where `1` is the edited file at full unamplified level and `0` is silence. These numbers are not perceived-loudness percentages: two recordings at the same gain may sound different because their source levels and spectra differ. Dynamic entries are target ranges; fades and smoothing can briefly produce intermediate values.

| Layer or phase | Gain target | Playback rate | Control |
| --- | ---: | ---: | --- |
| Foliage wind, calm | `0.157–0.183` | `0.75` | Two low-amplitude level drifts remain active around the `0.17` base. |
| Foliage wind, ambient gust | Up to `0.298` | Up to `1` | Independent randomized gust envelope. |
| Foliage wind, page blowing away | `0.157–0.298` | `0.75–1` | Smoothed normalized page X speed replaces the ambient gust envelope after first road contact. |
| Bird bed | `0.23625` | `1` | Fixed after scene fade-in. |
| Bird accent | `0.54` while active | `1` | Scheduled authored call segments. |
| Cicada | `0.3` while active | `1` | Scheduled authored call segments. |
| Book-opening page turn | `0.7` | `1` | One-shot. |
| Writing | Up to `0.204` | `1` | Word-reveal interval with short attack and release. |
| Released paper, before contact | `0.2` | `0.7` | Fixed targets; page velocity has no effect. |
| Released paper, after contact | `0.075–0.5` | `0.5–1` | X speed controls both gain and rate; lift adds gain only. |

The exact segment offsets and implementation constants remain local to `SceneSoundscape.tsx`. This table records the mix at the time of writing; implementation constants are the source for exact current values. Update affected entries when changing the mix. Treat related values as one control group and listen in the complete scene before accepting them.

### Transition and splice policy

No environmental layer may jump directly between audible gains or playback rates, and no excerpt may enter or leave at full gain. The current transition paths are:

| Transition | Envelope or smoothing |
| --- | --- |
| Soundscape start or visible-tab resume | Continuous wind and bird bed fade in over `1.4 s`. Scheduled layers begin silent; active writing and flutter restart from zero gain. |
| Ambient wind gust | The gust uses a sine-shaped rise and fall; the audible wind drive then follows with `0.028` per-frame rise and `0.02` fall coefficients. |
| Ambient-to-page-driven wind | The page-speed input is smoothed at `0.065` per frame, then passes through the wind-drive smoothing above. Both gain and playback rate use the same eased drive. |
| Bird excerpt | `260 ms` smooth attack and `460 ms` smooth release. |
| Cicada excerpt | `320 ms` smooth attack and `520 ms` smooth release. |
| Writing start and natural end | `180 ms` attack and `260 ms` release. |
| Writing interrupted by page release | Shortens the remaining interval to at most `260 ms`, preserving the same release envelope instead of hard-muting. |
| Released-paper flutter | Gain rises with a `0.14` per-frame coefficient and falls with `0.075`; playback rate uses `0.08` in both directions. |
| Released-paper position | Projected screen X follows with a `0.12` per-frame coefficient and is limited to `-0.6…+0.6`. |

The book-opening page turn is the intentional exception: it is a discrete material impact tied exactly to the click, not an ambient bed or a sliced excerpt. Its edited asset owns its transient shape.

### Ambient scheduling

| Event | Initial delay | Active duration | Following quiet gap |
| --- | ---: | ---: | ---: |
| Foliage-wind gust | `2.2–5.2 s` | `3.2–7.2 s` | `3.5–9.5 s` |
| Bird accent | `8–12 s` | `2.1–2.6 s` | `8–12 s` |
| Cicada phrase | `1.8–3.4 s` | `2.9–3.3 s` | `7–10 s` |

The intervals are sampled independently with unseeded `Math.random()`. Wind gusts use a shaped rise-and-fall envelope with two small internal variations rather than switching gain abruptly.

## Interaction timing

### Enabling sound

The `sound off` button is the required user gesture. Enabling it creates the engine, begins the quiet ambient loops, and starts the animation-frame mix loop. Disabling it pauses every player, cancels the mix frame, and discards the engine. The preference is not persisted across reloads.

The button exposes `aria-pressed` and changes its accessible label between “Turn scene sound on” and “Turn scene sound off.”
Its nonvisual `data-spatial-audio` diagnostic reports `active` when the Web Audio graph was created and `fallback` otherwise.

### Opening the book

`App.handleOpening` calls `playBookOpening()` at activation time, before the delayed visual page appearance. The sound plays once per opening session. After a released page leaves the scene, `resetPageInteraction()` returns the foreground page, writing, and flutter layers to their closed state so the next book activation can play the opening sound again. Ambient sound remains enabled when the reader has turned it on.

### Revealing words

When the opening completes, `App.handlePageOpened` starts writing audio for the first passage. Selecting an unseen second passage does the same. Returning to a passage that has already revealed does not replay the writing sound.

The requested duration is tied to the visual word cadence:

```text
duration = 1440 ms + (word count - 1) × 128 ms
```

Releasing the page cancels the writing interval and completes a short release of no more than `260 ms`. This mirrors the visual interruption, which freezes the words that have appeared instead of completing the passage after release, without introducing a hard audio cut.

### Released-page motion

`WindPage` reports motion every rendered frame while the page is active:

- `horizontalPosition` is the projected page center mapped from viewport space to `-1…+1`.
- `horizontalSpeed` is normalized from the magnitude of the page's X velocity.
- `lift` is normalized from clearance above the road after first contact.
- `afterGroundContact` remains true once contact has occurred during that release.
- `active` becomes false when the page leaves or the renderer cleans up.

The normalized inputs are:

```text
horizontalSpeed = smoothstep(7, 82, abs(velocityX))
lift = smoothstep(3, 14, clearanceAboveRoad)
flutterPan = clamp(horizontalPosition × 0.6, -0.6, 0.6)
```

Before first contact, released-paper flutter is fixed at `0.2` gain and `0.7×` rate. It is intentionally independent of the falling page's velocity. After contact:

```text
flutter gain = min(0.5, 0.075 + horizontalSpeed × 0.16 + lift × 0.265)
flutter rate = 0.5 + horizontalSpeed × 0.5
```

This lets a crawling page sound quiet and slow while preserving a distinct lift boost. Flutter gain approaches its target with a `0.14` per-frame rise coefficient and `0.075` fall coefficient; rate uses `0.08` in both directions.

After contact, the foliage-wind layer also follows horizontal page speed. That input is smoothed with a `0.065` per-frame coefficient and maps to `0.75–1×` playback and approximately `0.157–0.298` gain. The shared wind drive then eases toward the selected page or ambient target with `0.028` per-frame rise and `0.02` fall coefficients, so changing control modes cannot jump either parameter. At all other times, foliage wind uses its independent ambient gust envelope. Page speed replaces rather than stacks with the ambient gust drive, preventing a strong random gust from contradicting a visibly crawling page.

Audio does not feed forces back into the paper solver. It is a sonification of motion, not another physics system.

## Time, visibility, and cleanup

- Scheduling uses `performance.now()` in milliseconds and converts to seconds only for slow periodic wind texture.
- The mix loop uses `requestAnimationFrame` while the document is visible.
- When the document becomes hidden, all players pause and the mix loop stops.
- When visibility returns, bird accents restart with an `8–12 s` delay, cicadas with a `1.8–3.4 s` delay, and wind gusts with a `2.2–5.2 s` delay. Looped players and the mix frame then resume.
- Unmounting cancels the frame, pauses all audio, and closes the shared `AudioContext`.
- Failed `play()` promises are swallowed because browser autoplay policy can reject synthetic or automated activation. The visible toggle is the supported start path.

The current gain and playback smoothing is applied once per rendered frame, not with delta-time-correct exponential damping. It is adequate for the present mix but can respond somewhat differently at unusual refresh rates; preserve this fact when diagnosing timing rather than assuming the audio is frame-rate independent.

## Determinism

The paper's `windSeed` does not seed the soundscape. Ambient gust timing, initial accent selection, and quiet gaps use unseeded `Math.random()`. Therefore visual paper motion may be deterministic for a chosen wind seed while the ambient audio sequence differs between visits.

The ordered cicada and bird segment lists prevent immediate arbitrary slicing, but their initial positions and event timings are still nondeterministic. Do not describe recordings made with the same visual seed as having identical sound unless the scheduler is deliberately seeded in a future change.

## Reduced motion and fallback behavior

Sound preference and motion preference are separate. `SceneSoundscape` does not inspect `prefers-reduced-motion`; a reader who enables sound can hear the ambient mix in reduced-motion mode. The reduced-motion opening goes directly to the stable HTML passage, so it does not currently trigger the first passage's writing loop through `handlePageOpened`. The page-turn sound can still play, and changing to an unseen passage can still trigger writing.

If audio creation or playback is unavailable, the visual interaction continues. No state transition waits for a clip to load or finish.

## Adding or changing a sound

1. Confirm that the sound has a clear narrative or physical cause and is not required for comprehension.
2. Record its source, licence, runtime edit, and intended role in `design/references/README.md`.
3. Put the edited runtime asset in the existing scene audio directory; do not ship an untrimmed source recording when a compact edit is sufficient.
4. Add playback state and cleanup to `SceneSoundscape`, then expose the smallest semantic method or normalized motion input needed by the caller.
5. Keep clip offsets and related mix constants beside the layer that uses them.
6. Verify affected playback and lifecycle paths using the checks below; inspect console errors and missing assets.

Select checks below for the behavior changed; use the full list for sound-system changes. For audible mix changes, listen in the scene; compare speakers and headphones when available and report listening checks that were unavailable:

- sound starts only after the visible toggle and sound-off remains fully usable;
- both passage reveals trigger writing once, and premature release stops it;
- pre-contact flutter remains fixed even as fall velocity changes;
- slow and fast post-contact travel produce audibly different flutter and foliage-wind responses;
- every scheduled bird and cicada excerpt enters and leaves without an audible splice;
- ambient wind hands off to and from page-speed control without a gain or pitch step;
- lift raises flutter gain without changing its playback-rate mapping;
- hiding and restoring the tab does not create an immediate accent burst;
- repeated sound toggles do not leave duplicate loops; and
- the console and network panel contain no playback errors or missing assets.

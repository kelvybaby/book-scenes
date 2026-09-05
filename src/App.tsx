import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ButterflyLayer } from './components/ButterflyLayer'
import { DappledLight } from './components/DappledLight'
import { FallingLeaves } from './components/FallingLeaves'
import { LivingPlant } from './components/LivingPlant'
import { SceneContext } from './components/SceneContext'
import {
  SceneSoundscape,
  type SceneSoundscapeHandle,
} from './components/SceneSoundscape'
import { WindPage } from './components/WindPage'
import { underTheAlmondTreesPassages } from './content/passages'
import { BookModelLab } from './labs/book-model/BookModelLab'
import { sceneAmbientWind } from './motion/AmbientWindField'

const sceneImage =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-study-q.png'
const sceneShadowRepair =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-shadow-repair-v1.png'
const canopyUnderpaint =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-canopy-underpaint-v4.png'
const canopyImage =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-canopy-v4.png'
const rightForegroundUnderpaint =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-right-foreground-underpaint-v1.png'
const rightForegroundImage =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-right-foreground-v1.png'
const rightForegroundStatic =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-right-foreground-static-v3.png'
const flowerUnderpaint =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-flower-underpaint-v1.png'
type PageState = 'idle' | 'opening' | 'open' | 'closing'

const SCENE_SOURCE_WIDTH = 1672
const SCENE_SOURCE_HEIGHT = 941
// Manual hotspot adjustment: increase x to move right; increase y to move down.
// Both values are normalized coordinates in the 1672 × 941 source artwork.
const BOOK_CUE_SOURCE_POSITION = { x: 0.219, y: 0.716 } as const
const BOOK_CUE_VISUAL_CENTER = { x: 0.5, y: 0.63 } as const
// Keep the approved canopy and vegetation motion active alongside the ambient
// effects. This can be restored to `true` for an isolated lighting comparison.
const LIGHTING_PROTOTYPE_FREEZES_OBJECT_LAYERS = false
const WORD_REVEAL_BASE_DURATION_MS = 1440
const WORD_REVEAL_STEP_MS = 128

const wordRevealDuration = (text: string) =>
  WORD_REVEAL_BASE_DURATION_MS +
  Math.max(0, text.trim().split(/\s+/).length - 1) * WORD_REVEAL_STEP_MS

const windSeedOverride = (() => {
  const rawSeed = new URLSearchParams(window.location.search).get('windSeed')
  if (rawSeed === null || rawSeed.trim() === '') return null
  const parsedSeed = Number(rawSeed)
  return Number.isSafeInteger(parsedSeed) ? parsedSeed >>> 0 : null
})()

const createReleaseWindSeed = () => {
  if (windSeedOverride !== null) return windSeedOverride
  const seed = new Uint32Array(1)
  crypto.getRandomValues(seed)
  return seed[0]
}

function App() {
  const sceneRef = useRef<HTMLElement>(null)
  const readingLeavesRef = useRef<HTMLDivElement>(null)
  const readingSheetRef = useRef<HTMLElement>(null)
  const bookTargetRef = useRef<HTMLButtonElement>(null)
  const soundscapeRef = useRef<SceneSoundscapeHandle>(null)
  const currentOffset = useRef({ x: 0, y: 0 })
  const targetOffset = useRef({ x: 0, y: 0 })
  const cueNearbyRef = useRef(false)
  const revealedPassageIdsRef = useRef(new Set<string>())
  const releasedWordOpacitiesRef = useRef<readonly number[]>([])
  const animationFrame = useRef<number | null>(null)
  const [loadedLayerCount, setLoadedLayerCount] = useState(0)
  const [activePassageIndex, setActivePassageIndex] = useState(0)
  const [pageState, setPageState] = useState<PageState>('idle')
  const [cueNearby, setCueNearby] = useState(false)
  const [windPageReady, setWindPageReady] = useState(false)
  const [windSeed, setWindSeed] = useState(windSeedOverride ?? 0)
  const [revealingPassageId, setRevealingPassageId] = useState<string | null>(null)
  const activePassage = underTheAlmondTreesPassages[activePassageIndex]
  const dappledLightEnabled =
    new URLSearchParams(window.location.search).get('dapple') === 'on'
  const bookPrototypeEnabled =
    new URLSearchParams(window.location.search).get('bookPrototype') === 'on'

  const handleWindPageReady = useCallback((ready: boolean) => {
    setWindPageReady(ready)
  }, [])

  const handlePageGone = useCallback(() => {
    soundscapeRef.current?.resetPageInteraction()
    revealedPassageIdsRef.current = new Set()
    releasedWordOpacitiesRef.current = []
    setActivePassageIndex(0)
    setRevealingPassageId(null)
    setWindPageReady(false)
    setPageState('idle')
    window.requestAnimationFrame(() => bookTargetRef.current?.focus())
  }, [])

  const handlePageOpened = useCallback(() => {
    const firstPassage = underTheAlmondTreesPassages[0]
    revealedPassageIdsRef.current.add(firstPassage.id)
    soundscapeRef.current?.playWordReveal(wordRevealDuration(firstPassage.text))
    setPageState('open')
    setRevealingPassageId(firstPassage.id)
    window.requestAnimationFrame(() => readingSheetRef.current?.focus())
  }, [])

  const handleOpening = useCallback(() => {
    soundscapeRef.current?.playBookOpening()
    cueNearbyRef.current = false
    revealedPassageIdsRef.current = new Set()
    releasedWordOpacitiesRef.current = []
    setCueNearby(false)
    setRevealingPassageId(null)
    setActivePassageIndex(0)
    setWindSeed(createReleaseWindSeed())
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPageState(reducedMotion.matches ? 'open' : 'opening')
  }, [])

  const handleRelease = useCallback(() => {
    // The passage is selectable while it is at rest. Clear an active range before
    // handing its canvas counterpart back to the release animation so no browser
    // selection highlight is left behind as the DOM text is hidden.
    const visibleWords = readingLeavesRef.current?.querySelectorAll<HTMLElement>(
      '.reading-sheet__word',
    )
    releasedWordOpacitiesRef.current = visibleWords
      ? Array.from(visibleWords, (word) =>
          Number.parseFloat(window.getComputedStyle(word).opacity),
        )
      : []
    window.getSelection()?.removeAllRanges()
    soundscapeRef.current?.stopWordReveal()
    setRevealingPassageId(null)
    setPageState('closing')
  }, [])

  const handlePreviewPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pageState !== 'open') return
      const target = event.target
      if (target instanceof Node && readingLeavesRef.current?.contains(target)) return
      handleRelease()
    },
    [handleRelease, pageState],
  )

  useEffect(() => {
    if (pageState !== 'open') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) return
      event.preventDefault()
      handleRelease()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleRelease, pageState])

  const handlePassageChange = useCallback((index: number) => {
    const passage = underTheAlmondTreesPassages[index]
    const passageId = passage.id
    const alreadyRevealed = revealedPassageIdsRef.current.has(passageId)
    setRevealingPassageId(alreadyRevealed ? null : passageId)
    setActivePassageIndex(index)
    if (!alreadyRevealed) {
      revealedPassageIdsRef.current.add(passageId)
      soundscapeRef.current?.playWordReveal(wordRevealDuration(passage.text))
    }
  }, [])

  const handlePageFlutter = useCallback(
    (motion: Parameters<SceneSoundscapeHandle['updatePageFlutter']>[0]) => {
      soundscapeRef.current?.updatePageFlutter(motion)
    },
    [],
  )

  useEffect(() => {
    if (pageState !== 'closing') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (windPageReady && !reducedMotion.matches) return

    const closingTimer = window.setTimeout(handlePageGone, 720)
    return () => window.clearTimeout(closingTimer)
  }, [handlePageGone, pageState, windPageReady])

  const readingActive =
    pageState === 'opening' || pageState === 'open' || pageState === 'closing'

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')

    const render = () => {
      animationFrame.current = null

      const current = currentOffset.current
      const target = targetOffset.current
      const nextX = current.x + (target.x - current.x) * 0.14
      const nextY = current.y + (target.y - current.y) * 0.14

      currentOffset.current = { x: nextX, y: nextY }
      scene.style.setProperty('--canopy-x', `${nextX.toFixed(3)}px`)
      scene.style.setProperty('--canopy-y', `${nextY.toFixed(3)}px`)
      scene.style.setProperty('--foreground-x', `${(nextX * 0.34).toFixed(3)}px`)
      scene.style.setProperty('--foreground-y', `${(nextY * 0.28).toFixed(3)}px`)

      if (Math.abs(target.x - nextX) > 0.015 || Math.abs(target.y - nextY) > 0.015) {
        animationFrame.current = requestAnimationFrame(render)
      }
    }

    const requestRender = () => {
      if (animationFrame.current === null && document.visibilityState === 'visible') {
        animationFrame.current = requestAnimationFrame(render)
      }
    }

    const updateCueProximity = (nearby: boolean) => {
      if (cueNearbyRef.current === nearby) return
      cueNearbyRef.current = nearby
      setCueNearby(nearby)
    }

    const positionBookTarget = () => {
      const target = bookTargetRef.current
      if (!target) return

      const viewportWidth = scene.clientWidth
      const viewportHeight = scene.clientHeight
      const portrait = viewportHeight > viewportWidth
      const artworkWidth = portrait
        ? viewportWidth * (viewportWidth >= 700 ? 1.18 : 1.36)
        : SCENE_SOURCE_WIDTH *
          Math.max(
            viewportWidth / SCENE_SOURCE_WIDTH,
            viewportHeight / SCENE_SOURCE_HEIGHT,
          )
      const artworkHeight = artworkWidth * (SCENE_SOURCE_HEIGHT / SCENE_SOURCE_WIDTH)
      const objectPositionY = !portrait && viewportWidth / viewportHeight >= 2 ? 0.47 : 0.5
      const artworkLeft = (viewportWidth - artworkWidth) * 0.5
      const artworkTop = portrait
        ? (viewportHeight - artworkHeight) * 0.5
        : (viewportHeight - artworkHeight) * objectPositionY
      const targetWidth = Math.max(82, artworkWidth * 0.08)
      const targetHeight = Math.max(72, artworkHeight * 0.13)
      const centerX = artworkLeft + artworkWidth * BOOK_CUE_SOURCE_POSITION.x
      const centerY = artworkTop + artworkHeight * BOOK_CUE_SOURCE_POSITION.y

      target.style.left = `${centerX - targetWidth * BOOK_CUE_VISUAL_CENTER.x}px`
      target.style.top = `${centerY - targetHeight * BOOK_CUE_VISUAL_CENTER.y}px`
      target.style.width = `${targetWidth}px`
      target.style.height = `${targetHeight}px`
    }

    const settle = () => {
      updateCueProximity(false)
      targetOffset.current = { x: 0, y: 0 }
      requestRender()
    }

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = scene.getBoundingClientRect()
      const normalizedX = (event.clientX - bounds.left) / bounds.width
      const normalizedY = (event.clientY - bounds.top) / bounds.height
      const horizontal = normalizedX - 0.5
      const vertical = normalizedY - 0.5
      const targetBounds = bookTargetRef.current?.getBoundingClientRect()
      const cueDistance = targetBounds
        ? ((event.clientX - (targetBounds.left + targetBounds.width * 0.5)) /
            (targetBounds.width * 1.4)) **
            2 +
          ((event.clientY - (targetBounds.top + targetBounds.height * 0.5)) /
            (targetBounds.height * 1.8)) **
            2
        : Number.POSITIVE_INFINITY

      updateCueProximity(!readingActive && finePointer.matches && cueDistance <= 1)
      if (readingActive || reducedMotion.matches || !finePointer.matches) return

      targetOffset.current = {
        x: horizontal * -5.4,
        y: vertical * -2,
      }
      requestRender()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current)
        animationFrame.current = null
      } else {
        requestRender()
      }
    }

    scene.addEventListener('pointermove', handlePointerMove)
    scene.addEventListener('pointerleave', settle)
    window.addEventListener('resize', positionBookTarget)
    reducedMotion.addEventListener('change', settle)
    finePointer.addEventListener('change', settle)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    positionBookTarget()
    settle()

    return () => {
      scene.removeEventListener('pointermove', handlePointerMove)
      scene.removeEventListener('pointerleave', settle)
      window.removeEventListener('resize', positionBookTarget)
      reducedMotion.removeEventListener('change', settle)
      finePointer.removeEventListener('change', settle)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current)
        animationFrame.current = null
      }
    }
  }, [readingActive])

  return (
    <>
      <main className={`scene${readingActive ? ' scene--reading-active' : ''}`} ref={sceneRef}>
      <img
        className="scene__art"
        src={sceneImage}
        width="1672"
        height="941"
        alt="A sunlit park facing a weathered, arched house: Florentino reads beneath the almond trees while Fermina embroiders in the distant doorway."
        draggable="false"
        decoding="async"
        fetchPriority="high"
      />
      <img
        className="scene__art scene__shadow-repair"
        src={sceneShadowRepair}
        width="1672"
        height="941"
        alt=""
        aria-hidden="true"
        draggable="false"
        decoding="async"
      />
      {dappledLightEnabled ? <DappledLight /> : null}
      <FallingLeaves readingActive={readingActive} wind={sceneAmbientWind} />
      {!LIGHTING_PROTOTYPE_FREEZES_OBJECT_LAYERS ? (
        <div
          className={`scene__layers${loadedLayerCount >= 4 ? ' scene__layers--ready' : ''}`}
          aria-hidden="true"
        >
        <img
          className="scene__underpaint"
          src={canopyUnderpaint}
          width="1672"
          height="941"
          alt=""
          draggable="false"
          decoding="async"
          onLoad={() => setLoadedLayerCount((count) => count + 1)}
        />
        <img
          className="scene__foreground-underpaint"
          src={rightForegroundUnderpaint}
          width="1672"
          height="941"
          alt=""
          draggable="false"
          decoding="async"
          onLoad={() => setLoadedLayerCount((count) => count + 1)}
        />
        <img
          className="scene__canopy"
          src={canopyImage}
          width="1672"
          height="941"
          alt=""
          draggable="false"
          decoding="async"
          onLoad={() => setLoadedLayerCount((count) => count + 1)}
        />
          <LivingPlant
            fallbackSource={rightForegroundImage}
            readingActive={readingActive}
            staticSource={rightForegroundStatic}
            underpaintSource={flowerUnderpaint}
            wind={sceneAmbientWind}
            onLoad={() => setLoadedLayerCount((count) => count + 1)}
          />
        </div>
      ) : null}
      <ButterflyLayer readingActive={readingActive} wind={sceneAmbientWind} />
      <SceneSoundscape ref={soundscapeRef} />
      <div className="scene__reading-veil" aria-hidden="true" />
      <button
        ref={bookTargetRef}
        className={`book-passage-target${pageState === 'idle' ? ' book-passage-target--available' : ''}${cueNearby ? ' book-passage-target--nearby' : ''}`}
        type="button"
        aria-label="Open a passage from Florentino's book"
        aria-hidden={pageState !== 'idle'}
        tabIndex={pageState === 'idle' ? 0 : -1}
        onClick={handleOpening}
      >
        <span className="book-cue" aria-hidden="true">
          <span className="book-cue__spill" />
          <span className="book-cue__page" />
        </span>
      </button>
      <section
        className={`reading-preview${pageState === 'open' ? ' reading-preview--dismissible' : ''}`}
        aria-labelledby="reading-preview-title"
        onPointerDown={handlePreviewPointerDown}
      >
        <h2 className="visually-hidden" id="reading-preview-title">
          Passage from Florentino&apos;s book of verse
        </h2>
        {readingActive ? (
          <>
            <WindPage
              ambientWind={sceneAmbientWind}
              anchorRef={readingLeavesRef}
              originRef={bookTargetRef}
              passage={activePassage}
              releasedWordOpacitiesRef={releasedWordOpacitiesRef}
              state={pageState}
              windSeed={windSeed}
              onReady={handleWindPageReady}
              onOpened={handlePageOpened}
              onGone={handlePageGone}
              onReleaseMotion={handlePageFlutter}
            />
            <div
              className={`reading-leaves reading-leaves--${activePassage.treatment} reading-leaves--${pageState}${windPageReady ? ' reading-leaves--mesh-ready' : ''}${revealingPassageId === activePassage.id ? ' reading-leaves--word-reveal' : ''}`}
              ref={readingLeavesRef}
            >
          <article
            ref={readingSheetRef}
            className={`reading-sheet reading-sheet--${activePassage.treatment}`}
            aria-labelledby="reading-preview-title"
            aria-live="polite"
            tabIndex={-1}
          >
            <svg
              className="reading-sheet__fibers"
              viewBox="0 0 560 410"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <filter id="paper-fibers" x="0" y="0" width="100%" height="100%">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.28 0.52"
                    numOctaves="3"
                    seed="17"
                  />
                  <feColorMatrix type="saturate" values="0" />
                </filter>
                <filter id="page-warp" x="-12%" y="-12%" width="124%" height="124%">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.007 0.018"
                    numOctaves="2"
                    seed="29"
                    result="page-warp-noise"
                  />
                  <feDisplacementMap
                    data-page-displacement="true"
                    in="SourceGraphic"
                    in2="page-warp-noise"
                    scale="0"
                    xChannelSelector="R"
                    yChannelSelector="B"
                  />
                </filter>
                <linearGradient id="ghost-page-wash" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#fff9e8" stopOpacity="0.24" />
                  <stop offset="0.46" stopColor="#f7e8c8" stopOpacity="0.16" />
                  <stop offset="1" stopColor="#f3e3c1" stopOpacity="0.18" />
                </linearGradient>
                <clipPath id="ghost-page-clip">
                  <path d="M42 29C123 10 308 33 493 14Q538 14 546 47C557 115 529 213 549 361Q554 394 521 397C403 386 269 406 50 394Q20 396 28 361C8 287 48 197 25 103Q18 49 42 29Z" />
                </clipPath>
              </defs>
              <path
                className="reading-sheet__ghost-page"
                d="M42 29C123 10 308 33 493 14Q538 14 546 47C557 115 529 213 549 361Q554 394 521 397C403 386 269 406 50 394Q20 396 28 361C8 287 48 197 25 103Q18 49 42 29Z"
              />
              <rect
                className="reading-sheet__ghost-fibers"
                width="560"
                height="410"
                clipPath="url(#ghost-page-clip)"
                filter="url(#paper-fibers)"
              />
              <path
                className="reading-sheet__ghost-edge"
                d="M42 29C123 10 308 33 493 14Q538 14 546 47C557 115 529 213 549 361Q554 394 521 397C403 386 269 406 50 394Q20 396 28 361C8 287 48 197 25 103Q18 49 42 29Z"
              />
              <path
                className="reading-sheet__ghost-fold"
                d="M498 20Q529 20 543 45Q524 38 508 26"
              />
            </svg>
            <blockquote className="reading-sheet__passage">
              <p>
                {activePassage.text.split(/\s+/).map((word, index, words) => (
                  <span
                    className="reading-sheet__word"
                    key={`${activePassage.id}-${index}`}
                    style={{ '--word-index': index } as CSSProperties}
                  >
                    {word}
                    {index < words.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </p>
            </blockquote>
            <div className="leaf-switcher" aria-label="Preview passage leaf">
              {underTheAlmondTreesPassages.map((passage, index) => (
                <button
                  key={passage.id}
                  className="leaf-switcher__leaf"
                  type="button"
                  aria-label={`Show passage leaf ${passage.folio}`}
                  aria-pressed={activePassageIndex === index}
                  onClick={() => handlePassageChange(index)}
                >
                  {passage.folio}
                </button>
              ))}
            </div>
          </article>
            </div>
          </>
        ) : null}
      </section>
      </main>
      {bookPrototypeEnabled ? <BookModelLab /> : <SceneContext />}
    </>
  )
}

export default App

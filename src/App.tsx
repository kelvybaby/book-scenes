import { useCallback, useEffect, useRef, useState } from 'react'
import { WindPage } from './components/WindPage'
import { underTheAlmondTreesPassages } from './content/passages'

const sceneImage =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-study-q.png'
const canopyUnderpaint =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-canopy-underpaint-v4.png'
const canopyImage =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-canopy-v4.png'
const rightForegroundUnderpaint =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-right-foreground-underpaint-v1.png'
const rightForegroundImage =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-right-foreground-v1.png'
const readingStateOpen = true
type PageState = 'open' | 'closing' | 'closed'

function App() {
  const sceneRef = useRef<HTMLElement>(null)
  const readingLeavesRef = useRef<HTMLDivElement>(null)
  const currentOffset = useRef({ x: 0, y: 0 })
  const targetOffset = useRef({ x: 0, y: 0 })
  const animationFrame = useRef<number | null>(null)
  const [loadedLayerCount, setLoadedLayerCount] = useState(0)
  const [activePassageIndex, setActivePassageIndex] = useState(0)
  const [pageState, setPageState] = useState<PageState>('open')
  const [windPageReady, setWindPageReady] = useState(false)
  const activePassage = underTheAlmondTreesPassages[activePassageIndex]

  const handleWindPageReady = useCallback((ready: boolean) => {
    setWindPageReady(ready)
  }, [])

  const handlePageGone = useCallback(() => {
    setPageState('closed')
  }, [])

  const handleRelease = useCallback(() => {
    setPageState('closing')
  }, [])

  useEffect(() => {
    if (pageState !== 'closing') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (windPageReady && !reducedMotion.matches) return

    const closingTimer = window.setTimeout(() => setPageState('closed'), 720)
    return () => window.clearTimeout(closingTimer)
  }, [pageState, windPageReady])

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

    const settle = () => {
      targetOffset.current = { x: 0, y: 0 }
      requestRender()
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (readingStateOpen || reducedMotion.matches || !finePointer.matches) return

      const bounds = scene.getBoundingClientRect()
      const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5
      const vertical = (event.clientY - bounds.top) / bounds.height - 0.5

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
    reducedMotion.addEventListener('change', settle)
    finePointer.addEventListener('change', settle)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    settle()

    return () => {
      scene.removeEventListener('pointermove', handlePointerMove)
      scene.removeEventListener('pointerleave', settle)
      reducedMotion.removeEventListener('change', settle)
      finePointer.removeEventListener('change', settle)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current)
    }
  }, [])

  return (
    <main className="scene scene--reading-open" ref={sceneRef}>
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
        <img
          className="scene__foreground"
          src={rightForegroundImage}
          width="1672"
          height="941"
          alt=""
          draggable="false"
          decoding="async"
          onLoad={() => setLoadedLayerCount((count) => count + 1)}
        />
      </div>
      <div className="scene__reading-veil" aria-hidden="true" />
      <section className="reading-preview" aria-labelledby="reading-preview-title">
        <h1 className="visually-hidden" id="reading-preview-title">
          Passage from Florentino&apos;s book of verse
        </h1>
        {pageState !== 'closed' ? (
          <>
            <WindPage
              anchorRef={readingLeavesRef}
              passage={activePassage}
              state={pageState}
              onReady={handleWindPageReady}
              onGone={handlePageGone}
            />
            <div
              className={`reading-leaves reading-leaves--${activePassage.treatment} reading-leaves--${pageState}${windPageReady ? ' reading-leaves--mesh-ready' : ''}`}
              ref={readingLeavesRef}
            >
          <article
            className={`reading-sheet reading-sheet--${activePassage.treatment}`}
            aria-live="polite"
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
              <p>{activePassage.text}</p>
            </blockquote>
            <div className="leaf-switcher" aria-label="Preview passage leaf">
              {underTheAlmondTreesPassages.map((passage, index) => (
                <button
                  key={passage.id}
                  className="leaf-switcher__leaf"
                  type="button"
                  aria-label={`Show passage leaf ${passage.folio}`}
                  aria-pressed={activePassageIndex === index}
                  onClick={() => setActivePassageIndex(index)}
                >
                  {passage.folio}
                </button>
              ))}
            </div>
            <button
              className="page-release"
              type="button"
              onClick={handleRelease}
            >
              release
            </button>
          </article>
            </div>
          </>
        ) : (
          <button className="page-replay" type="button" onClick={() => setPageState('open')}>
            restore page
          </button>
        )}
      </section>
    </main>
  )
}

export default App

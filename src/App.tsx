import { useEffect, useRef, useState } from 'react'

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

function App() {
  const sceneRef = useRef<HTMLElement>(null)
  const currentOffset = useRef({ x: 0, y: 0 })
  const targetOffset = useRef({ x: 0, y: 0 })
  const animationFrame = useRef<number | null>(null)
  const [loadedLayerCount, setLoadedLayerCount] = useState(0)

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
      if (reducedMotion.matches || !finePointer.matches) return

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
    <main className="scene" ref={sceneRef}>
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
    </main>
  )
}

export default App

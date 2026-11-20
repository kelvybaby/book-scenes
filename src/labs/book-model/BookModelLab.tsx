import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  loveInTheTimeOfCholeraBookModel,
  type BookModelAsset,
} from '../../content/bookModels'
import {
  createEarlyPageOpenRig,
  type EarlyPageOpenRig,
} from './EarlyPageOpenRig'
import './bookModelLab.css'

// Present the Blender-authored book upright in a conventional Y-up model
// viewer. These camera values are the original inspection views transformed
// through the same fixed quarter-turn as the book.
const STARTING_CAMERA = new THREE.Vector3(0.235, -0.275, 0.225)
const LOOK_TARGET = new THREE.Vector3(0, 0.002, 0.003)
// Same azimuth/elevation as the approved IMG_2862 Blender camera, translated
// so the procedural gutter sits on the closed model's authored spine.
const OPEN_CAMERA = new THREE.Vector3(-0.0307, -0.4255, 0.2338)
const OPEN_LOOK_TARGET = new THREE.Vector3(-0.0635, 0.005, 0.0006)
const KEY_ROTATION = Math.PI / 14
const TURN_RESPONSE = 5.8
const MAX_TURN_ERROR = 0.29
const TURN_SETTLE_EPSILON = 0.00002
const UPRIGHT_CAMERA_DISTANCE_SCALE = 1.30
const ORBIT_POLAR_MARGIN = 0.07
const ORBIT_RADIANS_PER_HEIGHT = Math.PI * 1.5

type LoadState = 'waiting' | 'loading' | 'ready' | 'failed'

type InteractiveBookRig = EarlyPageOpenRig

const disposeMaterial = (material: THREE.Material) => {
  const record = material as THREE.Material & Record<string, unknown>
  for (const value of Object.values(record)) {
    if (value instanceof THREE.Texture) value.dispose()
  }
  material.dispose()
}

const createInteractiveBookRig = (model: THREE.Group, requestedLeafCount: number) => {
  return createEarlyPageOpenRig(model, requestedLeafCount)
}

type BookModelLabProps = {
  asset?: BookModelAsset
}

export function BookModelLab({ asset = loveInTheTimeOfCholeraBookModel }: BookModelLabProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const hasMovedRef = useRef(false)
  const targetTurnStepRef = useRef(0)
  const requestRenderRef = useRef<() => void>(() => undefined)
  const resetViewRef = useRef<() => void>(() => undefined)
  const [loadState, setLoadState] = useState<LoadState>('waiting')
  const [hasMoved, setHasMoved] = useState(false)
  const [shouldMount, setShouldMount] = useState(false)
  const [turnStep, setTurnStep] = useState(0)
  const leafCount = THREE.MathUtils.clamp(Math.round(asset.physicalLeafCount), 1, 10)
  const lastTurnStep = leafCount + 1

  const turnToStep = useCallback(
    (nextStep: number) => {
      const clamped = THREE.MathUtils.clamp(Math.round(nextStep), 0, lastTurnStep)
      if (clamped === targetTurnStepRef.current) return
      targetTurnStepRef.current = clamped
      setTurnStep(clamped)
      if (!hasMovedRef.current) {
        hasMovedRef.current = true
        setHasMoved(true)
      }
      requestRenderRef.current()
    },
    [lastTurnStep],
  )

  const turnBy = useCallback(
    (direction: -1 | 1) => turnToStep(targetTurnStepRef.current + direction),
    [turnToStep],
  )

  useEffect(() => {
    targetTurnStepRef.current = 0
    setTurnStep(0)
  }, [asset])

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    if (!('IntersectionObserver' in window)) {
      setShouldMount(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldMount(true)
          observer.disconnect()
        }
      },
      { rootMargin: '40% 0px' },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!shouldMount) return
    const host = canvasHostRef.current
    const section = sectionRef.current
    if (!host || !section) return

    let disposed = false
    let frame: number | null = null
    let model: THREE.Group | null = null
    let interactiveRig: InteractiveBookRig | null = null
    let visible = true
    let currentTurnStep = targetTurnStepRef.current
    let turnVelocity = 0
    let turnAccumulator = 0
    let openCameraAmount = currentTurnStep > 0 ? 1 : 0
    let lastFrameTime = performance.now()
    let animating = false
    let cameraHasMoved = false
    let dragging = false
    let pointerId: number | null = null
    let previousX = 0
    let previousY = 0
    let dragX = 0
    let dragY = 0
    let dragDistance = 0
    let lastPosedTurnStep = Number.NaN
    let lastCameraAmount = Number.NaN
    let portraitDistance = 1
    let responsiveFov = 29

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050504)

    const camera = new THREE.PerspectiveCamera(29, 1, 0.01, 4)
    camera.position.copy(STARTING_CAMERA)
    camera.lookAt(LOOK_TARGET)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
    } catch (error) {
      console.error('The book model could not create a WebGL renderer.', error)
      setLoadState('failed')
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.92
    renderer.shadowMap.enabled = false
    renderer.domElement.className = 'book-model-lab__canvas'
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.appendChild(renderer.domElement)

    const worldUp = new THREE.Vector3(0, 1, 0)
    const orbitTarget = LOOK_TARGET.clone()
    const orbitOffset = new THREE.Vector3()
    const spherical = new THREE.Spherical()
    const rotateCamera = (horizontalAngle: number, verticalAngle: number) => {
      // One roll-free turntable for every drag direction, position and length.
      // Horizontal movement always orbits the spine; vertical movement changes
      // elevation. Stop just before the poles rather than flipping camera up.
      orbitOffset.copy(camera.position).sub(orbitTarget)
      spherical.setFromVector3(orbitOffset)
      spherical.theta -= horizontalAngle
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi - verticalAngle, ORBIT_POLAR_MARGIN, Math.PI - ORBIT_POLAR_MARGIN,
      )
      orbitOffset.setFromSpherical(spherical)
      camera.position.copy(orbitTarget).add(orbitOffset)
      camera.up.copy(worldUp)
      camera.lookAt(orbitTarget)
      requestRender()
    }

    const bookPivot = new THREE.Group()
    bookPivot.name = 'BookInspectionPivot'
    // The glTF is authored lying on its back. This single fixed transform puts
    // the spine on world Y so OrbitControls can use its standard, stable Y-up
    // orbit while the book itself never changes transform during inspection.
    bookPivot.rotation.x = Math.PI * 0.5
    scene.add(bookPivot)

    scene.add(new THREE.HemisphereLight(0xffe6c6, 0x46392e, 1.65))
    const key = new THREE.DirectionalLight(0xffd5a3, 2.05)
    key.position.set(0.32, 0.42, 0.30)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x9ebce0, 0.72)
    fill.position.set(-0.28, 0.22, -0.24)
    scene.add(fill)
    const edge = new THREE.DirectionalLight(0xffbb74, 0.54)
    edge.position.set(-0.12, 0.30, -0.32)
    scene.add(edge)
    const undersideFill = new THREE.DirectionalLight(0xffd4aa, 1.15)
    undersideFill.position.set(-0.22, -0.34, 0.18)
    scene.add(undersideFill)

    const cameraPosition = new THREE.Vector3()
    const cameraTarget = new THREE.Vector3()
    const cameraOffset = new THREE.Vector3()

    const updateCamera = () => {
      cameraTarget.lerpVectors(LOOK_TARGET, OPEN_LOOK_TARGET, openCameraAmount)
      cameraPosition.lerpVectors(STARTING_CAMERA, OPEN_CAMERA, openCameraAmount)
      const desiredDistance =
        cameraPosition.distanceTo(cameraTarget) * portraitDistance * UPRIGHT_CAMERA_DISTANCE_SCALE

      if (cameraHasMoved) {
        // Preserve the direction chosen by the viewer. Opening/closing and a
        // responsive resize may change framing, but never reset the orbit.
        cameraOffset.copy(camera.position).sub(orbitTarget)
        if (cameraOffset.lengthSq() < 0.000001) {
          cameraOffset.copy(cameraPosition).sub(cameraTarget)
        }
        cameraOffset.setLength(desiredDistance)
        camera.position.copy(cameraTarget).add(cameraOffset)
      } else {
        cameraOffset
          .copy(cameraPosition)
          .sub(cameraTarget)
          .multiplyScalar(portraitDistance * UPRIGHT_CAMERA_DISTANCE_SCALE)
        camera.position.copy(cameraTarget).add(cameraOffset)
      }
      orbitTarget.copy(cameraTarget)
      camera.fov = responsiveFov + openCameraAmount * 1.5
      camera.updateProjectionMatrix()
      camera.up.copy(worldUp)
      camera.lookAt(orbitTarget)
      lastCameraAmount = openCameraAmount
    }

    const resetView = () => {
      if (!model) return
      // Reset to the authored camera for the current reading state without
      // changing the cover/page position itself.
      openCameraAmount = targetTurnStepRef.current > 0 ? 1 : 0
      cameraHasMoved = false
      camera.up.copy(worldUp)
      updateCamera()
      requestRender()
    }

    resetViewRef.current = resetView

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      portraitDistance = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(camera.aspect, 0.42, 0.92, 1.7, 1),
        1,
        1.7,
      )
      responsiveFov = camera.aspect < 0.92 ? 37 : 29
      updateCamera()
      requestRender()
    }

    const render = (timestamp = performance.now()) => {
      frame = null
      if (disposed || !visible || document.visibilityState !== 'visible') return
      // Integrate elapsed time, with bounded catch-up after a long main-thread
      // stall. Visibility resume resets the clock rather than consuming pause.
      const delta = Math.max(0, (timestamp - lastFrameTime) / 1000)
      lastFrameTime = timestamp
      let pageMoving = false
      let cameraMoving = false

      if (model) {
        if (reducedMotion.matches) {
          currentTurnStep = targetTurnStepRef.current
          turnVelocity = 0
          turnAccumulator = 0
        } else {
          // Fixed time quanta make acceleration independent of display rate.
          // Each quantum solves a critically damped spring analytically. Limit
          // its driving error so a queue of rapid clicks does not fling pages;
          // retargeting preserves velocity and gently brakes a reversal.
          turnAccumulator += Math.min(delta, 0.25)
          const quantum = 1 / 120
          while (turnAccumulator >= quantum) {
            const error = THREE.MathUtils.clamp(
              currentTurnStep - targetTurnStepRef.current, -MAX_TURN_ERROR, MAX_TURN_ERROR,
            )
            const goal = currentTurnStep - error
            const decay = Math.exp(-TURN_RESPONSE * quantum)
            const impulse = turnVelocity + TURN_RESPONSE * error
            currentTurnStep = goal + (error + impulse * quantum) * decay
            turnVelocity = (turnVelocity - TURN_RESPONSE * impulse * quantum) * decay
            // The physical stop bounds the cover and final leaf, including a
            // reversal issued within a few pixels of either end of the range.
            const bounded = THREE.MathUtils.clamp(currentTurnStep, 0, lastTurnStep)
            if (bounded !== currentTurnStep) turnVelocity = 0
            currentTurnStep = bounded
            turnAccumulator -= quantum
          }
          pageMoving = Math.abs(targetTurnStepRef.current - currentTurnStep) > TURN_SETTLE_EPSILON ||
            Math.abs(turnVelocity) > TURN_SETTLE_EPSILON
          if (!pageMoving) {
            currentTurnStep = targetTurnStepRef.current
            turnVelocity = 0
            turnAccumulator = 0
          }
        }

        if (
          interactiveRig &&
          (!Number.isFinite(lastPosedTurnStep) ||
            Math.abs(currentTurnStep - lastPosedTurnStep) > 0.000001)
        ) {
          interactiveRig.pose(currentTurnStep)
          lastPosedTurnStep = currentTurnStep
        }

        const targetOpenAmount = THREE.MathUtils.smoothstep(
          THREE.MathUtils.clamp(currentTurnStep, 0, 1),
          0,
          1,
        )
        openCameraAmount = reducedMotion.matches
          ? targetOpenAmount
          : THREE.MathUtils.damp(openCameraAmount, targetOpenAmount, 5.4, delta)
        cameraMoving = Math.abs(targetOpenAmount - openCameraAmount) > 0.0004
        if (
          !Number.isFinite(lastCameraAmount) ||
          Math.abs(openCameraAmount - lastCameraAmount) > 0.000001
        ) {
          updateCamera()
        }
      }

      renderer.domElement.dataset.turnStep = currentTurnStep.toFixed(6)
      renderer.domElement.dataset.turnVelocity = turnVelocity.toFixed(6)
      renderer.domElement.dataset.renderCount = String(renderer.info.render.frame + 1)
      renderer.render(scene, camera)
      animating = !reducedMotion.matches && (pageMoving || cameraMoving)
      if (animating) {
        requestRender()
      }
    }

    function requestRender() {
      if (
        frame === null &&
        visible &&
        document.visibilityState === 'visible' &&
        !disposed
      ) {
        // A fresh input after resting must start with one frame's delta, not
        // treat time spent idle as animation catch-up.
        if (!animating) lastFrameTime = performance.now()
        frame = window.requestAnimationFrame(render)
      }
    }

    requestRenderRef.current = requestRender

    const beginDrag = (event: PointerEvent) => {
      const target = event.target
      if (
        !model ||
        dragging ||
        pointerId !== null ||
        !event.isPrimary ||
        event.button !== 0 ||
        (target instanceof Element &&
          target.closest('.book-model-lab__nav, .book-model-lab__reset-button'))
      ) {
        return
      }
      dragging = true
      pointerId = event.pointerId
      section.setPointerCapture(event.pointerId)
      previousX = event.clientX
      previousY = event.clientY
      dragX = 0
      dragY = 0
      dragDistance = 0
      section.focus({ preventScroll: true })
      section.classList.add('book-model-lab--dragging')
    }

    const moveDrag = (event: PointerEvent) => {
      if (!dragging || pointerId !== event.pointerId) return
      const deltaX = event.clientX - previousX
      const deltaY = event.clientY - previousY
      previousX = event.clientX
      previousY = event.clientY
      dragX += deltaX
      dragY += deltaY
      dragDistance += Math.hypot(deltaX, deltaY)
      if (dragDistance >= 7) {
        // Include initial sub-threshold movement once; then use increments so
        // opening during a grab cannot jump to a stale pointer-down frame.
        const radians = ORBIT_RADIANS_PER_HEIGHT / Math.max(1, host.clientHeight)
        rotateCamera(dragX * radians, dragY * radians)
        dragX = 0
        dragY = 0
        cameraHasMoved = true
      }
      if (!hasMovedRef.current && Math.abs(deltaX) + Math.abs(deltaY) > 2) {
        hasMovedRef.current = true
        setHasMoved(true)
      }
    }

    const finishDrag = (event: PointerEvent, allowPageTurn: boolean) => {
      if (pointerId !== event.pointerId) return
      const wasClick = dragDistance < 7
      if (section.hasPointerCapture(event.pointerId)) section.releasePointerCapture(event.pointerId)
      dragging = false
      pointerId = null
      section.classList.remove('book-model-lab--dragging')

      if (allowPageTurn && wasClick && interactiveRig) {
        const bounds = section.getBoundingClientRect()
        turnBy(event.clientX < bounds.left + bounds.width * 0.5 ? -1 : 1)
      }
    }

    const endDrag = (event: PointerEvent) => finishDrag(event, true)
    const cancelDrag = (event: PointerEvent) => finishDrag(event, false)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!model) return
      let handled = true
      switch (event.key) {
        case 'ArrowLeft':
          if (event.shiftKey) rotateCamera(-KEY_ROTATION, 0)
          else turnBy(-1)
          break
        case 'ArrowRight':
          if (event.shiftKey) rotateCamera(KEY_ROTATION, 0)
          else turnBy(1)
          break
        case 'ArrowUp':
          rotateCamera(0, KEY_ROTATION)
          break
        case 'ArrowDown':
          rotateCamera(0, -KEY_ROTATION)
          break
        case 'Home':
          resetView()
          break
        default:
          handled = false
      }
      if (!handled) return
      event.preventDefault()
      if (event.key !== 'Home') cameraHasMoved = true
      if (!hasMovedRef.current) {
        hasMovedRef.current = true
        setHasMoved(true)
      }
      requestRender()
    }

    const handleMotionPreference = () => {
      requestRender()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastFrameTime = performance.now()
        turnAccumulator = 0
        requestRender()
      }
      else if (frame !== null) {
        window.cancelAnimationFrame(frame)
        frame = null
      }
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting && entry.intersectionRatio > 0)
      if (visible) {
        lastFrameTime = performance.now()
        turnAccumulator = 0
        requestRender()
      }
      else if (frame !== null) {
        window.cancelAnimationFrame(frame)
        frame = null
      }
    }, { threshold: [0, 0.001] })
    visibilityObserver.observe(section)

    section.addEventListener('pointerdown', beginDrag)
    section.addEventListener('pointermove', moveDrag)
    section.addEventListener('pointerup', endDrag)
    section.addEventListener('pointercancel', cancelDrag)
    section.addEventListener('lostpointercapture', cancelDrag)
    section.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibility)
    reducedMotion.addEventListener('change', handleMotionPreference)

    setLoadState('loading')
    resize()
    const loader = new GLTFLoader()
    loader.load(
      asset.modelUrl,
      (gltf) => {
        if (disposed) {
          gltf.scene.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return
            node.geometry.dispose()
            const materials = Array.isArray(node.material) ? node.material : [node.material]
            materials.forEach(disposeMaterial)
          })
          return
        }
        model = gltf.scene
        model.name = asset.objectName
        model.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return
          node.castShadow = false
          node.receiveShadow = false
          const materials = Array.isArray(node.material) ? node.material : [node.material]
          for (const material of materials) {
            const map = (material as THREE.MeshStandardMaterial).map
            if (map) {
              map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
              map.needsUpdate = true
            }
          }
        })
        let rigReady = false
        try {
          interactiveRig = createInteractiveBookRig(model, leafCount)
          rigReady = true
        } catch (error) {
          console.error('The interactive book pages could not be prepared.', error)
        }
        bookPivot.add(model)
        setLoadState(rigReady ? 'ready' : 'failed')
        requestRender()
      },
      undefined,
      (error) => {
        if (disposed) return
        console.error('The book model failed to load.', error)
        setLoadState('failed')
      },
    )

    return () => {
      disposed = true
      if (frame !== null) window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
      section.removeEventListener('pointerdown', beginDrag)
      section.removeEventListener('pointermove', moveDrag)
      section.removeEventListener('pointerup', endDrag)
      section.removeEventListener('pointercancel', cancelDrag)
      section.removeEventListener('lostpointercapture', cancelDrag)
      section.removeEventListener('keydown', handleKeyDown)
      if (pointerId !== null && section.hasPointerCapture(pointerId)) {
        section.releasePointerCapture(pointerId)
      }
      document.removeEventListener('visibilitychange', handleVisibility)
      reducedMotion.removeEventListener('change', handleMotionPreference)
      requestRenderRef.current = () => undefined
      resetViewRef.current = () => undefined
      if (interactiveRig) {
        interactiveRig.dispose()
        interactiveRig = null
      }
      model?.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return
        node.geometry.dispose()
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.forEach(disposeMaterial)
      })
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      section.classList.remove('book-model-lab--dragging')
    }
  }, [asset, leafCount, lastTurnStep, shouldMount, turnBy])

  const instructionsId = `${asset.id}-model-instructions`

  return (
    <section
      id="book-model-lab"
      ref={sectionRef}
      className={`book-model-lab book-model-lab--${loadState}${hasMoved ? ' book-model-lab--moved' : ''}${turnStep > 0 ? ' book-model-lab--open' : ''}`}
      aria-label={asset.ariaLabel}
      aria-describedby={instructionsId}
      tabIndex={0}
    >
      <img
        className="book-model-lab__fallback"
        src={asset.fallbackUrl}
        alt={asset.fallbackAlt}
        loading="lazy"
        draggable={false}
      />
      <div ref={canvasHostRef} className="book-model-lab__canvas-host" aria-hidden="true" />
      <p id={instructionsId} className="book-model-lab__instructions">
        Click either side or use ← / → to turn a leaf. Drag to orbit the view; Shift + ← / →
        or ↑ / ↓ orbits with the keyboard.
      </p>
      <nav
        className="book-model-lab__nav"
        aria-label="Book pages"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="book-model-lab__page-button"
          aria-label="Previous page"
          disabled={loadState !== 'ready' || turnStep === 0}
          onClick={() => turnBy(-1)}
        >
          <span aria-hidden="true">&#8592;</span>
        </button>
        <output className="book-model-lab__page-number" aria-live="polite">
          {turnStep === 0
            ? 'Cover'
            : turnStep === lastTurnStep
              ? 'End'
              : `${turnStep} / ${leafCount}`}
        </output>
        <button
          type="button"
          className="book-model-lab__page-button"
          aria-label="Next page"
          disabled={loadState !== 'ready' || turnStep === lastTurnStep}
          onClick={() => turnBy(1)}
        >
          <span aria-hidden="true">&#8594;</span>
        </button>
      </nav>
      <button
        type="button"
        className="book-model-lab__reset-button"
        disabled={loadState !== 'ready'}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => resetViewRef.current()}
      >
        Reset view
      </button>
      <p className="book-model-lab__status visually-hidden" aria-live="polite">
        {loadState === 'ready'
          ? 'Interactive book model ready.'
          : loadState === 'failed'
            ? 'The static book view is available.'
            : 'Preparing the interactive book model.'}
      </p>
    </section>
  )
}

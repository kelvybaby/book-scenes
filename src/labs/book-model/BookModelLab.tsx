import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  loveInTheTimeOfCholeraBookModel,
  type BookModelAsset,
} from '../../content/bookModels'
import {
  createBookPageRig,
  disposeBookPageRig,
  poseBookPage,
  type BookPageRig,
} from './BookPageRig'
import './bookModelLab.css'

// Blender's Z-up coordinates are exported to glTF's Y-up coordinates.
const STARTING_CAMERA = new THREE.Vector3(0.235, 0.225, 0.275)
const LOOK_TARGET = new THREE.Vector3(0, 0.003, -0.002)
const OPEN_CAMERA = new THREE.Vector3(0.254, 0.306, 0.372)
const OPEN_LOOK_TARGET = new THREE.Vector3(-0.0635, 0.006, -0.002)
const ROTATION_PER_PIXEL = 0.008
const KEY_ROTATION = Math.PI / 14
const COVER_TURN_SECONDS = 1.35
const PAGE_TURN_SECONDS = 1.55
const PAGE_STACK_SPACING = 0.0002
const FRONT_COVER_NAME = 'FrontCover_AnimationReady'
const PAGE_TEMPLATE_NAME = 'FrontLoosePage_01_AnimationReady'
const PAGE_BLOCK_NAME = 'PageBlock_ClosedShell'
const ORIGINAL_FRONT_LEAVES = [
  'FrontLoosePage_01_AnimationReady',
  'FrontLoosePage_02_AnimationReady',
  'FrontLoosePage_03_AnimationReady',
  'HeroPage_Title_AnimationReady',
] as const

type LoadState = 'waiting' | 'loading' | 'ready' | 'failed'

type InteractiveBookRig = {
  pageBlock: BookPageRig
  cover: BookPageRig
  leaves: BookPageRig[]
}

const createSoftShadow = () => {
  const surface = document.createElement('canvas')
  surface.width = 256
  surface.height = 256
  const context = surface.getContext('2d')
  if (!context) return null

  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 122)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.58)')
  gradient.addColorStop(0.46, 'rgba(0, 0, 0, 0.32)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)

  const texture = new THREE.CanvasTexture(surface)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    toneMapped: false,
  })
  const geometry = new THREE.PlaneGeometry(0.31, 0.38)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI * 0.5
  mesh.position.set(0.012, -0.015, -0.006)
  mesh.renderOrder = -1
  return { mesh, geometry, material, texture }
}

const disposeMaterial = (material: THREE.Material) => {
  const record = material as THREE.Material & Record<string, unknown>
  for (const value of Object.values(record)) {
    if (value instanceof THREE.Texture) value.dispose()
  }
  material.dispose()
}

const createInteractiveBookRig = (model: THREE.Group, requestedLeafCount: number) => {
  const coverTemplate = model.getObjectByName(FRONT_COVER_NAME)
  const pageTemplate = model.getObjectByName(PAGE_TEMPLATE_NAME)
  const pageBlockTemplate = model.getObjectByName(PAGE_BLOCK_NAME)
  if (!coverTemplate || !pageTemplate || !pageBlockTemplate) {
    throw new Error('The book model is missing its animation-ready cover, page, or page block.')
  }

  const leafCount = THREE.MathUtils.clamp(Math.round(requestedLeafCount), 1, 10)
  let pageBlock: BookPageRig | null = null
  let cover: BookPageRig | null = null
  const leaves: BookPageRig[] = []

  try {
    pageBlock = createBookPageRig(pageBlockTemplate, {
      name: 'InteractivePageBlock',
      segments: 36,
      leftHingeY: 0,
      turnAngle: 0,
      restingBend: 0.064,
      turningBend: 0,
      settledBend: 0,
      cornerFold: 0,
    })
    cover = createBookPageRig(coverTemplate, {
      name: 'InteractiveFrontCover',
      segments: 32,
      turnAngle: Math.PI - 0.12,
      restingBend: 0,
      turningBend: 0.13,
      settledBend: 0.015,
      cornerFold: 0.035,
    })

    for (let index = 0; index < leafCount; index += 1) {
      const unevenness = ((index * 5) % 7 - 3) * 0.00115
      leaves.push(
        createBookPageRig(pageTemplate, {
          name: `InteractiveLeaf_${String(index + 1).padStart(2, '0')}`,
          segments: 30,
          rightStackOffset: (leafCount - 1 - index) * PAGE_STACK_SPACING,
          leftStackOffset: index * PAGE_STACK_SPACING,
          turnAngle: Math.PI - (0.108 + index * 0.0018),
          restingBend: 0.068 + unevenness,
          turningBend: 0.22,
          settledBend: 0.074 + unevenness,
          cornerFold: 0.052,
        }),
      )
    }
  } catch (error) {
    if (pageBlock) disposeBookPageRig(pageBlock)
    if (cover) disposeBookPageRig(cover)
    leaves.forEach(disposeBookPageRig)
    throw error
  }

  pageBlockTemplate.visible = false
  coverTemplate.visible = false
  for (const name of ORIGINAL_FRONT_LEAVES) {
    const leaf = model.getObjectByName(name)
    if (leaf) leaf.visible = false
  }

  const parent = coverTemplate.parent ?? model
  parent.add(pageBlock.mesh)
  parent.add(cover.mesh)
  poseBookPage(pageBlock, 0, 0)
  leaves.forEach((rig) => {
    parent.add(rig.mesh)
    poseBookPage(rig, 0, 0)
  })

  poseBookPage(cover, 0)
  return { pageBlock, cover, leaves } satisfies InteractiveBookRig
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
    let openCameraAmount = currentTurnStep > 0 ? 1 : 0
    let lastFrameTime = performance.now()
    let currentPitch = 0
    let currentYaw = 0
    let targetPitch = 0
    let targetYaw = 0
    let dragging = false
    let pointerId: number | null = null
    let previousX = 0
    let previousY = 0
    let dragDistance = 0

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

    const bookPivot = new THREE.Group()
    bookPivot.name = 'BookInspectionPivot'
    scene.add(bookPivot)

    const shadow = createSoftShadow()
    if (shadow) scene.add(shadow.mesh)

    scene.add(new THREE.HemisphereLight(0xffe6c6, 0x151714, 1.65))
    const key = new THREE.DirectionalLight(0xffd5a3, 2.05)
    key.position.set(0.32, 0.42, 0.30)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x9ebce0, 0.72)
    fill.position.set(-0.28, 0.22, -0.24)
    scene.add(fill)
    const edge = new THREE.DirectionalLight(0xffbb74, 0.54)
    edge.position.set(-0.12, 0.30, -0.32)
    scene.add(edge)

    const cameraPosition = new THREE.Vector3()
    const cameraTarget = new THREE.Vector3()

    const updateCamera = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      const aspect = width / height
      const portraitDistance = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(aspect, 0.42, 0.92, 2.0, 1),
        1,
        2.0,
      )
      cameraTarget.lerpVectors(LOOK_TARGET, OPEN_LOOK_TARGET, openCameraAmount)
      cameraPosition.lerpVectors(STARTING_CAMERA, OPEN_CAMERA, openCameraAmount)
      camera.position
        .copy(cameraPosition)
        .sub(cameraTarget)
        .multiplyScalar(portraitDistance)
        .add(cameraTarget)
      camera.fov = (aspect < 0.92 ? 37 : 29) + openCameraAmount * 1.5
      camera.lookAt(cameraTarget)
      camera.updateProjectionMatrix()
    }

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      updateCamera()
      requestRender()
    }

    const render = (timestamp = performance.now()) => {
      frame = null
      if (disposed || !visible || document.visibilityState !== 'visible') return
      const delta = Math.min(Math.max((timestamp - lastFrameTime) / 1000, 1 / 240), 1 / 20)
      lastFrameTime = timestamp
      let pageMoving = false

      if (model) {
        if (reducedMotion.matches) {
          currentPitch = targetPitch
          currentYaw = targetYaw
          currentTurnStep = targetTurnStepRef.current
        } else {
          currentPitch = THREE.MathUtils.damp(currentPitch, targetPitch, 11, delta)
          currentYaw = THREE.MathUtils.damp(currentYaw, targetYaw, 11, delta)
          const remainingTurn = targetTurnStepRef.current - currentTurnStep
          if (Math.abs(remainingTurn) < 0.000001) {
            currentTurnStep = targetTurnStepRef.current
          } else {
            pageMoving = true
            const turnDuration = currentTurnStep < 1 ? COVER_TURN_SECONDS : PAGE_TURN_SECONDS
            const travel = Math.min(Math.abs(remainingTurn), delta / turnDuration)
            currentTurnStep += Math.sign(remainingTurn) * travel
          }
        }

        if (interactiveRig) {
          const coverProgress = THREE.MathUtils.clamp(currentTurnStep, 0, 1)
          const pageOpenness = THREE.MathUtils.smoothstep(coverProgress, 0, 1)
          poseBookPage(interactiveRig.pageBlock, 0, pageOpenness)
          poseBookPage(interactiveRig.cover, coverProgress)
          interactiveRig.leaves.forEach((leaf, index) => {
            poseBookPage(
              leaf,
              THREE.MathUtils.clamp(currentTurnStep - index - 1, 0, 1),
              pageOpenness,
            )
          })
        }

        const targetOpenAmount = THREE.MathUtils.smoothstep(
          THREE.MathUtils.clamp(currentTurnStep, 0, 1),
          0,
          1,
        )
        openCameraAmount = reducedMotion.matches
          ? targetOpenAmount
          : THREE.MathUtils.damp(openCameraAmount, targetOpenAmount, 5.4, delta)
        updateCamera()
        bookPivot.rotation.set(currentPitch, currentYaw, 0, 'XYZ')
        if (shadow) {
          const faceToViewer = Math.abs(Math.cos(currentPitch))
          shadow.material.opacity = 0.13 + faceToViewer * 0.21
          const baseScale = 0.92 + (1 - faceToViewer) * 0.16
          shadow.mesh.scale.set(baseScale * (1 + openCameraAmount * 0.38), baseScale, baseScale)
          shadow.mesh.position.x = THREE.MathUtils.lerp(0.012, -0.0635, openCameraAmount)
        }
      }

      renderer.render(scene, camera)
      if (
        !reducedMotion.matches &&
        (pageMoving ||
          Math.abs(targetPitch - currentPitch) > 0.0004 ||
          Math.abs(targetYaw - currentYaw) > 0.0004)
      ) {
        frame = window.requestAnimationFrame(render)
      }
    }

    function requestRender() {
      if (
        frame === null &&
        visible &&
        document.visibilityState === 'visible' &&
        !disposed
      ) {
        frame = window.requestAnimationFrame(render)
      }
    }

    requestRenderRef.current = requestRender

    const beginDrag = (event: PointerEvent) => {
      const target = event.target
      if (
        !model ||
        event.button !== 0 ||
        (target instanceof Element && target.closest('.book-model-lab__nav'))
      ) {
        return
      }
      dragging = true
      pointerId = event.pointerId
      previousX = event.clientX
      previousY = event.clientY
      dragDistance = 0
      section.focus({ preventScroll: true })
      section.setPointerCapture(event.pointerId)
      section.classList.add('book-model-lab--dragging')
    }

    const moveDrag = (event: PointerEvent) => {
      if (!dragging || pointerId !== event.pointerId) return
      const deltaX = event.clientX - previousX
      const deltaY = event.clientY - previousY
      previousX = event.clientX
      previousY = event.clientY
      dragDistance += Math.hypot(deltaX, deltaY)
      targetYaw += deltaX * ROTATION_PER_PIXEL
      targetPitch += deltaY * ROTATION_PER_PIXEL
      if (!hasMovedRef.current && Math.abs(deltaX) + Math.abs(deltaY) > 2) {
        hasMovedRef.current = true
        setHasMoved(true)
      }
      requestRender()
    }

    const finishDrag = (event: PointerEvent, allowPageTurn: boolean) => {
      if (pointerId !== event.pointerId) return
      const wasClick = dragDistance < 7
      dragging = false
      pointerId = null
      section.classList.remove('book-model-lab--dragging')
      if (section.hasPointerCapture(event.pointerId)) section.releasePointerCapture(event.pointerId)

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
          if (event.shiftKey) targetYaw -= KEY_ROTATION
          else turnBy(-1)
          break
        case 'ArrowRight':
          if (event.shiftKey) targetYaw += KEY_ROTATION
          else turnBy(1)
          break
        case 'ArrowUp':
          targetPitch -= KEY_ROTATION
          break
        case 'ArrowDown':
          targetPitch += KEY_ROTATION
          break
        case 'Home':
          targetPitch = 0
          targetYaw = 0
          break
        default:
          handled = false
      }
      if (!handled) return
      event.preventDefault()
      if (!hasMovedRef.current) {
        hasMovedRef.current = true
        setHasMoved(true)
      }
      requestRender()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestRender()
      else if (frame !== null) {
        window.cancelAnimationFrame(frame)
        frame = null
      }
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting)
      if (visible) requestRender()
      else if (frame !== null) {
        window.cancelAnimationFrame(frame)
        frame = null
      }
    })
    visibilityObserver.observe(section)

    section.addEventListener('pointerdown', beginDrag)
    section.addEventListener('pointermove', moveDrag)
    section.addEventListener('pointerup', endDrag)
    section.addEventListener('pointercancel', cancelDrag)
    section.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibility)
    reducedMotion.addEventListener('change', requestRender)

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
          for (const name of [PAGE_BLOCK_NAME, FRONT_COVER_NAME, ...ORIGINAL_FRONT_LEAVES]) {
            const original = model.getObjectByName(name)
            if (original) original.visible = true
          }
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
      section.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibility)
      reducedMotion.removeEventListener('change', requestRender)
      requestRenderRef.current = () => undefined
      if (interactiveRig) {
        interactiveRig.pageBlock.mesh.removeFromParent()
        disposeBookPageRig(interactiveRig.pageBlock)
        interactiveRig.cover.mesh.removeFromParent()
        disposeBookPageRig(interactiveRig.cover)
        interactiveRig.leaves.forEach((leaf) => {
          leaf.mesh.removeFromParent()
          disposeBookPageRig(leaf)
        })
        interactiveRig = null
      }
      model?.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return
        node.geometry.dispose()
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        materials.forEach(disposeMaterial)
      })
      if (shadow) {
        shadow.geometry.dispose()
        shadow.material.dispose()
        shadow.texture.dispose()
      }
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [asset, leafCount, shouldMount, turnBy])

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
        Click either side or use ← / → to turn a leaf. Drag to inspect; Shift + ← / →
        or ↑ / ↓ rotates.
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

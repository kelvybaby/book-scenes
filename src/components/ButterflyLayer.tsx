import { useEffect, useRef, type CSSProperties } from 'react'
import * as THREE from 'three'
import { ButterflyFlock, type ButterflyAgent } from '../motion/ButterflyFlock'
import type { AmbientWindField } from '../motion/AmbientWindField'
import {
  DEFAULT_BUTTERFLY_SETTINGS,
  type ButterflySettings,
} from './butterflySettings'
import {
  createButterflyGeometrySet,
  createButterflyModelView,
  type ButterflyGeometrySet,
} from './butterflyModel'

type ButterflyLayerProps = {
  readingActive: boolean
  wind: AmbientWindField
  settings?: ButterflySettings
}

type ButterflyView = {
  root: THREE.Group
  leftWing: THREE.Group
  rightWing: THREE.Group
  heading: number
  bank: number
  pitchBias: number
  yawBias: number
}

type DebugLayer = {
  group: THREE.Group
  pathGeometry: THREE.BufferGeometry | null
  materials: THREE.Material[]
  geometries: THREE.BufferGeometry[]
}

const TAU = Math.PI * 2
const SIMULATION_STEP = 1 / 60
const MOVING_FLOWER_OCCLUDER_DEPTH = 0.46
const MOVING_FLOWER_OCCLUDER_UPDATE_INTERVAL = 1 / 20

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const mix = (minimum: number, maximum: number, amount: number) =>
  minimum + (maximum - minimum) * amount

// Use the equivalent body axis whose head remains screen-up, while retaining
// the prior protection against 180° travel reversals.
const shortestAxisAngle = (angle: number) =>
  ((angle + Math.PI * 0.5) % Math.PI + Math.PI) % Math.PI - Math.PI * 0.5

const upperFacingAngle = (angle: number) => {
  const axisAngle = shortestAxisAngle(angle)
  return axisAngle > 0 ? axisAngle - Math.PI : axisAngle
}

const shortestAngle = (angle: number) =>
  ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI

function numericQuery(name: string) {
  const raw = new URLSearchParams(window.location.search).get(name)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function debugMode() {
  return new URLSearchParams(window.location.search).get('butterflyDebug')
}

function isReducedMotionForced() {
  return new URLSearchParams(window.location.search).get('butterflyMotion') === 'reduce'
}

function ellipseGeometry(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  depth: number,
) {
  const positions = new Float32Array(65 * 3)
  for (let index = 0; index <= 64; index += 1) {
    const angle = (index / 64) * TAU
    const offset = index * 3
    positions[offset] = centerX + Math.cos(angle) * radiusX
    positions[offset + 1] = centerY + Math.sin(angle) * radiusY
    positions[offset + 2] = depth
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geometry
}

function createDebugLayer(
  settings: ButterflySettings,
  mode: string | null,
  count: number,
): DebugLayer | null {
  if (mode !== 'regions' && mode !== 'paths' && mode !== 'all') return null

  const group = new THREE.Group()
  group.renderOrder = 200
  const materials: THREE.Material[] = []
  const geometries: THREE.BufferGeometry[] = []
  const regionMaterial = new THREE.LineBasicMaterial({
    color: 0xf1cb55,
    transparent: true,
    opacity: 0.88,
    depthTest: false,
  })
  materials.push(regionMaterial)
  const regionGeometry = ellipseGeometry(
    settings.activity.x,
    settings.activity.y,
    settings.activity.radiusX,
    settings.activity.radiusY,
    2.2,
  )
  geometries.push(regionGeometry)
  group.add(new THREE.Line(regionGeometry, regionMaterial))

  const avoidanceMaterial = new THREE.LineBasicMaterial({
    color: 0xe16c66,
    transparent: true,
    opacity: 0.74,
    depthTest: false,
  })
  materials.push(avoidanceMaterial)
  for (const avoidance of settings.avoidance) {
    const geometry = ellipseGeometry(
      avoidance.x,
      avoidance.y,
      avoidance.radiusX,
      avoidance.radiusY,
      2.2,
    )
    geometries.push(geometry)
    group.add(new THREE.Line(geometry, avoidanceMaterial))
  }

  const anchorPositions = new Float32Array(settings.leafAnchors.length * 3)
  settings.leafAnchors.forEach((anchor, index) => {
    const offset = index * 3
    anchorPositions[offset] = anchor.x
    anchorPositions[offset + 1] = anchor.y
    anchorPositions[offset + 2] = 2.25
  })
  const anchorGeometry = new THREE.BufferGeometry()
  anchorGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(anchorPositions, 3),
  )
  geometries.push(anchorGeometry)
  const anchorMaterial = new THREE.PointsMaterial({
    color: 0x77d5c4,
    size: 7,
    sizeAttenuation: false,
    depthTest: false,
  })
  materials.push(anchorMaterial)
  group.add(new THREE.Points(anchorGeometry, anchorMaterial))

  let pathGeometry: THREE.BufferGeometry | null = null
  if (mode === 'paths' || mode === 'all') {
    pathGeometry = new THREE.BufferGeometry()
    pathGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3),
    )
    geometries.push(pathGeometry)
    const pathMaterial = new THREE.LineBasicMaterial({
      color: 0x8fc4ff,
      transparent: true,
      opacity: 0.68,
      depthTest: false,
    })
    materials.push(pathMaterial)
    group.add(new THREE.LineSegments(pathGeometry, pathMaterial))
  }

  return { group, pathGeometry, materials, geometries }
}

function updateDebugPaths(debug: DebugLayer | null, agents: readonly ButterflyAgent[]) {
  if (!debug?.pathGeometry) return
  const position = debug.pathGeometry.getAttribute('position') as THREE.BufferAttribute
  const positions = position.array as Float32Array
  for (let index = 0; index < agents.length; index += 1) {
    const agent = agents[index]
    const offset = index * 6
    positions[offset] = agent.position.x
    positions[offset + 1] = agent.position.y
    positions[offset + 2] = 2.3
    positions[offset + 3] = agent.target.x
    positions[offset + 4] = agent.target.y
    positions[offset + 5] = 2.3
  }
  position.needsUpdate = true
}

export function ButterflyLayer({
  readingActive,
  wind,
  settings = DEFAULT_BUTTERFLY_SETTINGS,
}: ButterflyLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readingActiveRef = useRef(readingActive)

  useEffect(() => {
    readingActiveRef.current = readingActive
  }, [readingActive])

  useEffect(() => {
    const currentCanvas = canvasRef.current
    if (!currentCanvas) return
    const canvasElement: HTMLCanvasElement = currentCanvas

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mobileViewport = window.matchMedia(
      `(max-width: ${settings.mobileBreakpoint}px)`,
    )
    const forcedReducedMotion = isReducedMotionForced()
    const debug = debugMode()
    const querySeed = numericQuery('butterflySeed')
    const seed = querySeed === null ? settings.seed : querySeed >>> 0
    const queryCount = numericQuery('butterflyCount')
    let disposed = false
    let visible = true
    let initialising = false
    let frame: number | null = null
    let lastTime = performance.now()
    let accumulatedTime = 0
    let readingBlend = readingActiveRef.current ? 1 : 0
    let renderer: THREE.WebGLRenderer | null = null
    let scene: THREE.Scene | null = null
    let camera: THREE.OrthographicCamera | null = null
    let flock: ButterflyFlock | null = null
    let butterflyGeometry: ButterflyGeometrySet | null = null
    let views: ButterflyView[] = []
    let debugLayer: DebugLayer | null = null
    let occluderGeometry: THREE.PlaneGeometry | null = null
    let movingFlowerOccluder: THREE.CanvasTexture | null = null
    let movingFlowerOccluderElapsed = 0
    const occluderMaterials: THREE.MeshBasicMaterial[] = []
    const occluderTextures: THREE.Texture[] = []
    const sharedGeometries: THREE.BufferGeometry[] = []
    const sharedMaterials: THREE.Material[] = []

    const countForViewport = () =>
      queryCount === null
        ? mobileViewport.matches
          ? settings.mobileCount
          : settings.desktopCount
        : clamp(Math.round(queryCount), 1, 24)

    const sizeRendererForViewport = () => {
      if (!renderer) return
      const renderScale = mobileViewport.matches
        ? settings.mobileRenderScale
        : settings.renderScale
      renderer.setSize(
        Math.round(settings.sourceWidth * renderScale),
        Math.round(settings.sourceHeight * renderScale),
        false,
      )
      canvasElement.dataset.renderScale = String(renderScale)
    }

    const stop = () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = null
      canvasElement.dataset.paused = 'true'
    }

    const canAnimate = () =>
      !disposed &&
      visible &&
      renderer !== null &&
      !forcedReducedMotion &&
      !reducedMotion.matches &&
      document.visibilityState === 'visible'

    const requestFrame = () => {
      if (frame !== null || !canAnimate()) return
      lastTime = performance.now()
      frame = window.requestAnimationFrame(render)
    }

    const disposeDebugLayer = () => {
      if (!debugLayer) return
      debugLayer.group.removeFromParent()
      for (const geometry of debugLayer.geometries) geometry.dispose()
      for (const material of debugLayer.materials) material.dispose()
      debugLayer = null
    }

    const rebuildPopulation = () => {
      if (!scene || !butterflyGeometry || sharedMaterials.length < 7) return
      for (const view of views) view.root.removeFromParent()
      views = []
      disposeDebugLayer()

      const count = countForViewport()
      flock = new ButterflyFlock(settings, wind, count, seed)
      const bodyMaterial = sharedMaterials[0]

      for (const agent of flock.agents) {
        const materialOffset = 1 + agent.depthBand * 2
        const model = createButterflyModelView(butterflyGeometry, {
          body: bodyMaterial,
          forewing: sharedMaterials[materialOffset],
          hindwing: sharedMaterials[materialOffset + 1],
        })
        model.root.scale.setScalar(agent.scale)
        scene.add(model.root)
        views.push({
          ...model,
          heading: upperFacingAngle(agent.travelHeading),
          bank: 0,
          pitchBias: Math.sin(agent.id * 2.17 + agent.bobPhase) * 0.28,
          yawBias: Math.cos(agent.id * 1.63 + agent.flapPhase) * 0.22,
        })
      }

      debugLayer = createDebugLayer(settings, debug, count)
      if (debugLayer) scene.add(debugLayer.group)
      canvasElement.dataset.count = String(count)
      canvasElement.dataset.viewportMode = mobileViewport.matches ? 'mobile' : 'desktop'
    }

    function render(time: number) {
      frame = null
      if (!canAnimate() || !renderer || !scene || !camera || !flock) {
        stop()
        return
      }

      const elapsed = Math.min((time - lastTime) / 1000, 0.08)
      lastTime = time
      accumulatedTime = Math.min(accumulatedTime + elapsed, 0.12)
      const readingTarget = readingActiveRef.current ? 1 : 0
      readingBlend +=
        (readingTarget - readingBlend) * (1 - Math.exp(-1.25 * elapsed))

      while (accumulatedTime >= SIMULATION_STEP) {
        flock.update(SIMULATION_STEP, time / 1000, readingBlend)
        accumulatedTime -= SIMULATION_STEP
      }

      if (movingFlowerOccluder) {
        movingFlowerOccluderElapsed += elapsed
        if (
          movingFlowerOccluderElapsed >=
          MOVING_FLOWER_OCCLUDER_UPDATE_INTERVAL
        ) {
          movingFlowerOccluder.needsUpdate = true
          movingFlowerOccluderElapsed = 0
        }
      }

      let totalSpeed = 0
      const behaviorCounts: Record<ButterflyAgent['behavior'], number> = {
        hover: 0,
        flutter: 0,
        dart: 0,
        inspect: 0,
        wander: 0,
      }
      for (let index = 0; index < flock.agents.length; index += 1) {
        const agent = flock.agents[index]
        const view = views[index]
        behaviorCounts[agent.behavior] += 1
        const speed = Math.hypot(agent.velocity.x, agent.velocity.y)
        totalSpeed += speed
        const headingDelta = shortestAngle(
          upperFacingAngle(agent.travelHeading) - view.heading,
        )
        const headingStep = clamp(
          headingDelta *
            (1 - Math.exp(-settings.presentationTurnResponse * elapsed)),
          -settings.maximumPresentationTurnRate * elapsed,
          settings.maximumPresentationTurnRate * elapsed,
        )
        view.heading += headingStep
        const bankTarget = clamp(
          (agent.turnRate / settings.turnRate[1]) * settings.maximumBank,
          -settings.maximumBank,
          settings.maximumBank,
        )
        view.bank += (bankTarget - view.bank) * (1 - Math.exp(-4.2 * elapsed))

        const flapWave = 0.5 + Math.sin(agent.flapPhase) * 0.5
        const flapTravel =
          agent.flapAmplitude *
          mix(settings.pauseFlapScale, 1, clamp(agent.flapEnergy, 0, 1))
        const flapAmount =
          settings.flapOpenAngle +
          Math.pow(flapWave, 0.72) * flapTravel
        const bodyFlutter = Math.sin(agent.flapPhase) * agent.flapEnergy
        view.root.position.set(
          agent.position.x,
          agent.position.y,
          agent.position.z,
        )
        view.root.rotation.x =
          view.pitchBias +
          clamp(
            agent.flutterVelocity.y / settings.flutterSpeed[1],
            -1,
            1,
          ) * 0.045 +
          bodyFlutter * 0.075
        view.root.rotation.z = view.heading
        view.root.rotation.y =
          view.bank +
          view.yawBias +
          Math.cos(agent.flapPhase + 0.4) * agent.flapEnergy * 0.055
        view.leftWing.rotation.x = flapAmount
        view.rightWing.rotation.x = -flapAmount
      }

      updateDebugPaths(debugLayer, flock.agents)
      canvasElement.dataset.readingBlend = readingBlend.toFixed(3)
      canvasElement.dataset.frameTime = time.toFixed(1)
      canvasElement.dataset.averageSpeed = (
        totalSpeed / Math.max(flock.agents.length, 1)
      ).toFixed(2)
      canvasElement.dataset.positions = flock.agents
        .map(
          (agent) =>
            `${agent.id}:${agent.position.x.toFixed(1)},${agent.position.y.toFixed(1)},${agent.position.z.toFixed(2)},${agent.behavior}`,
        )
        .join('|')
      canvasElement.dataset.behaviors = Object.entries(behaviorCounts)
        .map(([behavior, count]) => `${behavior}:${count}`)
        .join('|')
      canvasElement.dataset.flight = flock.agents
        .map(
          (agent) =>
            `${agent.id}:${agent.speed.toFixed(1)},${agent.turnRate.toFixed(2)},${agent.travelHeading.toFixed(2)}`,
        )
        .join('|')
      canvasElement.dataset.presentation = views
        .map(
          (view, index) =>
            `${index}:${view.heading.toFixed(2)},${view.bank.toFixed(3)}`,
        )
        .join('|')
      canvasElement.dataset.paused = 'false'
      renderer.render(scene, camera)
      frame = window.requestAnimationFrame(render)
    }

    const initialise = async () => {
      if (initialising || renderer || disposed) return
      initialising = true
      try {
        scene = new THREE.Scene()
        camera = new THREE.OrthographicCamera(
          0,
          settings.sourceWidth,
          0,
          settings.sourceHeight,
          0.1,
          30,
        )
        camera.position.z = 10

        butterflyGeometry = createButterflyGeometrySet(settings)
        sharedGeometries.push(...butterflyGeometry.all)

        const bodyMaterial = new THREE.MeshBasicMaterial({
          color: settings.bodyColor,
        })
        sharedMaterials.push(bodyMaterial)
        for (const color of settings.wingColors) {
          const hindwingColor = new THREE.Color(color).offsetHSL(0, -0.025, 0.075)
          sharedMaterials.push(
            new THREE.MeshBasicMaterial({
              color,
              side: THREE.DoubleSide,
            }),
            new THREE.MeshBasicMaterial({
              color: hindwingColor,
              side: THREE.DoubleSide,
            }),
          )
        }

        occluderGeometry = new THREE.PlaneGeometry(
          settings.sourceWidth,
          settings.sourceHeight,
        )
        const depthGeometry = occluderGeometry
        const loader = new THREE.TextureLoader()
        const textures = await Promise.all(
          settings.occluders.map((occluder) => loader.loadAsync(occluder.source)),
        )
        if (disposed || !scene) {
          for (const texture of textures) texture.dispose()
          return
        }

        settings.occluders.forEach((occluder, index) => {
          const texture = textures[index]
          texture.flipY = false
          texture.generateMipmaps = false
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          occluderTextures.push(texture)
          const showMask = debug === 'occlusion' || debug === 'all'
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            color: showMask ? occluder.debugColor : 0xffffff,
            alphaTest: occluder.alphaTest,
            transparent: showMask,
            opacity: showMask ? 0.42 : 1,
            colorWrite: showMask,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide,
          })
          occluderMaterials.push(material)
          const mesh = new THREE.Mesh(depthGeometry, material)
          mesh.position.set(
            settings.sourceWidth * 0.5,
            settings.sourceHeight * 0.5,
            occluder.depth,
          )
          mesh.frustumCulled = false
          scene?.add(mesh)
        })

        const movingFlowerCanvas = document.querySelector<HTMLCanvasElement>(
          '.scene__foreground-leaves',
        )
        if (movingFlowerCanvas) {
          movingFlowerOccluder = new THREE.CanvasTexture(movingFlowerCanvas)
          movingFlowerOccluder.flipY = false
          movingFlowerOccluder.generateMipmaps = false
          movingFlowerOccluder.minFilter = THREE.LinearFilter
          movingFlowerOccluder.magFilter = THREE.LinearFilter
          occluderTextures.push(movingFlowerOccluder)
          const showMask = debug === 'occlusion' || debug === 'all'
          const material = new THREE.MeshBasicMaterial({
            map: movingFlowerOccluder,
            color: showMask ? 0xb678dc : 0xffffff,
            alphaTest: 0.01,
            transparent: showMask,
            opacity: showMask ? 0.42 : 1,
            colorWrite: showMask,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide,
          })
          occluderMaterials.push(material)
          const mesh = new THREE.Mesh(depthGeometry, material)
          mesh.position.set(
            settings.sourceWidth * 0.5,
            settings.sourceHeight * 0.5,
            MOVING_FLOWER_OCCLUDER_DEPTH,
          )
          mesh.frustumCulled = false
          scene.add(mesh)
          canvasElement.dataset.movingFlowerOccluder = 'active'
        }

        renderer = new THREE.WebGLRenderer({
          canvas: canvasElement,
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
        })
        renderer.setPixelRatio(1)
        sizeRendererForViewport()
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.setClearColor(0x000000, 0)
        rebuildPopulation()
        renderer.render(scene, camera)
        canvasElement.dataset.seed = String(seed)
        canvasElement.dataset.debug = debug ?? 'off'
        canvasElement.dataset.motion = 'live'
        requestFrame()
      } catch (error) {
        console.error(
          'Butterfly renderer unavailable; the scene remains complete without it.',
          error,
        )
        canvasElement.dataset.motion = 'fallback'
      } finally {
        initialising = false
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stop()
      else requestFrame()
    }

    const handleMotionPreference = () => {
      if (forcedReducedMotion || reducedMotion.matches) {
        stop()
        renderer?.clear()
        canvasElement.dataset.motion = 'reduced'
      } else if (renderer) {
        canvasElement.dataset.motion = 'live'
        requestFrame()
      } else {
        void initialise()
      }
    }

    const handleViewportChange = () => {
      if (!renderer || !scene) return
      sizeRendererForViewport()
      rebuildPopulation()
      requestFrame()
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false
        if (visible) requestFrame()
        else stop()
      },
      { threshold: 0.01 },
    )

    observer.observe(canvasElement)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    reducedMotion.addEventListener('change', handleMotionPreference)
    mobileViewport.addEventListener('change', handleViewportChange)
    if (forcedReducedMotion || reducedMotion.matches) {
      canvasElement.dataset.motion = 'reduced'
      canvasElement.dataset.paused = 'true'
    } else {
      void initialise()
    }

    return () => {
      disposed = true
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      reducedMotion.removeEventListener('change', handleMotionPreference)
      mobileViewport.removeEventListener('change', handleViewportChange)
      disposeDebugLayer()
      for (const view of views) view.root.removeFromParent()
      for (const geometry of sharedGeometries) geometry.dispose()
      for (const material of sharedMaterials) material.dispose()
      for (const material of occluderMaterials) material.dispose()
      for (const texture of occluderTextures) texture.dispose()
      occluderGeometry?.dispose()
      renderer?.dispose()
    }
  }, [settings, wind])

  return (
    <canvas
      className="scene__butterflies"
      ref={canvasRef}
      aria-hidden="true"
      style={
        {
          '--butterfly-reading-opacity': settings.readingOpacity,
        } as CSSProperties
      }
    />
  )
}

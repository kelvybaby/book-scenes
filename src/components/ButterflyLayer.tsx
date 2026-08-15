import { useEffect, useRef, type CSSProperties } from 'react'
import * as THREE from 'three'
import { ButterflyFlock, type ButterflyAgent } from '../motion/ButterflyFlock'
import type { AmbientWindField } from '../motion/AmbientWindField'
import {
  DEFAULT_BUTTERFLY_SETTINGS,
  type ButterflySettings,
} from './butterflySettings'

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
}

type DebugLayer = {
  group: THREE.Group
  pathGeometry: THREE.BufferGeometry | null
  materials: THREE.Material[]
  geometries: THREE.BufferGeometry[]
}

const TAU = Math.PI * 2
const SIMULATION_STEP = 1 / 60

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const mix = (minimum: number, maximum: number, amount: number) =>
  minimum + (maximum - minimum) * amount

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

function createWingGeometry(settings: ButterflySettings, side: -1 | 1) {
  const span = settings.wingSpan * side
  const length = settings.wingLength
  const positions = new Float32Array([
    0,
    0,
    0,
    length * 0.48,
    span * 0.18,
    0,
    length * 0.28,
    span,
    0,
    -length * 0.36,
    span * 0.82,
    0,
    -length * 0.42,
    span * 0.24,
    0,
  ])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4])
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
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
    let views: ButterflyView[] = []
    let debugLayer: DebugLayer | null = null
    let occluderGeometry: THREE.PlaneGeometry | null = null
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
      if (!scene || sharedGeometries.length < 3 || sharedMaterials.length < 4) return
      for (const view of views) view.root.removeFromParent()
      views = []
      disposeDebugLayer()

      const count = countForViewport()
      flock = new ButterflyFlock(settings, wind, count, seed)
      const [bodyGeometry, leftWingGeometry, rightWingGeometry] = sharedGeometries
      const [bodyMaterial, farWingMaterial, middleWingMaterial, nearWingMaterial] =
        sharedMaterials
      const wingMaterials = [
        farWingMaterial,
        middleWingMaterial,
        nearWingMaterial,
      ]

      for (const agent of flock.agents) {
        const root = new THREE.Group()
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
        const leftWing = new THREE.Group()
        const rightWing = new THREE.Group()
        leftWing.add(
          new THREE.Mesh(leftWingGeometry, wingMaterials[agent.depthBand]),
        )
        rightWing.add(
          new THREE.Mesh(rightWingGeometry, wingMaterials[agent.depthBand]),
        )
        root.add(body, leftWing, rightWing)
        root.scale.setScalar(agent.scale)
        scene.add(root)
        views.push({ root, leftWing, rightWing, heading: 0, bank: 0 })
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

      let totalSpeed = 0
      for (let index = 0; index < flock.agents.length; index += 1) {
        const agent = flock.agents[index]
        const view = views[index]
        const speed = Math.hypot(agent.velocity.x, agent.velocity.y)
        totalSpeed += speed
        if (speed > 0.16) {
          const targetHeading = Math.atan2(agent.velocity.y, agent.velocity.x)
          const headingDelta = shortestAngle(targetHeading - view.heading)
          view.heading +=
            headingDelta * (1 - Math.exp(-settings.turnResponse * elapsed))
          const bankTarget = clamp(
            headingDelta * 0.72,
            -settings.maximumBank,
            settings.maximumBank,
          )
          view.bank += (bankTarget - view.bank) * (1 - Math.exp(-4.2 * elapsed))
        }

        const flapClock =
          (time / 1000) *
            agent.flapFrequency *
            mix(1, settings.readingFlapScale, readingBlend) *
            TAU +
          agent.flapPhase
        const flapAmount =
          settings.flapOpenAngle +
          (0.5 + Math.sin(flapClock) * 0.5) * agent.flapAmplitude

        view.root.position.set(
          agent.position.x,
          agent.position.y,
          agent.position.z,
        )
        view.root.rotation.z = view.heading
        view.leftWing.rotation.x = view.bank + flapAmount
        view.rightWing.rotation.x = view.bank - flapAmount
      }

      updateDebugPaths(debugLayer, flock.agents)
      canvasElement.dataset.readingBlend = readingBlend.toFixed(3)
      canvasElement.dataset.averageSpeed = (
        totalSpeed / Math.max(flock.agents.length, 1)
      ).toFixed(2)
      canvasElement.dataset.positions = flock.agents
        .map(
          (agent) =>
            `${agent.id}:${agent.position.x.toFixed(1)},${agent.position.y.toFixed(1)},${agent.position.z.toFixed(2)},${agent.behavior}`,
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

        const bodyGeometry = new THREE.CylinderGeometry(
          0.38,
          0.52,
          settings.bodyLength,
          5,
          1,
        )
        bodyGeometry.rotateZ(Math.PI / 2)
        const leftWingGeometry = createWingGeometry(settings, 1)
        const rightWingGeometry = createWingGeometry(settings, -1)
        sharedGeometries.push(
          bodyGeometry,
          leftWingGeometry,
          rightWingGeometry,
        )

        const bodyMaterial = new THREE.MeshLambertMaterial({
          color: settings.bodyColor,
          flatShading: true,
        })
        sharedMaterials.push(bodyMaterial)
        for (const color of settings.wingColors) {
          sharedMaterials.push(
            new THREE.MeshLambertMaterial({
              color,
              emissive: settings.wingEmissive,
              emissiveIntensity: settings.wingEmissiveIntensity,
              flatShading: true,
              side: THREE.DoubleSide,
            }),
          )
        }

        scene.add(new THREE.HemisphereLight(0xffe7aa, 0x30361f, 1.65))
        const sun = new THREE.DirectionalLight(0xffd987, 0.82)
        sun.position.set(-0.7, 1.1, 2.4)
        scene.add(sun)

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

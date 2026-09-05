import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { AmbientWindField, AmbientWindSample } from '../motion/AmbientWindField'

type LivingPlantProps = {
  readingActive: boolean
  fallbackSource: string
  staticSource: string
  underpaintSource: string
  wind: AmbientWindField
  onLoad: () => void
}

type PlantPartDefinition = {
  id: string
  source: string
  bounds: readonly [left: number, top: number, width: number, height: number]
  base: readonly [x: number, y: number]
  tip: readonly [x: number, y: number]
  fieldPosition: number
  response: number
  detailResponse: number
  stiffness: number
  damping: number
  maxBend: number
  swayPhase: number
  swaySpeed: number
  bendExponent: number
  curvatureResponse: number
  renderOrder: number
}

type LeafRig = {
  definition: PlantPartDefinition
  geometry: THREE.BufferGeometry
  material: THREE.MeshBasicMaterial
  mesh: THREE.Mesh
  rest: Float32Array
  progress: Float32Array
  angle: number
  velocity: number
  sample: AmbientWindSample
}

type PlantMode = 'loading' | 'live' | 'fallback'

const SOURCE_WIDTH = 1672
const SOURCE_HEIGHT = 941
const GRID_COLUMNS = 6
const GRID_ROWS = 10

const PARTS: readonly PlantPartDefinition[] = [
  {
    id: 'lower-far-left',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-lower-leaf-far-left-v2.png',
    bounds: [1045, 807, 145, 102],
    base: [1174, 902],
    tip: [1051, 815],
    fieldPosition: 4.46,
    response: 0.82,
    detailResponse: 0.08,
    stiffness: 2.25,
    damping: 2.65,
    maxBend: 8.5,
    swayPhase: -0.62,
    swaySpeed: 0.82,
    bendExponent: 1.68,
    curvatureResponse: 0.032,
    renderOrder: 1,
  },
  {
    id: 'left',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-lower-leaf-left-v2.png',
    bounds: [1106, 816, 106, 96],
    base: [1200, 902],
    tip: [1114, 823],
    fieldPosition: 4.72,
    response: 0.86,
    detailResponse: 0.11,
    stiffness: 2.45,
    damping: 2.72,
    maxBend: 10,
    swayPhase: 0.25,
    swaySpeed: 0.9,
    bendExponent: 1.62,
    curvatureResponse: 0.035,
    renderOrder: 2,
  },
  {
    id: 'lower-left-upright',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-lower-leaf-left-upright-v2.png',
    bounds: [1149, 811, 50, 98],
    base: [1195, 902],
    tip: [1155, 817],
    fieldPosition: 4.86,
    response: 0.76,
    detailResponse: 0.1,
    stiffness: 2.72,
    damping: 2.88,
    maxBend: 9,
    swayPhase: 0.94,
    swaySpeed: 0.95,
    bendExponent: 1.74,
    curvatureResponse: 0.03,
    renderOrder: 3,
  },
  {
    id: 'upright',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-lower-leaf-upright-v2.png',
    bounds: [1180, 802, 47, 107],
    base: [1216, 900],
    tip: [1189, 809],
    fieldPosition: 5,
    response: 0.72,
    detailResponse: 0.08,
    stiffness: 3.05,
    damping: 3.08,
    maxBend: 8.8,
    swayPhase: 1.58,
    swaySpeed: 0.78,
    bendExponent: 1.72,
    curvatureResponse: 0.028,
    renderOrder: 4,
  },
  {
    id: 'lower-center-tall',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-lower-leaf-center-tall-v2.png',
    bounds: [1220, 807, 30, 102],
    base: [1238, 902],
    tip: [1229, 813],
    fieldPosition: 5.15,
    response: 0.68,
    detailResponse: 0.12,
    stiffness: 3.18,
    damping: 3.16,
    maxBend: 8,
    swayPhase: 2.1,
    swaySpeed: 1.02,
    bendExponent: 1.82,
    curvatureResponse: 0.025,
    renderOrder: 5,
  },
  {
    id: 'right',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-lower-leaf-right-v2.png',
    bounds: [1215, 788, 115, 123],
    base: [1228, 901],
    tip: [1321, 795],
    fieldPosition: 5.31,
    response: 1,
    detailResponse: 0.14,
    stiffness: 2.18,
    damping: 2.55,
    maxBend: 11.9,
    swayPhase: 2.72,
    swaySpeed: 0.99,
    bendExponent: 1.58,
    curvatureResponse: 0.036,
    renderOrder: 6,
  },
  {
    id: 'lower-right-upright',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-lower-leaf-right-upright-v2.png',
    bounds: [1264, 830, 25, 79],
    base: [1276, 902],
    tip: [1277, 826],
    fieldPosition: 5.5,
    response: 0.62,
    detailResponse: 0.13,
    stiffness: 3.35,
    damping: 3.25,
    maxBend: 7.5,
    swayPhase: 3.36,
    swaySpeed: 1.08,
    bendExponent: 1.88,
    curvatureResponse: 0.022,
    renderOrder: 7,
  },
  {
    id: 'lower-far-right',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-lower-leaf-far-right-v2.png',
    bounds: [1307, 818, 72, 93],
    base: [1320, 903],
    tip: [1372, 824],
    fieldPosition: 5.78,
    response: 0.74,
    detailResponse: 0.09,
    stiffness: 2.62,
    damping: 2.86,
    maxBend: 9.3,
    swayPhase: 3.92,
    swaySpeed: 0.88,
    bendExponent: 1.7,
    curvatureResponse: 0.03,
    renderOrder: 8,
  },
  {
    id: 'lower-outer-right',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-lower-leaf-outer-right-v2.png',
    bounds: [1354, 831, 44, 79],
    base: [1366, 903],
    tip: [1387, 837],
    fieldPosition: 6.02,
    response: 0.66,
    detailResponse: 0.11,
    stiffness: 3.05,
    damping: 3.12,
    maxBend: 7.8,
    swayPhase: 4.48,
    swaySpeed: 1,
    bendExponent: 1.86,
    curvatureResponse: 0.024,
    renderOrder: 9,
  },
  {
    id: 'flower-upper',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-flower-branch-upper-v1.png',
    bounds: [1571, 524, 62, 178],
    base: [1625, 695],
    tip: [1595, 545],
    fieldPosition: 8.42,
    response: 0.48,
    detailResponse: 0.035,
    stiffness: 1.62,
    damping: 3.38,
    maxBend: 5.6,
    swayPhase: 0.4,
    swaySpeed: 0.72,
    bendExponent: 1.38,
    curvatureResponse: 0.016,
    renderOrder: 20,
  },
  {
    id: 'flower-center',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-flower-branch-center-v1.png',
    bounds: [1582, 577, 66, 130],
    base: [1631, 700],
    tip: [1610, 602],
    fieldPosition: 8.7,
    response: 0.55,
    detailResponse: 0.04,
    stiffness: 1.78,
    damping: 3.46,
    maxBend: 6.1,
    swayPhase: 0.46,
    swaySpeed: 0.72,
    bendExponent: 1.42,
    curvatureResponse: 0.018,
    renderOrder: 21,
  },
  {
    id: 'flower-right',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-flower-branch-right-v1.png',
    bounds: [1628, 584, 44, 124],
    base: [1640, 701],
    tip: [1654, 608],
    fieldPosition: 8.96,
    response: 0.58,
    detailResponse: 0.045,
    stiffness: 1.84,
    damping: 3.52,
    maxBend: 6.4,
    swayPhase: 0.51,
    swaySpeed: 0.72,
    bendExponent: 1.44,
    curvatureResponse: 0.017,
    renderOrder: 22,
  },
  {
    id: 'flower-lower-left',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-flower-branch-lower-left-v1.png',
    bounds: [1557, 631, 66, 80],
    base: [1615, 703],
    tip: [1587, 653],
    fieldPosition: 8.61,
    response: 0.5,
    detailResponse: 0.045,
    stiffness: 2.02,
    damping: 3.62,
    maxBend: 5.1,
    swayPhase: 0.43,
    swaySpeed: 0.72,
    bendExponent: 1.48,
    curvatureResponse: 0.014,
    renderOrder: 23,
  },
  {
    id: 'flower-lower-right',
    source:
      '/assets/scenes/under-the-almond-trees/under-the-almond-trees-flower-branch-lower-right-v1.png',
    bounds: [1632, 635, 40, 80],
    base: [1648, 708],
    tip: [1658, 657],
    fieldPosition: 9.12,
    response: 0.52,
    detailResponse: 0.05,
    stiffness: 2.08,
    damping: 3.7,
    maxBend: 5,
    swayPhase: 0.48,
    swaySpeed: 0.72,
    bendExponent: 1.5,
    curvatureResponse: 0.013,
    renderOrder: 24,
  },
]

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

const loadImage = (source: string) =>
  new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Could not load ${source}`))
    image.src = source
  })

const createLeafGeometry = (definition: PlantPartDefinition) => {
  const [left, top, width, height] = definition.bounds
  const vertexCount = (GRID_COLUMNS + 1) * (GRID_ROWS + 1)
  const positions = new Float32Array(vertexCount * 3)
  const rest = new Float32Array(vertexCount * 2)
  const progress = new Float32Array(vertexCount)
  const uvs = new Float32Array(vertexCount * 2)
  const indices: number[] = []
  const axisX = definition.tip[0] - definition.base[0]
  const axisY = definition.tip[1] - definition.base[1]
  const axisLengthSquared = axisX * axisX + axisY * axisY

  for (let row = 0; row <= GRID_ROWS; row += 1) {
    const vertical = row / GRID_ROWS
    for (let column = 0; column <= GRID_COLUMNS; column += 1) {
      const horizontal = column / GRID_COLUMNS
      const vertex = row * (GRID_COLUMNS + 1) + column
      const positionOffset = vertex * 3
      const restOffset = vertex * 2
      const x = left + horizontal * width
      const y = top + vertical * height
      const fromBaseX = x - definition.base[0]
      const fromBaseY = y - definition.base[1]

      positions[positionOffset] = x
      positions[positionOffset + 1] = y
      positions[positionOffset + 2] = 0
      rest[restOffset] = x
      rest[restOffset + 1] = y
      progress[vertex] = clamp(
        (fromBaseX * axisX + fromBaseY * axisY) / axisLengthSquared,
        0,
        1,
      )
      uvs[restOffset] = horizontal
      uvs[restOffset + 1] = 1 - vertical
    }
  }

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const topLeft = row * (GRID_COLUMNS + 1) + column
      const topRight = topLeft + 1
      const bottomLeft = topLeft + GRID_COLUMNS + 1
      const bottomRight = bottomLeft + 1
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()

  return { geometry, rest, progress }
}

const deformLeaf = (rig: LeafRig) => {
  const positions = rig.geometry.getAttribute('position') as THREE.BufferAttribute
  const positionArray = positions.array as Float32Array
  const angle = THREE.MathUtils.degToRad(rig.angle)
  const baseX = rig.definition.base[0]
  const baseY = rig.definition.base[1]
  const axisX = rig.definition.tip[0] - baseX
  const axisY = rig.definition.tip[1] - baseY
  const axisLength = Math.hypot(axisX, axisY)
  const normalX = -axisY / axisLength
  const normalY = axisX / axisLength

  for (let vertex = 0; vertex < rig.progress.length; vertex += 1) {
    const positionOffset = vertex * 3
    const restOffset = vertex * 2
    const x = rig.rest[restOffset]
    const y = rig.rest[restOffset + 1]
    const bendProgress = Math.pow(rig.progress[vertex], rig.definition.bendExponent)
    const localAngle = angle * bendProgress
    const cosine = Math.cos(localAngle)
    const sine = Math.sin(localAngle)
    const fromBaseX = x - baseX
    const fromBaseY = y - baseY
    const curvature =
      Math.sin(Math.PI * rig.progress[vertex]) *
      angle *
      axisLength *
      rig.definition.curvatureResponse

    positionArray[positionOffset] =
      baseX + fromBaseX * cosine - fromBaseY * sine + normalX * curvature
    positionArray[positionOffset + 1] =
      baseY + fromBaseX * sine + fromBaseY * cosine + normalY * curvature
  }

  positions.needsUpdate = true
}

export function LivingPlant({
  readingActive,
  fallbackSource,
  staticSource,
  underpaintSource,
  wind,
  onLoad,
}: LivingPlantProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readingActiveRef = useRef(readingActive)
  const onLoadRef = useRef(onLoad)
  const readyReportedRef = useRef(false)
  const [mode, setMode] = useState<PlantMode>('loading')

  useEffect(() => {
    readingActiveRef.current = readingActive
  }, [readingActive])

  useEffect(() => {
    onLoadRef.current = onLoad
  }, [onLoad])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let disposed = false
    let visible = false
    let frame: number | null = null
    let lastTime = performance.now()
    let swayClock = 0
    let readingBlend = readingActiveRef.current ? 1 : 0
    let renderer: THREE.WebGLRenderer | null = null
    let leafRigs: LeafRig[] = []
    let scene: THREE.Scene | null = null
    let camera: THREE.OrthographicCamera | null = null
    let initialising = false

    const reportReady = () => {
      if (readyReportedRef.current) return
      readyReportedRef.current = true
      onLoadRef.current()
    }

    const stop = () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = null
    }

    const requestFrame = () => {
      if (
        frame === null &&
        renderer &&
        visible &&
        !reducedMotion.matches &&
        document.visibilityState === 'visible'
      ) {
        lastTime = performance.now()
        frame = window.requestAnimationFrame(render)
      }
    }

    const render = (time: number) => {
      frame = null
      if (!renderer || !scene || !camera || reducedMotion.matches || disposed) return

      const delta = Math.min((time - lastTime) / 1000, 1 / 30)
      lastTime = time
      const readingTarget = readingActiveRef.current ? 1 : 0
      const blendRate = readingTarget > readingBlend ? 0.62 : 0.36
      readingBlend += (readingTarget - readingBlend) * (1 - Math.exp(-blendRate * delta))
      const amplitude = mix(1, 0.52, readingBlend)
      const swaySpeedScale = mix(1, 0.55, readingBlend)
      const detailScale = mix(1, 0.2, readingBlend)
      const stiffnessScale = mix(1, 0.58, readingBlend)
      const dampingScale = mix(1, 1.22, readingBlend)
      const windTime = wind.time(time)
      swayClock += delta * swaySpeedScale

      for (const rig of leafRigs) {
        wind.sample(rig.definition.fieldPosition, windTime, rig.sample)
        const persistentSway =
          Math.sin(
            swayClock * rig.definition.swaySpeed + rig.definition.swayPhase,
          ) * 0.62 +
          Math.sin(
            swayClock * rig.definition.swaySpeed * 0.53 + rig.definition.swayPhase * 1.37,
          ) * 0.18
        const ambientSway =
          rig.sample.broad * rig.definition.response * 0.34 +
          rig.sample.detail * rig.definition.detailResponse * detailScale
        const targetAngle =
          clamp(persistentSway + ambientSway, -1, 1) *
          rig.definition.maxBend *
          amplitude
        const stiffness = rig.definition.stiffness * stiffnessScale
        const damping = rig.definition.damping * dampingScale
        rig.velocity += (targetAngle - rig.angle) * stiffness * delta
        rig.velocity *= Math.exp(-damping * delta)
        rig.angle += rig.velocity * delta
        rig.angle = clamp(rig.angle, -rig.definition.maxBend, rig.definition.maxBend)
        deformLeaf(rig)
      }

      canvas.dataset.leafAngles = leafRigs.map((rig) => rig.angle.toFixed(3)).join(',')
      canvas.dataset.readingBlend = readingBlend.toFixed(3)
      renderer.render(scene, camera)
      frame = window.requestAnimationFrame(render)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stop()
      else requestFrame()
    }

    const handleMotionPreference = () => {
      if (reducedMotion.matches) {
        stop()
        setMode('fallback')
      } else if (renderer) {
        setMode('live')
        requestFrame()
      } else {
        void initialise()
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false
        if (visible) requestFrame()
        else stop()
      },
      { threshold: 0.01 },
    )

    const initialise = async () => {
      if (initialising || renderer) return
      initialising = true

      try {
        if (reducedMotion.matches) {
          await loadImage(fallbackSource)
          if (disposed) return
          if (reducedMotion.matches) {
            setMode('fallback')
            reportReady()
            return
          }
        }

        const textureLoader = new THREE.TextureLoader()
        const [textures] = await Promise.all([
          Promise.all(PARTS.map((part) => textureLoader.loadAsync(part.source))),
          loadImage(staticSource),
          loadImage(underpaintSource),
        ])
        if (disposed) {
          for (const texture of textures) texture.dispose()
          return
        }

        scene = new THREE.Scene()
        camera = new THREE.OrthographicCamera(0, SOURCE_WIDTH, 0, SOURCE_HEIGHT, -10, 10)
        camera.position.z = 1

        leafRigs = PARTS.map((definition, index) => {
          const texture = textures[index]
          texture.colorSpace = THREE.SRGBColorSpace
          texture.minFilter = THREE.LinearMipmapLinearFilter
          texture.magFilter = THREE.LinearFilter
          const { geometry, rest, progress } = createLeafGeometry(definition)
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.002,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
          const mesh = new THREE.Mesh(geometry, material)
          mesh.frustumCulled = false
          mesh.renderOrder = definition.renderOrder
          scene?.add(mesh)
          return {
            definition,
            geometry,
            material,
            mesh,
            rest,
            progress,
            angle: 0,
            velocity: 0,
            sample: { broad: 0, detail: 0 },
          }
        })

        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
        renderer.setPixelRatio(1)
        renderer.setSize(SOURCE_WIDTH, SOURCE_HEIGHT, false)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.setClearColor(0x000000, 0)
        renderer.render(scene, camera)
        reportReady()
        if (reducedMotion.matches) {
          setMode('fallback')
        } else {
          setMode('live')
          requestFrame()
        }
      } catch (error) {
        console.error('Living plant renderer unavailable; using the static foreground.', error)
        if (disposed) return
        setMode('fallback')
        reportReady()
      } finally {
        initialising = false
      }
    }

    observer.observe(canvas)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    reducedMotion.addEventListener('change', handleMotionPreference)
    void initialise()

    return () => {
      disposed = true
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      reducedMotion.removeEventListener('change', handleMotionPreference)
      for (const rig of leafRigs) {
        rig.geometry.dispose()
        rig.material.map?.dispose()
        rig.material.dispose()
      }
      renderer?.dispose()
    }
  }, [fallbackSource, staticSource, underpaintSource, wind])

  return (
    <div className={`scene__foreground scene__foreground--${mode}`} aria-hidden="true">
      <img
        className="scene__foreground-fallback"
        src={fallbackSource}
        width={SOURCE_WIDTH}
        height={SOURCE_HEIGHT}
        alt=""
        draggable="false"
        decoding="async"
      />
      <img
        className="scene__foreground-flower-underpaint"
        src={underpaintSource}
        width={SOURCE_WIDTH}
        height={SOURCE_HEIGHT}
        alt=""
        draggable="false"
        decoding="async"
      />
      <img
        className="scene__foreground-static"
        src={staticSource}
        width={SOURCE_WIDTH}
        height={SOURCE_HEIGHT}
        alt=""
        draggable="false"
        decoding="async"
      />
      <canvas className="scene__foreground-leaves" ref={canvasRef} />
    </div>
  )
}

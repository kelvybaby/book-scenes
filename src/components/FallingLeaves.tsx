import { useEffect, useRef } from 'react'
import type { AmbientWindField, AmbientWindSample } from '../motion/AmbientWindField'

type FallingLeavesProps = {
  readingActive: boolean
  wind: AmbientWindField
}

type SourceId =
  | 'upper-left-canopy'
  | 'central-canopy'
  | 'house-canopy'
  | 'courtyard-tree'
  | 'doorway-tree'
  | 'left-tree'

type SourceZone = {
  id: SourceId
  patches: readonly (
    readonly [left: number, right: number, top: number, bottom: number]
  )[]
  ground: (x: number) => number
  fieldPosition: readonly [minimum: number, maximum: number]
  interval: readonly [minimum: number, maximum: number]
  initialDelay: number
}

type FallingLeaf = {
  id: number
  source: SourceId
  x: number
  y: number
  velocityX: number
  velocityY: number
  gravity: number
  terminalSpeed: number
  windResponse: number
  baseDrift: number
  flutterAmplitude: number
  flutterPhase: number
  flutterSpeed: number
  tumble: number
  tumbleSpeed: number
  rotation: number
  rotationSpeed: number
  length: number
  widthRatio: number
  depth: number
  sprite: number
  fieldPosition: number
  age: number
  fadeIn: number
  landed: boolean
  landingAge: number
  landingDuration: number
  opacity: number
}

const SOURCE_WIDTH = 1672
const SOURCE_HEIGHT = 941
const RENDER_SCALE = 0.75
const RENDER_WIDTH = Math.round(SOURCE_WIDTH * RENDER_SCALE)
const RENDER_HEIGHT = Math.round(SOURCE_HEIGHT * RENDER_SCALE)
const TARGET_FRAME_MS = 1000 / 24
const TAU = Math.PI * 2
const MAX_ACTIVE_LEAVES = 4
const SCENE_TEXTURE_SOURCE =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-study-q.png'

// Each patch is contained inside visible foliage instead of combining an x
// corridor with one broad y range. The paths also avoid repeatedly crossing
// either figure's face or hands.
const SOURCE_ZONES: readonly SourceZone[] = [
  {
    id: 'upper-left-canopy',
    patches: [
      [34, 104, 86, 228],
      [126, 236, 48, 176],
      [266, 356, 22, 112],
    ],
    ground: (x) => 610 + (x - 34) * 0.1,
    fieldPosition: [0.08, 0.8],
    interval: [16, 24],
    initialDelay: 0.35,
  },
  {
    id: 'central-canopy',
    patches: [
      [414, 520, 28, 126],
      [574, 690, 16, 112],
      [714, 786, 42, 144],
    ],
    ground: (x) => 650 + (x - 414) * 0.105,
    fieldPosition: [2.1, 3.6],
    interval: [17, 26],
    initialDelay: 1.2,
  },
  {
    id: 'house-canopy',
    patches: [
      [800, 936, 32, 150],
      [968, 1080, 50, 202],
    ],
    ground: (x) => 681 + (x - 800) * 0.05,
    fieldPosition: [4.05, 5.42],
    interval: [15, 23],
    initialDelay: 2.4,
  },
  {
    id: 'courtyard-tree',
    patches: [
      [1084, 1194, 92, 254],
      [1216, 1322, 118, 296],
    ],
    ground: (x) => 696 + (x - 1084) * 0.035,
    fieldPosition: [5.55, 7.2],
    interval: [14, 22],
    initialDelay: 3.7,
  },
  {
    id: 'doorway-tree',
    patches: [
      [1294, 1362, 184, 322],
      [1508, 1592, 192, 354],
    ],
    ground: (x) => 706 + (x - 1294) * 0.035,
    fieldPosition: [7.25, 8.65],
    interval: [13, 21],
    initialDelay: 5.1,
  },
  {
    id: 'left-tree',
    patches: [
      [62, 126, 360, 446],
      [146, 220, 346, 466],
    ],
    ground: (x) => 616 + (x - 62) * 0.16,
    fieldPosition: [0.55, 1.35],
    interval: [13, 20],
    initialDelay: 6.5,
  },
]

const LEAF_PALETTES = [
  ['#a98a32', '#685823', '#d3b34f'],
  ['#86742b', '#4d481f', '#b99b38'],
  ['#9a6930', '#5b4226', '#c89546'],
  ['#74682c', '#3e3d1f', '#a88f36'],
] as const

// Small foliage samples supply Study Q's actual brush texture. The pointed
// alpha silhouette is authored in canvas so a source leaf never has to be
// removed from the flattened master.
const TEXTURE_PATCHES = [
  [868, 68, 74, 27],
  [1118, 98, 74, 27],
  [1440, 142, 74, 27],
  [174, 425, 74, 27],
] as const

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const mix = (minimum: number, maximum: number, amount: number) =>
  minimum + (maximum - minimum) * amount

const smoothstep = (minimum: number, maximum: number, value: number) => {
  const amount = clamp((value - minimum) / (maximum - minimum), 0, 1)
  return amount * amount * (3 - 2 * amount)
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function traceLeaf(context: CanvasRenderingContext2D, length: number, width: number) {
  const halfLength = length * 0.5
  const halfWidth = width * 0.5
  context.beginPath()
  context.moveTo(-halfLength, 0)
  context.bezierCurveTo(
    -halfLength * 0.35,
    -halfWidth,
    halfLength * 0.43,
    -halfWidth * 0.84,
    halfLength,
    0,
  )
  context.bezierCurveTo(
    halfLength * 0.38,
    halfWidth * 0.82,
    -halfLength * 0.36,
    halfWidth,
    -halfLength,
    0,
  )
  context.closePath()
}

function loadSceneTexture() {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The falling-leaf source texture failed to load.'))
    image.src = SCENE_TEXTURE_SOURCE
  })
}

function createLeafSprites(source: HTMLImageElement | null) {
  return LEAF_PALETTES.map(([lit, shade, highlight], paletteIndex) => {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 56
    const context = canvas.getContext('2d')
    if (!context) return canvas

    context.translate(48, 28)
    traceLeaf(context, 74, 27)
    context.save()
    context.clip()
    if (source) {
      const [sourceX, sourceY, sourceWidth, sourceHeight] =
        TEXTURE_PATCHES[paletteIndex]
      context.drawImage(
        source,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        -37,
        -13.5,
        74,
        27,
      )
      context.globalCompositeOperation = 'multiply'
      context.globalAlpha = 0.34
      context.fillStyle = lit
      context.fillRect(-38, -15, 76, 30)
      context.globalCompositeOperation = 'screen'
      context.globalAlpha = 0.16
      const textureLight = context.createLinearGradient(-36, -8, 34, 9)
      textureLight.addColorStop(0, shade)
      textureLight.addColorStop(0.5, lit)
      textureLight.addColorStop(1, highlight)
      context.fillStyle = textureLight
      context.fillRect(-38, -15, 76, 30)
    } else {
      const gradient = context.createLinearGradient(-36, -8, 34, 9)
      gradient.addColorStop(0, shade)
      gradient.addColorStop(0.46, lit)
      gradient.addColorStop(1, highlight)
      context.fillStyle = gradient
      context.fillRect(-38, -15, 76, 30)
    }
    context.restore()
    traceLeaf(context, 74, 27)
    context.strokeStyle = 'rgba(44, 38, 17, 0.76)'
    context.lineWidth = 1.5
    context.stroke()

    context.beginPath()
    context.moveTo(-34, 0.5)
    context.quadraticCurveTo(0, paletteIndex % 2 === 0 ? -1.8 : 1.8, 32, 0)
    context.strokeStyle = 'rgba(224, 193, 92, 0.54)'
    context.lineWidth = 1.15
    context.stroke()

    const random = mulberry32(9100 + paletteIndex * 73)
    for (let mark = 0; mark < 11; mark += 1) {
      const x = mix(-27, 27, random())
      const halfWidth = 10.5 * (1 - Math.abs(x) / 37)
      const y = mix(-halfWidth, halfWidth, random())
      context.beginPath()
      context.arc(x, y, mix(0.45, 1.35, random()), 0, TAU)
      context.fillStyle =
        mark % 3 === 0 ? 'rgba(241, 208, 102, 0.3)' : 'rgba(48, 41, 20, 0.2)'
      context.fill()
    }

    return canvas
  })
}

function sourceGround(source: SourceId, x: number) {
  return SOURCE_ZONES.find((zone) => zone.id === source)?.ground(x) ?? SOURCE_HEIGHT
}

function isDebugDense() {
  return new URLSearchParams(window.location.search).get('fallingLeavesDebug') === 'dense'
}

function isReducedMotionForced() {
  return new URLSearchParams(window.location.search).get('fallingLeavesMotion') === 'reduce'
}

export function FallingLeaves({ readingActive, wind }: FallingLeavesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readingActiveRef = useRef(readingActive)

  useEffect(() => {
    readingActiveRef.current = readingActive
  }, [readingActive])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const random = mulberry32(0x4c454146)
    let sprites: HTMLCanvasElement[] = []
    const windSample: AmbientWindSample = { broad: 0, detail: 0 }
    const leaves: FallingLeaf[] = []
    const debugDense = isDebugDense()
    const forcedReducedMotion = isReducedMotionForced()
    let disposed = false
    let visible = true
    let frame: number | null = null
    let lastFrameTime = performance.now()
    let accumulatedFrameTime = TARGET_FRAME_MS
    let simulationTime = 0
    const nextEmissionAt = Object.fromEntries(
      SOURCE_ZONES.map((source, index) => [
        source.id,
        debugDense ? 0.15 + index * 0.34 : source.initialDelay,
      ]),
    ) as Record<SourceId, number>
    let leafSequence = 0
    let emittedCount = 0
    let readingBlend = readingActiveRef.current ? 1 : 0

    const updateDiagnostics = (paused: boolean) => {
      canvas.dataset.activeCount = String(leaves.length)
      canvas.dataset.emittedCount = String(emittedCount)
      canvas.dataset.sources = leaves.map((leaf) => leaf.source).join(',')
      canvas.dataset.readingBlend = readingBlend.toFixed(3)
      canvas.dataset.paused = String(paused)
      canvas.dataset.leafStates = leaves
        .map(
          (leaf) =>
            `${leaf.id}:${leaf.x.toFixed(1)},${leaf.y.toFixed(1)},${leaf.velocityY.toFixed(1)},${leaf.rotation.toFixed(2)},${leaf.landed ? 1 : 0}`,
        )
        .join('|')
    }

    const clear = () => {
      context.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT)
      leaves.length = 0
      updateDiagnostics(true)
    }

    const stop = () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = null
      updateDiagnostics(true)
    }

    const canAnimate = () =>
      !disposed &&
      visible &&
      sprites.length > 0 &&
      !forcedReducedMotion &&
      !reducedMotion.matches &&
      document.visibilityState === 'visible'

    const requestFrame = () => {
      if (frame !== null || !canAnimate()) return
      lastFrameTime = performance.now()
      frame = window.requestAnimationFrame(render)
    }

    const spawnLeaf = (source: SourceZone, paired: boolean) => {
      const patch = source.patches[Math.floor(random() * source.patches.length)]
      const depth = mix(0.72, 1.14, random())
      const x = mix(patch[0], patch[1], random()) + (paired ? mix(-8, 8, random()) : 0)
      const y = mix(patch[2], patch[3], random()) + (paired ? mix(-12, 12, random()) : 0)
      const fallDirection = random() < 0.46 ? -1 : 1

      leaves.push({
        id: leafSequence,
        source: source.id,
        x,
        y,
        velocityX: mix(-2.5, 2.5, random()),
        velocityY: mix(5, 12, random()) * depth,
        gravity: mix(16, 23, random()) * depth,
        terminalSpeed: mix(29, 43, random()) * depth,
        windResponse: mix(7, 12, random()) * depth,
        baseDrift: fallDirection * mix(1.2, 4.6, random()),
        flutterAmplitude: mix(5.5, 11.5, random()) * depth,
        flutterPhase: random() * TAU,
        flutterSpeed: mix(1.65, 2.75, random()),
        tumble: random() * TAU,
        tumbleSpeed: fallDirection * mix(1.2, 2.4, random()),
        rotation: random() * TAU,
        rotationSpeed: fallDirection * mix(0.28, 0.82, random()),
        length: mix(10, 16, random()) * depth,
        widthRatio: mix(0.31, 0.43, random()),
        depth,
        sprite: Math.floor(random() * sprites.length),
        fieldPosition: mix(source.fieldPosition[0], source.fieldPosition[1], random()),
        age: 0,
        fadeIn: mix(0.38, 0.72, random()),
        landed: false,
        landingAge: 0,
        landingDuration: mix(1.6, 2.7, random()),
        opacity: mix(0.76, 0.94, random()),
      })
      leafSequence += 1
      emittedCount += 1
    }

    const scheduleEmission = (source: SourceZone) => {
      spawnLeaf(source, false)

      const pairChance = debugDense ? 0.38 : 0.1
      if (leaves.length < MAX_ACTIVE_LEAVES && random() < pairChance) {
        spawnLeaf(source, true)
      }

      const readingIntervalScale = mix(1, 1.22, readingBlend)
      nextEmissionAt[source.id] =
        simulationTime +
        (debugDense
          ? mix(0.9, 1.45, random())
          : mix(source.interval[0], source.interval[1], random())) *
          readingIntervalScale
    }

    const updateLeaf = (leaf: FallingLeaf, delta: number, windTime: number) => {
      leaf.age += delta

      if (leaf.landed) {
        leaf.landingAge += delta
        leaf.x += leaf.velocityX * delta
        leaf.velocityX *= Math.exp(-3.2 * delta)
        return
      }

      wind.sample(leaf.fieldPosition, windTime, windSample)
      const motionScale = mix(1, 0.76, readingBlend)
      const windScale = mix(1, 0.62, readingBlend)
      const flutterPhase = leaf.age * leaf.flutterSpeed * motionScale + leaf.flutterPhase
      const lateralFlutter =
        Math.sin(flutterPhase) * leaf.flutterAmplitude +
        Math.sin(flutterPhase * 0.47 + leaf.flutterPhase * 1.7) *
          leaf.flutterAmplitude *
          0.24
      const targetVelocityX =
        leaf.baseDrift + windSample.broad * leaf.windResponse * windScale + lateralFlutter
      leaf.velocityX +=
        (targetVelocityX - leaf.velocityX) * (1 - Math.exp(-1.15 * delta))
      leaf.velocityY = Math.min(
        leaf.terminalSpeed * motionScale,
        leaf.velocityY + leaf.gravity * motionScale * delta,
      )

      const verticalFlutter = 0.86 + Math.cos(flutterPhase * 0.91) * 0.14
      leaf.x += leaf.velocityX * delta
      leaf.y += leaf.velocityY * verticalFlutter * delta
      leaf.tumble += leaf.tumbleSpeed * motionScale * delta
      leaf.rotation +=
        (leaf.rotationSpeed + windSample.detail * 0.16) * motionScale * delta

      const ground = sourceGround(leaf.source, leaf.x)
      if (leaf.y >= ground) {
        leaf.y = ground
        leaf.landed = true
        leaf.landingAge = 0
        leaf.velocityX *= 0.24
        leaf.rotation += mix(-0.18, 0.18, random())
      }
    }

    const drawLeaf = (leaf: FallingLeaf) => {
      const fadeIn = smoothstep(0, leaf.fadeIn, leaf.age)
      const landingFade = leaf.landed
        ? 1 - smoothstep(leaf.landingDuration * 0.48, leaf.landingDuration, leaf.landingAge)
        : 1
      const face = Math.cos(leaf.tumble)
      const foreshortening = leaf.landed ? 0.3 : 0.16 + Math.abs(face) * 0.84
      const width = leaf.length * leaf.widthRatio
      const depthOpacity = mix(0.68, 1, clamp((leaf.depth - 0.72) / 0.42, 0, 1))

      context.save()
      context.translate(leaf.x, leaf.y)
      context.rotate(leaf.rotation)
      context.scale(1, (face < 0 ? -1 : 1) * foreshortening)
      context.globalAlpha = leaf.opacity * fadeIn * landingFade * depthOpacity
      context.drawImage(
        sprites[leaf.sprite],
        -leaf.length * 0.5,
        -width * 0.5,
        leaf.length,
        width,
      )
      context.restore()
    }

    const step = (delta: number, time: number) => {
      simulationTime += delta
      const readingTarget = readingActiveRef.current ? 1 : 0
      readingBlend +=
        (readingTarget - readingBlend) * (1 - Math.exp(-0.52 * delta))

      const dueSources = SOURCE_ZONES.filter(
        (source) => simulationTime >= nextEmissionAt[source.id],
      ).sort((first, second) => nextEmissionAt[first.id] - nextEmissionAt[second.id])
      for (const source of dueSources) {
        if (leaves.length >= (debugDense ? 10 : MAX_ACTIVE_LEAVES)) break
        scheduleEmission(source)
      }

      const windTime = wind.time(time)
      for (const leaf of leaves) updateLeaf(leaf, delta, windTime)

      for (let index = leaves.length - 1; index >= 0; index -= 1) {
        const leaf = leaves[index]
        if (
          (leaf.landed && leaf.landingAge >= leaf.landingDuration) ||
          leaf.x < -40 ||
          leaf.x > SOURCE_WIDTH + 40 ||
          leaf.age > 24
        ) {
          leaves.splice(index, 1)
        }
      }
    }

    const draw = () => {
      context.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT)
      const orderedLeaves = [...leaves].sort((first, second) => first.depth - second.depth)
      context.save()
      context.scale(RENDER_SCALE, RENDER_SCALE)
      for (const leaf of orderedLeaves) drawLeaf(leaf)
      context.restore()
      updateDiagnostics(false)
    }

    function render(time: number) {
      frame = null
      if (!canAnimate()) {
        stop()
        return
      }

      const elapsed = Math.min(time - lastFrameTime, 80)
      lastFrameTime = time
      accumulatedFrameTime += elapsed
      if (accumulatedFrameTime >= TARGET_FRAME_MS) {
        const delta = Math.min(accumulatedFrameTime / 1000, 1 / 15)
        accumulatedFrameTime = 0
        step(delta, time)
        draw()
      }
      frame = window.requestAnimationFrame(render)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stop()
      else requestFrame()
    }

    const handleMotionPreference = () => {
      if (forcedReducedMotion || reducedMotion.matches) {
        stop()
        clear()
      } else {
        for (const source of SOURCE_ZONES) {
          nextEmissionAt[source.id] = simulationTime + mix(0.35, 1.1, random())
        }
        requestFrame()
      }
    }

    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false
      if (visible) requestFrame()
      else stop()
    })

    const initialise = async () => {
      try {
        sprites = createLeafSprites(await loadSceneTexture())
      } catch (error) {
        console.warn('Using painted-color fallback leaves.', error)
        sprites = createLeafSprites(null)
      }
      requestFrame()
    }

    canvas.width = RENDER_WIDTH
    canvas.height = RENDER_HEIGHT
    observer.observe(canvas)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    reducedMotion.addEventListener('change', handleMotionPreference)
    if (forcedReducedMotion || reducedMotion.matches) clear()
    void initialise()

    return () => {
      disposed = true
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      reducedMotion.removeEventListener('change', handleMotionPreference)
    }
  }, [wind])

  return (
    <canvas
      className="scene__falling-leaves"
      ref={canvasRef}
      width={RENDER_WIDTH}
      height={RENDER_HEIGHT}
      aria-hidden="true"
    />
  )
}

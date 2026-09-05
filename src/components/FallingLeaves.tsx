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

type Point = readonly [x: number, y: number]
type SpawnTriangle = readonly [Point, Point, Point]
type LeafFlow = 'ambient' | 'sky-canopy'

type SourceZone = {
  id: SourceId
  triangles: readonly SpawnTriangle[]
  ground: (x: number) => number
  fieldPosition: readonly [minimum: number, maximum: number]
}

type FallingLeaf = {
  id: number
  flow: LeafFlow
  source: SourceId
  x: number
  y: number
  velocityX: number
  velocityY: number
  descentSpeed: number
  horizontalAnchor: number
  travelRadius: number
  lateralDirection: number
  lateralDrift: number
  flutterAmplitude: number
  flutterPhase: number
  flutterFrequency: number
  phaseModulation: number
  secondaryPhase: number
  turbulencePhase: number
  turbulenceFrequency: number
  turbulencePhaseTwo: number
  turbulenceFrequencyTwo: number
  tumbleBlend: number
  tumbleStartAge: number
  tumblePhase: number
  tumbleRate: number
  tumbleDirection: number
  rotation: number
  rotationVelocity: number
  orientationBias: number
  roll: number
  rollVelocity: number
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
  landingRotationTarget: number
  landingRollTarget: number
  avoidanceSide: -1 | 1
  opacity: number
  turnCount: number
}

const SOURCE_WIDTH = 1672
const SOURCE_HEIGHT = 941
const RENDER_SCALE = 0.75
const RENDER_WIDTH = Math.round(SOURCE_WIDTH * RENDER_SCALE)
const RENDER_HEIGHT = Math.round(SOURCE_HEIGHT * RENDER_SCALE)
const TARGET_FRAME_MS = 1000 / 24
const TAU = Math.PI * 2
const SCENE_TEXTURE_SOURCE =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-study-q.png'

/**
 * FALLING-LEAF ART DIRECTION CONTROLS
 *
 * These are the intentional scene-level controls. Per-leaf variation is
 * sampled inside these ranges so tuning remains art-directable in one place.
 */
const FALLING_LEAF_CONTROLS = {
  leafScale: { minimum: 1.55, maximum: 1.95 },
  descentSpeed: { minimum: 30, maximum: 42 },
  lateralDrift: { minimum: 3.5, maximum: 10 },
  flutterAmplitude: { minimum: 34, maximum: 66 },
  flutterFrequency: { minimum: 0.105, maximum: 0.19 },
  tumbleProbability: 0.17,
  windStrength: 11,
  turbulenceStrength: 4.2,
  spawnInterval: { minimum: 1.4, maximum: 2.8 },
  maxActiveLeaves: 12,
  clusterProbability: 0.32,
  clusterSize: { minimum: 2, maximum: 4 },
  clusterSpread: { minimum: 0.18, maximum: 0.38 },
  clusterStagger: { minimum: 0.12, maximum: 0.38 },
  settlingDuration: { minimum: 2.8, maximum: 4.1 },
  protectedAreaStrength: 68,
  skyCanopyFlow: {
    spawnInterval: { minimum: 1.9, maximum: 2.55 },
    recoveryInterval: { minimum: 0.65, maximum: 0.95 },
    minimumSkyBandLeaves: 3,
    skyBandBottom: 390,
    maxActiveLeaves: 8,
  },
} as const

// Leaves are free to move through the park, but the flattened figure and the
// interactive book cannot occlude them correctly. A soft predictive clearance
// region makes approaching trajectories curve around both instead of drawing
// over Florentino, his hands, or the discovery light.
const FLORENTINO_AND_BOOK_CLEARANCE = {
  center: [366, 688] as const,
  radius: [155, 170] as const,
  verticalLead: 95,
} as const

// Triangles follow painted foliage masses. Barycentric sampling produces a
// genuinely two-dimensional distribution without rectangular emitter edges.
const SOURCE_ZONES: readonly SourceZone[] = [
  {
    id: 'upper-left-canopy',
    triangles: [
      [[30, 80], [116, 102], [62, 238]],
      [[112, 42], [250, 58], [172, 184]],
      [[246, 16], [376, 28], [314, 126]],
    ],
    ground: (x) => 610 + (x - 34) * 0.1,
    fieldPosition: [0.08, 0.8],
  },
  {
    id: 'central-canopy',
    triangles: [
      [[392, 16], [534, 24], [478, 142]],
      [[548, 8], [700, 14], [638, 124]],
      [[690, 30], [806, 48], [748, 158]],
    ],
    ground: (x) => 650 + (x - 414) * 0.105,
    fieldPosition: [2.1, 3.6],
  },
  {
    id: 'house-canopy',
    triangles: [
      [[782, 24], [946, 38], [874, 172]],
      [[940, 34], [1098, 62], [1020, 218]],
    ],
    ground: (x) => 681 + (x - 800) * 0.05,
    fieldPosition: [4.05, 5.42],
  },
  {
    id: 'courtyard-tree',
    triangles: [
      [[1072, 74], [1208, 108], [1138, 272]],
      [[1196, 98], [1338, 138], [1260, 310]],
    ],
    ground: (x) => 696 + (x - 1084) * 0.035,
    fieldPosition: [5.55, 7.2],
  },
  {
    id: 'doorway-tree',
    triangles: [
      [[1284, 166], [1380, 196], [1334, 340]],
      [[1494, 176], [1608, 218], [1548, 370]],
    ],
    ground: (x) => 706 + (x - 1294) * 0.035,
    fieldPosition: [7.25, 8.65],
  },
  {
    id: 'left-tree',
    triangles: [
      [[52, 346], [138, 372], [92, 462]],
      [[132, 330], [232, 370], [178, 482]],
    ],
    ground: (x) => 616 + (x - 62) * 0.16,
    fieldPosition: [0.55, 1.35],
  },
]

const SOURCE_ZONE_BY_ID = Object.fromEntries(
  SOURCE_ZONES.map((zone) => [zone.id, zone]),
) as Record<SourceId, SourceZone>

// A dedicated flow uses only the two foliage pockets directly above
// Florentino. Their leaves cross the open sky and clouds before entering the
// busier lower half of the painting, where they remain part of the same motion.
const SKY_CANOPY_SOURCE = SOURCE_ZONE_BY_ID['central-canopy']
const SKY_CANOPY_TRIANGLES = SKY_CANOPY_SOURCE.triangles.slice(0, 2)

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

const damp = (current: number, target: number, response: number, delta: number) =>
  current + (target - current) * (1 - Math.exp(-response * delta))

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

const sampleTriangle = (triangle: SpawnTriangle, random: () => number): Point => {
  let first = random()
  let second = random()
  if (first + second > 1) {
    first = 1 - first
    second = 1 - second
  }
  const [a, b, c] = triangle
  return [
    a[0] + (b[0] - a[0]) * first + (c[0] - a[0]) * second,
    a[1] + (b[1] - a[1]) * first + (c[1] - a[1]) * second,
  ]
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
  return SOURCE_ZONE_BY_ID[source].ground(x)
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
    // Keep this stream deterministic and independent: adding sky leaves must
    // not consume random samples or alter spawn choices elsewhere in the scene.
    const skyCanopyRandom = mulberry32(0x534b594c)
    let sprites: HTMLCanvasElement[] = []
    const windSample: AmbientWindSample = { broad: 0, detail: 0 }
    const leaves: FallingLeaf[] = []
    const pendingSpawns: Array<{
      at: number
      source: SourceZone
      point: Point
    }> = []
    const debugDense = isDebugDense()
    const forcedReducedMotion = isReducedMotionForced()
    let disposed = false
    let visible = true
    let frame: number | null = null
    let lastFrameTime = performance.now()
    let accumulatedFrameTime = TARGET_FRAME_MS
    let simulationTime = 0
    let nextEmissionAt = debugDense ? 0.15 : 0.42
    let nextSkyCanopyEmissionAt = 0.18
    let sourceBag: SourceZone[] = []
    let previousSource: SourceId | null = null
    let leafSequence = 0
    let emittedCount = 0
    let ambientEmittedCount = 0
    let readingBlend = readingActiveRef.current ? 1 : 0
    let lastDiagnosticsAt = Number.NEGATIVE_INFINITY

    const updateDiagnostics = (paused: boolean, force = false) => {
      const diagnosticInterval = debugDense ? 0.1 : 0.25
      if (!force && simulationTime - lastDiagnosticsAt < diagnosticInterval) return
      lastDiagnosticsAt = simulationTime
      canvas.dataset.activeCount = String(leaves.length)
      canvas.dataset.emittedCount = String(emittedCount)
      let skyCanopyCount = 0
      let skyCanopyBandCount = 0
      for (const leaf of leaves) {
        if (leaf.flow !== 'sky-canopy') continue
        skyCanopyCount += 1
        if (!leaf.landed && leaf.y < FALLING_LEAF_CONTROLS.skyCanopyFlow.skyBandBottom) {
          skyCanopyBandCount += 1
        }
      }
      canvas.dataset.skyCanopyCount = String(skyCanopyCount)
      canvas.dataset.skyCanopyBandCount = String(skyCanopyBandCount)
      canvas.dataset.sources = leaves.map((leaf) => leaf.source).join(',')
      canvas.dataset.readingBlend = readingBlend.toFixed(3)
      canvas.dataset.paused = String(paused)
      canvas.dataset.leafStates = leaves
        .map(
          (leaf) =>
            `${leaf.id}:${leaf.source},${leaf.x.toFixed(1)},${leaf.y.toFixed(1)},${leaf.velocityX.toFixed(1)},${leaf.velocityY.toFixed(1)},${leaf.rotation.toFixed(2)},${leaf.roll.toFixed(2)},${leaf.tumbleBlend.toFixed(2)},${leaf.turnCount},${leaf.landed ? 1 : 0}`,
        )
        .join('|')
    }

    const clear = () => {
      context.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT)
      leaves.length = 0
      pendingSpawns.length = 0
      updateDiagnostics(true, true)
    }

    const stop = () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = null
      updateDiagnostics(true, true)
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

    const takeNextSource = () => {
      if (sourceBag.length === 0) {
        sourceBag = [...SOURCE_ZONES]
        for (let index = sourceBag.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(random() * (index + 1))
          ;[sourceBag[index], sourceBag[swapIndex]] = [sourceBag[swapIndex], sourceBag[index]]
        }
        if (sourceBag.at(-1)?.id === previousSource && sourceBag.length > 1) {
          ;[sourceBag[0], sourceBag[sourceBag.length - 1]] = [
            sourceBag[sourceBag.length - 1],
            sourceBag[0],
          ]
        }
      }
      const source = sourceBag.pop() ?? SOURCE_ZONES[0]
      previousSource = source.id
      return source
    }

    const spawnLeaf = (
      source: SourceZone,
      point: Point,
      flow: LeafFlow = 'ambient',
      randomSource: () => number = random,
    ) => {
      const [x, y] = point
      const depth = mix(0.72, 1.14, randomSource())
      const lateralDirection = randomSource() < 0.5 ? -1 : 1
      const flutterFrequency = mix(
        FALLING_LEAF_CONTROLS.flutterFrequency.minimum,
        FALLING_LEAF_CONTROLS.flutterFrequency.maximum,
        randomSource(),
      )
      const flutterAmplitude =
        mix(
          FALLING_LEAF_CONTROLS.flutterAmplitude.minimum,
          FALLING_LEAF_CONTROLS.flutterAmplitude.maximum,
          randomSource(),
        ) * depth
      const flutterPhase = randomSource() * TAU
      const leafScale = mix(
        FALLING_LEAF_CONTROLS.leafScale.minimum,
        FALLING_LEAF_CONTROLS.leafScale.maximum,
        randomSource(),
      )
      const descentSpeed =
        mix(
          FALLING_LEAF_CONTROLS.descentSpeed.minimum,
          FALLING_LEAF_CONTROLS.descentSpeed.maximum,
          randomSource(),
        ) *
        mix(0.92, 1.08, depth)
      const initialGlideVelocity =
        lateralDirection *
        flutterAmplitude *
        TAU *
        flutterFrequency *
        Math.cos(flutterPhase)
      const willTumble = randomSource() < FALLING_LEAF_CONTROLS.tumbleProbability
      const orientationBias = mix(-0.72, 0.72, randomSource())
      const avoidanceSide: -1 | 1 =
        x < FLORENTINO_AND_BOOK_CLEARANCE.center[0] ? -1 : 1

      leaves.push({
        id: leafSequence,
        flow,
        source: source.id,
        x,
        y,
        velocityX: initialGlideVelocity * mix(0.45, 0.78, randomSource()),
        velocityY: descentSpeed * mix(0.42, 0.7, randomSource()),
        descentSpeed,
        horizontalAnchor: x,
        travelRadius: flutterAmplitude * 1.8 + 28,
        lateralDirection,
        lateralDrift:
          lateralDirection *
          mix(
            FALLING_LEAF_CONTROLS.lateralDrift.minimum,
            FALLING_LEAF_CONTROLS.lateralDrift.maximum,
            randomSource(),
          ),
        flutterAmplitude,
        flutterPhase,
        flutterFrequency,
        phaseModulation: mix(0.035, 0.12, randomSource()),
        secondaryPhase: randomSource() * TAU,
        turbulencePhase: randomSource() * TAU,
        turbulenceFrequency: mix(0.055, 0.105, randomSource()),
        turbulencePhaseTwo: randomSource() * TAU,
        turbulenceFrequencyTwo: mix(0.11, 0.19, randomSource()),
        tumbleBlend: 0,
        tumbleStartAge: willTumble
          ? mix(2.2, 7.2, randomSource())
          : Number.POSITIVE_INFINITY,
        tumblePhase: randomSource() * TAU,
        tumbleRate: mix(1.05, 1.72, randomSource()),
        tumbleDirection: randomSource() < 0.5 ? -1 : 1,
        rotation: orientationBias,
        rotationVelocity: 0,
        orientationBias,
        roll: mix(-0.72, 0.72, randomSource()),
        rollVelocity: 0,
        length: mix(10, 16, randomSource()) * depth * leafScale,
        widthRatio: mix(0.31, 0.43, randomSource()),
        depth,
        sprite: Math.floor(randomSource() * sprites.length),
        fieldPosition: mix(
          source.fieldPosition[0],
          source.fieldPosition[1],
          randomSource(),
        ),
        age: 0,
        fadeIn: mix(0.38, 0.72, randomSource()),
        landed: false,
        landingAge: 0,
        landingDuration: mix(
          FALLING_LEAF_CONTROLS.settlingDuration.minimum,
          FALLING_LEAF_CONTROLS.settlingDuration.maximum,
          randomSource(),
        ),
        landingRotationTarget: orientationBias,
        landingRollTarget: 0.12,
        avoidanceSide,
        opacity: mix(0.76, 0.94, randomSource()),
        turnCount: 0,
      })
      leaves.sort((first, second) => first.depth - second.depth)
      leafSequence += 1
      emittedCount += 1
      if (flow === 'ambient') ambientEmittedCount += 1
    }

    const scheduleEmission = (
      maximumLeaves: number,
      ambientLeafCount: number,
    ) => {
      const source = takeNextSource()
      const triangle = source.triangles[Math.floor(random() * source.triangles.length)]
      const anchor = sampleTriangle(triangle, random)
      const firstRelease = ambientEmittedCount === 0
      const requestedGroupSize = firstRelease
        ? 3
        : random() < FALLING_LEAF_CONTROLS.clusterProbability
          ? Math.floor(
              mix(
                FALLING_LEAF_CONTROLS.clusterSize.minimum,
                FALLING_LEAF_CONTROLS.clusterSize.maximum + 1,
                random(),
              ),
            )
          : 1
      const openSlots = Math.max(
        1,
        maximumLeaves - ambientLeafCount - pendingSpawns.length,
      )
      const groupSize = Math.min(requestedGroupSize, openSlots)

      spawnLeaf(source, anchor)
      let stagger = 0
      for (let index = 1; index < groupSize; index += 1) {
        const nearbyPoint = sampleTriangle(triangle, random)
        const spread = mix(
          FALLING_LEAF_CONTROLS.clusterSpread.minimum,
          FALLING_LEAF_CONTROLS.clusterSpread.maximum,
          random(),
        )
        stagger += mix(
          FALLING_LEAF_CONTROLS.clusterStagger.minimum,
          FALLING_LEAF_CONTROLS.clusterStagger.maximum,
          random(),
        )
        pendingSpawns.push({
          at: simulationTime + stagger,
          source,
          point: [
            mix(anchor[0], nearbyPoint[0], spread),
            mix(anchor[1], nearbyPoint[1], spread),
          ],
        })
      }
      pendingSpawns.sort((first, second) => first.at - second.at)

      const readingIntervalScale = mix(1, 1.22, readingBlend)
      nextEmissionAt =
        simulationTime +
        (debugDense
          ? mix(0.9, 1.45, random())
          : mix(
              FALLING_LEAF_CONTROLS.spawnInterval.minimum,
              FALLING_LEAF_CONTROLS.spawnInterval.maximum,
              random(),
            )) *
          readingIntervalScale
    }

    const scheduleSkyCanopyEmission = (skyBandLeafCount: number) => {
      const triangle =
        SKY_CANOPY_TRIANGLES[
          Math.floor(skyCanopyRandom() * SKY_CANOPY_TRIANGLES.length)
        ]
      spawnLeaf(
        SKY_CANOPY_SOURCE,
        sampleTriangle(triangle, skyCanopyRandom),
        'sky-canopy',
        skyCanopyRandom,
      )

      const interval =
        skyBandLeafCount <
        FALLING_LEAF_CONTROLS.skyCanopyFlow.minimumSkyBandLeaves
          ? FALLING_LEAF_CONTROLS.skyCanopyFlow.recoveryInterval
          : FALLING_LEAF_CONTROLS.skyCanopyFlow.spawnInterval
      const readingIntervalScale = mix(1, 1.12, readingBlend)
      nextSkyCanopyEmissionAt =
        simulationTime +
        mix(interval.minimum, interval.maximum, skyCanopyRandom()) *
          readingIntervalScale
    }

    const updateLeaf = (leaf: FallingLeaf, delta: number, windTime: number) => {
      leaf.age += delta

      if (leaf.landed) {
        leaf.landingAge += delta
        leaf.x += leaf.velocityX * delta
        leaf.velocityX *= Math.exp(-2.45 * delta)
        leaf.rotation = wrapAngle(
          leaf.rotation +
            wrapAngle(leaf.landingRotationTarget - leaf.rotation) *
              (1 - Math.exp(-3.6 * delta)),
        )
        leaf.roll = damp(leaf.roll, leaf.landingRollTarget, 3.8, delta)
        return
      }

      wind.sample(leaf.fieldPosition, windTime, windSample)
      const motionScale = mix(1, 0.76, readingBlend)
      const windScale = mix(1, 0.62, readingBlend)
      const phaseRate =
        TAU *
        leaf.flutterFrequency *
        (1 +
          Math.sin(leaf.age * TAU * 0.043 + leaf.secondaryPhase) *
            leaf.phaseModulation +
          windSample.detail * 0.025) *
        motionScale
      leaf.flutterPhase += phaseRate * delta
      leaf.tumblePhase += leaf.tumbleRate * leaf.tumbleDirection * motionScale * delta
      const tumbleTarget = leaf.age >= leaf.tumbleStartAge ? 1 : 0
      leaf.tumbleBlend = damp(leaf.tumbleBlend, tumbleTarget, 0.58, delta)

      const phaseCosine = Math.cos(leaf.flutterPhase)
      const turningStrength = Math.pow(1 - Math.abs(phaseCosine), 2.7)
      const glideVelocity =
        leaf.lateralDirection *
        leaf.flutterAmplitude *
        phaseRate *
        (phaseCosine +
          Math.cos(leaf.flutterPhase * 2.07 + leaf.secondaryPhase) * 0.14)
      const windVelocity =
        windSample.broad * FALLING_LEAF_CONTROLS.windStrength * windScale
      const turbulenceVelocity =
        (Math.sin(
          leaf.age * TAU * leaf.turbulenceFrequency + leaf.turbulencePhase,
        ) *
          0.72 +
          Math.sin(
            leaf.age * TAU * leaf.turbulenceFrequencyTwo +
              leaf.turbulencePhaseTwo,
          ) *
            0.28) *
        FALLING_LEAF_CONTROLS.turbulenceStrength *
        windScale
      leaf.horizontalAnchor = clamp(
        leaf.horizontalAnchor +
          (leaf.lateralDrift * 0.16 + windVelocity * 0.08) * delta,
        24,
        SOURCE_WIDTH - 24,
      )
      const flutterTargetVelocityX =
        glideVelocity + leaf.lateralDrift + windVelocity + turbulenceVelocity
      const tumbleTargetVelocityX =
        leaf.lateralDrift * 0.72 +
        leaf.lateralDirection *
          leaf.flutterAmplitude *
          leaf.tumbleRate *
          0.42 *
          Math.cos(leaf.tumblePhase * 0.54 + leaf.secondaryPhase) +
        windVelocity +
        turbulenceVelocity * 0.7
      const unconstrainedTargetVelocityX = mix(
        flutterTargetVelocityX,
        tumbleTargetVelocityX,
        leaf.tumbleBlend,
      )
      const anchorDisplacement = leaf.x - leaf.horizontalAnchor
      const travelLimitBlend = smoothstep(
        leaf.travelRadius * 0.72,
        leaf.travelRadius,
        Math.abs(anchorDisplacement),
      )
      const returnDirection = -Math.sign(anchorDisplacement || leaf.lateralDirection)
      const returnVelocity =
        returnDirection *
        Math.max(Math.abs(unconstrainedTargetVelocityX), 52)
      const unavoidedTargetVelocityX = mix(
        unconstrainedTargetVelocityX,
        returnVelocity,
        travelLimitBlend,
      )
      const predictedX = leaf.x + unavoidedTargetVelocityX * 0.9
      const normalizedAvoidanceX =
        (predictedX - FLORENTINO_AND_BOOK_CLEARANCE.center[0]) /
        FLORENTINO_AND_BOOK_CLEARANCE.radius[0]
      const normalizedAvoidanceY =
        (leaf.y - FLORENTINO_AND_BOOK_CLEARANCE.center[1]) /
        FLORENTINO_AND_BOOK_CLEARANCE.radius[1]
      const avoidanceDistance = Math.hypot(
        normalizedAvoidanceX,
        normalizedAvoidanceY,
      )
      const approachBlend = smoothstep(
        FLORENTINO_AND_BOOK_CLEARANCE.center[1] -
          FLORENTINO_AND_BOOK_CLEARANCE.radius[1] -
          FLORENTINO_AND_BOOK_CLEARANCE.verticalLead,
        FLORENTINO_AND_BOOK_CLEARANCE.center[1] -
          FLORENTINO_AND_BOOK_CLEARANCE.radius[1] +
          24,
        leaf.y,
      )
      const departureBlend =
        1 -
        smoothstep(
          FLORENTINO_AND_BOOK_CLEARANCE.center[1] +
            FLORENTINO_AND_BOOK_CLEARANCE.radius[1] *
              0.45,
          FLORENTINO_AND_BOOK_CLEARANCE.center[1] +
            FLORENTINO_AND_BOOK_CLEARANCE.radius[1],
          leaf.y,
        )
      const avoidanceBlend =
        (1 - smoothstep(0.82, 1.38, avoidanceDistance)) *
        approachBlend *
        departureBlend
      const protectedAreaVelocity =
        leaf.avoidanceSide *
        Math.max(
          Math.abs(unavoidedTargetVelocityX),
          FALLING_LEAF_CONTROLS.protectedAreaStrength,
        )
      const targetVelocityX = mix(
        unavoidedTargetVelocityX,
        protectedAreaVelocity,
        avoidanceBlend,
      )
      const previousVelocityX = leaf.velocityX
      leaf.velocityX = damp(
        leaf.velocityX,
        targetVelocityX,
        mix(1.45, 2.25, turningStrength),
        delta,
      )
      if (
        previousVelocityX * leaf.velocityX < 0 &&
        Math.abs(targetVelocityX) > 5
      ) {
        leaf.turnCount += 1
      }

      const flutterTargetVelocityY =
        leaf.descentSpeed *
        motionScale *
        (1 - turningStrength * 0.43 +
          Math.sin(leaf.flutterPhase * 2 + leaf.secondaryPhase) * 0.065)
      const tumbleTargetVelocityY =
        leaf.descentSpeed *
        motionScale *
        (1.04 + Math.sin(leaf.tumblePhase * 0.83) * 0.075)
      leaf.velocityY = damp(
        leaf.velocityY,
        mix(flutterTargetVelocityY, tumbleTargetVelocityY, leaf.tumbleBlend),
        1.35,
        delta,
      )

      leaf.x += leaf.velocityX * delta
      leaf.y += leaf.velocityY * delta

      const turnDirection =
        -Math.sign(Math.sin(leaf.flutterPhase) || 1) * leaf.lateralDirection
      const glideVelocityScale = Math.max(8, leaf.flutterAmplitude * phaseRate)
      const glideLean = clamp(leaf.velocityX / glideVelocityScale, -1, 1)
      const flutterRotationTarget =
        leaf.orientationBias +
        glideLean * 0.58 +
        turnDirection * turningStrength * 0.72
      const tumbleRotationTarget =
        leaf.orientationBias + leaf.tumblePhase
      const rotationTarget =
        flutterRotationTarget +
        wrapAngle(tumbleRotationTarget - flutterRotationTarget) * leaf.tumbleBlend
      const rotationError = wrapAngle(rotationTarget - leaf.rotation)
      leaf.rotationVelocity +=
        rotationError * mix(8.5, 24, turningStrength) * delta
      leaf.rotationVelocity *= Math.exp(-mix(5.2, 3.35, turningStrength) * delta)
      leaf.rotation = wrapAngle(leaf.rotation + leaf.rotationVelocity * delta)

      const flutterRollTarget =
        Math.sin(leaf.flutterPhase + leaf.secondaryPhase * 0.19) * 0.38 +
        turnDirection * turningStrength * 1.08
      const tumbleRollTarget =
        Math.sin(leaf.tumblePhase * 1.37 + leaf.secondaryPhase) * 1.3
      const rollTarget = mix(
        flutterRollTarget,
        tumbleRollTarget,
        leaf.tumbleBlend,
      )
      leaf.rollVelocity += (rollTarget - leaf.roll) * 9.5 * delta
      leaf.rollVelocity *= Math.exp(-4.1 * delta)
      leaf.roll += leaf.rollVelocity * delta

      const ground = sourceGround(leaf.source, leaf.x)
      if (leaf.y >= ground) {
        const landingRandom =
          leaf.flow === 'sky-canopy' ? skyCanopyRandom : random
        leaf.y = ground
        leaf.landed = true
        leaf.landingAge = 0
        leaf.velocityX *= 0.3
        leaf.velocityY = 0
        leaf.landingRotationTarget = wrapAngle(
          leaf.rotation + mix(-0.28, 0.28, landingRandom()),
        )
        leaf.landingRollTarget = mix(-0.14, 0.14, landingRandom())
      }
    }

    const drawLeaf = (leaf: FallingLeaf) => {
      const fadeIn = smoothstep(0, leaf.fadeIn, leaf.age)
      const landingFade = leaf.landed
        ? 1 - smoothstep(leaf.landingDuration * 0.7, leaf.landingDuration, leaf.landingAge)
        : 1
      const face = Math.cos(leaf.roll)
      const foreshortening = leaf.landed ? 0.3 : 0.24 + Math.abs(face) * 0.76
      const width = leaf.length * leaf.widthRatio
      const depthOpacity = mix(0.68, 1, clamp((leaf.depth - 0.72) / 0.42, 0, 1))

      context.save()
      context.translate(leaf.x, leaf.y)
      context.rotate(leaf.rotation)
      context.scale(1, (face < 0 ? -1 : 1) * foreshortening)
      context.globalAlpha =
        leaf.opacity *
        fadeIn *
        landingFade *
        depthOpacity *
        (face < 0 ? 0.9 : 1)
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

      const maximumLeaves = debugDense
        ? FALLING_LEAF_CONTROLS.maxActiveLeaves + 6
        : FALLING_LEAF_CONTROLS.maxActiveLeaves
      let ambientLeafCount = 0
      let skyCanopyLeafCount = 0
      let skyCanopyBandLeafCount = 0
      for (const leaf of leaves) {
        if (leaf.flow === 'ambient') {
          ambientLeafCount += 1
          continue
        }
        skyCanopyLeafCount += 1
        if (
          !leaf.landed &&
          leaf.y < FALLING_LEAF_CONTROLS.skyCanopyFlow.skyBandBottom
        ) {
          skyCanopyBandLeafCount += 1
        }
      }
      while (pendingSpawns[0]?.at <= simulationTime) {
        const pending = pendingSpawns.shift()
        if (pending && ambientLeafCount < maximumLeaves) {
          spawnLeaf(pending.source, pending.point)
          ambientLeafCount += 1
        }
      }
      if (
        simulationTime >= nextEmissionAt &&
        ambientLeafCount + pendingSpawns.length < maximumLeaves
      ) {
        scheduleEmission(maximumLeaves, ambientLeafCount)
      }
      if (
        simulationTime >= nextSkyCanopyEmissionAt &&
        skyCanopyLeafCount < FALLING_LEAF_CONTROLS.skyCanopyFlow.maxActiveLeaves
      ) {
        scheduleSkyCanopyEmission(skyCanopyBandLeafCount)
      }

      const windTime = wind.time(time)
      for (const leaf of leaves) updateLeaf(leaf, delta, windTime)

      for (let index = leaves.length - 1; index >= 0; index -= 1) {
        const leaf = leaves[index]
        if (
          (leaf.landed && leaf.landingAge >= leaf.landingDuration) ||
          leaf.x < -40 ||
          leaf.x > SOURCE_WIDTH + 40 ||
          leaf.age > 52
        ) {
          leaves.splice(index, 1)
        }
      }
    }

    const draw = () => {
      context.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT)
      context.save()
      context.scale(RENDER_SCALE, RENDER_SCALE)
      for (const leaf of leaves) drawLeaf(leaf)
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
        nextEmissionAt = simulationTime + mix(0.35, 1.1, random())
        nextSkyCanopyEmissionAt =
          simulationTime + mix(0.18, 0.5, skyCanopyRandom())
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

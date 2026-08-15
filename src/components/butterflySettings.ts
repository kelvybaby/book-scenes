export type ButterflyPoint = {
  x: number
  y: number
}

export type ButterflyRange = readonly [minimum: number, maximum: number]

export type ButterflyOccluder = {
  id: string
  source: string
  depth: number
  alphaTest: number
  debugColor: number
}

export type ButterflyAvoidanceEllipse = ButterflyPoint & {
  radiusX: number
  radiusY: number
  strength: number
}

export type ButterflyActivityRegion = ButterflyPoint & {
  radiusX: number
  radiusY: number
  minimumX: number
  maximumX: number
  minimumY: number
  maximumY: number
}

export type ButterflySettings = {
  sourceWidth: number
  sourceHeight: number
  renderScale: number
  mobileRenderScale: number
  mobileBreakpoint: number
  desktopCount: number
  mobileCount: number
  seed: number
  activity: ButterflyActivityRegion
  leafAnchors: readonly ButterflyPoint[]
  avoidance: readonly ButterflyAvoidanceEllipse[]
  depth: ButterflyRange
  scale: ButterflyRange
  wingSpan: number
  wingLength: number
  bodyLength: number
  flapFrequency: ButterflyRange
  flapAmplitude: ButterflyRange
  flapOpenAngle: number
  cruiseSpeed: ButterflyRange
  hoverSpeed: ButterflyRange
  maximumAcceleration: number
  steeringResponse: number
  turnResponse: number
  maximumBank: number
  arrivalRadius: number
  slowdownRadius: number
  localTravel: ButterflyRange
  longLocalTravelChance: number
  anchorApproachChance: number
  hoverDuration: ButterflyRange
  targetDuration: ButterflyRange
  noiseStrength: ButterflyRange
  noiseFrequency: ButterflyRange
  boundaryStrength: number
  avoidanceStrength: number
  separationRadius: number
  separationStrength: number
  depthSpeed: number
  readingSpeedScale: number
  readingNoiseScale: number
  readingFlapScale: number
  readingOpacity: number
  windStrength: number
  wingColors: readonly [far: number, middle: number, near: number]
  wingEmissive: number
  wingEmissiveIntensity: number
  bodyColor: number
  occluders: readonly ButterflyOccluder[]
}

export const DEFAULT_BUTTERFLY_SETTINGS: ButterflySettings = {
  sourceWidth: 1672,
  sourceHeight: 941,
  renderScale: 0.9,
  mobileRenderScale: 0.52,
  mobileBreakpoint: 760,
  desktopCount: 11,
  mobileCount: 8,
  seed: 0x42555454,
  // A single bounded habitat around the far-right flowering pot. The hard
  // limits keep every target outside Fermina, the doorway, and the wall mass.
  activity: {
    x: 1590,
    y: 606,
    radiusX: 103,
    radiusY: 154,
    minimumX: 1498,
    maximumX: 1668,
    minimumY: 454,
    maximumY: 742,
  },
  leafAnchors: [
    { x: 1583, y: 532 },
    { x: 1610, y: 575 },
    { x: 1648, y: 598 },
    { x: 1568, y: 642 },
    { x: 1608, y: 672 },
    { x: 1650, y: 688 },
  ],
  avoidance: [
    // Fermina and the chair remain outside the activity ellipse; this larger
    // soft boundary prevents interpolation or resizing from drifting toward her.
    { x: 1428, y: 600, radiusX: 116, radiusY: 152, strength: 1.25 },
    // Keep flight off the bare pier/window above the flowers while permitting
    // butterflies to hover immediately around the plant's upper silhouette.
    { x: 1512, y: 428, radiusX: 68, radiusY: 94, strength: 0.9 },
  ],
  depth: [-0.32, 1.14],
  scale: [0.64, 1.3],
  wingSpan: 6.4,
  wingLength: 5.2,
  bodyLength: 4.2,
  flapFrequency: [6.4, 9.4],
  flapAmplitude: [1.02, 1.42],
  flapOpenAngle: 0.035,
  cruiseSpeed: [11, 24],
  hoverSpeed: [2.4, 6.2],
  maximumAcceleration: 46,
  steeringResponse: 2.7,
  turnResponse: 6.4,
  maximumBank: 0.24,
  arrivalRadius: 8,
  slowdownRadius: 45,
  localTravel: [28, 76],
  longLocalTravelChance: 0.16,
  anchorApproachChance: 0.36,
  hoverDuration: [0.65, 2.8],
  targetDuration: [3.8, 8.6],
  noiseStrength: [3.2, 8.4],
  noiseFrequency: [0.12, 0.29],
  boundaryStrength: 38,
  avoidanceStrength: 52,
  separationRadius: 19,
  separationStrength: 20,
  depthSpeed: 0.24,
  readingSpeedScale: 0.38,
  readingNoiseScale: 0.32,
  readingFlapScale: 0.78,
  readingOpacity: 0.72,
  windStrength: 1.8,
  wingColors: [0xc39f35, 0xdfb63a, 0xf0c641],
  wingEmissive: 0x4d3a0d,
  wingEmissiveIntensity: 0.42,
  bodyColor: 0x3b3119,
  occluders: [
    {
      id: 'mid-foliage',
      source:
        '/assets/scenes/under-the-almond-trees/under-the-almond-trees-butterfly-occluder-mid-v1.png',
      depth: 0.14,
      alphaTest: 0.14,
      debugColor: 0x5ec6a5,
    },
    {
      id: 'near-flowers',
      source:
        '/assets/scenes/under-the-almond-trees/under-the-almond-trees-butterfly-occluder-near-v1.png',
      depth: 0.72,
      alphaTest: 0.12,
      debugColor: 0xe98b62,
    },
  ],
}

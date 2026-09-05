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
  bodyRadius: number
  flapFrequency: ButterflyRange
  flapAmplitude: ButterflyRange
  flapOpenAngle: number
  pauseFlapScale: number
  dartFlapScale: number
  bodyBobAmount: number
  cruiseSpeed: ButterflyRange
  speedControlInterval: ButterflyRange
  slowSpeedScale: ButterflyRange
  activeSpeedScale: ButterflyRange
  burstSpeedScale: ButterflyRange
  slowChance: number
  burstChance: number
  speedResponse: number
  turnRate: ButterflyRange
  turnControlInterval: ButterflyRange
  turnPersistence: number
  turnRateResponse: number
  homeRadiusX: ButterflyRange
  homeRadiusY: ButterflyRange
  homeTurnStrength: number
  homeReturnStrength: number
  flutterSpeed: ButterflyRange
  flutterControlInterval: ButterflyRange
  flutterResponse: number
  velocityResponse: number
  depthControlInterval: ButterflyRange
  depthResponse: number
  maximumAcceleration: number
  presentationTurnResponse: number
  maximumPresentationTurnRate: number
  maximumBank: number
  boundaryStrength: number
  avoidanceStrength: number
  separationRadius: number
  separationStrength: number
  depthSpeed: number
  readingSpeedScale: number
  readingJitterScale: number
  readingFlapScale: number
  readingOpacity: number
  windStrength: number
  wingColors: readonly [far: number, middle: number, near: number]
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
  // A single bounded habitat around the far-right flowering canopy. The hard
  // limits keep all flight outside Fermina, the doorway, and the wall mass.
  activity: {
    x: 1604,
    y: 604,
    radiusX: 94,
    radiusY: 99,
    minimumX: 1512,
    maximumX: 1668,
    minimumY: 505,
    maximumY: 703,
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
  // Broad wings and a smaller body preserve the paired V/M silhouette seen in
  // the reference, while the depth-driven scale still leaves several specks.
  scale: [0.91, 2.24],
  wingSpan: 3.4,
  wingLength: 5.8,
  bodyLength: 3.4,
  bodyRadius: 0.3,
  flapFrequency: [9.4, 13.8],
  flapAmplitude: [0.72, 1],
  flapOpenAngle: 0.12,
  pauseFlapScale: 0.55,
  dartFlapScale: 1.2,
  bodyBobAmount: 1.15,
  // The flight solver continuously varies speed and curvature around a local
  // home. These controls create compact hooks and brief relaxations without
  // choosing destination points or switching through visible behavior states.
  cruiseSpeed: [52, 82],
  speedControlInterval: [0.03, 0.12],
  slowSpeedScale: [0.02, 0.12],
  activeSpeedScale: [0.65, 1.12],
  burstSpeedScale: [1.65, 2.45],
  slowChance: 0.24,
  burstChance: 0.38,
  speedResponse: 16,
  turnRate: [2.5, 9],
  turnControlInterval: [0.025, 0.1],
  turnPersistence: 0.56,
  turnRateResponse: 24,
  homeRadiusX: [18, 28],
  homeRadiusY: [14, 24],
  homeTurnStrength: 20,
  homeReturnStrength: 1400,
  flutterSpeed: [5, 13],
  flutterControlInterval: [0.015, 0.055],
  flutterResponse: 36,
  velocityResponse: 28,
  depthControlInterval: [0.2, 0.64],
  depthResponse: 4.6,
  maximumAcceleration: 1000,
  presentationTurnResponse: 6,
  maximumPresentationTurnRate: 2.6,
  maximumBank: 0.13,
  boundaryStrength: 300,
  avoidanceStrength: 300,
  separationRadius: 19,
  separationStrength: 34,
  depthSpeed: 0.42,
  readingSpeedScale: 0.38,
  readingJitterScale: 0.42,
  readingFlapScale: 0.78,
  readingOpacity: 0.72,
  windStrength: 0.72,
  // These are painted, light-independent colours rather than emissive VFX.
  wingColors: [0xe8c96b, 0xf5dc7a, 0xffe78f],
  bodyColor: 0x765522,
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

import { AmbientWindField, type AmbientWindSample } from './AmbientWindField'

export type WindSample = {
  x: number
  y: number
  z: number
}

export type WindPersonality = 'hesitant' | 'wandering' | 'decisive'

export type WindCatch =
  | 'upper-left-corner'
  | 'lower-left-corner'
  | 'left-edge'
  | 'lower-right-corner'

export type ReleasePlan = {
  personality: WindPersonality
  secondaryGustTime: number
  secondaryGustStrength: number
  lateralAcceleration: number
  catch: WindCatch
  catchX: number
  catchY: number
  flutterFrequency: number
  flutterAmplitude: number
}

export type WindProfile = {
  seed: number
  plan: ReleasePlan
  energy: number
  tempo: number
  strength: number
  flutter: number
  firstLift: number
  phase: number
}

export type WindMoments = {
  time: number
  condensationAir: number
  restingFlutter: number
  firstLift: number
  actionFlutter: number
  groundedQuiet: number
  edgeCatch: number
}

type FlowMode = {
  kx: number
  ky: number
  kz: number
  vx: number
  vy: number
  vz: number
  phase: number
  speed: number
  amplitude: number
}

const TAU = Math.PI * 2

// Shared authored contact beat. The solver begins sampling the seeded gust at
// this instant; profile strength then decides whether the page leaves quickly
// or continues to hesitate on the road.
export const RELEASE_CONTACT_TIME = 6.2

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const progress = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1)
  return progress * progress * (3 - 2 * progress)
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const pulse = (start: number, peak: number, end: number, value: number) =>
  smoothstep(start, peak, value) * (1 - smoothstep(peak, end, value))

const hash = (value: number, seed: number) => {
  const hashed = Math.sin(value * 127.1 + seed * 311.7) * 43758.5453
  return hashed - Math.floor(hashed)
}

const valueNoise = (value: number, seed: number) => {
  const start = Math.floor(value)
  const fraction = value - start
  const eased = fraction * fraction * (3 - 2 * fraction)
  return hash(start, seed) + (hash(start + 1, seed) - hash(start, seed)) * eased
}

const seededValue = (seed: number, offset: number) =>
  hash((seed % 100_003) * 0.001 + offset * 7.13, offset * 1.91 + 3.7)

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

type ProceduralGust = {
  activity: number
  horizontal: number
  vertical: number
  depth: number
  turbulence: number
}

const sampleProceduralGust = (
  profile: WindProfile,
  releaseTime: number,
): ProceduralGust => {
  const age = Math.max(0, releaseTime - RELEASE_CONTACT_TIME)
  const cadence = mix(0.16, 0.31, seededValue(profile.seed, 20))
  const slowPhase = seededValue(profile.seed, 21) * 37
  const detailPhase = seededValue(profile.seed, 22) * 53
  const slow = valueNoise(age * cadence + slowPhase, (profile.seed % 211) + 83)
  const detail = valueNoise(
    age * cadence * mix(1.7, 2.35, seededValue(profile.seed, 23)) + detailPhase,
    (profile.seed % 257) + 107,
  )
  const gustSignal = slow * 0.72 + detail * 0.28
  const threshold = mix(0.3, 0.44, seededValue(profile.seed, 24))
  const activity = smoothstep(threshold, 0.84, gustSignal)
  const direction = valueNoise(
    age * cadence * 0.48 + seededValue(profile.seed, 25) * 29,
    (profile.seed % 293) + 131,
  )
  const verticalSignal =
    valueNoise(
      age * cadence * 0.73 + seededValue(profile.seed, 26) * 41,
      (profile.seed % 331) + 151,
    ) *
      2 -
    1
  const depthSignal =
    valueNoise(
      age * cadence * 0.57 + seededValue(profile.seed, 27) * 47,
      (profile.seed % 367) + 173,
    ) *
      2 -
    1
  const strength = mix(0.82, 1.18, clamp(profile.strength / 1.4, 0, 1))
  const gustStrength = 0.16 + activity * strength

  return {
    activity,
    horizontal:
      (28 + gustStrength * 650) * mix(0.72, 1.2, direction),
    vertical: verticalSignal * (48 + activity * 300) * strength,
    depth:
      (depthSignal * (15 + activity * 48) +
        (seededValue(profile.seed, 28) * 2 - 1) * activity * 16) *
      strength,
    turbulence: 52 + activity * 300 * profile.flutter,
  }
}

const catches: readonly { name: WindCatch; x: number; y: number }[] = [
  { name: 'upper-left-corner', x: 0.04, y: 0.06 },
  { name: 'lower-left-corner', x: 0.05, y: 0.94 },
  { name: 'left-edge', x: 0.03, y: 0.5 },
  { name: 'lower-right-corner', x: 0.94, y: 0.92 },
]

export const createReleasePlan = (seed: number): ReleasePlan => {
  const normalizedSeed = seed >>> 0
  const personality: WindPersonality =
    normalizedSeed % 3 === 0 ? 'hesitant' : normalizedSeed % 3 === 1 ? 'wandering' : 'decisive'
  const force = seededValue(normalizedSeed, 11)
  const texture = seededValue(normalizedSeed, 12)
  const catchChoice = catches[Math.floor(seededValue(normalizedSeed, 13) * catches.length)]

  const personalityBounds =
    personality === 'hesitant'
      ? {
          secondary: [0.72, 0.9] as const,
          lateral: [0.82, 0.98] as const,
          frequency: [2.4, 3.15] as const,
          amplitude: [0.5, 0.66] as const,
        }
      : personality === 'wandering'
        ? {
            secondary: [0.9, 1.08] as const,
            lateral: [1.12, 1.38] as const,
            frequency: [3.15, 4.2] as const,
            amplitude: [0.7, 0.9] as const,
          }
        : {
            secondary: [1.18, 1.4] as const,
            lateral: [1.02, 1.2] as const,
            frequency: [2.9, 3.8] as const,
            amplitude: [0.62, 0.8] as const,
          }

  return {
    personality,
    secondaryGustTime: RELEASE_CONTACT_TIME,
    secondaryGustStrength: mix(
      personalityBounds.secondary[0],
      personalityBounds.secondary[1],
      force,
    ),
    lateralAcceleration: mix(
      personalityBounds.lateral[0],
      personalityBounds.lateral[1],
      seededValue(normalizedSeed, 14),
    ),
    catch: catchChoice.name,
    catchX: catchChoice.x,
    catchY: catchChoice.y,
    flutterFrequency: mix(
      personalityBounds.frequency[0],
      personalityBounds.frequency[1],
      texture,
    ),
    flutterAmplitude: mix(
      personalityBounds.amplitude[0],
      personalityBounds.amplitude[1],
      seededValue(normalizedSeed, 15),
    ),
  }
}

export const createWindProfile = (seed: number): WindProfile => {
  const normalizedSeed = seed >>> 0
  const energy = seededValue(normalizedSeed, 1)
  const plan = createReleasePlan(normalizedSeed)
  return {
    seed: normalizedSeed,
    plan,
    energy,
    tempo: 1,
    strength: plan.secondaryGustStrength,
    flutter: 1 + plan.flutterAmplitude * 0.42,
    firstLift: 0.82 + seededValue(normalizedSeed, 3) * 0.22,
    phase: seededValue(normalizedSeed, 7) * TAU,
  }
}

export const sampleWindMoments = (
  profile: WindProfile,
  releaseTime: number,
): WindMoments => {
  const time = releaseTime
  const plan = profile.plan
  if (releaseTime > RELEASE_CONTACT_TIME) {
    const gust = sampleProceduralGust(profile, releaseTime)
    const handoff = smoothstep(
      RELEASE_CONTACT_TIME,
      RELEASE_CONTACT_TIME + 0.5,
      releaseTime,
    )
    const activity = gust.activity * handoff
    return {
      time,
      condensationAir: 0,
      restingFlutter: 0,
      firstLift: 0,
      actionFlutter: activity,
      groundedQuiet: 1 - activity,
      edgeCatch: activity * plan.flutterAmplitude,
    }
  }
  const condensationAir =
    smoothstep(0.36, 1.05, releaseTime) *
    (0.32 + smoothstep(1.45, 2.05, releaseTime) * 0.68) *
    (1 - smoothstep(2.55, 2.92, releaseTime))
  const restingFlutter = smoothstep(2.42, 2.72, releaseTime)
  const firstLift = pulse(
    plan.secondaryGustTime - 0.04,
    plan.secondaryGustTime + 0.18,
    plan.secondaryGustTime + 0.62,
    releaseTime,
  )

  return {
    time,
    condensationAir,
    restingFlutter,
    firstLift,
    actionFlutter: firstLift,
    groundedQuiet: smoothstep(2.05, 2.55, time),
    edgeCatch: firstLift * plan.flutterAmplitude,
  }
}

const makeMode = (
  wavelength: number,
  direction: readonly [number, number, number],
  potential: readonly [number, number, number],
  phase: number,
  speed: number,
  amplitude: number,
): FlowMode => {
  const scale = TAU / wavelength
  const kx = direction[0] * scale
  const ky = direction[1] * scale
  const kz = direction[2] * scale

  // curl(A sin(k·p + wt)) = (k × A) cos(k·p + wt).
  // The cross product makes every mode divergence-free, so nearby samples
  // circulate instead of collapsing into the same back-and-forth motion.
  const crossX = ky * potential[2] - kz * potential[1]
  const crossY = kz * potential[0] - kx * potential[2]
  const crossZ = kx * potential[1] - ky * potential[0]
  const crossLength = Math.hypot(crossX, crossY, crossZ) || 1

  return {
    kx,
    ky,
    kz,
    vx: crossX / crossLength,
    vy: crossY / crossLength,
    vz: crossZ / crossLength,
    phase,
    speed,
    amplitude,
  }
}

const flowModes: readonly FlowMode[] = [
  makeMode(620, [0.9, 0.22, 0.35], [0.15, 0.92, 0.38], 0.4, 0.33, 0.32),
  makeMode(340, [0.48, -0.8, 0.34], [0.74, 0.18, 0.64], 2.1, -0.57, 0.24),
  makeMode(205, [0.82, 0.44, -0.36], [0.22, 0.61, 0.76], 4.8, 0.91, 0.18),
  makeMode(118, [0.38, -0.52, 0.77], [0.88, 0.31, 0.18], 1.5, -1.37, 0.16),
  makeMode(72, [0.66, 0.71, 0.24], [0.12, 0.82, 0.56], 5.4, 2.03, 0.1),
]

export type WindPhase = 'reading' | 'release'

/** A scene-scale wind field. Paper, loose leaves, and deforming foliage can all
 * sample this same field while responding with their own material model. */
export class WindField {
  private readonly profile: WindProfile
  private readonly preHandoffProfile?: WindProfile
  private readonly ambientWind: AmbientWindField
  private readonly ambientSample: AmbientWindSample = { broad: 0, detail: 0 }

  constructor(
    profile: WindProfile,
    ambientWind = new AmbientWindField(profile.seed),
    preHandoffProfile?: WindProfile,
  ) {
    this.profile = profile
    this.preHandoffProfile = preHandoffProfile
    this.ambientWind = ambientWind
  }

  sample(
    x: number,
    y: number,
    z: number,
    time: number,
    phase: WindPhase,
    releaseTime: number,
    target: WindSample,
  ) {
    const profile =
      phase === 'release' &&
      releaseTime <= RELEASE_CONTACT_TIME &&
      this.preHandoffProfile
        ? this.preHandoffProfile
        : this.profile
    const moments = sampleWindMoments(profile, releaseTime)
    const ambientTime =
      phase === 'release' && releaseTime > RELEASE_CONTACT_TIME
        ? time
        : this.ambientWind.time()
    const ambient = this.ambientWind.sample(
      (x + z) * 0.002,
      ambientTime,
      this.ambientSample,
    )
    const slowGust = 0.93 + ambient.broad * 0.255
    const quickGust = 0.99 + ambient.detail * 0.15
    const condensationAir = phase === 'release' ? moments.condensationAir : 0
    const restingFlutter = phase === 'release' ? moments.restingFlutter : 0
    const firstLift = phase === 'release' ? moments.firstLift : 0
    const groundedQuiet = phase === 'release' ? moments.groundedQuiet : 0
    const strength = profile.strength
    const flutter = profile.flutter
    const plan = profile.plan
    const lateral = plan.lateralAcceleration
    const wanderingLift = plan.personality === 'wandering' ? 1.34 : 1
    const contactDrive =
      plan.personality === 'decisive' ? 1.55 : plan.personality === 'hesitant' ? 0.55 : 1
    let baseX =
      phase === 'reading'
        ? 6 * slowGust
        : (3 +
            condensationAir * 205 +
            firstLift * 620 * strength * lateral * contactDrive) *
          slowGust
    let baseY =
      phase === 'reading'
        ? 1.8 * flutter
        : 0.4 +
          restingFlutter * 3.4 * flutter +
          firstLift * 20 * profile.firstLift * wanderingLift * strength
    let baseZ =
      phase === 'reading'
        ? 14 * flutter
        : 7 * (1 - groundedQuiet) +
          condensationAir * 116 +
          restingFlutter * 30 * flutter +
          firstLift * 160 * flutter * wanderingLift * strength
    let turbulenceBase =
      phase === 'reading' ? 92 * flutter : 84 - groundedQuiet * 70
    let turbulence =
      (turbulenceBase +
        condensationAir * 138 +
        restingFlutter * 42 * flutter +
        firstLift * 168 * flutter * wanderingLift * strength) *
      slowGust *
      quickGust

    if (phase === 'release' && releaseTime > RELEASE_CONTACT_TIME) {
      const gust = sampleProceduralGust(profile, releaseTime)
      const handoff = smoothstep(
        RELEASE_CONTACT_TIME,
        RELEASE_CONTACT_TIME + 0.5,
        releaseTime,
      )
      baseX = mix(3, gust.horizontal, handoff) * slowGust
      baseY = mix(0.4, gust.vertical, handoff)
      baseZ = mix(0, gust.depth, handoff)
      turbulenceBase = mix(14, gust.turbulence, handoff)
      turbulence = turbulenceBase * slowGust * quickGust
    }

    let windX = baseX
    let windY = baseY
    let windZ = baseZ

    for (const mode of flowModes) {
      const wave = Math.cos(
        mode.kx * x +
          mode.ky * y +
          mode.kz * z +
          mode.phase +
          profile.phase * (0.35 + mode.amplitude) +
          time * mode.speed,
      )
      const contribution = turbulence * mode.amplitude * wave
      windX += mode.vx * contribution
      windY += mode.vy * contribution
      windZ += mode.vz * contribution
    }

    target.x = windX
    target.y = windY
    target.z = windZ
    return target
  }
}

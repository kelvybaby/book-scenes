export type WindSample = {
  x: number
  y: number
  z: number
}

export type WindProfile = {
  seed: number
  energy: number
  tempo: number
  strength: number
  flutter: number
  firstLift: number
  exitStart: number
  lullDepth: number
  lateFrequency: number
  phase: number
}

export type WindMoments = {
  time: number
  condensationAir: number
  restingFlutter: number
  firstLift: number
  exitAttack: number
  exitSecond: number
  exitTail: number
  midLull: number
  latePulse: number
  actionFlutter: number
  finalSweep: number
  groundedQuiet: number
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

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const progress = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1)
  return progress * progress * (3 - 2 * progress)
}

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

export const createWindProfile = (seed: number): WindProfile => {
  const energy = seededValue(seed, 1)
  return {
    seed,
    energy,
    tempo: 0.9 + energy * 0.32,
    strength: 0.82 + energy * 0.65,
    flutter: 1 + seededValue(seed, 2) * 0.72,
    firstLift: 0.78 + seededValue(seed, 3) * 0.5,
    exitStart: 4.12 - energy * 0.34 + seededValue(seed, 4) * 0.13,
    lullDepth: (1 - energy) * (0.72 + seededValue(seed, 5) * 0.24),
    lateFrequency: 2.25 + seededValue(seed, 6) * 1.9,
    phase: seededValue(seed, 7) * TAU,
  }
}

export const sampleWindMoments = (
  profile: WindProfile,
  releaseTime: number,
): WindMoments => {
  const time =
    releaseTime <= 2.65
      ? releaseTime
      : 2.65 + (releaseTime - 2.65) * profile.tempo
  const exitStart = profile.exitStart
  const condensationAir =
    smoothstep(0.36, 1.05, releaseTime) *
    (0.32 + smoothstep(1.45, 2.05, releaseTime) * 0.68) *
    (1 - smoothstep(2.55, 2.92, releaseTime))
  const restingFlutter =
    smoothstep(2.42, 2.72, releaseTime) *
    (1 - smoothstep(exitStart - 0.28, exitStart, time))
  const firstLift = pulse(3.3, 3.58, 4, releaseTime)
  const exitAttack = pulse(exitStart, exitStart + 0.3, exitStart + 0.74, time)
  const exitSecond = pulse(exitStart + 0.48, exitStart + 0.86, exitStart + 1.28, time)
  const exitTail = pulse(exitStart + 1.02, exitStart + 1.46, exitStart + 1.98, time)
  const midLull =
    pulse(exitStart + 0.7, exitStart + 1.12, exitStart + 1.7, time) * profile.lullDepth
  const lateEnvelope = smoothstep(exitStart + 1.58, exitStart + 2.05, time)
  const lateWave = Math.max(
    0,
    Math.sin((time - exitStart) * profile.lateFrequency + profile.phase),
  )
  const lateNoise = 0.72 + valueNoise(time * 0.61, (profile.seed % 71) + 17) * 0.28
  const latePulse = lateEnvelope * (0.18 + lateWave * lateWave * 0.82) * lateNoise
  const actionFlutter = Math.max(firstLift, exitAttack, exitSecond, exitTail, latePulse)

  return {
    time,
    condensationAir,
    restingFlutter,
    firstLift,
    exitAttack,
    exitSecond,
    exitTail,
    midLull,
    latePulse,
    actionFlutter,
    finalSweep: smoothstep(exitStart - 0.05, exitStart + 0.34, time),
    groundedQuiet: smoothstep(2.05, 2.55, time),
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

/** A scene-scale wind field. Paper, loose leaves, and hinged foliage can all
 * sample this same field while responding with their own material model. */
export class WindField {
  private readonly profile: WindProfile

  constructor(profile: WindProfile) {
    this.profile = profile
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
    const moments = sampleWindMoments(this.profile, releaseTime)
    const slowGust =
      0.7 + valueNoise(time * 0.19, (this.profile.seed % 47) + 4) * 0.46
    const quickGust =
      0.84 + valueNoise(time * 0.79, (this.profile.seed % 83) + 11) * 0.3
    const condensationAir = phase === 'release' ? moments.condensationAir : 0
    const restingFlutter = phase === 'release' ? moments.restingFlutter : 0
    const firstLift = phase === 'release' ? moments.firstLift : 0
    const exitAttack = phase === 'release' ? moments.exitAttack : 0
    const exitSecond = phase === 'release' ? moments.exitSecond : 0
    const exitTail = phase === 'release' ? moments.exitTail : 0
    const midLull = phase === 'release' ? moments.midLull : 0
    const latePulse = phase === 'release' ? moments.latePulse : 0
    const groundedQuiet = phase === 'release' ? moments.groundedQuiet : 0
    const strength = this.profile.strength
    const flutter = this.profile.flutter
    const lullDrive = 1 - midLull * 0.88
    const lullTurbulence = 1 - midLull * 0.52
    const baseX =
      phase === 'reading'
        ? 6 * slowGust
        : (3 +
            condensationAir * (140 + strength * 70) +
            firstLift * (38 + (strength - 0.86) * 150) +
            exitAttack * 620 * lullDrive +
            exitSecond * 830 * lullDrive +
            exitTail * 940 * lullDrive +
            latePulse * 1080) *
          slowGust *
          strength
    const baseY =
      phase === 'reading'
        ? 1.8 * flutter
        : 0.4 +
          restingFlutter * 3.4 * flutter +
          firstLift * 22 * this.profile.firstLift +
          exitAttack * 50 * lullDrive +
          exitSecond * 26 * lullDrive +
          exitTail * 16 * lullDrive +
          latePulse * 12
    const baseZ =
      phase === 'reading'
        ? 14 * flutter
        : 7 * (1 - groundedQuiet) +
          condensationAir * 120 +
          restingFlutter * 30 * flutter +
          firstLift * 190 * flutter +
          exitAttack * 215 * flutter * lullTurbulence +
          exitSecond * 275 * flutter * lullTurbulence +
          exitTail * 225 * flutter * lullTurbulence +
          latePulse * 250 * flutter
    const turbulenceBase =
      phase === 'reading' ? 92 * flutter : 84 - groundedQuiet * 70
    const turbulence =
      (turbulenceBase +
        condensationAir * 145 +
        restingFlutter * 42 * flutter +
        firstLift * 195 * flutter +
        exitAttack * 265 * flutter * lullTurbulence +
        exitSecond * 320 * flutter * lullTurbulence +
        exitTail * 290 * flutter * lullTurbulence +
        latePulse * 330 * flutter) *
      slowGust *
      quickGust

    let windX = baseX
    let windY = baseY
    let windZ = baseZ

    for (const mode of flowModes) {
      const wave = Math.cos(
        mode.kx * x +
          mode.ky * y +
          mode.kz * z +
          mode.phase +
          this.profile.phase * (0.35 + mode.amplitude) +
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

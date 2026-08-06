import {
  createWindProfile,
  sampleWindMoments,
  WindField,
  type WindPhase,
  type WindProfile,
  type WindSample,
} from './WindField'

type Constraint = {
  a: number
  b: number
  restDx: number
  restDy: number
  restDz: number
  compliance: number
  lambda: number
}

type Triangle = readonly [number, number, number]

export type PaperEnvironment = {
  targetWidth: number
  targetHeight: number
  groundY: number
  groundSlopeX: number
  groundSlopeZ: number
}

export type PaperMotionState = {
  releaseTime: number
  condensation: number
  contactRatio: number
  averageX: number
  averageY: number
  averageZ: number
  width: number
  height: number
}

const FIXED_STEP = 1 / 120
const SOLVER_ITERATIONS = 7

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

export class PaperSheet {
  readonly positions: Float32Array
  readonly previous: Float32Array
  readonly rest: Float32Array
  readonly segmentsX: number
  readonly segmentsY: number

  private readonly constraints: Constraint[] = []
  private readonly triangles: Triangle[] = []
  private readonly acceleration: Float32Array
  private readonly profile: WindProfile
  private readonly wind: WindField
  private readonly windSample: WindSample = { x: 0, y: 0, z: 0 }
  private readonly initialWidth: number
  private readonly initialHeight: number
  private environment: PaperEnvironment
  private accumulator = 0
  private simulationTime = 0
  private releaseTime = 0
  private phase: WindPhase = 'reading'
  private contactCount = 0

  constructor(
    width: number,
    height: number,
    environment: PaperEnvironment,
    seed: number,
    segmentsX = 18,
    segmentsY = 14,
  ) {
    this.profile = createWindProfile(seed)
    this.wind = new WindField(this.profile)
    this.initialWidth = width
    this.initialHeight = height
    this.environment = environment
    this.segmentsX = segmentsX
    this.segmentsY = segmentsY
    const vertexCount = (segmentsX + 1) * (segmentsY + 1)
    this.positions = new Float32Array(vertexCount * 3)
    this.previous = new Float32Array(vertexCount * 3)
    this.rest = new Float32Array(vertexCount * 3)
    this.acceleration = new Float32Array(vertexCount * 3)

    for (let row = 0; row <= segmentsY; row += 1) {
      for (let column = 0; column <= segmentsX; column += 1) {
        const vertex = this.index(column, row)
        const offset = vertex * 3
        const x = (column / segmentsX - 0.5) * width
        const y = (0.5 - row / segmentsY) * height
        const seedCurve =
          Math.sin((column / segmentsX) * Math.PI + this.profile.phase * 0.13) *
          Math.sin((row / segmentsY) * Math.PI * 2 + this.profile.phase) *
          (1.55 + (this.profile.flutter - 1) * 1.8)
        this.positions[offset] = x
        this.positions[offset + 1] = y
        this.positions[offset + 2] = seedCurve
        this.previous[offset] = x
        this.previous[offset + 1] = y
        this.previous[offset + 2] = seedCurve
        this.rest[offset] = x
        this.rest[offset + 1] = y
        this.rest[offset + 2] = 0
      }
    }

    for (let row = 0; row <= segmentsY; row += 1) {
      for (let column = 0; column <= segmentsX; column += 1) {
        if (column < segmentsX) this.addConstraint(column, row, column + 1, row, 0.000008)
        if (row < segmentsY) this.addConstraint(column, row, column, row + 1, 0.000008)
        if (column < segmentsX && row < segmentsY) {
          this.addConstraint(column, row, column + 1, row + 1, 0.000045)
          this.addConstraint(column + 1, row, column, row + 1, 0.000045)
          const a = this.index(column, row)
          const b = this.index(column + 1, row)
          const c = this.index(column, row + 1)
          const d = this.index(column + 1, row + 1)
          this.triangles.push([a, c, b], [b, c, d])
        }
        if (column < segmentsX - 1) this.addConstraint(column, row, column + 2, row, 0.0022)
        if (row < segmentsY - 1) this.addConstraint(column, row, column, row + 2, 0.0022)
      }
    }
  }

  setEnvironment(environment: PaperEnvironment) {
    this.environment = environment
  }

  beginRelease() {
    this.phase = 'release'
    this.releaseTime = 0
  }

  advance(delta: number) {
    const safeDelta = Math.min(delta, 1 / 20)
    this.accumulator += safeDelta

    while (this.accumulator >= FIXED_STEP) {
      this.step(FIXED_STEP)
      this.accumulator -= FIXED_STEP
    }
  }

  getGroundHeight(x: number, z: number) {
    return (
      this.environment.groundY +
      x * this.environment.groundSlopeX +
      z * this.environment.groundSlopeZ
    )
  }

  getMotionState(): PaperMotionState {
    const vertexCount = this.positions.length / 3
    let minimumX = Number.POSITIVE_INFINITY
    let maximumX = Number.NEGATIVE_INFINITY
    let minimumY = Number.POSITIVE_INFINITY
    let maximumY = Number.NEGATIVE_INFINITY
    let totalX = 0
    let totalY = 0
    let totalZ = 0

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      const x = this.positions[offset]
      const y = this.positions[offset + 1]
      minimumX = Math.min(minimumX, x)
      maximumX = Math.max(maximumX, x)
      minimumY = Math.min(minimumY, y)
      maximumY = Math.max(maximumY, y)
      totalX += x
      totalY += y
      totalZ += this.positions[offset + 2]
    }

    return {
      releaseTime: this.releaseTime,
      condensation:
        this.phase === 'release' ? smoothstep(0, 1.95, this.releaseTime) : 0,
      contactRatio: this.contactCount / vertexCount,
      averageX: totalX / vertexCount,
      averageY: totalY / vertexCount,
      averageZ: totalZ / vertexCount,
      width: maximumX - minimumX,
      height: maximumY - minimumY,
    }
  }

  isBeyond(rightBoundary: number) {
    let leftmost = Number.POSITIVE_INFINITY
    for (let vertex = 0; vertex < this.positions.length / 3; vertex += 1) {
      leftmost = Math.min(leftmost, this.positions[vertex * 3])
    }
    return this.phase === 'release' && leftmost > rightBoundary
  }

  private index(column: number, row: number) {
    return row * (this.segmentsX + 1) + column
  }

  private addConstraint(
    columnA: number,
    rowA: number,
    columnB: number,
    rowB: number,
    compliance: number,
  ) {
    const a = this.index(columnA, rowA)
    const b = this.index(columnB, rowB)
    const offsetA = a * 3
    const offsetB = b * 3
    this.constraints.push({
      a,
      b,
      restDx: this.rest[offsetB] - this.rest[offsetA],
      restDy: this.rest[offsetB + 1] - this.rest[offsetA + 1],
      restDz: this.rest[offsetB + 2] - this.rest[offsetA + 2],
      compliance,
      lambda: 0,
    })
  }

  private step(delta: number) {
    this.simulationTime += delta
    if (this.phase === 'release') this.releaseTime += delta
    this.acceleration.fill(0)
    this.addAerodynamicForces(delta)
    this.addReleaseGuidance(delta)
    this.integrate(delta)

    this.contactCount = 0
    for (const constraint of this.constraints) constraint.lambda = 0
    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
      for (const constraint of this.constraints) this.solveConstraint(constraint, delta)
      this.applyReadingTethers(delta)
      if (this.phase === 'release' && this.releaseTime > 1.24) {
        this.applySettlingPose()
        this.solveGroundContact(iteration === SOLVER_ITERATIONS - 1)
      }
    }
  }

  private currentScale() {
    const progress = this.phase === 'release' ? smoothstep(0, 1.95, this.releaseTime) : 0
    return {
      x: mix(1, this.environment.targetWidth / this.initialWidth, progress),
      y: mix(1, this.environment.targetHeight / this.initialHeight, progress),
    }
  }

  private addAerodynamicForces(delta: number) {
    const moments = sampleWindMoments(this.profile, this.releaseTime)
    const releaseStrength = this.phase === 'release' ? smoothstep(0.2, 1.8, moments.time) : 0
    const finalSweep = this.phase === 'release' ? moments.finalSweep : 0
    const actionFlutter = this.phase === 'release' ? moments.actionFlutter : 0
    const condensationAir = this.phase === 'release' ? moments.condensationAir : 0
    const aerodynamicActivity = Math.max(actionFlutter, condensationAir)
    const normalCoefficient =
      0.000052 +
      releaseStrength * 0.000055 +
      aerodynamicActivity * 0.00012 * this.profile.flutter
    const tangentialDrag =
      0.16 +
      releaseStrength * 0.14 +
      condensationAir * 1.05 +
      finalSweep * (0.72 + this.profile.strength * 0.12)

    for (const [a, b, c] of this.triangles) {
      const ia = a * 3
      const ib = b * 3
      const ic = c * 3
      const abx = this.positions[ib] - this.positions[ia]
      const aby = this.positions[ib + 1] - this.positions[ia + 1]
      const abz = this.positions[ib + 2] - this.positions[ia + 2]
      const acx = this.positions[ic] - this.positions[ia]
      const acy = this.positions[ic + 1] - this.positions[ia + 1]
      const acz = this.positions[ic + 2] - this.positions[ia + 2]
      const crossX = aby * acz - abz * acy
      const crossY = abz * acx - abx * acz
      const crossZ = abx * acy - aby * acx
      const doubleArea = Math.hypot(crossX, crossY, crossZ)
      if (doubleArea < 0.0001) continue

      const nx = crossX / doubleArea
      const ny = crossY / doubleArea
      const nz = crossZ / doubleArea
      const centerX = (this.positions[ia] + this.positions[ib] + this.positions[ic]) / 3
      const centerY = (this.positions[ia + 1] + this.positions[ib + 1] + this.positions[ic + 1]) / 3
      const centerZ = (this.positions[ia + 2] + this.positions[ib + 2] + this.positions[ic + 2]) / 3
      const wind = this.wind.sample(
        centerX,
        centerY,
        centerZ,
        this.simulationTime,
        this.phase,
        this.releaseTime,
        this.windSample,
      )
      const velocityX =
        ((this.positions[ia] - this.previous[ia]) +
          (this.positions[ib] - this.previous[ib]) +
          (this.positions[ic] - this.previous[ic])) /
        (3 * delta)
      const velocityY =
        ((this.positions[ia + 1] - this.previous[ia + 1]) +
          (this.positions[ib + 1] - this.previous[ib + 1]) +
          (this.positions[ic + 1] - this.previous[ic + 1])) /
        (3 * delta)
      const velocityZ =
        ((this.positions[ia + 2] - this.previous[ia + 2]) +
          (this.positions[ib + 2] - this.previous[ib + 2]) +
          (this.positions[ic + 2] - this.previous[ic + 2])) /
        (3 * delta)
      const relativeX = wind.x - velocityX
      const relativeY = wind.y - velocityY
      const relativeZ = wind.z - velocityZ
      const normalSpeed = relativeX * nx + relativeY * ny + relativeZ * nz
      const area = doubleArea * 0.5
      const pressure = normalSpeed * Math.abs(normalSpeed) * area * normalCoefficient
      const forceX = nx * pressure + relativeX * tangentialDrag
      const forceY = ny * pressure + relativeY * tangentialDrag
      const forceZ = nz * pressure + relativeZ * tangentialDrag

      for (const offset of [ia, ib, ic]) {
        this.acceleration[offset] += forceX / 3
        this.acceleration[offset + 1] += forceY / 3
        this.acceleration[offset + 2] += forceZ / 3
      }
    }
  }

  private addReleaseGuidance(delta: number) {
    if (this.phase !== 'release') return
    const state = this.getMotionState()
    const moments = sampleWindMoments(this.profile, this.releaseTime)
    const settlingTime = this.releaseTime
    const handoffHold = 1 - smoothstep(0.42, 0.82, settlingTime)
    const fallGuide =
      smoothstep(0.55, 1.9, settlingTime) *
      (1 - smoothstep(2.95, 3.25, settlingTime))
    const settlingTurn =
      smoothstep(1.82, 2.2, settlingTime) *
      (1 - smoothstep(2.78, 3.08, settlingTime))
    const actionFlutter = moments.actionFlutter
    const finalSweep = moments.finalSweep
    const landingCenterY = this.environment.groundY + this.environment.targetHeight * 0.44
    const targetScale = this.currentScale()
    const vertexCount = this.positions.length / 3
    const roadHold = smoothstep(2.45, 3.25, settlingTime)
    let averageVelocityY = 0
    let averageVelocityZ = 0

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      averageVelocityY += (this.positions[offset + 1] - this.previous[offset + 1]) / delta
      averageVelocityZ += (this.positions[offset + 2] - this.previous[offset + 2]) / delta
    }
    averageVelocityY /= vertexCount
    averageVelocityZ /= vertexCount

    const centerGround = this.getGroundHeight(state.averageX, state.averageZ)
    const centerClearance = state.averageY - centerGround
    const nearRoad =
      1 -
      smoothstep(
        this.environment.targetHeight * 0.65,
        this.environment.targetHeight * 1.1,
        centerClearance,
      )
    const liftCeiling = this.environment.targetHeight * (0.18 + actionFlutter * 0.04)
    const excessLift = Math.max(0, centerClearance - liftCeiling)
    const ceilingApproach = smoothstep(liftCeiling * 0.72, liftCeiling, centerClearance)
    const roadLiftCorrection =
      (-excessLift * 32 - Math.max(0, averageVelocityY) * 4.5 * ceilingApproach) *
      roadHold *
      nearRoad
    const roadDepthCorrection =
      (-state.averageZ * 4.2 - averageVelocityZ * 2.8) * roadHold

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      const row = Math.floor(vertex / (this.segmentsX + 1))
      const column = vertex % (this.segmentsX + 1)
      const normalizedX = column / this.segmentsX
      const normalizedY = row / this.segmentsY
      const surface =
        this.positions[offset + 1] - this.getGroundHeight(this.positions[offset], this.positions[offset + 2])

      this.acceleration[offset] += -state.averageX * 0.34 * handoffHold
      this.acceleration[offset + 1] += roadLiftCorrection
      this.acceleration[offset + 2] += -state.averageZ * 2.4 * handoffHold + roadDepthCorrection
      this.acceleration[offset + 1] += (landingCenterY - state.averageY) * 8 * fallGuide
      this.acceleration[offset + 2] +=
        (-this.environment.targetHeight * 0.16 - state.averageZ) * 2.1 * settlingTurn
      this.acceleration[offset + 2] -= Math.pow(1 - normalizedY, 1.35) * 118 * settlingTurn
      this.acceleration[offset + 1] -= Math.pow(1 - normalizedY, 1.7) * 18 * settlingTurn

      const cornerLead = (1 - normalizedX) * normalizedY
      this.acceleration[offset + 1] -=
        cornerLead * smoothstep(0.55, 1.7, settlingTime) * 7.5

      // The last gust skims the road rather than lofting the leaf through the
      // doorway. It can still curl and detach, but its centre stays only a few
      // centimetres above the projected ground plane.
      if (finalSweep > 0 && surface > 30) {
        this.acceleration[offset + 1] -= (surface - 30) * 8.5 * finalSweep
      }

      if (settlingTime < 2.1) {
        const restX = this.rest[offset] * targetScale.x
        const restY = this.rest[offset + 1] * targetScale.y
        this.acceleration[offset + 2] +=
          Math.sin(normalizedX * Math.PI * 1.4 + normalizedY * 5.2 + this.simulationTime * 3.1) *
          smoothstep(0.25, 1.8, this.releaseTime) *
          9
        this.acceleration[offset] += (restX - (this.positions[offset] - state.averageX)) * 0.035
        this.acceleration[offset + 1] +=
          (restY - (this.positions[offset + 1] - state.averageY)) * 0.022
      }
    }

    void delta
  }

  private integrate(delta: number) {
    const moments = sampleWindMoments(this.profile, this.releaseTime)
    const finalSweep = this.phase === 'release' ? moments.finalSweep : 0
    const midLull = this.phase === 'release' ? moments.midLull : 0
    const damping =
      this.phase === 'reading' ? 0.986 : 0.981 + finalSweep * 0.012 - midLull * 0.018
    const deltaSquared = delta * delta
    const vertexCount = this.positions.length / 3
    const maximumSpeed =
      this.phase === 'reading' ? 55 : 145 + finalSweep * 720 * this.profile.strength
    const gravity =
      this.phase === 'reading'
        ? 8.5
        : mix(17.2, 95, smoothstep(0.48, 0.92, this.releaseTime)) + midLull * 8

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      let velocityX = (this.positions[offset] - this.previous[offset]) * damping
      let velocityY = (this.positions[offset + 1] - this.previous[offset + 1]) * damping
      let velocityZ = (this.positions[offset + 2] - this.previous[offset + 2]) * damping
      const speed = Math.hypot(velocityX, velocityY, velocityZ) / delta
      if (speed > maximumSpeed) {
        const speedScale = maximumSpeed / speed
        velocityX *= speedScale
        velocityY *= speedScale
        velocityZ *= speedScale
      }
      this.previous[offset] = this.positions[offset]
      this.previous[offset + 1] = this.positions[offset + 1]
      this.previous[offset + 2] = this.positions[offset + 2]
      this.positions[offset] += velocityX + this.acceleration[offset] * deltaSquared
      this.positions[offset + 1] +=
        velocityY + (this.acceleration[offset + 1] - gravity) * deltaSquared
      this.positions[offset + 2] += velocityZ + this.acceleration[offset + 2] * deltaSquared
    }
  }

  private solveConstraint(constraint: Constraint, delta: number) {
    const offsetA = constraint.a * 3
    const offsetB = constraint.b * 3
    const dx = this.positions[offsetB] - this.positions[offsetA]
    const dy = this.positions[offsetB + 1] - this.positions[offsetA + 1]
    const dz = this.positions[offsetB + 2] - this.positions[offsetA + 2]
    const length = Math.hypot(dx, dy, dz)
    if (length < 0.0001) return

    const scale = this.currentScale()
    const targetLength = Math.hypot(
      constraint.restDx * scale.x,
      constraint.restDy * scale.y,
      constraint.restDz,
    )
    const moments = sampleWindMoments(this.profile, this.releaseTime)
    const aerodynamicActivity =
      this.phase === 'release'
        ? Math.max(moments.actionFlutter, moments.condensationAir * 0.9)
        : 0
    const bendFlex =
      constraint.compliance >= 0.002
        ? 1 + aerodynamicActivity * (2.8 + (this.profile.flutter - 1) * 2.5)
        : 1
    const alpha = (constraint.compliance * bendFlex) / (delta * delta)
    const value = length - targetLength
    const deltaLambda = (-value - alpha * constraint.lambda) / (2 + alpha)
    constraint.lambda += deltaLambda
    const correction = deltaLambda / length
    const correctionX = dx * correction
    const correctionY = dy * correction
    const correctionZ = dz * correction
    this.positions[offsetA] -= correctionX
    this.positions[offsetA + 1] -= correctionY
    this.positions[offsetA + 2] -= correctionZ
    this.positions[offsetB] += correctionX
    this.positions[offsetB + 1] += correctionY
    this.positions[offsetB + 2] += correctionZ
  }

  private applyReadingTethers(delta: number) {
    const vertexCount = this.positions.length / 3
    const globalHold =
      this.phase === 'reading' ? 0.0035 : 0.0035 * (1 - smoothstep(0.05, 0.38, this.releaseTime))

    if (globalHold <= 0) return
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      const iterationScale = delta * 8
      this.positions[offset] +=
        (this.rest[offset] - this.positions[offset]) * globalHold * iterationScale
      this.positions[offset + 1] +=
        (this.rest[offset + 1] - this.positions[offset + 1]) * globalHold * iterationScale
      this.positions[offset + 2] +=
        (this.rest[offset + 2] - this.positions[offset + 2]) * globalHold * iterationScale
    }
  }

  private solveGroundContact(countContact: boolean) {
    const vertexCount = this.positions.length / 3
    const normalX = -this.environment.groundSlopeX
    const normalY = 1
    const normalZ = -this.environment.groundSlopeZ
    const normalLength = Math.hypot(normalX, normalY, normalZ)
    const nx = normalX / normalLength
    const ny = normalY / normalLength
    const nz = normalZ / normalLength
    const finalSweep = sampleWindMoments(this.profile, this.releaseTime).finalSweep

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      const x = this.positions[offset]
      const y = this.positions[offset + 1]
      const z = this.positions[offset + 2]
      const ground = this.getGroundHeight(x, z)
      const signedDistance = (y - ground) / normalLength
      if (signedDistance > 1.2) continue

      if (signedDistance < 0) {
        const correction = -signedDistance
        this.positions[offset] += nx * correction
        this.positions[offset + 1] += ny * correction
        this.positions[offset + 2] += nz * correction
      }

      const velocityX = this.positions[offset] - this.previous[offset]
      const velocityY = this.positions[offset + 1] - this.previous[offset + 1]
      const velocityZ = this.positions[offset + 2] - this.previous[offset + 2]
      const normalVelocity = velocityX * nx + velocityY * ny + velocityZ * nz
      if (normalVelocity < 0) {
        this.previous[offset] += nx * normalVelocity * 0.91
        this.previous[offset + 1] += ny * normalVelocity * 0.91
        this.previous[offset + 2] += nz * normalVelocity * 0.91
      }

      const friction = mix(0.72, 0.18, finalSweep)
      this.previous[offset] = this.positions[offset] - velocityX * (1 - friction)
      this.previous[offset + 2] = this.positions[offset + 2] - velocityZ * (1 - friction)
      if (countContact) this.contactCount += 1
    }
  }

  private applySettlingPose() {
    const settling =
      smoothstep(2.22, 2.78, this.releaseTime) *
      (1 - smoothstep(3.25, 3.5, this.releaseTime))
    if (settling <= 0) return

    const state = this.getMotionState()
    const centerGround = this.getGroundHeight(state.averageX, state.averageZ)
    if (state.averageY - centerGround > this.environment.targetHeight * 1.1) return
    const scale = this.currentScale()
    const vertexCount = this.positions.length / 3
    const blend = settling * 0.032

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      const row = Math.floor(vertex / (this.segmentsX + 1))
      const column = vertex % (this.segmentsX + 1)
      const normalizedX = column / this.segmentsX
      const normalizedY = row / this.segmentsY
      const edgeDistance = Math.min(normalizedX, 1 - normalizedX, normalizedY, 1 - normalizedY)
      const edgeCurl = (1 - smoothstep(0, 0.17, edgeDistance)) * 1.7
      const targetX = state.averageX + this.rest[offset] * scale.x
      const targetZ = -this.rest[offset + 1] * scale.y * 0.94
      const targetY =
        this.getGroundHeight(targetX, targetZ) +
        0.42 +
        edgeCurl * (0.56 + Math.sin(normalizedX * 5.1 + normalizedY * 3.7) * 0.16)

      this.positions[offset] += (targetX - this.positions[offset]) * blend
      this.positions[offset + 1] += (targetY - this.positions[offset + 1]) * blend
      this.positions[offset + 2] += (targetZ - this.positions[offset + 2]) * blend
    }
  }
}

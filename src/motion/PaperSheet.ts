import {
  createWindProfile,
  RELEASE_CONTACT_TIME,
  sampleWindMoments,
  WindField,
  type WindPhase,
  type WindProfile,
  type WindSample,
} from './WindField'
import type { AmbientWindField } from './AmbientWindField'

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
  pageScreenX: number
  pageScreenY: number
  cameraDistance: number
  roadTopY: (screenX: number) => number
  roadBottomY: (screenX: number) => number
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
  normalZ: number
  velocityX: number
  velocityY: number
  velocityZ: number
}

export type PaperReleaseMotionTuning = {
  horizontalWindScale: number
  horizontalDrag: number
  depthWindScale?: number
  depthDrag?: number
  verticalWindScale?: number
  verticalDrag?: number
  preserveScriptedVelocity?: boolean
  contactSolverProvidesSupport?: boolean
  preserveRoadContactPosition?: boolean
  perVertexGroundContact?: boolean
  aerodynamicAreaReferenceHeight?: number
  edgeOnStabilityStrength?: number
  edgeOnStabilityDamping?: number
  handoffForceRampDuration?: number
  handoffShapeRampDuration?: number
}

const FIXED_STEP = 1 / 120
const SOLVER_ITERATIONS = 7
const BEND_COMPLIANCE = 0.0000000
export const PAPER_CONDENSE_END = 1.95
const DESCENT_START = 1.45
const DESCENT_END = RELEASE_CONTACT_TIME
const WIND_HANDOFF = RELEASE_CONTACT_TIME
export const PAPER_ROAD_PITCH = -Math.PI * 0.44
export const PAPER_SCRIPTED_RELEASE_PITCH = -Math.PI * 0.38
const ROAD_CLEARANCE_PX = 10
const PER_VERTEX_CONTACT_SKIN = 0.08

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
  private readonly releasePose: Float32Array
  private readonly contactMask: Uint8Array
  private readonly profile: WindProfile
  private readonly wind: WindField
  private readonly releaseMotionTuning: PaperReleaseMotionTuning | null
  private readonly windSample: WindSample = { x: 0, y: 0, z: 0 }
  private readonly initialWidth: number
  private readonly initialHeight: number
  private environment: PaperEnvironment
  private accumulator = 0
  private simulationTime = 0
  private releaseTime = 0
  private phase: WindPhase = 'reading'
  private contactCount = 0
  private minimumRoadClearance = Number.POSITIVE_INFINITY
  private minimumRoadClearanceTime = 0
  private stabilityFacingSign = 1
  private preserveReleaseVelocityFrame = false

  constructor(
    width: number,
    height: number,
    environment: PaperEnvironment,
    seed: number,
    segmentsX = 18,
    segmentsY = 14,
    ambientWind?: AmbientWindField,
    releaseMotionTuning: PaperReleaseMotionTuning | null = null,
    windSeed = seed,
  ) {
    this.profile = createWindProfile(windSeed)
    this.wind = new WindField(this.profile, ambientWind)
    this.releaseMotionTuning = releaseMotionTuning
    this.stabilityFacingSign = Math.cos(this.profile.phase) < 0 ? -1 : 1
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
    this.releasePose = new Float32Array(vertexCount * 3)
    this.contactMask = new Uint8Array(vertexCount)

    const surfaceProfile = createWindProfile(seed)
    for (let row = 0; row <= segmentsY; row += 1) {
      for (let column = 0; column <= segmentsX; column += 1) {
        const vertex = this.index(column, row)
        const offset = vertex * 3
        const x = (column / segmentsX - 0.5) * width
        const y = (0.5 - row / segmentsY) * height
        const seedCurve =
          Math.sin((column / segmentsX) * Math.PI + surfaceProfile.phase * 0.13) *
          Math.sin((row / segmentsY) * Math.PI * 2 + surfaceProfile.phase) *
          (1.55 + (surfaceProfile.flutter - 1) * 1.8)
        this.positions[offset] = x
        this.positions[offset + 1] = y
        this.positions[offset + 2] = seedCurve
        this.previous[offset] = x
        this.previous[offset + 1] = y
        this.previous[offset + 2] = seedCurve
        this.rest[offset] = x
        this.rest[offset + 1] = y
        this.rest[offset + 2] = 0
        this.releasePose[offset] = x
        this.releasePose[offset + 1] = y
        // The released leaf begins as one flat page. Reading-state ripples do
        // not become stored creases when it leaves the enlarged passage view.
        this.releasePose[offset + 2] = 0
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
        if (column < segmentsX - 1) {
          this.addConstraint(column, row, column + 2, row, BEND_COMPLIANCE)
        }
        if (row < segmentsY - 1) {
          this.addConstraint(column, row, column, row + 2, BEND_COMPLIANCE)
        }
      }
    }
  }

  setEnvironment(environment: PaperEnvironment) {
    this.environment = environment
  }

  beginRelease(preserveCurrentState = false) {
    this.phase = 'release'
    this.releaseTime = 0
    this.accumulator = 0
    this.contactCount = 0
    this.minimumRoadClearance = Number.POSITIVE_INFINITY
    this.minimumRoadClearanceTime = 0
    if (preserveCurrentState) {
      // The feature solver begins from the live reading surface. Preserve both
      // vertex positions and Verlet history so the handoff carries its current
      // world pose and velocity instead of recreating a flat canonical sheet.
      this.releasePose.set(this.positions)
      this.preserveReleaseVelocityFrame = true
    } else {
      // The production fallback retains its established deterministic reset.
      this.positions.set(this.releasePose)
      this.previous.set(this.releasePose)
      this.preserveReleaseVelocityFrame = false
    }
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
    let totalVelocityX = 0
    let totalVelocityY = 0
    let totalVelocityZ = 0

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
      totalVelocityX += (x - this.previous[offset]) / FIXED_STEP
      totalVelocityY += (y - this.previous[offset + 1]) / FIXED_STEP
      totalVelocityZ += (this.positions[offset + 2] - this.previous[offset + 2]) / FIXED_STEP
    }

    const topLeft = this.index(0, 0) * 3
    const topRight = this.index(this.segmentsX, 0) * 3
    const bottomLeft = this.index(0, this.segmentsY) * 3
    const ux = this.positions[topRight] - this.positions[topLeft]
    const uy = this.positions[topRight + 1] - this.positions[topLeft + 1]
    const uz = this.positions[topRight + 2] - this.positions[topLeft + 2]
    const vx = this.positions[topLeft] - this.positions[bottomLeft]
    const vy = this.positions[topLeft + 1] - this.positions[bottomLeft + 1]
    const vz = this.positions[topLeft + 2] - this.positions[bottomLeft + 2]
    const normalX = uy * vz - uz * vy
    const normalY = uz * vx - ux * vz
    const normalZ = ux * vy - uy * vx
    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1

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
      normalZ: normalZ / normalLength,
      velocityX: totalVelocityX / vertexCount,
      velocityY: totalVelocityY / vertexCount,
      velocityZ: totalVelocityZ / vertexCount,
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

    // Keep the first descent out of the triangle-by-triangle wind solver. A
    // broadside falling leaf should move as one stiff sheet; only after it has
    // settled on the road can a gust start to detach and carry it.
    if (this.phase === 'release' && this.releaseTime <= WIND_HANDOFF) {
      this.applyScriptedDescent()
      return
    }

    this.acceleration.fill(0)
    this.addAerodynamicForces(delta)
    this.addEdgeOnStabilityTorque(delta)
    this.integrate(delta)

    this.contactCount = 0
    for (const constraint of this.constraints) constraint.lambda = 0
    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration += 1) {
      for (const constraint of this.constraints) this.solveConstraint(constraint, delta)
      this.applyReadingTethers(delta)
      if (this.phase === 'release' && this.releaseTime > 1.24) {
        this.solveGroundContact(
          this.releaseMotionTuning?.perVertexGroundContact
            ? false
            : iteration === SOLVER_ITERATIONS - 1,
        )
      }
    }

    if (this.phase === 'release') {
      this.applyRigidShape(delta)
      this.contactCount = 0
      if (this.releaseMotionTuning?.perVertexGroundContact) this.contactMask.fill(0)
      this.solveGroundContact(true)
      // The painted-road boundary is a ground-contact rule, not an aerial
      // flight cage. Once the gust lifts every vertex, the page is free to
      // rise, tumble, and cross the projected boundary naturally.
      if (this.contactCount > 0) {
        if (this.releaseMotionTuning?.perVertexGroundContact) {
          this.constrainContactVerticesToRoadCorridor()
          // A screen-space road-edge correction can move an individual corner
          // toward the sloped ground. Re-project only penetrating vertices;
          // never raise the page centre as a substitute for contact handling.
          this.solveGroundContact(false)
        } else {
          this.constrainToRoadCorridor()
        }
      }
      const roadClearance = this.getRoadClearance()
      if (roadClearance < this.minimumRoadClearance) {
        this.minimumRoadClearance = roadClearance
        this.minimumRoadClearanceTime = this.releaseTime
      }
    }
  }

  private applyScriptedDescent() {
    const scale = this.currentScale()
    const fallTime = clamp(
      (this.releaseTime - DESCENT_START) / (DESCENT_END - DESCENT_START),
      0,
      1,
    )
    // Retain a non-zero initial descent velocity. Blending mostly linear time
    // with a small smoothstep component avoids both a hard start and the
    // visible aerial pause produced by a fully eased trajectory.
    const fall = mix(fallTime, smoothstep(0, 1, fallTime), 0.35)
    const swingProgress = clamp((fallTime - 0.18) / 0.82, 0, 1)
    const airborne = Math.sin(swingProgress * Math.PI)
    const landingEase = smoothstep(0.78, 1, fall)
    const swingEnvelope =
      Math.pow(Math.max(airborne, 0), 0.52) * smoothstep(0.18, 0.24, fallTime)
    const swingPhase = swingProgress * Math.PI * 3.2
    const swingAmplitude =
      this.environment.targetWidth * mix(2.25, 1.2, fall) * swingEnvelope
    const sideSwing = -Math.sin(swingPhase) * swingAmplitude
    const centerX = fall * this.environment.targetWidth * 0.9 + sideSwing
    const centerZ =
      -fall * this.environment.targetHeight * 0.12 +
      Math.sin(fall * Math.PI * 2.6) * swingEnvelope * 1.4
    // Match the support height used by the rigid post-contact pose. Previously
    // the scripted descent placed the page centre on the ground, so the solver
    // had to lift the whole leaf on its first frame.
    // The prototype hands off at the scripted pitch, not yet at the shallower
    // road pitch. Give that exact pose enough clearance so the first contact
    // solve does not have to translate and rotate a partially embedded sheet.
    // Keep the production fallback's established support height unchanged.
    const landingPitch = this.releaseMotionTuning?.preserveScriptedVelocity
      ? PAPER_SCRIPTED_RELEASE_PITCH
      : PAPER_ROAD_PITCH
    const landingSupport =
      this.environment.targetHeight * Math.abs(Math.cos(landingPitch)) * 0.5 + 1.4
    const landingY = this.getGroundHeight(centerX, centerZ) + landingSupport
    const condensation = smoothstep(0, PAPER_CONDENSE_END, this.releaseTime)
    const condensedY = -this.environment.targetHeight * 2.3
    const descentOriginY = mix(0, condensedY, condensation)
    // Each lateral swing carries a shallow lift at its outer edge. This makes
    // the path read as a sequence of falling arcs instead of a flat sine wave
    // sliding down a constant vertical track.
    const arcLift =
      Math.pow(Math.abs(Math.sin(swingPhase)), 1.35) *
      this.environment.targetHeight *
      0.34 *
      swingEnvelope *
      (1 - landingEase)
    const centerY = mix(descentOriginY, landingY, fall) + arcLift
    // Reorient during the first falling beat, before the broad lateral swings.
    // The final few degrees settle only near contact so the page does not snap
    // mechanically into the road plane.
    const flattenProgress = smoothstep(0.01, 0.17, fallTime)
    const contactSettle = smoothstep(0.82, 1, fallTime)
    // Negative pitch brings the lower edge toward the camera while leaving the
    // upper edge farther away and slightly higher. Stop well short of 90deg so
    // the page reads as a shallow plane throughout the swinging descent.
    const pitch =
      mix(0, -Math.PI * 0.34, flattenProgress) +
      mix(0, PAPER_SCRIPTED_RELEASE_PITCH + Math.PI * 0.34, contactSettle)
    const roll =
      -Math.cos(swingPhase) * swingEnvelope * 0.085 *
      (1 - landingEase * 0.8)
    const cosinePitch = Math.cos(pitch)
    const sinePitch = Math.sin(pitch)
    const cosineRoll = Math.cos(roll)
    const sineRoll = Math.sin(roll)
    const rippleEnvelope =
      smoothstep(0.08, 0.32, fall) * (1 - smoothstep(0.8, 1, fall))
    const rippleAmplitude = rippleEnvelope * 0.88

    this.contactCount = 0
    for (let row = 0; row <= this.segmentsY; row += 1) {
      for (let column = 0; column <= this.segmentsX; column += 1) {
        const vertex = this.index(column, row)
        const offset = vertex * 3
        const normalizedX = column / this.segmentsX
        const normalizedY = row / this.segmentsY
        const localX = this.releasePose[offset] * scale.x
        const localY = this.releasePose[offset + 1] * scale.y
        const inheritedDepth = this.releasePose[offset + 2]
        const ripple =
          Math.sin(normalizedX * Math.PI * 2.1 + normalizedY * Math.PI * 0.7) *
          Math.sin(normalizedY * Math.PI) *
          rippleAmplitude
        const rolledX = localX * cosineRoll - localY * sineRoll
        const rolledY = localX * sineRoll + localY * cosineRoll
        const localDepth = inheritedDepth + ripple
        const pitchedY = rolledY * cosinePitch - localDepth * sinePitch
        const pitchedZ = rolledY * sinePitch + localDepth * cosinePitch
        const x = centerX + rolledX
        const z = centerZ + pitchedZ
        const y =
          centerY +
          pitchedY +
          (this.environment.groundSlopeX * rolledX +
            this.environment.groundSlopeZ * pitchedZ) *
            landingEase

        const previousX = this.positions[offset]
        const previousY = this.positions[offset + 1]
        const previousZ = this.positions[offset + 2]

        this.positions[offset] = x
        this.positions[offset + 1] = y
        this.positions[offset + 2] = z
        if (
          this.releaseMotionTuning?.preserveScriptedVelocity &&
          !this.preserveReleaseVelocityFrame
        ) {
          this.previous[offset] = previousX
          this.previous[offset + 1] = previousY
          this.previous[offset + 2] = previousZ
        } else if (!this.releaseMotionTuning?.preserveScriptedVelocity) {
          this.previous[offset] = x
          this.previous[offset + 1] = y
          this.previous[offset + 2] = z
        }
      }
    }
    this.preserveReleaseVelocityFrame = false

    if (fall >= 1) {
      if (this.releaseMotionTuning?.preserveScriptedVelocity) {
        // The prototype landing pose is already aimed at the road. Do not
        // recenter it on the final scripted frame: that produced the visible
        // handoff shift and applied a road-boundary rule before real contact.
        // Resolve the landing pose vertex-by-vertex on this exact frame so a
        // corner cannot spend one rendered frame below the contact plane.
        this.solveGroundContact(false)
        this.contactCount = 0
      } else {
        this.contactCount = this.positions.length / 3
        this.constrainToRoadCorridor(1)
      }
    }
  }

  private constrainToRoadCorridor(landingCenterBlend = 0) {
    const beforeHandoff = this.releaseTime < WIND_HANDOFF
    if (beforeHandoff && landingCenterBlend <= 0) return

    const environment = this.environment
    const vertexCount = this.positions.length / 3
    const desiredPadding = Math.max(
      ROAD_CLEARANCE_PX,
      environment.targetHeight * 0.2,
    )

    // Treat the painted road as a hard screen-space invariant, while gently
    // biasing a safely contained page back toward the lane centre. The desired
    // visual margin is reduced only when the current projected footprint makes
    // it geometrically impossible; the zero-margin road boundary is retained.
    const passCount = beforeHandoff ? 1 : 4
    for (let pass = 0; pass < passCount; pass += 1) {
      let minimumWithoutPadding = Number.NEGATIVE_INFINITY
      let maximumWithoutPadding = Number.POSITIVE_INFINITY
      let totalProjectionScale = 0

      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const offset = vertex * 3
        const z = this.positions[offset + 2]
        const projectionScale =
          environment.cameraDistance /
          Math.max(environment.cameraDistance - z, environment.cameraDistance * 0.2)
        const screenX = environment.pageScreenX + this.positions[offset] * projectionScale
        const screenY = environment.pageScreenY - this.positions[offset + 1] * projectionScale
        const roadTop = environment.roadTopY(screenX)
        const roadBottom = environment.roadBottomY(screenX)

        minimumWithoutPadding = Math.max(minimumWithoutPadding, roadTop - screenY)
        maximumWithoutPadding = Math.min(maximumWithoutPadding, roadBottom - screenY)
        totalProjectionScale += projectionScale
      }

      const feasiblePadding = Math.max(
        0,
        (maximumWithoutPadding - minimumWithoutPadding) * 0.5 - 0.25,
      )
      const corridorPadding = Math.min(desiredPadding, feasiblePadding)
      const minimumScreenShift = minimumWithoutPadding + corridorPadding
      const maximumScreenShift = maximumWithoutPadding - corridorPadding
      const centredScreenShift = (minimumScreenShift + maximumScreenShift) * 0.5

      let screenShift: number
      if (beforeHandoff) {
        screenShift = centredScreenShift * landingCenterBlend
      } else if (minimumScreenShift > maximumScreenShift) {
        screenShift = (minimumScreenShift + maximumScreenShift) * 0.5
      } else if (minimumScreenShift > 0) {
        screenShift = minimumScreenShift
      } else if (maximumScreenShift < 0) {
        screenShift = maximumScreenShift
      } else {
        // The prototype retains the exact contact position while safely
        // inside the lane. The hard road edges still correct a real overlap,
        // but do not recenter a valid landing at the solver handoff.
        screenShift = this.releaseMotionTuning?.preserveRoadContactPosition
          ? 0
          : pass === 0
            ? centredScreenShift
            : 0
      }

      if (Math.abs(screenShift) < 0.01) break
      const averageProjectionScale = totalProjectionScale / vertexCount
      const worldShiftY = -screenShift / averageProjectionScale

      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const offset = vertex * 3 + 1
        this.positions[offset] += worldShiftY
        this.previous[offset] += worldShiftY
      }
    }
  }

  private constrainContactVerticesToRoadCorridor() {
    const environment = this.environment
    const desiredPadding = Math.max(
      ROAD_CLEARANCE_PX,
      environment.targetHeight * 0.2,
    )

    for (let vertex = 0; vertex < this.contactMask.length; vertex += 1) {
      if (this.contactMask[vertex] === 0) continue
      const offset = vertex * 3
      const z = this.positions[offset + 2]
      const projectionScale =
        environment.cameraDistance /
        Math.max(environment.cameraDistance - z, environment.cameraDistance * 0.2)
      const screenX = environment.pageScreenX + this.positions[offset] * projectionScale
      const screenY = environment.pageScreenY - this.positions[offset + 1] * projectionScale
      const roadTop = environment.roadTopY(screenX) + desiredPadding
      const roadBottom = environment.roadBottomY(screenX) - desiredPadding
      const targetScreenY = clamp(screenY, Math.min(roadTop, roadBottom), Math.max(roadTop, roadBottom))
      const worldShiftY = -(targetScreenY - screenY) / projectionScale
      if (Math.abs(worldShiftY) < 0.001) continue

      this.positions[offset + 1] += worldShiftY
      this.previous[offset + 1] += worldShiftY
    }
  }

  getRoadClearance() {
    if (this.releaseTime < WIND_HANDOFF) return Number.POSITIVE_INFINITY

    const environment = this.environment
    const vertexCount = this.positions.length / 3
    let minimumClearance = Number.POSITIVE_INFINITY

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      const z = this.positions[offset + 2]
      const projectionScale =
        environment.cameraDistance /
        Math.max(environment.cameraDistance - z, environment.cameraDistance * 0.2)
      const screenX = environment.pageScreenX + this.positions[offset] * projectionScale
      const screenY = environment.pageScreenY - this.positions[offset + 1] * projectionScale
      minimumClearance = Math.min(
        minimumClearance,
        screenY - environment.roadTopY(screenX),
        environment.roadBottomY(screenX) - screenY,
      )
    }

    return minimumClearance
  }

  getMinimumRoadClearance() {
    return this.minimumRoadClearance
  }

  getMinimumRoadClearanceTime() {
    return this.minimumRoadClearanceTime
  }

  getMinimumGroundClearance() {
    const normalLength = Math.hypot(
      -this.environment.groundSlopeX,
      1,
      -this.environment.groundSlopeZ,
    )
    let minimumClearance = Number.POSITIVE_INFINITY
    for (let vertex = 0; vertex < this.positions.length / 3; vertex += 1) {
      const offset = vertex * 3
      const x = this.positions[offset]
      const y = this.positions[offset + 1]
      const z = this.positions[offset + 2]
      minimumClearance = Math.min(
        minimumClearance,
        (y - this.getGroundHeight(x, z)) / normalLength,
      )
    }
    return minimumClearance
  }

  private applyRigidShape(delta: number) {
    const vertexCount = this.positions.length / 3
    const scale = this.currentScale()
    let centerX = 0
    let centerY = 0
    let centerZ = 0
    let leftX = 0
    let leftY = 0
    let leftZ = 0
    let rightX = 0
    let rightY = 0
    let rightZ = 0
    let topX = 0
    let topY = 0
    let topZ = 0
    let bottomX = 0
    let bottomY = 0
    let bottomZ = 0

    for (let row = 0; row <= this.segmentsY; row += 1) {
      for (let column = 0; column <= this.segmentsX; column += 1) {
        const offset = this.index(column, row) * 3
        const x = this.positions[offset]
        const y = this.positions[offset + 1]
        const z = this.positions[offset + 2]
        centerX += x
        centerY += y
        centerZ += z
        if (column === 0) {
          leftX += x
          leftY += y
          leftZ += z
        }
        if (column === this.segmentsX) {
          rightX += x
          rightY += y
          rightZ += z
        }
        if (row === 0) {
          topX += x
          topY += y
          topZ += z
        }
        if (row === this.segmentsY) {
          bottomX += x
          bottomY += y
          bottomZ += z
        }
      }
    }

    centerX /= vertexCount
    centerY /= vertexCount
    centerZ /= vertexCount

    // Rebuild a stiff sheet around its current orientation. Deriving both
    // axes from the simulated edges preserves tumbling caused by uneven wind;
    // forcing them back to the road orientation made the leaf slide flat.
    let ux = rightX - leftX
    let uy = rightY - leftY
    let uz = rightZ - leftZ
    const currentWidth = Math.hypot(ux, uy, uz) || 1
    ux /= currentWidth
    uy /= currentWidth
    uz /= currentWidth

    let vx = topX - bottomX
    let vy = topY - bottomY
    let vz = topZ - bottomZ
    const projection = vx * ux + vy * uy + vz * uz
    vx -= ux * projection
    vy -= uy * projection
    vz -= uz * projection
    const vLength = Math.hypot(vx, vy, vz) || 1
    vx /= vLength
    vy /= vLength
    vz /= vLength

    const groundCenter = this.getGroundHeight(centerX, centerZ)
    const minimumCenterY =
      groundCenter +
      this.environment.targetWidth * Math.abs(uy) * 0.5 +
      this.environment.targetHeight * Math.abs(vy) * 0.5 +
      1.4
    if (!this.releaseMotionTuning?.contactSolverProvidesSupport) {
      centerY = Math.max(centerY, minimumCenterY)
    }

    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const moments = sampleWindMoments(this.profile, this.releaseTime)
    const activity = Math.max(moments.actionFlutter, moments.edgeCatch)
    const rippleAmplitude = 0.16 + activity * (0.52 + this.profile.flutter * 0.18)
    const shapeBlend =
      (1 - Math.exp(-delta * (50 - activity * 10))) *
      this.postHandoffResponse(this.releaseMotionTuning?.handoffShapeRampDuration)

    for (let row = 0; row <= this.segmentsY; row += 1) {
      for (let column = 0; column <= this.segmentsX; column += 1) {
        const vertex = this.index(column, row)
        const offset = vertex * 3
        const normalizedX = column / this.segmentsX
        const normalizedY = row / this.segmentsY
        const localX = this.rest[offset] * scale.x
        const localY = this.rest[offset + 1] * scale.y
        const ripple =
          Math.sin(
            normalizedX * Math.PI * 2.15 +
              normalizedY * Math.PI * 0.65 -
              this.releaseTime * (2.4 + this.profile.plan.flutterFrequency * 0.32) +
              this.profile.phase,
          ) *
          Math.sin(normalizedY * Math.PI) *
          rippleAmplitude
        const targetX = centerX + ux * localX + vx * localY + nx * ripple
        const targetY = centerY + uy * localX + vy * localY + ny * ripple
        const targetZ = centerZ + uz * localX + vz * localY + nz * ripple
        const correctionX = (targetX - this.positions[offset]) * shapeBlend
        const correctionY = (targetY - this.positions[offset + 1]) * shapeBlend
        const correctionZ = (targetZ - this.positions[offset + 2]) * shapeBlend

        this.positions[offset] += correctionX
        this.positions[offset + 1] += correctionY
        this.positions[offset + 2] += correctionZ
        this.previous[offset] += correctionX
        this.previous[offset + 1] += correctionY
        this.previous[offset + 2] += correctionZ
      }
    }
  }

  private currentScale() {
    const progress =
      this.phase === 'release' ? smoothstep(0, PAPER_CONDENSE_END, this.releaseTime) : 0
    return {
      x: mix(1, this.environment.targetWidth / this.initialWidth, progress),
      y: mix(1, this.environment.targetHeight / this.initialHeight, progress),
    }
  }

  private addAerodynamicForces(delta: number) {
    const moments = sampleWindMoments(this.profile, this.releaseTime)
    const releaseStrength = this.phase === 'release' ? smoothstep(0.2, 1.8, moments.time) : 0
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
      condensationAir * 1.05
    const horizontalWindMultiplier = this.horizontalWindMultiplier()
    const depthWindMultiplier = this.depthWindMultiplier()
    const verticalWindScale =
      this.releaseMotionTuning && this.releaseTime > WIND_HANDOFF
        ? (this.releaseMotionTuning.verticalWindScale ?? 1)
        : 1
    const forceResponse = this.postHandoffResponse(
      this.releaseMotionTuning?.handoffForceRampDuration,
    )
    const aerodynamicAreaScale = this.releaseMotionTuning?.aerodynamicAreaReferenceHeight
      ? Math.pow(
          this.releaseMotionTuning.aerodynamicAreaReferenceHeight /
            this.environment.targetHeight,
          2,
        )
      : 1

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
        this.phase === 'release' ? this.releaseTime : this.simulationTime,
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
      const relativeX = wind.x * horizontalWindMultiplier - velocityX
      const relativeY = wind.y * verticalWindScale - velocityY
      const relativeZ = wind.z * depthWindMultiplier - velocityZ
      const normalSpeed = relativeX * nx + relativeY * ny + relativeZ * nz
      const area = doubleArea * 0.5
      // Responsive sheets keep the same number of equal-mass vertices. In the
      // feature solver, compensate triangle pressure for the smaller rendered
      // area so the mobile page does not become artificially heavy.
      const pressure =
        normalSpeed *
        Math.abs(normalSpeed) *
        area *
        normalCoefficient *
        aerodynamicAreaScale
      const forceX = (nx * pressure + relativeX * tangentialDrag) * forceResponse
      const forceY =
        (ny * pressure + relativeY * tangentialDrag) * forceResponse
      const forceZ = (nz * pressure + relativeZ * tangentialDrag) * forceResponse

      for (const offset of [ia, ib, ic]) {
        this.acceleration[offset] += forceX / 3
        this.acceleration[offset + 1] += forceY / 3
        this.acceleration[offset + 2] += forceZ / 3
      }
    }
  }

  private horizontalWindMultiplier() {
    if (!this.releaseMotionTuning || this.phase !== 'release' || this.releaseTime <= WIND_HANDOFF) {
      return 1
    }

    return this.releaseMotionTuning.horizontalWindScale
  }

  private depthWindMultiplier() {
    const tuning = this.releaseMotionTuning
    if (
      !tuning ||
      tuning.depthWindScale === undefined ||
      this.phase !== 'release' ||
      this.releaseTime <= WIND_HANDOFF
    ) {
      return 1
    }

    return tuning.depthWindScale
  }

  private postHandoffResponse(duration?: number) {
    if (!this.releaseMotionTuning || duration === undefined) return 1
    if (duration <= 0) return 1
    return smoothstep(0, duration, this.releaseTime - WIND_HANDOFF)
  }

  private addEdgeOnStabilityTorque(delta: number) {
    const tuning = this.releaseMotionTuning
    const strength = tuning?.edgeOnStabilityStrength ?? 0
    if (strength <= 0 || this.phase !== 'release' || this.releaseTime <= WIND_HANDOFF) return

    const vertexCount = this.positions.length / 3
    let centerX = 0
    let centerY = 0
    let centerZ = 0
    let velocityX = 0
    let velocityY = 0
    let velocityZ = 0
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      centerX += this.positions[offset]
      centerY += this.positions[offset + 1]
      centerZ += this.positions[offset + 2]
      velocityX += (this.positions[offset] - this.previous[offset]) / delta
      velocityY += (this.positions[offset + 1] - this.previous[offset + 1]) / delta
      velocityZ += (this.positions[offset + 2] - this.previous[offset + 2]) / delta
    }
    centerX /= vertexCount
    centerY /= vertexCount
    centerZ /= vertexCount
    velocityX /= vertexCount
    velocityY /= vertexCount
    velocityZ /= vertexCount

    const topLeft = this.index(0, 0) * 3
    const topRight = this.index(this.segmentsX, 0) * 3
    const bottomLeft = this.index(0, this.segmentsY) * 3
    const ux = this.positions[topRight] - this.positions[topLeft]
    const uy = this.positions[topRight + 1] - this.positions[topLeft + 1]
    const uz = this.positions[topRight + 2] - this.positions[topLeft + 2]
    const vx = this.positions[topLeft] - this.positions[bottomLeft]
    const vy = this.positions[topLeft + 1] - this.positions[bottomLeft + 1]
    const vz = this.positions[topLeft + 2] - this.positions[bottomLeft + 2]
    let normalX = uy * vz - uz * vy
    let normalY = uz * vx - ux * vz
    let normalZ = ux * vy - uy * vx
    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1
    normalX /= normalLength
    normalY /= normalLength
    normalZ /= normalLength

    if (Math.abs(normalZ) > 0.18) this.stabilityFacingSign = normalZ < 0 ? -1 : 1
    const handoffResponse = this.postHandoffResponse(tuning?.handoffForceRampDuration)
    const activation =
      (1 - smoothstep(0.14, 0.55, Math.abs(normalZ))) * handoffResponse
    if (activation <= 0) return

    // Rotate the current normal gently toward the nearer camera-facing side.
    // The remembered sign supplies hysteresis around zero: sufficient angular
    // momentum can still turn the page over, after which the opposite side is
    // stabilized instead of snapping back.
    let torqueX = normalY * this.stabilityFacingSign * strength * activation
    let torqueY = -normalX * this.stabilityFacingSign * strength * activation
    let torqueZ = 0
    let angularX = 0
    let angularY = 0
    let angularZ = 0
    let inertia = 0

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      const rx = this.positions[offset] - centerX
      const ry = this.positions[offset + 1] - centerY
      const rz = this.positions[offset + 2] - centerZ
      const relativeVelocityX =
        (this.positions[offset] - this.previous[offset]) / delta - velocityX
      const relativeVelocityY =
        (this.positions[offset + 1] - this.previous[offset + 1]) / delta - velocityY
      const relativeVelocityZ =
        (this.positions[offset + 2] - this.previous[offset + 2]) / delta - velocityZ
      angularX += ry * relativeVelocityZ - rz * relativeVelocityY
      angularY += rz * relativeVelocityX - rx * relativeVelocityZ
      angularZ += rx * relativeVelocityY - ry * relativeVelocityX
      inertia += rx * rx + ry * ry + rz * rz
    }

    const damping = (tuning?.edgeOnStabilityDamping ?? 0) * activation
    const inverseInertia = 1 / Math.max(inertia, 0.001)
    torqueX -= angularX * inverseInertia * damping
    torqueY -= angularY * inverseInertia * damping
    torqueZ -= angularZ * inverseInertia * damping

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      const rx = this.positions[offset] - centerX
      const ry = this.positions[offset + 1] - centerY
      const rz = this.positions[offset + 2] - centerZ
      this.acceleration[offset] += torqueY * rz - torqueZ * ry
      this.acceleration[offset + 1] += torqueZ * rx - torqueX * rz
      this.acceleration[offset + 2] += torqueX * ry - torqueY * rx
    }
  }

  private integrate(delta: number) {
    const damping = this.phase === 'reading' ? 0.986 : 0.983
    const deltaSquared = delta * delta
    const vertexCount = this.positions.length / 3
    const maximumSpeed =
      this.phase === 'reading' ? 55 : 420
    const gravity =
      this.phase === 'reading'
        ? 8.5
        : mix(17.2, 95, smoothstep(0.48, 0.92, this.releaseTime))

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      let velocityX = (this.positions[offset] - this.previous[offset]) * damping
      let velocityY = (this.positions[offset + 1] - this.previous[offset + 1]) * damping
      let velocityZ = (this.positions[offset + 2] - this.previous[offset + 2]) * damping
      if (this.releaseMotionTuning && this.releaseTime > WIND_HANDOFF) {
        const dragResponse = this.postHandoffResponse(
          this.releaseMotionTuning.handoffForceRampDuration,
        )
        velocityX *= Math.exp(-this.releaseMotionTuning.horizontalDrag * dragResponse * delta)
        velocityY *= Math.exp(
          -(this.releaseMotionTuning.verticalDrag ?? 0) * dragResponse * delta,
        )
        velocityZ *= Math.exp(
          -(this.releaseMotionTuning.depthDrag ?? 0) * dragResponse * delta,
        )
      }
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
    // Wind may curve a page, but it must not turn the paper into cloth. Keep
    // the two-step bend constraints nearly rigid as gust energy rises; the
    // spatially varying aerodynamic forces still create broad ripples.
    const bendFlex =
      constraint.compliance === BEND_COMPLIANCE
        ? 1 + clamp(aerodynamicActivity, 0, 1) * (0.18 + (this.profile.flutter - 1) * 0.16)
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
    const moments = sampleWindMoments(this.profile, this.releaseTime)
    const perVertexRelease = this.releaseMotionTuning?.perVertexGroundContact === true

    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const offset = vertex * 3
      const x = this.positions[offset]
      const y = this.positions[offset + 1]
      const z = this.positions[offset + 2]
      const ground = this.getGroundHeight(x, z)
      const signedDistance = (y - ground) / normalLength
      if (signedDistance > (perVertexRelease ? 0.12 : 1.2)) continue

      const velocityX = this.positions[offset] - this.previous[offset]
      const velocityY = this.positions[offset + 1] - this.previous[offset + 1]
      const velocityZ = this.positions[offset + 2] - this.previous[offset + 2]
      const normalVelocity = velocityX * nx + velocityY * ny + velocityZ * nz
      if (perVertexRelease && signedDistance >= 0 && normalVelocity >= 0) continue

      const contactSkin = perVertexRelease ? PER_VERTEX_CONTACT_SKIN : 0
      if (signedDistance < contactSkin) {
        const correction = contactSkin - signedDistance
        this.positions[offset] += nx * correction
        this.positions[offset + 1] += ny * correction
        this.positions[offset + 2] += nz * correction
        if (perVertexRelease) {
          // Geometric depenetration is not an impulse. Shift Verlet history by
          // the same amount so correction cannot create a sudden upward jump.
          this.previous[offset] += nx * correction
          this.previous[offset + 1] += ny * correction
          this.previous[offset + 2] += nz * correction
        }
      }

      if (perVertexRelease) {
        if (normalVelocity < 0) {
          const tangentialX = velocityX - nx * normalVelocity
          const tangentialY = velocityY - ny * normalVelocity
          const tangentialZ = velocityZ - nz * normalVelocity
          const contactSlip = smoothstep(0.025, 0.18, moments.actionFlutter)
          const friction = countContact ? mix(0.72, 0.08, contactSlip) : 0
          const retainedTangent = 1 - friction
          this.previous[offset] =
            this.positions[offset] - tangentialX * retainedTangent
          this.previous[offset + 1] =
            this.positions[offset + 1] - tangentialY * retainedTangent
          this.previous[offset + 2] =
            this.positions[offset + 2] - tangentialZ * retainedTangent
        }
        if (countContact) this.contactCount += 1
        if (countContact) this.contactMask[vertex] = 1
        continue
      }

      if (normalVelocity < 0) {
        this.previous[offset] += nx * normalVelocity * 0.91
        this.previous[offset + 1] += ny * normalVelocity * 0.91
        this.previous[offset + 2] += nz * normalVelocity * 0.91
      }

      const contactSlip = smoothstep(0.025, 0.18, moments.actionFlutter)
      const friction = mix(0.72, 0.08, contactSlip)
      this.previous[offset] = this.positions[offset] - velocityX * (1 - friction)
      this.previous[offset + 2] = this.positions[offset + 2] - velocityZ * (1 - friction)
      if (countContact) this.contactCount += 1
    }
  }

}

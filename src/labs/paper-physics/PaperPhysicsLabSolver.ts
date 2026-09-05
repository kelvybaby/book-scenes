import * as THREE from 'three'
import {
  sceneAmbientWind,
  type AmbientWindField,
} from '../../motion/AmbientWindField'
import {
  PaperSheet,
  type PaperEnvironment,
  type PaperMotionState,
} from '../../motion/PaperSheet'
import {
  createWindProfile,
  RELEASE_CONTACT_TIME,
  sampleWindMoments,
  WindField,
  type WindProfile,
  type WindSample,
} from '../../motion/WindField'
import {
  PAPER_PROBE_IDS,
  type PaperProbeAnalysis,
  type PaperProbeSample,
} from './PaperPhysicsLabDiagnostics'

type DistanceConstraint = {
  a: number
  b: number
  restLength: number
  compliance: number
  lambda: number
}

type Triangle = readonly [number, number, number]

type BendingConstraint = {
  edgeA: number
  edgeB: number
  oppositeA: number
  oppositeB: number
  triangleA: Triangle
  triangleB: Triangle
  restAngle: number
  compliance: number
  lambda: number
}

export type PaperSimulationMesh = {
  segmentsX: number
  segmentsY: number
  positions: Float32Array
  previous: Float32Array
  rest: Float32Array
  accelerations: Float32Array
  structuralConstraints: DistanceConstraint[]
  shearConstraints: DistanceConstraint[]
  bendingConstraints: BendingConstraint[]
  triangles: Triangle[]
}

export type PaperDeformationState = {
  /** Trajectory/contact time in controller seconds. */
  simulationTime: number
  /** Isolated visual-deformation clock in deformation seconds. */
  deformationTime: number
  releaseTime: number
  relativeAirSpeed: number
  windStrength: number
  waveDirectionX: number
  waveDirectionY: number
  broadAmplitude: number
  broadFrequency: number
  broadPropagationSpeed: number
  mediumRippleFrequency: number
  curlAngle: number
  curlRegionWidth: number
  curlAxisSkew: number
  flutterAmplitude: number
  flutterFrequency: number
  angularVelocity: number
  angularBias: number
  aerodynamicImpulse: number
  groundContact: number
  impactRipple: number
}

export type PaperLabSettings = {
  physicsTimeScale: number
  deformationTimeScale: number
  structuralCompliance: number
  bendingCompliance: number
  shearCompliance: number
  broadBendAmplitude: number
  broadBendFrequency: number
  broadBendPropagationSpeed: number
  broadBendEdgeEmphasis?: number
  broadBendIrregularity?: number
  broadBendLateralBias?: number
  perVertexGroundContact?: boolean
  curlAngleDegrees: number
  curlRegionWidth: number
  curlResponseSpeed: number
  edgeFlutterAmplitude: number
  edgeFlutterFrequency: number
  airDamping: number
  windCoupling: number
  physicsSubsteps: number
  visualDeformation: boolean
  broadBendEnabled: boolean
  curlEnabled: boolean
  flutterEnabled: boolean
}

export const DEFAULT_PAPER_LAB_SEED = 2_465_284_871

export const APPROVED_PAPER_LAB_PRESET: Readonly<PaperLabSettings> = Object.freeze({
  physicsTimeScale: 1,
  deformationTimeScale: 0.07,
  structuralCompliance: 0.000000004,
  bendingCompliance: 0.000001,
  shearCompliance: 0.00000149,
  broadBendAmplitude: 0.055,
  broadBendFrequency: 0.57,
  broadBendPropagationSpeed: 1.5,
  curlAngleDegrees: 17,
  curlRegionWidth: 0.46,
  curlResponseSpeed: 4.85,
  edgeFlutterAmplitude: 0.041,
  edgeFlutterFrequency: 3.35,
  airDamping: 4.2,
  windCoupling: 1.6,
  physicsSubsteps: 16,
  visualDeformation: true,
  broadBendEnabled: true,
  curlEnabled: true,
  flutterEnabled: true,
})

export const DEFAULT_PAPER_LAB_SETTINGS = APPROVED_PAPER_LAB_PRESET

export type PaperLabMetrics = PaperDeformationState & {
  status: 'reading' | 'descending' | 'grounded' | 'airborne'
  substeps: number
  roadClearance: number
  coarseVertices: number
  visualVertices: number
  probeProgress?: number
  probeAnalysis?: PaperProbeAnalysis | null
  integrationHz?: number
}

type PaperFrame = {
  center: THREE.Vector3
  u: THREE.Vector3
  v: THREE.Vector3
  normal: THREE.Vector3
  width: number
  height: number
}

type SharedEdge = {
  triangle: Triangle
  opposite: number
}

const MAX_SHAPE_SUBSTEPS = 16
const SHAPE_SOLVER_ITERATIONS = 1
const STRUCTURAL_COMPLIANCE = DEFAULT_PAPER_LAB_SETTINGS.structuralCompliance
const SHEAR_COMPLIANCE = DEFAULT_PAPER_LAB_SETTINGS.shearCompliance
const DIHEDRAL_COMPLIANCE = DEFAULT_PAPER_LAB_SETTINGS.bendingCompliance
const VISUAL_SEGMENTS_X = 32
const VISUAL_SEGMENTS_Y = 24
const TAU = Math.PI * 2
const DEFORMATION_TIME_SCALE_REFERENCE = 0.075

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const progress = clamp((value - edge0) / Math.max(edge1 - edge0, 0.000001), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

const seededUnit = (seed: number, offset: number) => {
  const value = Math.sin(seed * 0.00137 + offset * 91.739) * 43758.5453
  return value - Math.floor(value)
}

const angleDifference = (from: number, to: number) => {
  let difference = to - from
  while (difference > Math.PI) difference -= Math.PI * 2
  while (difference < -Math.PI) difference += Math.PI * 2
  return difference
}

const gridIndex = (column: number, row: number, segmentsX: number) =>
  row * (segmentsX + 1) + column

const distance = (positions: Float32Array, a: number, b: number) => {
  const offsetA = a * 3
  const offsetB = b * 3
  return Math.hypot(
    positions[offsetB] - positions[offsetA],
    positions[offsetB + 1] - positions[offsetA + 1],
    positions[offsetB + 2] - positions[offsetA + 2],
  )
}

const triangleNormal = (
  positions: Float32Array,
  triangle: Triangle,
  target: THREE.Vector3,
) => {
  const offsetA = triangle[0] * 3
  const offsetB = triangle[1] * 3
  const offsetC = triangle[2] * 3
  const abx = positions[offsetB] - positions[offsetA]
  const aby = positions[offsetB + 1] - positions[offsetA + 1]
  const abz = positions[offsetB + 2] - positions[offsetA + 2]
  const acx = positions[offsetC] - positions[offsetA]
  const acy = positions[offsetC + 1] - positions[offsetA + 1]
  const acz = positions[offsetC + 2] - positions[offsetA + 2]
  target.set(
    aby * acz - abz * acy,
    abz * acx - abx * acz,
    abx * acy - aby * acx,
  )
  const length = target.length()
  if (length > 0.0000001) target.multiplyScalar(1 / length)
  return target
}

const normalA = new THREE.Vector3()
const normalB = new THREE.Vector3()
const normalCross = new THREE.Vector3()
const sharedEdgeDirection = new THREE.Vector3()
const bendingVertices = new Int32Array(4)
const bendingGradients = new Float32Array(12)

const signedDihedralAngle = (
  positions: Float32Array,
  constraint: BendingConstraint,
) => {
  triangleNormal(positions, constraint.triangleA, normalA)
  triangleNormal(positions, constraint.triangleB, normalB)
  const edgeAOffset = constraint.edgeA * 3
  const edgeBOffset = constraint.edgeB * 3
  sharedEdgeDirection
    .set(
      positions[edgeBOffset] - positions[edgeAOffset],
      positions[edgeBOffset + 1] - positions[edgeAOffset + 1],
      positions[edgeBOffset + 2] - positions[edgeAOffset + 2],
    )
    .normalize()
  normalCross.crossVectors(normalA, normalB)
  const sine = normalCross.dot(sharedEdgeDirection)
  const cosine = clamp(normalA.dot(normalB), -1, 1)
  return Math.atan2(sine, cosine)
}

/**
 * A deliberately coarse local lattice. Horizontal and vertical distances are
 * nearly inextensible, only one alternating diagonal supplies cell shear, and
 * bending is represented by adjacent-triangle dihedral angles instead of
 * two-vertex rest distances.
 */
export const createPaperSimulationMesh = (
  segmentsX = 8,
  segmentsY = 6,
): PaperSimulationMesh => {
  const vertexCount = (segmentsX + 1) * (segmentsY + 1)
  const positions = new Float32Array(vertexCount * 3)
  const previous = new Float32Array(vertexCount * 3)
  const rest = new Float32Array(vertexCount * 3)
  const accelerations = new Float32Array(vertexCount * 3)
  const structuralConstraints: DistanceConstraint[] = []
  const shearConstraints: DistanceConstraint[] = []
  const bendingConstraints: BendingConstraint[] = []
  const triangles: Triangle[] = []

  for (let row = 0; row <= segmentsY; row += 1) {
    for (let column = 0; column <= segmentsX; column += 1) {
      const vertex = gridIndex(column, row, segmentsX)
      const offset = vertex * 3
      const x = column / segmentsX - 0.5
      const y = 0.5 - row / segmentsY
      const subtleRestCurve = Math.sin((column / segmentsX) * Math.PI) * 0.006
      positions[offset] = x
      positions[offset + 1] = y
      positions[offset + 2] = subtleRestCurve
      previous[offset] = x
      previous[offset + 1] = y
      previous[offset + 2] = subtleRestCurve
      rest[offset] = x
      rest[offset + 1] = y
      rest[offset + 2] = subtleRestCurve
    }
  }

  const addDistanceConstraint = (
    collection: DistanceConstraint[],
    a: number,
    b: number,
    compliance: number,
  ) => {
    collection.push({
      a,
      b,
      restLength: distance(rest, a, b),
      compliance,
      lambda: 0,
    })
  }

  for (let row = 0; row <= segmentsY; row += 1) {
    for (let column = 0; column <= segmentsX; column += 1) {
      const a = gridIndex(column, row, segmentsX)
      if (column < segmentsX) {
        addDistanceConstraint(
          structuralConstraints,
          a,
          gridIndex(column + 1, row, segmentsX),
          STRUCTURAL_COMPLIANCE,
        )
      }
      if (row < segmentsY) {
        addDistanceConstraint(
          structuralConstraints,
          a,
          gridIndex(column, row + 1, segmentsX),
          STRUCTURAL_COMPLIANCE,
        )
      }
      if (column < segmentsX && row < segmentsY) {
        const b = gridIndex(column + 1, row, segmentsX)
        const c = gridIndex(column, row + 1, segmentsX)
        const d = gridIndex(column + 1, row + 1, segmentsX)
        triangles.push([a, c, b], [b, c, d])

        // A single alternating diagonal controls shear without turning every
        // quad into a doubly braced rigid panel.
        if ((column + row) % 2 === 0) {
          addDistanceConstraint(shearConstraints, a, d, SHEAR_COMPLIANCE)
        } else {
          addDistanceConstraint(shearConstraints, b, c, SHEAR_COMPLIANCE)
        }
      }
    }
  }

  const edges = new Map<string, SharedEdge>()
  for (const triangle of triangles) {
    const triangleEdges = [
      [triangle[0], triangle[1], triangle[2]],
      [triangle[1], triangle[2], triangle[0]],
      [triangle[2], triangle[0], triangle[1]],
    ] as const

    for (const [edgeAValue, edgeBValue, opposite] of triangleEdges) {
      const edgeA = Math.min(edgeAValue, edgeBValue)
      const edgeB = Math.max(edgeAValue, edgeBValue)
      const key = `${edgeA}:${edgeB}`
      const shared = edges.get(key)
      if (!shared) {
        edges.set(key, { triangle, opposite })
        continue
      }

      const constraint: BendingConstraint = {
        edgeA,
        edgeB,
        oppositeA: shared.opposite,
        oppositeB: opposite,
        triangleA: shared.triangle,
        triangleB: triangle,
        restAngle: 0,
        compliance: DIHEDRAL_COMPLIANCE,
        lambda: 0,
      }
      constraint.restAngle = signedDihedralAngle(rest, constraint)
      bendingConstraints.push(constraint)
    }
  }

  return {
    segmentsX,
    segmentsY,
    positions,
    previous,
    rest,
    accelerations,
    structuralConstraints,
    shearConstraints,
    bendingConstraints,
    triangles,
  }
}

export const createPaperVisualMesh = (
  segmentsX = VISUAL_SEGMENTS_X,
  segmentsY = VISUAL_SEGMENTS_Y,
) => {
  const geometry = new THREE.PlaneGeometry(1, 1, segmentsX, segmentsY)
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  positions.setUsage(THREE.DynamicDrawUsage)
  return geometry
}

export class PaperPhysicsLabSolver {
  readonly coarse: PaperSimulationMesh
  readonly visualGeometry: THREE.PlaneGeometry
  readonly controller: PaperSheet
  readonly seed: number

  private readonly environment: PaperEnvironment
  private readonly profile: WindProfile
  private readonly windProfile: WindProfile
  private readonly wind: WindField
  private readonly windSample: WindSample = { x: 0, y: 0, z: 0 }
  private readonly frame: PaperFrame = {
    center: new THREE.Vector3(),
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(0, 0, 1),
    width: 1,
    height: 1,
  }
  private readonly previousFrame = {
    center: new THREE.Vector3(),
    u: new THREE.Vector3(1, 0, 0),
    normal: new THREE.Vector3(0, 0, 1),
  }
  private readonly previousCenter = new THREE.Vector3()
  private readonly currentCenter = new THREE.Vector3()
  private readonly currentVelocity = new THREE.Vector3()
  private readonly smoothedVelocity = new THREE.Vector3()
  private readonly relativeAir = new THREE.Vector3()
  private readonly tempWorld = new THREE.Vector3()
  private readonly probeBaseWorld = new THREE.Vector3()
  private readonly probeDeltaWorld = new THREE.Vector3()
  private readonly probeDisplacements = new Float32Array(PAPER_PROBE_IDS.length * 3)
  private readonly constraintProjectionStart = new Float32Array((8 + 1) * (6 + 1) * 3)
  private readonly cornerPhases: readonly number[]
  private settings: PaperLabSettings
  private shapeAccumulator = 0
  private deformationTime = 0
  private released = false
  private lastAerodynamicLoad = 0
  private impulseMemory = 0
  private impactMemory = 0
  private previousContact = 0
  private lastSubsteps = 0
  private smoothedBroadAmplitude = 0
  private smoothedCurlAngle = 0
  private smoothedCurlAxisSkew = 0
  private smoothedFlutterAmplitude = 0
  private smoothedWindStrength = 0
  private smoothedFlutterActivation = 0
  private smoothedAngularVelocity = 0
  private smoothedAngularBias = 0
  private smoothedWaveDirectionX = 1
  private smoothedWaveDirectionY = 0
  private minimumVisualGroundClearance = Number.POSITIVE_INFINITY
  private state: PaperDeformationState

  constructor(
    width: number,
    height: number,
    environment: PaperEnvironment,
    seed: number,
    settings: PaperLabSettings = { ...DEFAULT_PAPER_LAB_SETTINGS },
    controller?: PaperSheet,
    ambientWind: AmbientWindField = sceneAmbientWind,
    windSeed = seed,
  ) {
    this.seed = seed >>> 0
    this.environment = environment
    this.settings = { ...settings }
    this.profile = createWindProfile(this.seed)
    this.windProfile = createWindProfile(windSeed)
    this.wind = new WindField(this.windProfile, ambientWind, this.profile)
    this.controller =
      controller ??
      new PaperSheet(
        width,
        height,
        environment,
        this.seed,
        8,
        6,
        sceneAmbientWind,
        null,
        windSeed,
      )
    this.coarse = createPaperSimulationMesh(8, 6)
    this.visualGeometry = createPaperVisualMesh()
    this.cornerPhases = [
      seededUnit(this.seed, 31) * Math.PI * 2,
      seededUnit(this.seed, 32) * Math.PI * 2,
      seededUnit(this.seed, 33) * Math.PI * 2,
      seededUnit(this.seed, 34) * Math.PI * 2,
    ]
    this.smoothedWaveDirectionX = Math.cos(this.profile.phase)
    this.smoothedWaveDirectionY = Math.sin(this.profile.phase)
    this.state = this.defaultDeformationState()
    this.calculateControllerFrame()
    this.previousFrame.center.copy(this.frame.center)
    this.previousFrame.u.copy(this.frame.u)
    this.previousFrame.normal.copy(this.frame.normal)
    this.previousCenter.copy(this.frame.center)
    this.deformVisualPaperMesh(0, this.state)
  }

  private defaultDeformationState(): PaperDeformationState {
    return {
      simulationTime: 0,
      deformationTime: 0,
      releaseTime: 0,
      relativeAirSpeed: 0,
      windStrength: 0,
      waveDirectionX: Math.cos(this.profile.phase),
      waveDirectionY: Math.sin(this.profile.phase),
      broadAmplitude: 0,
      broadFrequency: this.settings.broadBendFrequency,
      broadPropagationSpeed: this.settings.broadBendPropagationSpeed,
      mediumRippleFrequency: 0.72,
      curlAngle: 0.22,
      curlRegionWidth: this.settings.curlRegionWidth,
      curlAxisSkew: 0,
      flutterAmplitude: 0,
      flutterFrequency: 2.8,
      angularVelocity: 0,
      angularBias: 0,
      aerodynamicImpulse: 0,
      groundContact: 0,
      impactRipple: 0,
    }
  }

  beginRelease() {
    this.released = true
    this.controller.beginRelease(true)
  }

  setSettings(settings: PaperLabSettings) {
    this.settings = { ...settings }
  }

  setEnvironment(environment: PaperEnvironment) {
    Object.assign(this.environment, environment)
    this.controller.setEnvironment(environment)
  }

  /** Controller time and visual-deformation time are intentionally independent. */
  updateCoarsePaperPhysics(delta: number) {
    const safeFrameDelta = clamp(delta, 0, 1 / 30)
    const physicsDelta =
      safeFrameDelta * clamp(this.settings.physicsTimeScale, 0.05, 1)
    const deformationDelta =
      physicsDelta * clamp(this.settings.deformationTimeScale, 0.01, 0.25)
    const normalizedDeformationDelta =
      deformationDelta / DEFORMATION_TIME_SCALE_REFERENCE
    this.controller.advance(physicsDelta)
    const motion = this.controller.getMotionState()
    this.calculateControllerFrame()
    this.state = this.calculatePaperDeformationState(
      physicsDelta,
      normalizedDeformationDelta,
      motion,
    )

    this.shapeAccumulator += deformationDelta
    const requestedSubsteps = Math.round(clamp(this.settings.physicsSubsteps, 2, 16))
    const fixedStep = 1 / (60 * requestedSubsteps)
    let substeps = 0
    while (this.shapeAccumulator >= fixedStep && substeps < MAX_SHAPE_SUBSTEPS) {
      this.deformationTime += fixedStep
      this.stepLocalShape(fixedStep, this.state)
      this.shapeAccumulator -= fixedStep
      substeps += 1
    }
    if (substeps === MAX_SHAPE_SUBSTEPS) {
      this.shapeAccumulator = Math.min(this.shapeAccumulator, fixedStep)
    }
    this.lastSubsteps = substeps
    return this.state
  }

  private stepLocalShape(delta: number, state: PaperDeformationState) {
    const mesh = this.coarse
    const phaseTime = this.deformationTime / DEFORMATION_TIME_SCALE_REFERENCE
    const mediumPhase =
      phaseTime * TAU * state.mediumRippleFrequency + this.profile.phase * 0.7
    const contactInfluence = this.settings.perVertexGroundContact ? 0 : state.groundContact
    mesh.accelerations.fill(0)

    for (let row = 0; row <= mesh.segmentsY; row += 1) {
      for (let column = 0; column <= mesh.segmentsX; column += 1) {
        const vertex = gridIndex(column, row, mesh.segmentsX)
        const offset = vertex * 3
        const u = column / mesh.segmentsX
        const v = row / mesh.segmentsY
        const normalizedEdgeDistance = Math.min(u, 1 - u, v, 1 - v) * 2
        const edgeWeight = Math.pow(1 - clamp(normalizedEdgeDistance, 0, 1), 2.4)
        const broadDrive = Math.sin(
          (u - 0.5) * state.waveDirectionX * Math.PI * 2.2 +
            (0.5 - v) * state.waveDirectionY * Math.PI * 2.2 -
            mediumPhase,
        )
        const cornerPhase =
          this.cornerPhases[0] * (1 - u) * (1 - v) +
          this.cornerPhases[1] * u * (1 - v) +
          this.cornerPhases[2] * (1 - u) * v +
          this.cornerPhases[3] * u * v
        const flutterDrive =
          Math.sin(
            phaseTime * TAU * state.flutterFrequency +
              cornerPhase +
              u * 2.7 -
              v * 1.3,
          ) +
          Math.sin(
            phaseTime * TAU * clamp(state.flutterFrequency * 1.31, 1.5, 4) +
              cornerPhase * 1.73 -
              u * 4.1,
          ) * 0.24

        mesh.accelerations[offset] +=
          (mesh.rest[offset] - mesh.positions[offset]) * (5 + contactInfluence * 12)
        mesh.accelerations[offset + 1] +=
          (mesh.rest[offset + 1] - mesh.positions[offset + 1]) *
          (5 + contactInfluence * 12)
        mesh.accelerations[offset + 2] +=
          (this.settings.broadBendEnabled ? broadDrive * (2.5 + state.windStrength * 7) : 0) +
          (this.settings.flutterEnabled
            ? flutterDrive * edgeWeight * state.windStrength * 8
            : 0) +
          state.angularBias * (u - 0.5) * 0.65 -
          (mesh.positions[offset + 2] - mesh.rest[offset + 2]) *
            (8 + contactInfluence * 24)
      }
    }

    const damping =
      Math.exp(
        (-this.settings.airDamping * delta) / DEFORMATION_TIME_SCALE_REFERENCE,
      ) * mix(1, 0.94, contactInfluence)
    const deltaSquared = delta * delta
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
      const offset = vertex * 3
      for (let component = 0; component < 3; component += 1) {
        const position = mesh.positions[offset + component]
        const velocity = (position - mesh.previous[offset + component]) * damping
        mesh.previous[offset + component] = position
        mesh.positions[offset + component] =
          position + velocity + mesh.accelerations[offset + component] * deltaSquared
      }
    }

    for (const constraint of mesh.structuralConstraints) constraint.lambda = 0
    for (const constraint of mesh.shearConstraints) constraint.lambda = 0
    for (const constraint of mesh.bendingConstraints) constraint.lambda = 0
    this.constraintProjectionStart.set(mesh.positions)

    for (let iteration = 0; iteration < SHAPE_SOLVER_ITERATIONS; iteration += 1) {
      this.solveStructuralConstraints(delta)
      this.solveBendingConstraints(delta)
    }

    // The coarse lattice is a slowly responding shape solver, not a resonant
    // cloth simulation. Preserve only a small part of each constraint
    // projection as velocity so finite-difference dihedral corrections cannot
    // inject high-frequency energy on the following step.
    for (let offset = 0; offset < mesh.positions.length; offset += 1) {
      const projection = mesh.positions[offset] - this.constraintProjectionStart[offset]
      mesh.previous[offset] += projection * 0.92
    }

    // A prototype lattice must fail soft under an abrupt gust. These bounds
    // are well outside the intended curvature but prevent one ill-conditioned
    // numeric dihedral gradient from projecting a vertex through the camera.
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
      const offset = vertex * 3
      const clampedX = clamp(
        mesh.positions[offset],
        mesh.rest[offset] - 0.11,
        mesh.rest[offset] + 0.11,
      )
      const clampedY = clamp(
        mesh.positions[offset + 1],
        mesh.rest[offset + 1] - 0.11,
        mesh.rest[offset + 1] + 0.11,
      )
      const clampedZ = clamp(mesh.positions[offset + 2], -0.18, 0.18)
      // A positional safety projection must shift Verlet history by the same
      // amount. Leaving `previous` outside the bound creates a fresh artificial
      // velocity on the next fixed step and was the source of clamp chatter.
      mesh.previous[offset] += clampedX - mesh.positions[offset]
      mesh.previous[offset + 1] += clampedY - mesh.positions[offset + 1]
      mesh.previous[offset + 2] += clampedZ - mesh.positions[offset + 2]
      mesh.positions[offset] = clampedX
      mesh.positions[offset + 1] = clampedY
      mesh.positions[offset + 2] = clampedZ
    }
  }

  private solveDistanceConstraint(
    constraint: DistanceConstraint,
    delta: number,
    compliance: number,
  ) {
    const positions = this.coarse.positions
    const offsetA = constraint.a * 3
    const offsetB = constraint.b * 3
    const dx = positions[offsetB] - positions[offsetA]
    const dy = positions[offsetB + 1] - positions[offsetA + 1]
    const dz = positions[offsetB + 2] - positions[offsetA + 2]
    const currentLength = Math.hypot(dx, dy, dz)
    if (currentLength < 0.0000001) return
    const alpha = compliance / (delta * delta)
    const value = currentLength - constraint.restLength
    const deltaLambda = (-value - alpha * constraint.lambda) / (2 + alpha)
    constraint.lambda += deltaLambda
    const correctionScale = deltaLambda / currentLength
    const correctionX = dx * correctionScale
    const correctionY = dy * correctionScale
    const correctionZ = dz * correctionScale
    positions[offsetA] -= correctionX
    positions[offsetA + 1] -= correctionY
    positions[offsetA + 2] -= correctionZ
    positions[offsetB] += correctionX
    positions[offsetB + 1] += correctionY
    positions[offsetB + 2] += correctionZ
  }

  solveStructuralConstraints(delta: number) {
    for (const constraint of this.coarse.structuralConstraints) {
      this.solveDistanceConstraint(constraint, delta, this.settings.structuralCompliance)
    }
    for (const constraint of this.coarse.shearConstraints) {
      this.solveDistanceConstraint(constraint, delta, this.settings.shearCompliance)
    }
  }

  /** XPBD dihedral constraints with finite-difference gradients on four vertices. */
  solveBendingConstraints(delta: number) {
    const positions = this.coarse.positions
    const epsilon = 0.00018

    for (const constraint of this.coarse.bendingConstraints) {
      const currentAngle = signedDihedralAngle(positions, constraint)
      const value = angleDifference(constraint.restAngle, currentAngle)
      bendingVertices[0] = constraint.edgeA
      bendingVertices[1] = constraint.edgeB
      bendingVertices[2] = constraint.oppositeA
      bendingVertices[3] = constraint.oppositeB
      let gradientMagnitude = 0

      for (let vertexIndex = 0; vertexIndex < bendingVertices.length; vertexIndex += 1) {
        const offset = bendingVertices[vertexIndex] * 3
        for (let component = 0; component < 3; component += 1) {
          const coordinateOffset = offset + component
          const original = positions[coordinateOffset]
          positions[coordinateOffset] = original + epsilon
          const plus = signedDihedralAngle(positions, constraint)
          positions[coordinateOffset] = original - epsilon
          const minus = signedDihedralAngle(positions, constraint)
          positions[coordinateOffset] = original
          const gradient = angleDifference(minus, plus) / (epsilon * 2)
          bendingGradients[vertexIndex * 3 + component] = gradient
          gradientMagnitude += gradient * gradient
        }
      }

      const alpha = this.settings.bendingCompliance / (delta * delta)
      const denominator = gradientMagnitude + alpha
      if (denominator < 0.0000001) continue
      const deltaLambda = clamp(
        (-value - alpha * constraint.lambda) / denominator,
        -0.0018,
        0.0018,
      )
      constraint.lambda += deltaLambda

      for (let vertexIndex = 0; vertexIndex < bendingVertices.length; vertexIndex += 1) {
        const offset = bendingVertices[vertexIndex] * 3
        positions[offset] += bendingGradients[vertexIndex * 3] * deltaLambda
        positions[offset + 1] += bendingGradients[vertexIndex * 3 + 1] * deltaLambda
        positions[offset + 2] += bendingGradients[vertexIndex * 3 + 2] * deltaLambda
      }
    }
  }

  private calculateControllerFrame() {
    const positions = this.controller.positions
    const segmentsX = this.controller.segmentsX
    const segmentsY = this.controller.segmentsY
    const vertexCount = positions.length / 3
    const center = this.frame.center.set(0, 0, 0)
    const left = new THREE.Vector3()
    const right = new THREE.Vector3()
    const top = new THREE.Vector3()
    const bottom = new THREE.Vector3()

    for (let row = 0; row <= segmentsY; row += 1) {
      for (let column = 0; column <= segmentsX; column += 1) {
        const offset = gridIndex(column, row, segmentsX) * 3
        const x = positions[offset]
        const y = positions[offset + 1]
        const z = positions[offset + 2]
        center.x += x
        center.y += y
        center.z += z
        if (column === 0) left.add(this.tempWorld.set(x, y, z))
        if (column === segmentsX) right.add(this.tempWorld.set(x, y, z))
        if (row === 0) top.add(this.tempWorld.set(x, y, z))
        if (row === segmentsY) bottom.add(this.tempWorld.set(x, y, z))
      }
    }
    center.multiplyScalar(1 / vertexCount)
    left.multiplyScalar(1 / (segmentsY + 1))
    right.multiplyScalar(1 / (segmentsY + 1))
    top.multiplyScalar(1 / (segmentsX + 1))
    bottom.multiplyScalar(1 / (segmentsX + 1))

    this.frame.u.subVectors(right, left)
    this.frame.width = Math.max(this.frame.u.length(), 0.001)
    this.frame.u.multiplyScalar(1 / this.frame.width)
    this.frame.v.subVectors(top, bottom)
    const projection = this.frame.v.dot(this.frame.u)
    this.frame.v.addScaledVector(this.frame.u, -projection)
    this.frame.height = Math.max(this.frame.v.length(), 0.001)
    this.frame.v.normalize()
    this.frame.normal.crossVectors(this.frame.u, this.frame.v).normalize()
  }

  calculatePaperDeformationState(
    physicsDelta: number,
    responseDelta: number,
    motion: PaperMotionState,
  ): PaperDeformationState {
    const frame = this.frame
    const phaseTime = this.deformationTime / DEFORMATION_TIME_SCALE_REFERENCE
    this.currentCenter.copy(frame.center)
    this.currentVelocity
      .subVectors(this.currentCenter, this.previousCenter)
      .multiplyScalar(1 / Math.max(physicsDelta, 0.0001))
    const velocityBlend = 1 - Math.exp(-responseDelta * 4.2)
    this.smoothedVelocity.lerp(this.currentVelocity, velocityBlend)
    const wind = this.wind.sample(
      frame.center.x,
      frame.center.y,
      frame.center.z,
      this.released && motion.releaseTime > 0 ? motion.releaseTime : phaseTime,
      this.released ? 'release' : 'reading',
      motion.releaseTime,
      this.windSample,
    )
    this.relativeAir
      .set(wind.x, wind.y, wind.z)
      .sub(this.smoothedVelocity)
    const relativeAirSpeed = this.relativeAir.length()
    const projectedWindX = this.relativeAir.dot(frame.u)
    const projectedWindY = this.relativeAir.dot(frame.v)
    const projectedLength = Math.hypot(projectedWindX, projectedWindY)
    const fallbackAngle = this.profile.phase + phaseTime * TAU * 0.025
    const targetWaveDirectionX =
      projectedLength > 0.01 ? projectedWindX / projectedLength : Math.cos(fallbackAngle)
    const targetWaveDirectionY =
      projectedLength > 0.01 ? projectedWindY / projectedLength : Math.sin(fallbackAngle)
    const directionBlend = 1 - Math.exp(-responseDelta * 0.72)
    this.smoothedWaveDirectionX = mix(
      this.smoothedWaveDirectionX,
      targetWaveDirectionX,
      directionBlend,
    )
    this.smoothedWaveDirectionY = mix(
      this.smoothedWaveDirectionY,
      targetWaveDirectionY,
      directionBlend,
    )
    const smoothedDirectionLength =
      Math.hypot(this.smoothedWaveDirectionX, this.smoothedWaveDirectionY) || 1
    this.smoothedWaveDirectionX /= smoothedDirectionLength
    this.smoothedWaveDirectionY /= smoothedDirectionLength
    const uTurn = Math.acos(clamp(this.previousFrame.u.dot(frame.u), -1, 1))
    const normalTurn = Math.acos(clamp(this.previousFrame.normal.dot(frame.normal), -1, 1))
    const targetAngularVelocity = clamp(
      (uTurn + normalTurn) / Math.max(physicsDelta, 0.0001),
      0,
      18,
    )
    const angularCross = new THREE.Vector3().crossVectors(this.previousFrame.normal, frame.normal)
    const targetAngularBias = clamp(
      angularCross.dot(frame.v) / Math.max(physicsDelta, 0.0001),
      -8,
      8,
    )
    const angularBlend = 1 - Math.exp(-responseDelta * 2.8)
    this.smoothedAngularVelocity = mix(
      this.smoothedAngularVelocity,
      targetAngularVelocity,
      angularBlend,
    )
    this.smoothedAngularBias = mix(
      this.smoothedAngularBias,
      targetAngularBias,
      angularBlend,
    )
    const normalAirSpeed = Math.abs(this.relativeAir.dot(frame.normal))
    const aerodynamicLoad = normalAirSpeed * normalAirSpeed * 0.000018
    const loadChange = Math.max(0, aerodynamicLoad - this.lastAerodynamicLoad)
    this.impulseMemory = Math.max(
      this.impulseMemory * Math.exp(-responseDelta * 2.4),
      loadChange * 0.12,
    )
    if (motion.contactRatio > this.previousContact + 0.08) {
      this.impactMemory = Math.max(
        this.impactMemory,
        clamp((motion.contactRatio - this.previousContact) * 2.8, 0, 1),
      )
    }
    this.impactMemory *= Math.exp(-responseDelta * 4.8)

    const deformationProfile =
      this.released && motion.releaseTime > RELEASE_CONTACT_TIME
        ? this.windProfile
        : this.profile
    const moments = sampleWindMoments(deformationProfile, motion.releaseTime)
    const coupledAirSpeed = relativeAirSpeed * clamp(this.settings.windCoupling, 0, 2)
    const targetWindStrength = smoothstep(72, 320, coupledAirSpeed)
    const targetFlutterActivation = smoothstep(145, 335, coupledAirSpeed)
    const exposureBlend = 1 - Math.exp(-responseDelta * 3.2)
    this.smoothedWindStrength = mix(
      this.smoothedWindStrength,
      targetWindStrength,
      exposureBlend,
    )
    this.smoothedFlutterActivation = mix(
      this.smoothedFlutterActivation,
      targetFlutterActivation,
      exposureBlend,
    )
    const windStrength = this.smoothedWindStrength
    const flutterActivation = this.smoothedFlutterActivation
    const contactInfluence = this.settings.perVertexGroundContact ? 0 : motion.contactRatio
    const contactDamping = 1 - contactInfluence * 0.9
    const minimumDimension = Math.min(frame.width, frame.height)
    const targetBroadAmplitude =
      minimumDimension *
      this.settings.broadBendAmplitude *
      (0.3 + windStrength * 0.7 + this.impulseMemory * 0.16) *
      mix(1, 0.46, contactInfluence)
    const broadResponse = 1 - Math.exp(-responseDelta * 0.9)
    this.smoothedBroadAmplitude = mix(
      this.smoothedBroadAmplitude,
      targetBroadAmplitude,
      broadResponse,
    )

    const maximumCurlAngle = THREE.MathUtils.degToRad(
      clamp(this.settings.curlAngleDegrees, 0, 150),
    )
    const targetCurlAngle =
      maximumCurlAngle *
      clamp(0.18 + windStrength * 0.72 + moments.edgeCatch * 0.1, 0.12, 1) *
      mix(1, 0.42, contactInfluence)
    const curlResponse =
      1 - Math.exp(-responseDelta * clamp(this.settings.curlResponseSpeed, 0.1, 6))
    this.smoothedCurlAngle = mix(
      this.smoothedCurlAngle,
      targetCurlAngle,
      curlResponse,
    )
    const targetCurlAxisSkew = clamp(
      this.smoothedWaveDirectionY * 0.2 + this.smoothedAngularBias * 0.003,
      -0.3,
      0.3,
    )
    this.smoothedCurlAxisSkew = mix(
      this.smoothedCurlAxisSkew,
      targetCurlAxisSkew,
      curlResponse,
    )

    const targetFlutterAmplitude =
      minimumDimension *
      this.settings.edgeFlutterAmplitude *
      flutterActivation *
      contactDamping
    const flutterResponse = 1 - Math.exp(-responseDelta * 4.2)
    this.smoothedFlutterAmplitude = mix(
      this.smoothedFlutterAmplitude,
      targetFlutterAmplitude,
      flutterResponse,
    )

    this.lastAerodynamicLoad = aerodynamicLoad
    this.previousContact = motion.contactRatio
    this.previousCenter.copy(this.currentCenter)
    this.previousFrame.center.copy(frame.center)
    this.previousFrame.u.copy(frame.u)
    this.previousFrame.normal.copy(frame.normal)

    return {
      simulationTime: motion.releaseTime,
      deformationTime: this.deformationTime,
      releaseTime: motion.releaseTime,
      relativeAirSpeed,
      windStrength,
      waveDirectionX: this.smoothedWaveDirectionX,
      waveDirectionY: this.smoothedWaveDirectionY,
      broadAmplitude: this.smoothedBroadAmplitude,
      broadFrequency: clamp(this.settings.broadBendFrequency, 0.15, 0.8),
      broadPropagationSpeed: clamp(this.settings.broadBendPropagationSpeed, 0.1, 1.8),
      mediumRippleFrequency: clamp(0.58 + windStrength * 0.72, 0.5, 1.5),
      curlAngle: this.smoothedCurlAngle,
      curlRegionWidth: clamp(this.settings.curlRegionWidth, 0.08, 0.5),
      curlAxisSkew: this.smoothedCurlAxisSkew,
      flutterAmplitude: this.smoothedFlutterAmplitude,
      flutterFrequency: clamp(
        this.settings.edgeFlutterFrequency * mix(0.88, 1.06, flutterActivation),
        1.5,
        4,
      ),
      angularVelocity: this.smoothedAngularVelocity,
      angularBias: this.smoothedAngularBias,
      aerodynamicImpulse: this.impulseMemory,
      groundContact: motion.contactRatio,
      impactRipple: this.impactMemory,
    }
  }

  private sampleLocalCoarse(u: number, v: number, target: THREE.Vector3) {
    const mesh = this.coarse
    const gridX = clamp(u, 0, 1) * mesh.segmentsX
    const gridY = clamp(v, 0, 1) * mesh.segmentsY
    const column = Math.min(Math.floor(gridX), mesh.segmentsX - 1)
    const row = Math.min(Math.floor(gridY), mesh.segmentsY - 1)
    const blendX = gridX - column
    const blendY = gridY - row
    const a = gridIndex(column, row, mesh.segmentsX) * 3
    const b = gridIndex(column + 1, row, mesh.segmentsX) * 3
    const c = gridIndex(column, row + 1, mesh.segmentsX) * 3
    const d = gridIndex(column + 1, row + 1, mesh.segmentsX) * 3

    const topX = mix(mesh.positions[a], mesh.positions[b], blendX)
    const topY = mix(mesh.positions[a + 1], mesh.positions[b + 1], blendX)
    const topZ = mix(mesh.positions[a + 2], mesh.positions[b + 2], blendX)
    const bottomX = mix(mesh.positions[c], mesh.positions[d], blendX)
    const bottomY = mix(mesh.positions[c + 1], mesh.positions[d + 1], blendX)
    const bottomZ = mix(mesh.positions[c + 2], mesh.positions[d + 2], blendX)
    return target.set(
      mix(topX, bottomX, blendY),
      mix(topY, bottomY, blendY),
      mix(topZ, bottomZ, blendY),
    )
  }

  private applyCylindricalCurl(
    point: THREE.Vector3,
    normalX: number,
    normalY: number,
    halfWidth: number,
    halfHeight: number,
    band: number,
    maximumAngle: number,
    normalSign: number,
    weight = 1,
  ) {
    const normalLength = Math.hypot(normalX, normalY) || 1
    const nx = normalX / normalLength
    const ny = normalY / normalLength
    const axisX = -ny
    const axisY = nx
    const edgeCoordinate = Math.abs(nx) * halfWidth + Math.abs(ny) * halfHeight
    const coordinate = point.x * nx + point.y * ny
    const distanceFromEdge = edgeCoordinate - coordinate
    if (distanceFromEdge >= band || maximumAngle < 0.001) return point

    const curlWeight = 1 - smoothstep(0, band, distanceFromEdge)
    const theta = maximumAngle * curlWeight
    const radius = band / maximumAngle
    const start = edgeCoordinate - band
    const mappedCoordinate = start + Math.sin(theta) * radius
    const cylinderRise = (1 - Math.cos(theta)) * radius * normalSign
    const axisCoordinate = point.x * axisX + point.y * axisY
    const curledX = axisX * axisCoordinate + nx * mappedCoordinate
    const curledY = axisY * axisCoordinate + ny * mappedCoordinate
    const blend = clamp(weight, 0, 1)
    point.x = mix(point.x, curledX, blend)
    point.y = mix(point.y, curledY, blend)
    point.z += cylinderRise * blend
    return point
  }

  deformVisualPaperMesh(time: number, state: PaperDeformationState) {
    const positions = this.visualGeometry.getAttribute('position') as THREE.BufferAttribute
    const segmentsX = VISUAL_SEGMENTS_X
    const segmentsY = VISUAL_SEGMENTS_Y
    const frame = this.frame
    const halfWidth = frame.width * 0.5
    const halfHeight = frame.height * 0.5
    const minimumDimension = Math.min(frame.width, frame.height)
    const local = new THREE.Vector3()
    const world = new THREE.Vector3()
    const mainCurlSide = seededUnit(this.seed, 51) > 0.5 ? 1 : -1
    const mainCurlNormalX = mainCurlSide
    const mainCurlNormalY = state.curlAxisSkew
    const mainCurlBand = minimumDimension * state.curlRegionWidth
    const secondaryCornerX = mainCurlSide > 0 ? -1 : 1
    const secondaryCornerY = seededUnit(this.seed, 52) > 0.5 ? 1 : -1
    const probeVertices = [
      gridIndex(0, 0, segmentsX),
      gridIndex(segmentsX, 0, segmentsX),
      gridIndex(0, segmentsY, segmentsX),
      gridIndex(segmentsX, segmentsY, segmentsX),
      gridIndex(Math.floor(segmentsX / 2), 0, segmentsX),
      gridIndex(segmentsX, Math.floor(segmentsY / 2), segmentsX),
      gridIndex(Math.floor(segmentsX / 2), segmentsY, segmentsX),
      gridIndex(0, Math.floor(segmentsY / 2), segmentsX),
      gridIndex(Math.floor(segmentsX / 2), Math.floor(segmentsY / 2), segmentsX),
    ]
    this.minimumVisualGroundClearance = Number.POSITIVE_INFINITY

    for (let row = 0; row <= segmentsY; row += 1) {
      for (let column = 0; column <= segmentsX; column += 1) {
        const vertex = gridIndex(column, row, segmentsX)
        const u = column / segmentsX
        const v = row / segmentsY
        if (this.settings.visualDeformation) {
          this.sampleLocalCoarse(u, v, local)
          local.x *= frame.width
          local.y *= frame.height
          local.z *= minimumDimension
        } else {
          local.set((u - 0.5) * frame.width, (0.5 - v) * frame.height, 0)
        }

        const lateralBias = clamp(this.settings.broadBendLateralBias ?? 0, 0, 0.9)
        const lateralSign = state.waveDirectionX < 0 ? -1 : 1
        const broadDirectionX = mix(state.waveDirectionX, lateralSign, lateralBias)
        const broadDirectionY = state.waveDirectionY * (1 - lateralBias)
        const broadDirectionLength = Math.hypot(broadDirectionX, broadDirectionY) || 1
        const normalizedBroadDirectionX = broadDirectionX / broadDirectionLength
        const normalizedBroadDirectionY = broadDirectionY / broadDirectionLength
        const waveCoordinate =
          local.x * normalizedBroadDirectionX + local.y * normalizedBroadDirectionY
        const normalizedWaveCoordinate = waveCoordinate / Math.max(minimumDimension, 1)
        const spatialCycles = state.broadFrequency / state.broadPropagationSpeed
        const irregularity = clamp(this.settings.broadBendIrregularity ?? 0, 0, 1)
        const irregularPhase =
          (Math.sin(
            time * TAU * 0.093 +
              normalizedWaveCoordinate * 1.6 +
              this.profile.phase * 0.37,
          ) *
            0.32 +
            Math.sin(
              time * TAU * 0.041 -
                normalizedWaveCoordinate * 0.82 +
                this.profile.phase * 0.73,
            ) *
              0.18) *
          irregularity
        const phase =
          TAU * (normalizedWaveCoordinate * spatialCycles - time * state.broadFrequency) +
          this.profile.phase +
          irregularPhase
        const normalizedEdgeDistance = Math.min(u, 1 - u, v, 1 - v) * 2
        const edgeProximity = Math.pow(1 - clamp(normalizedEdgeDistance, 0, 1), 1.8)
        const broadEdgeGain =
          1 + edgeProximity * clamp(this.settings.broadBendEdgeEmphasis ?? 0, 0, 0.35)
        const broadNormal =
          this.settings.visualDeformation && this.settings.broadBendEnabled
            ? Math.sin(phase) * state.broadAmplitude * broadEdgeGain
            : 0
        const broadSlope =
          this.settings.visualDeformation && this.settings.broadBendEnabled
            ? Math.cos(phase) * state.broadAmplitude * broadEdgeGain * TAU * spatialCycles /
              Math.max(minimumDimension, 1)
            : 0
        local.z += broadNormal
        // The small tangential correction approximates arc-length preservation;
        // together with frame-local normal displacement it rotates the surface
        // rather than pushing vertices along a fixed world Z axis.
        local.x -=
          normalizedBroadDirectionX * broadSlope * state.broadAmplitude * 0.48
        local.y -=
          normalizedBroadDirectionY * broadSlope * state.broadAmplitude * 0.48

        if (this.settings.visualDeformation && this.settings.curlEnabled) {
          this.applyCylindricalCurl(
            local,
            mainCurlNormalX,
            mainCurlNormalY,
            halfWidth,
            halfHeight,
            mainCurlBand,
            state.curlAngle,
            seededUnit(this.seed, 53) > 0.5 ? 1 : -1,
          )
        }

        const cornerU = secondaryCornerX > 0 ? u : 1 - u
        const cornerV = secondaryCornerY > 0 ? 1 - v : v
        const cornerCurlWeight = smoothstep(0.48, 0.94, cornerU * cornerV)
        if (this.settings.visualDeformation && this.settings.curlEnabled) {
          this.applyCylindricalCurl(
            local,
            secondaryCornerX,
            secondaryCornerY * 0.58,
            halfWidth,
            halfHeight,
            minimumDimension * state.curlRegionWidth * 0.72,
            state.curlAngle * 0.46,
            -1,
            cornerCurlWeight,
          )
        }

        const edgeWeight = Math.pow(1 - clamp(normalizedEdgeDistance, 0, 1), 2.65)
        const cornerPhase =
          this.cornerPhases[0] * (1 - u) * (1 - v) +
          this.cornerPhases[1] * u * (1 - v) +
          this.cornerPhases[2] * (1 - u) * v +
          this.cornerPhases[3] * u * v
        const noise =
          Math.sin(time * TAU * 0.12 + u * 8.1 - v * 5.7 + cornerPhase * 0.41) *
          Math.sin(time * TAU * 0.061 - u * 3.2 + v * 6.4 + cornerPhase)
        const secondaryFlutterFrequency = clamp(state.flutterFrequency * 1.31, 1.5, 4)
        const flutter =
          Math.sin(time * state.flutterFrequency * TAU + cornerPhase + u * 2.1) *
            0.67 +
          Math.sin(
            time * secondaryFlutterFrequency * TAU +
              cornerPhase * 1.71 -
              v * 3.8,
          ) *
            0.24 +
          noise * 0.19
        if (this.settings.visualDeformation && this.settings.flutterEnabled) {
          local.z += flutter * state.flutterAmplitude * edgeWeight
          local.x +=
            state.waveDirectionX * flutter * state.flutterAmplitude * edgeWeight * 0.07
          local.y +=
            state.waveDirectionY * flutter * state.flutterAmplitude * edgeWeight * 0.07
        }

        if (this.settings.visualDeformation && state.impactRipple > 0.001) {
          const impactDistance = Math.hypot(u - 0.42, v - 0.68)
          const impactWave = Math.sin(impactDistance * Math.PI * 7.5 - time * TAU * 1.15)
          local.z +=
            impactWave *
            state.impactRipple *
            minimumDimension *
            0.026 *
            (1 - smoothstep(0.08, 0.84, impactDistance))
        }

        world
          .copy(frame.center)
          .addScaledVector(frame.u, local.x)
          .addScaledVector(frame.v, local.y)
          .addScaledVector(frame.normal, local.z)

        // Only contact activates the ground rule. Airborne curls remain free to
        // cross the projected roadway boundaries, matching production behavior.
        if (this.settings.perVertexGroundContact) {
          const normalX = -this.environment.groundSlopeX
          const normalY = 1
          const normalZ = -this.environment.groundSlopeZ
          const normalLength = Math.hypot(normalX, normalY, normalZ)
          const nx = normalX / normalLength
          const ny = normalY / normalLength
          const nz = normalZ / normalLength
          const ground = this.controller.getGroundHeight(world.x, world.z)
          const signedDistance = (world.y - ground) / normalLength
          const projectionScale =
            this.environment.cameraDistance /
            Math.max(
              this.environment.cameraDistance - world.z,
              this.environment.cameraDistance * 0.2,
            )
          // Apply the visual skin only to vertices that reach the road; curls
          // and airborne portions remain completely unconstrained.
          const projectedPixel = clamp(1 / projectionScale, 0.7, 1.35)
          const landingBlend = smoothstep(
            RELEASE_CONTACT_TIME,
            RELEASE_CONTACT_TIME + 0.48,
            state.releaseTime,
          )
          const contactAnchorU = this.windProfile.plan.catchX < 0.5 ? 0.08 : 0.92
          const contactAnchorDistance = Math.abs(u - contactAnchorU)
          const nearEdgeWeight = smoothstep(0.66, 1, v)
          const shortContactWeight =
            nearEdgeWeight * (1 - smoothstep(0.055, 0.19, contactAnchorDistance))
          const nearEdgeRise =
            nearEdgeWeight *
            smoothstep(0.075, 0.72, contactAnchorDistance) *
            projectedPixel *
            0.92
          // Preserve the established one-pixel skin through the authored fall.
          // After handoff, one short section of the camera-facing edge can make
          // genuine contact while the remainder keeps a shallow visible arc.
          const visualClearance = mix(
            projectedPixel,
            projectedPixel * 0.045 + nearEdgeRise,
            landingBlend,
          )
          const contactTransition =
            projectedPixel * mix(1.35, 0.14, landingBlend * shortContactWeight)
          const transitionCutoff = contactTransition * 3
          const clearanceDelta = signedDistance - visualClearance
          if (clearanceDelta < transitionCutoff) {
            // A hard max() makes adjacent triangles meet the plane with a
            // derivative discontinuity, which can collapse their projected
            // area at touchdown. This compact smooth-max spreads only the
            // final fraction of the correction into nearby, already-low
            // vertices while leaving the rest of the sheet untouched.
            const rawCorrection =
              (Math.sqrt(
                clearanceDelta * clearanceDelta +
                  contactTransition * contactTransition,
              ) -
                clearanceDelta) *
              0.5
            const cutoffCorrection =
              (Math.sqrt(
                transitionCutoff * transitionCutoff +
                  contactTransition * contactTransition,
              ) -
                transitionCutoff) *
              0.5
            const correction = Math.max(0, rawCorrection - cutoffCorrection)
            world.x += nx * correction
            world.y += ny * correction
            world.z += nz * correction
          }
          const resolvedGround = this.controller.getGroundHeight(world.x, world.z)
          const resolvedDistance = (world.y - resolvedGround) / normalLength
          if (resolvedDistance < visualClearance) {
            const residualCorrection = visualClearance - resolvedDistance
            world.x += nx * residualCorrection
            world.y += ny * residualCorrection
            world.z += nz * residualCorrection
          }
          this.minimumVisualGroundClearance = Math.min(
            this.minimumVisualGroundClearance,
            Math.max(resolvedDistance, visualClearance),
          )
        } else if (state.groundContact > 0) {
          const ground = this.controller.getGroundHeight(world.x, world.z) + 0.35
          world.y = Math.max(world.y, ground)
        }
        positions.setXYZ(vertex, world.x, world.y, world.z)

        const probeIndex = probeVertices.indexOf(vertex)
        if (probeIndex >= 0) {
          this.probeBaseWorld
            .copy(frame.center)
            .addScaledVector(frame.u, (u - 0.5) * frame.width)
            .addScaledVector(frame.v, (0.5 - v) * frame.height)
          this.probeDeltaWorld.subVectors(world, this.probeBaseWorld)
          const probeOffset = probeIndex * 3
          this.probeDisplacements[probeOffset] =
            this.probeDeltaWorld.dot(frame.u) / minimumDimension
          this.probeDisplacements[probeOffset + 1] =
            this.probeDeltaWorld.dot(frame.v) / minimumDimension
          this.probeDisplacements[probeOffset + 2] =
            this.probeDeltaWorld.dot(frame.normal) / minimumDimension
        }
      }
    }

    positions.needsUpdate = true
    this.updatePaperNormals()
  }

  updatePaperNormals() {
    this.visualGeometry.computeVertexNormals()
    const normals = this.visualGeometry.getAttribute('normal') as THREE.BufferAttribute
    normals.needsUpdate = true
    this.visualGeometry.computeBoundingSphere()
  }

  updateVisualMesh(delta: number) {
    const state = this.updateCoarsePaperPhysics(delta)
    this.deformVisualPaperMesh(
      this.deformationTime / DEFORMATION_TIME_SCALE_REFERENCE,
      state,
    )
    return state
  }

  getMinimumVisualGroundClearance() {
    return this.minimumVisualGroundClearance
  }

  getProbeSample(wallTime: number): PaperProbeSample {
    const minimumDimension = Math.max(Math.min(this.frame.width, this.frame.height), 0.001)
    return {
      wallTime,
      physicsTime: this.controller.getMotionState().releaseTime,
      deformationTime: this.deformationTime,
      displacements: Array.from(this.probeDisplacements),
      windStrength: this.state.windStrength,
      angularBias: this.state.angularBias,
      curlAngle: this.state.curlAngle,
      flutterAmplitude: this.state.flutterAmplitude / minimumDimension,
      groundContact: this.state.groundContact,
    }
  }

  getCoarseWorldPositions() {
    const result = new Float32Array(this.coarse.positions.length)
    const minimumDimension = Math.min(this.frame.width, this.frame.height)
    const local = new THREE.Vector3()
    const world = new THREE.Vector3()
    for (let vertex = 0; vertex < this.coarse.positions.length / 3; vertex += 1) {
      const offset = vertex * 3
      local.set(
        this.coarse.positions[offset] * this.frame.width,
        this.coarse.positions[offset + 1] * this.frame.height,
        this.coarse.positions[offset + 2] * minimumDimension,
      )
      world
        .copy(this.frame.center)
        .addScaledVector(this.frame.u, local.x)
        .addScaledVector(this.frame.v, local.y)
        .addScaledVector(this.frame.normal, local.z)
      result[offset] = world.x
      result[offset + 1] = world.y
      result[offset + 2] = world.z
    }
    return result
  }

  getMetrics(): PaperLabMetrics {
    const motion = this.controller.getMotionState()
    const roadClearance = this.controller.getRoadClearance()
    let status: PaperLabMetrics['status'] = 'reading'
    if (this.released) {
      if (motion.releaseTime < 6.2) status = 'descending'
      else if (motion.contactRatio > 0) status = 'grounded'
      else status = 'airborne'
    }
    return {
      ...this.state,
      status,
      substeps: this.lastSubsteps,
      roadClearance,
      coarseVertices: this.coarse.positions.length / 3,
      visualVertices: this.visualGeometry.getAttribute('position').count,
    }
  }
}

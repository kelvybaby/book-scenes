import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type BookPageRig = {
  mesh: THREE.SkinnedMesh
  bones: THREE.Bone[]
  skeleton: THREE.Skeleton
  width: number
  rightHingeY: number
  leftHingeY: number
  closedX: number
  rightOpeningX: number
  leftOpeningX: number
  rightStackOffset: number
  leftStackOffset: number
  turnAngle: number
  restingBend: number
  turningBend: number
  settledBend: number
  cornerFold: number
}

type CreateBookPageRigOptions = {
  name: string
  segments: number
  rightStackOffset?: number
  leftStackOffset?: number
  leftHingeY?: number
  rightOpeningX?: number
  leftOpeningX?: number
  turnAngle: number
  restingBend?: number
  turningBend: number
  settledBend: number
  cornerFold: number
}

const smootherStep = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

const PROFILE_POWER = 1.4

const profileTangent = (u: number, bendRatio: number) => {
  const sine = Math.max(0, Math.sin(Math.PI * u))
  if (sine < 0.000001 || bendRatio === 0) return 0
  const derivative =
    bendRatio *
    PROFILE_POWER *
    Math.PI *
    sine ** (PROFILE_POWER - 1) *
    Math.cos(Math.PI * u)
  return Math.atan(derivative)
}

const collectTemplateSurface = (template: THREE.Object3D) => {
  template.updateWorldMatrix(true, true)
  const rootInverse = template.matrixWorld.clone().invert()
  const sourceMeshes: THREE.Mesh[] = []
  template.traverse((node) => {
    if (node instanceof THREE.Mesh) sourceMeshes.push(node)
  })
  if (sourceMeshes.length === 0) {
    throw new Error(`The page template ${template.name} contains no mesh surfaces.`)
  }

  if (sourceMeshes.length === 1) {
    const source = sourceMeshes[0]
    const geometry = source.geometry.clone()
    const localTransform = rootInverse.clone().multiply(source.matrixWorld)
    geometry.applyMatrix4(localTransform)
    const material = Array.isArray(source.material) ? [...source.material] : source.material
    return { geometry, material, renderOrder: source.renderOrder }
  }

  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  for (const source of sourceMeshes) {
    const sourceMaterials = Array.isArray(source.material) ? source.material : [source.material]
    if (sourceMaterials.length !== 1) {
      geometries.forEach((geometry) => geometry.dispose())
      throw new Error(`The page surface ${source.name} has an unsupported nested material group.`)
    }
    const geometry = source.geometry.clone()
    geometry.clearGroups()
    const localTransform = rootInverse.clone().multiply(source.matrixWorld)
    geometry.applyMatrix4(localTransform)
    geometries.push(geometry)
    materials.push(sourceMaterials[0])
  }

  const geometry = mergeGeometries(geometries, true)
  geometries.forEach((part) => part.dispose())
  if (!geometry) throw new Error(`The page surfaces for ${template.name} could not be merged.`)
  return { geometry, material: materials, renderOrder: sourceMeshes[0].renderOrder }
}

/**
 * Convert one of the already-subdivided Blender leaves into a skinned mesh.
 * The source geometry, UVs, material groups, page thickness, and photographed
 * surface remain untouched; only skin indices and a widthwise bone chain are
 * added for the turn.
 */
export function createBookPageRig(
  template: THREE.Object3D,
  options: CreateBookPageRigOptions,
): BookPageRig {
  const surface = collectTemplateSurface(template)
  const geometry = surface.geometry
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (!bounds) throw new Error(`The page template ${template.name} has no bounds.`)

  const minX = bounds.min.x
  const width = bounds.max.x - minX
  const segmentCount = Math.max(4, Math.floor(options.segments))
  const segmentWidth = width / segmentCount
  const positions = geometry.getAttribute('position')
  const hingeTolerance = Math.max(segmentWidth * 0.25, 0.000001)
  let hingeMinY = Number.POSITIVE_INFINITY
  let hingeMaxY = Number.NEGATIVE_INFINITY

  for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
    if (positions.getX(vertexIndex) > minX + hingeTolerance) continue
    const y = positions.getY(vertexIndex)
    hingeMinY = Math.min(hingeMinY, y)
    hingeMaxY = Math.max(hingeMaxY, y)
  }
  if (!Number.isFinite(hingeMinY) || !Number.isFinite(hingeMaxY)) {
    geometry.dispose()
    throw new Error(`The page template ${template.name} has no usable hinge edge.`)
  }

  const localHingeY = (hingeMinY + hingeMaxY) * 0.5
  geometry.translate(0, -localHingeY, 0)
  const skinIndices: number[] = []
  const skinWeights: number[] = []

  for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex += 1) {
    const x = positions.getX(vertexIndex)
    const positionOnChain = THREE.MathUtils.clamp((x - minX) / segmentWidth, 0, segmentCount)
    const lowerBone = Math.min(segmentCount - 1, Math.floor(positionOnChain))
    const blend = positionOnChain - lowerBone
    skinIndices.push(lowerBone, lowerBone + 1, 0, 0)
    skinWeights.push(1 - blend, blend, 0, 0)
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4))

  const bones: THREE.Bone[] = []
  for (let index = 0; index <= segmentCount; index += 1) {
    const bone = new THREE.Bone()
    bone.name = `${options.name}_Bone_${String(index).padStart(2, '0')}`
    bone.position.x = index === 0 ? minX : segmentWidth
    bone.rotation.order = 'ZXY'
    if (index > 0) bones[index - 1].add(bone)
    bones.push(bone)
  }

  const mesh = new THREE.SkinnedMesh(geometry, surface.material)
  mesh.name = options.name
  mesh.position.copy(template.position)
  mesh.position.y += localHingeY
  mesh.quaternion.copy(template.quaternion)
  mesh.scale.copy(template.scale)
  mesh.renderOrder = surface.renderOrder
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.add(bones[0])

  const skeleton = new THREE.Skeleton(bones)
  mesh.updateMatrixWorld(true)
  mesh.bind(skeleton)
  mesh.normalizeSkinWeights()

  const rightHingeY = mesh.position.y

  return {
    mesh,
    bones,
    skeleton,
    width,
    rightHingeY,
    leftHingeY: options.leftHingeY ?? -rightHingeY,
    closedX: mesh.position.x,
    rightOpeningX: options.rightOpeningX ?? 0,
    leftOpeningX: options.leftOpeningX ?? 0,
    rightStackOffset: options.rightStackOffset ?? 0,
    leftStackOffset: options.leftStackOffset ?? 0,
    turnAngle: options.turnAngle,
    restingBend: options.restingBend ?? 0,
    turningBend: options.turningBend,
    settledBend: options.settledBend,
    cornerFold: options.cornerFold,
  }
}

/**
 * Pose a page from its photographed right-hand rest state (0) to its shallow
 * left-hand reading state (1). The tangent field describes a smooth sine bow,
 * so the sheet stays pinned at both ends instead of kinking at a bone.
 */
export function poseBookPage(rig: BookPageRig, progress: number, openness = 1) {
  const p = THREE.MathUtils.clamp(progress, 0, 1)
  const eased = smootherStep(p)
  const turnEnvelope = Math.sin(Math.PI * eased) ** 0.9
  const bendRatio =
    THREE.MathUtils.lerp(
      rig.restingBend * THREE.MathUtils.clamp(openness, 0, 1),
      -rig.settledBend,
      eased,
    ) +
    rig.turningBend * turnEnvelope
  const foldAmount = rig.cornerFold * turnEnvelope
  const lastBone = rig.bones.length - 1
  let previousOrientation = 0
  let previousTwist = 0

  for (let index = 0; index <= lastBone; index += 1) {
    const u = index / lastBone
    // Let the free edge begin moving a fraction ahead of the bound edge. Keep
    // the phase spread restrained: a large spread makes the sheet collapse
    // into a pointed fan rather than carrying a broad travelling curl.
    const phaseExponent = THREE.MathUtils.lerp(1.12, 0.94, u)
    const localTurn = smootherStep(p ** phaseExponent)
    const tangent = profileTangent(u, bendRatio)
    const orientation = rig.turnAngle * localTurn + tangent
    const foldU = THREE.MathUtils.smoothstep(u, 0.34, 1)
    const twist = foldAmount * (0.82 + eased * 0.18) * foldU ** 1.65
    const bone = rig.bones[index]

    bone.rotation.z = index === 0 ? orientation : orientation - previousOrientation
    bone.rotation.x = index === 0 ? twist : twist - previousTwist
    bone.rotation.y = 0
    previousOrientation = orientation
    previousTwist = twist
  }

  rig.mesh.position.y =
    THREE.MathUtils.lerp(
      rig.rightHingeY + rig.rightStackOffset,
      rig.leftHingeY + rig.leftStackOffset,
      eased,
    )
  const openAmount = THREE.MathUtils.clamp(openness, 0, 1)
  rig.mesh.position.x = THREE.MathUtils.lerp(
    rig.closedX + rig.rightOpeningX * openAmount,
    rig.closedX + rig.leftOpeningX * openAmount,
    eased,
  )
  // WebGLRenderer updates each visible skeleton once immediately before draw.
  // Updating it here as well duplicated all bone-matrix work on every turn frame.
}

export function disposeBookPageRig(rig: BookPageRig) {
  rig.skeleton.dispose()
  rig.mesh.geometry.dispose()
}

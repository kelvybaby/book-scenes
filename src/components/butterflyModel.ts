import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type ButterflyModelDimensions = {
  wingSpan: number
  wingLength: number
  bodyLength: number
  bodyRadius: number
}

export type ButterflyGeometrySet = {
  body: THREE.BufferGeometry
  leftForewing: THREE.BufferGeometry
  leftHindwing: THREE.BufferGeometry
  rightForewing: THREE.BufferGeometry
  rightHindwing: THREE.BufferGeometry
  all: readonly THREE.BufferGeometry[]
}

export type ButterflyModelMaterials = {
  body: THREE.Material
  forewing: THREE.Material
  hindwing: THREE.Material
}

export type ButterflyModelView = {
  root: THREE.Group
  leftWing: THREE.Group
  rightWing: THREE.Group
}

type NormalizedWingPoint = readonly [axial: number, lateral: number]

// These points are normalized directly from the supplied dorsal reference's
// right-hand outer silhouette. Axial coordinates span the complete butterfly
// height; lateral coordinates span from the body hinge to the outermost tip.
const FOREWING_OUTLINE: readonly NormalizedWingPoint[] = [
  [0.002, 0],
  [0.1016, 0.0488],
  [0.1931, 0.1394],
  [0.3557, 0.331],
  [0.4207, 0.4425],
  [0.4715, 0.5679],
  [0.5041, 0.6969],
  [0.5142, 0.7909],
  [0.5, 0.9408],
  [0.4736, 0.9895],
  [0.4451, 1],
  [0.4207, 0.9686],
  [0.4004, 0.9129],
  [0.3252, 0.9129],
  [0.2561, 0.8293],
  [0.1524, 0.7979],
  [0.0854, 0.8118],
  [0.063, 0.777],
  [0.0163, 0.7735],
  [-0.0122, 0.7213],
  [-0.0163, 0.6341],
  [-0.0041, 0.4355],
  [0.0061, 0.2265],
]

const HINDWING_OUTLINE: readonly NormalizedWingPoint[] = [
  [0, 0],
  [0.0061, 0.2265],
  [-0.0041, 0.4355],
  [-0.0163, 0.6341],
  [-0.0671, 0.7317],
  [-0.1545, 0.7805],
  [-0.189, 0.7735],
  [-0.2012, 0.7247],
  [-0.2195, 0.7073],
  [-0.2561, 0.7073],
  [-0.2886, 0.7282],
  [-0.313, 0.6655],
  [-0.3476, 0.6516],
  [-0.3598, 0.6098],
  [-0.3862, 0.5854],
  [-0.4024, 0.5401],
  [-0.4085, 0.5052],
  [-0.4329, 0.4251],
  [-0.4756, 0.3624],
  [-0.4654, 0.2997],
  [-0.4675, 0.223],
  [-0.4858, 0.2021],
  [-0.4248, 0.1394],
  [-0.3638, 0.0871],
  [-0.2907, 0.0453],
  [-0.2317, 0.0209],
  [-0.1443, -0.0035],
]

function softenOutline(
  outline: readonly NormalizedWingPoint[],
  amount = 0.14,
) {
  const softened: NormalizedWingPoint[] = []
  for (let index = 0; index < outline.length; index += 1) {
    const current = outline[index]
    const next = outline[(index + 1) % outline.length]
    softened.push(
      [
        current[0] + (next[0] - current[0]) * amount,
        current[1] + (next[1] - current[1]) * amount,
      ],
      [
        current[0] + (next[0] - current[0]) * (1 - amount),
        current[1] + (next[1] - current[1]) * (1 - amount),
      ],
    )
  }
  return softened
}

function createWingShape(
  outline: readonly NormalizedWingPoint[],
  dimensions: ButterflyModelDimensions,
  side: -1 | 1,
) {
  const shape = new THREE.Shape()
  softenOutline(outline).forEach(([axial, lateral], index) => {
    const x = axial * dimensions.wingLength
    const y = lateral * dimensions.wingSpan * side
    if (index === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  })
  shape.closePath()
  return shape
}

function createWingGeometry(
  shape: THREE.Shape,
  dimensions: ButterflyModelDimensions,
) {
  const thickness = Math.max(dimensions.bodyRadius * 0.09, 0.025)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: 5,
    depth: thickness,
    steps: 1,
  })
  geometry.translate(0, 0, -thickness * 0.5)

  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  const camber = dimensions.bodyRadius * 0.22
  for (let index = 0; index < position.count; index += 1) {
    const lateral = Math.min(
      Math.abs(position.getY(index)) / dimensions.wingSpan,
      1,
    )
    const longitudinal = Math.min(
      Math.abs(position.getX(index)) / dimensions.wingLength,
      1,
    )
    const lift =
      Math.sin(lateral * Math.PI) *
      (1 - longitudinal * 0.28) *
      camber
    position.setZ(index, position.getZ(index) + lift)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function createBodyGeometry(dimensions: ButterflyModelDimensions) {
  const { bodyLength, bodyRadius } = dimensions
  const parts: THREE.BufferGeometry[] = []

  const abdomen = new THREE.CylinderGeometry(
    bodyRadius * 0.55,
    bodyRadius * 0.24,
    bodyLength * 0.82,
    7,
    1,
  )
  abdomen.rotateZ(-Math.PI / 2)
  abdomen.translate(-bodyLength * 0.08, 0, 0)
  parts.push(abdomen)

  const thorax = new THREE.SphereGeometry(bodyRadius * 0.72, 7, 5)
  thorax.scale(1.05, 0.84, 0.8)
  thorax.translate(bodyLength * 0.31, 0, 0)
  parts.push(thorax)

  const head = new THREE.SphereGeometry(bodyRadius * 0.54, 7, 5)
  head.translate(bodyLength * 0.53, 0, 0)
  parts.push(head)

  for (const side of [-1, 1] as const) {
    const antennaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(
        bodyLength * 0.56,
        side * bodyRadius * 0.22,
        bodyRadius * 0.12,
      ),
      new THREE.Vector3(
        bodyLength * 0.7,
        side * bodyRadius * 0.62,
        bodyRadius * 0.15,
      ),
      new THREE.Vector3(
        bodyLength * 0.87,
        side * bodyRadius * 1.18,
        bodyRadius * 0.08,
      ),
      new THREE.Vector3(
        bodyLength * 1.02,
        side * bodyRadius * 1.62,
        0,
      ),
    ])
    parts.push(
      new THREE.TubeGeometry(
        antennaCurve,
        8,
        Math.max(bodyRadius * 0.07, 0.018),
        4,
        false,
      ),
    )
  }

  const geometry = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!geometry) throw new Error('Unable to create butterfly body geometry')
  geometry.computeBoundingSphere()
  return geometry
}

export function createButterflyGeometrySet(
  dimensions: ButterflyModelDimensions,
): ButterflyGeometrySet {
  const body = createBodyGeometry(dimensions)
  const leftForewing = createWingGeometry(
    createWingShape(FOREWING_OUTLINE, dimensions, 1),
    dimensions,
  )
  const leftHindwing = createWingGeometry(
    createWingShape(HINDWING_OUTLINE, dimensions, 1),
    dimensions,
  )
  const rightForewing = createWingGeometry(
    createWingShape(FOREWING_OUTLINE, dimensions, -1),
    dimensions,
  )
  const rightHindwing = createWingGeometry(
    createWingShape(HINDWING_OUTLINE, dimensions, -1),
    dimensions,
  )
  const all = [
    body,
    leftForewing,
    leftHindwing,
    rightForewing,
    rightHindwing,
  ] as const
  return {
    body,
    leftForewing,
    leftHindwing,
    rightForewing,
    rightHindwing,
    all,
  }
}

export function createButterflyModelView(
  geometry: ButterflyGeometrySet,
  materials: ButterflyModelMaterials,
): ButterflyModelView {
  const root = new THREE.Group()
  const leftWing = new THREE.Group()
  const rightWing = new THREE.Group()
  leftWing.add(
    new THREE.Mesh(geometry.leftHindwing, materials.hindwing),
    new THREE.Mesh(geometry.leftForewing, materials.forewing),
  )
  rightWing.add(
    new THREE.Mesh(geometry.rightHindwing, materials.hindwing),
    new THREE.Mesh(geometry.rightForewing, materials.forewing),
  )
  root.add(new THREE.Mesh(geometry.body, materials.body), leftWing, rightWing)
  return { root, leftWing, rightWing }
}

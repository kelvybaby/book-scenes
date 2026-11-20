import * as THREE from 'three'

const HINGE_X = -0.0635
const BOTTOM = -0.0123625
const BOOK_WIDTH = 0.127
const BOOK_HEIGHT = 0.19685
const BOOK_THICKNESS = 0.022225
const COVER_THICKNESS = 0.00046
const PAGE_THICKNESS = BOOK_THICKNESS - 2 * COVER_THICKNESS
const PAGE_WIDTH = BOOK_WIDTH - 0.00089
const PAGE_HEIGHT = BOOK_HEIGHT - 0.003
const GLUE_THICKNESS = 0.00034
const TOTAL_PAGES = 350
const MAX_OPEN_PAGES = 5
const PAGE_FRACTION = MAX_OPEN_PAGES / TOTAL_PAGES
const SINGLE_PAGE_THICKNESS = PAGE_THICKNESS / TOTAL_PAGES
// Accounts for the finite root fan while keeping the page-5 free edge at the
// approved 10 mm height above BOTTOM. It changes slope, not sheet length.
const OPEN_LEAF_DROP = -0.01264798

const FRONT_COVER_NAME = 'FrontCover_AnimationReady'
const BACK_COVER_NAME = 'BackCover_AnimationReady'
const PAGE_TEMPLATE_NAME = 'FrontLoosePage_01_AnimationReady'
const PAGE_BLOCK_NAME = 'PageBlock_ClosedShell'

type CrossSectionPoint = {
  x: number
  y: number
  region: 0 | 1 | 2
  u: number
}

type DynamicMesh = {
  mesh: THREE.Mesh
  geometry: THREE.BufferGeometry
}

export type EarlyPageOpenRig = {
  pose: (turnStep: number) => void
  dispose: () => void
}

const clamp01 = (value: number) => THREE.MathUtils.clamp(value, 0, 1)

const smoothstep = (value: number) => {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

const smootherStep = (value: number) => {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

const spineBendAmount = (q: number) => {
  const phase = Math.sin(Math.PI * clamp01(q))
  return 0.007 * phase ** 0.72
}

const spinePoint = (t: number, q: number) => {
  const direction = q <= 0.5 ? -1 : 1
  return {
    x:
      HINGE_X +
      direction * spineBendAmount(q) * Math.sin(Math.PI * t) ** 1.35,
    y: BOTTOM + COVER_THICKNESS + PAGE_THICKNESS * t,
  }
}

const findMaterial = (model: THREE.Object3D, objectName: string, materialName: string) => {
  const root = model.getObjectByName(objectName)
  let result: THREE.Material | null = null
  root?.traverse((node) => {
    if (result || !(node instanceof THREE.Mesh)) return
    const candidates = Array.isArray(node.material) ? node.material : [node.material]
    result = candidates.find((material) => material.name === materialName) ?? null
  })
  return result
}

const cloneMaterial = (
  source: THREE.Material | null,
  fallbackColor: number,
  roughness: number,
) => {
  const material = source
    ? source.clone()
    : new THREE.MeshStandardMaterial({ color: fallbackColor, roughness })
  material.side = THREE.DoubleSide
  material.needsUpdate = true
  return material
}

const pushQuad = (
  destination: number[],
  a: number,
  b: number,
  c: number,
  d: number,
  reversed = false,
) => {
  if (reversed) destination.push(a, d, c, a, c, b)
  else destination.push(a, b, c, a, c, d)
}

const finishIndexedGeometry = (
  geometry: THREE.BufferGeometry,
  materialIndices: number[][],
) => {
  const indices: number[] = []
  for (const group of materialIndices) indices.push(...group)
  geometry.setIndex(indices)
  let offset = 0
  for (let materialIndex = 0; materialIndex < materialIndices.length; materialIndex += 1) {
    const count = materialIndices[materialIndex].length
    if (count > 0) geometry.addGroup(offset, count, materialIndex)
    offset += count
  }
}

const wrapperCrossSection = (q: number, coverProgress: number) => {
  const points: CrossSectionPoint[] = []
  const coverSegments = 52
  const spineSegments = 32
  const filletSegments = 8
  const fillet = 0.00145

  for (let index = 0; index <= coverSegments; index += 1) {
    const u = 1 - index / coverSegments
    points.push({
      x: HINGE_X + fillet + u * (BOOK_WIDTH - fillet),
      y: BOTTOM + COVER_THICKNESS * 0.5 + 0.00018 * Math.sin(Math.PI * u),
      region: 1,
      u: 1 - u,
    })
  }

  for (let index = 1; index <= filletSegments; index += 1) {
    const s = index / filletSegments
    const theta = -Math.PI * 0.5 - Math.PI * 0.5 * s
    points.push({
      x: HINGE_X + fillet + fillet * Math.cos(theta),
      y:
        BOTTOM +
        COVER_THICKNESS * 0.5 +
        fillet +
        fillet * Math.sin(theta),
      region: 2,
      u: (s * fillet) / BOOK_THICKNESS,
    })
  }

  const t0 = fillet / PAGE_THICKNESS
  const t1 = 1 - t0
  for (let index = 1; index <= spineSegments; index += 1) {
    const t = t0 + ((t1 - t0) * index) / spineSegments
    const point = spinePoint(t, q)
    points.push({
      x: point.x,
      y: point.y - COVER_THICKNESS * 0.5,
      region: 2,
      u: t,
    })
  }

  const upper = points[points.length - 1]
  const turn = smootherStep(coverProgress)
  const shoulderAngle = Math.PI * (turn - 0.5)
  const shoulderLength = fillet * Math.PI * 0.5
  for (let index = 1; index <= filletSegments; index += 1) {
    const s = index / filletSegments
    const theta = Math.PI * 0.5 + shoulderAngle * s
    // The same finite shoulder curls right when closed and left when open.
    // A fixed left-facing shoulder made the closed cover too short and left
    // its root below the crowned sheets. The straight limit is continuous.
    const dx = Math.abs(shoulderAngle) < 0.000001 ? 0 :
      shoulderLength * (Math.sin(theta) - 1) / shoulderAngle
    const dy = Math.abs(shoulderAngle) < 0.000001 ? shoulderLength * s :
      -shoulderLength * Math.cos(theta) / shoulderAngle
    points.push({
      x: upper.x + dx,
      y: upper.y + dy + COVER_THICKNESS * smoothstep(s),
      region: 2,
      u: t1 + (s * fillet) / BOOK_THICKNESS,
    })
  }

  const root = points[points.length - 1]
  let x = root.x
  let y = root.y
  const segmentLength = BOOK_WIDTH / coverSegments
  for (let index = 1; index <= coverSegments; index += 1) {
    const u = (index - 0.5) / coverSegments
    const slope =
      ((BOTTOM + 0.0076) - root.y) * 6 * u * (1 - u) +
      0.0084 * Math.PI * Math.cos(Math.PI * u)
    // Card stock carries a broad, restrained bend, rather than the travelling
    // curl of a paper leaf. Tangent integration preserves the wrapper length.
    const closedSlope = 0.00105 * (9 * Math.exp(-u * 9) * (1 - u) ** 1.7 -
      1.7 * (1 - Math.exp(-u * 9)) * (1 - u) ** 0.7) +
      0.00069 * Math.PI * Math.cos(Math.PI * u)
    const angle = (1 - turn) * Math.atan(closedSlope / BOOK_WIDTH) +
      Math.PI * turn - turn * Math.atan(slope / BOOK_WIDTH) +
      0.08 * Math.sin(Math.PI * turn) * Math.sin(Math.PI * u)
    x += segmentLength * Math.cos(angle)
    y += segmentLength * Math.sin(angle)
    points.push({ x, y, region: 0, u: index / coverSegments })
  }
  return points
}

const createWrapperGeometry = () => {
  const sample = wrapperCrossSection(PAGE_FRACTION, 1)
  const pathLength = sample.length
  const depthSegments = 20
  const layerSize = pathLength * (depthSegments + 1)
  const vertexCount = layerSize * 2
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3))
  const uvs = new Float32Array(vertexCount * 2)
  const groups = Array.from({ length: 5 }, () => [] as number[])
  const vertex = (layer: number, pathIndex: number, depthIndex: number) =>
    layer * layerSize + depthIndex * pathLength + pathIndex

  for (let layer = 0; layer < 2; layer += 1) {
    for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
      const v = depthIndex / depthSegments
      for (let pathIndex = 0; pathIndex < pathLength; pathIndex += 1) {
        const index = vertex(layer, pathIndex, depthIndex)
        uvs[index * 2] = sample[pathIndex].u
        uvs[index * 2 + 1] = v
      }
    }
  }

  for (let layer = 0; layer < 2; layer += 1) {
    for (let depthIndex = 0; depthIndex < depthSegments; depthIndex += 1) {
      for (let pathIndex = 0; pathIndex < pathLength - 1; pathIndex += 1) {
        const region = layer === 0 ? sample[pathIndex + 1].region : 3
        pushQuad(
          groups[region],
          vertex(layer, pathIndex, depthIndex),
          vertex(layer, pathIndex + 1, depthIndex),
          vertex(layer, pathIndex + 1, depthIndex + 1),
          vertex(layer, pathIndex, depthIndex + 1),
          layer === 1,
        )
      }
    }
  }

  for (let depthIndex = 0; depthIndex < depthSegments; depthIndex += 1) {
    for (const pathIndex of [0, pathLength - 1]) {
      pushQuad(
        groups[4],
        vertex(0, pathIndex, depthIndex),
        vertex(1, pathIndex, depthIndex),
        vertex(1, pathIndex, depthIndex + 1),
        vertex(0, pathIndex, depthIndex + 1),
      )
    }
  }
  for (const depthIndex of [0, depthSegments]) {
    for (let pathIndex = 0; pathIndex < pathLength - 1; pathIndex += 1) {
      pushQuad(
        groups[4],
        vertex(0, pathIndex, depthIndex),
        vertex(0, pathIndex + 1, depthIndex),
        vertex(1, pathIndex + 1, depthIndex),
        vertex(1, pathIndex, depthIndex),
        depthIndex === 0,
      )
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  finishIndexedGeometry(geometry, groups)
  return { geometry, pathLength, depthSegments }
}

const updateWrapperGeometry = (
  geometry: THREE.BufferGeometry,
  pathLength: number,
  depthSegments: number,
  q: number,
  coverProgress: number,
) => {
  const points = wrapperCrossSection(q, coverProgress)
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const layerSize = pathLength * (depthSegments + 1)
  for (let layer = 0; layer < 2; layer += 1) {
    const offset = (layer === 0 ? 0.5 : -0.5) * COVER_THICKNESS
    for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
      const v = depthIndex / depthSegments
      for (let pathIndex = 0; pathIndex < pathLength; pathIndex += 1) {
        const before = points[Math.max(0, pathIndex - 1)]
        const after = points[Math.min(pathLength - 1, pathIndex + 1)]
        const dx = after.x - before.x
        const dy = after.y - before.y
        const length = Math.max(0.00000001, Math.hypot(dx, dy))
        const nx = -dy / length
        const ny = dx / length
        const crown =
          0.00035 *
          Math.sin(Math.PI * v) *
          Math.sin((Math.PI * pathIndex) / (pathLength - 1))
        const index = layer * layerSize + depthIndex * pathLength + pathIndex
        positions.setXYZ(
          index,
          points[pathIndex].x + nx * offset,
          points[pathIndex].y + ny * offset + crown,
          (v - 0.5) * BOOK_HEIGHT,
        )
      }
    }
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
}

const createGridSolidGeometry = (widthSegments: number, depthSegments: number, widthExponent = 1) => {
  const row = widthSegments + 1
  const layerSize = row * (depthSegments + 1)
  const columnU = Float64Array.from({ length: row }, (_, i) => (i / widthSegments) ** widthExponent)
  const edgeSources: number[] = []
  const edgeUvs: number[] = []
  const geometry = new THREE.BufferGeometry()
  const groups = [[], [], [], []] as number[][]
  const vertex = (layer: number, widthIndex: number, depthIndex: number) =>
    layer * layerSize + depthIndex * row + widthIndex
  for (let layer = 0; layer < 2; layer += 1) {
    for (let j = 0; j < depthSegments; j += 1) {
      for (let i = 0; i < widthSegments; i += 1) {
        pushQuad(groups[0], vertex(layer, i, j), vertex(layer, i + 1, j),
          vertex(layer, i + 1, j + 1), vertex(layer, i, j + 1), layer === 0)
      }
    }
  }
  const edgeVertex = (source: number, u: number, v: number) => {
    const index = layerSize * 2 + edgeSources.length
    edgeSources.push(source)
    edgeUvs.push(u, v)
    return index
  }
  for (let j = 0; j < depthSegments; j += 1) {
    pushQuad(groups[1],
      edgeVertex(vertex(0, widthSegments, j), 0, j / depthSegments),
      edgeVertex(vertex(1, widthSegments, j), 1, j / depthSegments),
      edgeVertex(vertex(1, widthSegments, j + 1), 1, (j + 1) / depthSegments),
      edgeVertex(vertex(0, widthSegments, j + 1), 0, (j + 1) / depthSegments))
  }
  for (const j of [0, depthSegments]) {
    for (let i = 0; i < widthSegments; i += 1) {
      pushQuad(groups[j === 0 ? 2 : 3],
        edgeVertex(vertex(0, i, j), columnU[i], 0),
        edgeVertex(vertex(0, i + 1, j), columnU[i + 1], 0),
        edgeVertex(vertex(1, i + 1, j), columnU[i + 1], 1),
        edgeVertex(vertex(1, i, j), columnU[i], 1), j === 0)
    }
  }
  const count = layerSize * 2 + edgeSources.length
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  const uvs = new Float32Array(count * 2)
  for (let layer = 0; layer < 2; layer += 1) {
    for (let j = 0; j <= depthSegments; j += 1) {
      for (let i = 0; i <= widthSegments; i += 1) {
        const k = vertex(layer, i, j)
        uvs[k * 2] = columnU[i]
        uvs[k * 2 + 1] = j / depthSegments
      }
    }
  }
  uvs.set(edgeUvs, layerSize * 4)
  geometry.userData.edgeSources = new Uint32Array(edgeSources)
  geometry.userData.surfaceVertexCount = layerSize * 2
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  finishIndexedGeometry(geometry, groups)
  return { geometry, widthSegments, depthSegments, columnU }
}

const updateEdges = (geometry: THREE.BufferGeometry) => {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const sources = geometry.userData.edgeSources as Uint32Array
  const first = geometry.userData.surfaceVertexCount as number
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i]
    positions.setXYZ(first + i, positions.getX(source), positions.getY(source), positions.getZ(source))
  }
}

const updatePageBlockGeometry = (
  geometry: THREE.BufferGeometry,
  widthSegments: number,
  depthSegments: number,
  q: number,
) => {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const row = widthSegments + 1
  const layerSize = row * (depthSegments + 1)
  for (let layer = 0; layer < 2; layer += 1) {
    for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
      const v = depthIndex / depthSegments
      for (let widthIndex = 0; widthIndex <= widthSegments; widthIndex += 1) {
        const u = widthIndex / widthSegments
        const root = spinePoint((1 - q) * layer, q)
        const rootX = root.x + COVER_THICKNESS * 0.5 + GLUE_THICKNESS
        const outerX = HINGE_X + PAGE_WIDTH
        const outerY =
          BOTTOM + COVER_THICKNESS + PAGE_THICKNESS * (1 - q) * layer
        let y = THREE.MathUtils.lerp(root.y, outerY, u)
        if (layer === 1) {
          y +=
            0.00105 *
              (1 - Math.exp(-u * 9)) *
              (1 - u) ** 1.7 +
            0.00024 * Math.sin(Math.PI * u) +
            0.00045 * Math.sin(Math.PI * v) * Math.sin(Math.PI * u)
          // Leave clearance for the thin leaves' clamped, initially flat root.
          y -= 0.000075 * smoothstep(u / 0.014)
        }
        const index = layer * layerSize + depthIndex * row + widthIndex
        positions.setXYZ(
          index,
          THREE.MathUtils.lerp(rootX, outerX, u),
          y,
          (v - 0.5) * PAGE_HEIGHT,
        )
      }
    }
  }
  updateEdges(geometry)
  positions.needsUpdate = true
  geometry.computeVertexNormals()
}

// Kinematic, inextensible strips: interpolate tangent angles, never vertex
// positions. Each material segment has the same length at every pose. The tip
// leads the middle of the sheet while the binding stays attached. This is a
// bounded paper approximation, not a physical simulation or collision solver.
const leafAngle = (u: number, v: number, progress: number) => {
  const turn = smootherStep(progress)
  const envelope = Math.sin(Math.PI * turn)
  const fan = smoothstep(u / 0.014)
  const targetSlope =
    OPEN_LEAF_DROP * 6 * u * (1 - u) +
    0.0119 * Math.PI * Math.cos(Math.PI * u) +
    0.00075 * Math.PI * Math.sin(Math.PI * v) * Math.cos(Math.PI * u)
  const openAngle = fan * (Math.PI - Math.atan(targetSlope / PAGE_WIDTH))
  // The stored sheet remains slightly crowned over the right block. Early
  // lift propagates from the outer half toward the binding; late motion rolls
  // out into the authored resting arch without a second settle-position blend.
  const closedSlope =
    0.00105 * (9 * Math.exp(-u * 9) * (1 - u) ** 1.7 -
      1.7 * (1 - Math.exp(-u * 9)) * (1 - u) ** 0.7) +
    (0.00024 + 0.00045 * Math.sin(Math.PI * v)) * Math.PI * Math.cos(Math.PI * u)
  const closedAngle = fan * Math.atan(closedSlope / PAGE_WIDTH)
  const curl = 0.78 * envelope * Math.sin(Math.PI * u * 0.85) * fan
  const corner = 0.095 * envelope * (v - 0.5) * u * u * fan
  return THREE.MathUtils.lerp(closedAngle, openAngle, turn) + curl + corner
}

type LeafProfile = {
  // Reused buffers: no per-vertex objects or arrays on the animation path.
  x: Float64Array
  y: Float64Array
  angle: Float64Array
}

const createLeafProfile = (widthSegments: number, depthSegments: number): LeafProfile => {
  const count = (widthSegments + 1) * (depthSegments + 1)
  return { x: new Float64Array(count), y: new Float64Array(count), angle: new Float64Array(count) }
}

const updateLeafGeometry = (
  geometry: THREE.BufferGeometry,
  widthSegments: number,
  depthSegments: number,
  columnU: Float64Array,
  profile: LeafProfile,
  pageNumber: number,
  turnProgress: number,
  q: number,
) => {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const row = widthSegments + 1
  const layerSize = row * (depthSegments + 1)
  const root = spinePoint(1 - (pageNumber - 0.5) / TOTAL_PAGES, q)
  root.x += COVER_THICKNESS * 0.5 + GLUE_THICKNESS
  const baseRoot = spinePoint(1 - (MAX_OPEN_PAGES - 0.5) / TOTAL_PAGES, q)
  baseRoot.x += COVER_THICKNESS * 0.5 + GLUE_THICKNESS
  const turn = smootherStep(turnProgress)
  const rootDX = root.x - baseRoot.x
  const rootDY = root.y - baseRoot.y
  for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
    const v = depthIndex / depthSegments
    const base = depthIndex * row
    profile.x[base] = baseRoot.x
    profile.y[base] = baseRoot.y
    profile.angle[base] = leafAngle(0, v, turnProgress)
    for (let i = 1; i <= widthSegments; i += 1) {
      const u = columnU[i]
      const segmentLength = PAGE_WIDTH * (u - columnU[i - 1])
      const angle = leafAngle((u + columnU[i - 1]) * 0.5, v, turnProgress)
      profile.x[base + i] = profile.x[base + i - 1] + segmentLength * Math.cos(angle)
      profile.y[base + i] = profile.y[base + i - 1] + segmentLength * Math.sin(angle)
      profile.angle[base + i] = leafAngle(u, v, turnProgress)
    }
  }
  for (let layer = 0; layer < 2; layer += 1) {
    const halfThickness = (layer === 0 ? -0.5 : 0.5) * SINGLE_PAGE_THICKNESS
    for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
      const v = depthIndex / depthSegments
      for (let i = 0; i <= widthSegments; i += 1) {
        const k = depthIndex * row + i
        const angle = profile.angle[k]
        // Rotate the distinct root interval with the tangent. Interpolating
        // between a vertical root offset and a normal offset compressed the
        // stack inside the fan. This keeps adjacent leaves parallel there.
        const fan = smoothstep(columnU[i] / 0.014)
        const separation = 1 + 0.03 * fan * turn
        const offsetX = separation * (rootDX * Math.cos(angle) - rootDY * Math.sin(angle))
        const offsetY = separation * (rootDX * Math.sin(angle) + rootDY * Math.cos(angle))
        positions.setXYZ(layer * layerSize + k,
          profile.x[k] + offsetX - Math.sin(angle) * halfThickness,
          profile.y[k] + offsetY + Math.cos(angle) * halfThickness,
          (v - 0.5) * PAGE_HEIGHT)
      }
    }
  }
  updateEdges(geometry)
  positions.needsUpdate = true
  geometry.computeVertexNormals()
}

export function createEarlyPageOpenRig(
  model: THREE.Group,
  requestedLeafCount: number,
): EarlyPageOpenRig {
  const leafCount = THREE.MathUtils.clamp(
    Math.round(requestedLeafCount),
    1,
    MAX_OPEN_PAGES,
  )
  const materials = {
    front: cloneMaterial(findMaterial(model, FRONT_COVER_NAME, 'Front cover photograph'), 0x9e6d37, 0.6),
    back: cloneMaterial(findMaterial(model, BACK_COVER_NAME, 'Back cover photograph'), 0x9e6d37, 0.62),
    spine: cloneMaterial(findMaterial(model, 'Spine', 'Spine photograph'), 0x80532e, 0.62),
    inside: cloneMaterial(null, 0xd2c39e, 0.86),
    coverEdge: cloneMaterial(null, 0xbb9254, 0.8),
    paper: cloneMaterial(findMaterial(model, PAGE_TEMPLATE_NAME, 'Warm aged paper'), 0xd8c9a8, 0.91),
    pageEdge: cloneMaterial(findMaterial(model, PAGE_BLOCK_NAME, 'Fore edge photograph'), 0xc5b48e, 0.9),
    leafEdge: cloneMaterial(null, 0xa28e6d, 0.94),
    pageTop: cloneMaterial(findMaterial(model, PAGE_BLOCK_NAME, 'Top edge photograph'), 0xc5b48e, 0.9),
    pageBottom: cloneMaterial(findMaterial(model, PAGE_BLOCK_NAME, 'Bottom edge photograph'), 0xc5b48e, 0.9),
  }
  const ownedMaterials = Object.values(materials)
  const originalVisibility = new Map<THREE.Object3D, boolean>()
  model.traverse((node) => {
    if (node instanceof THREE.Mesh) originalVisibility.set(node, node.visible)
  })

  const group = new THREE.Group()
  group.name = 'OpenReading_Page005_ApprovedProfile'
  group.visible = false
  model.add(group)

  const wrapperData = createWrapperGeometry()
  const wrapper: DynamicMesh = {
    geometry: wrapperData.geometry,
    mesh: new THREE.Mesh(wrapperData.geometry, [
      materials.front,
      materials.back,
      materials.spine,
      materials.inside,
      materials.coverEdge,
    ]),
  }
  wrapper.mesh.name = 'OpenReading_ContinuousWrapper_BackSpineFront'
  wrapper.mesh.frustumCulled = false
  group.add(wrapper.mesh)

  const blockData = createGridSolidGeometry(48, 18)
  const pageBlock: DynamicMesh = {
    geometry: blockData.geometry,
    mesh: new THREE.Mesh(blockData.geometry, [materials.paper, materials.pageEdge, materials.pageTop, materials.pageBottom]),
  }
  pageBlock.mesh.name = 'OpenReading_Remaining345of350_PageBlock'
  pageBlock.mesh.frustumCulled = false
  group.add(pageBlock.mesh)

  const leaves = Array.from({ length: leafCount }, (_, index) => {
    // Concentrate samples at the tight binding bend, without making the entire
    // sheet denser. Material coordinates and integration use the same spacing.
    const data = createGridSolidGeometry(96, 12, 1.5)
    const leaf: DynamicMesh = {
      geometry: data.geometry,
      mesh: new THREE.Mesh(data.geometry, [materials.paper, materials.leafEdge, materials.leafEdge, materials.leafEdge]),
    }
    leaf.mesh.name = `OpenReading_OpenedLeaf_${String(index + 1).padStart(3, '0')}_DistinctRoot`
    leaf.mesh.frustumCulled = false
    leaf.mesh.renderOrder = index + 1
    group.add(leaf.mesh)
    return { ...leaf, ...data, profile: createLeafProfile(data.widthSegments, data.depthSegments), pageNumber: index + 1 }
  })

  let previousTurnStep = Number.NaN
  let previousQ = Number.NaN
  const previousLeafProgress = new Float64Array(leafCount).fill(Number.NaN)
  const pose = (turnStep: number) => {
    if (Math.abs(turnStep - previousTurnStep) <= 0.000001) return
    const coverProgress = clamp01(turnStep)
    const openedLeaves = leaves.reduce((sum, leaf) => sum + smootherStep(clamp01(turnStep - leaf.pageNumber)), 0)
    const q = (0.15 * smootherStep(coverProgress) + 0.85 * openedLeaves / leafCount) * PAGE_FRACTION
    const showRig = true
    group.visible = showRig
    for (const [node, wasVisible] of originalVisibility) {
      node.visible = showRig ? false : wasVisible
    }
    if (showRig) {
      updateWrapperGeometry(
        wrapper.geometry,
        wrapperData.pathLength,
        wrapperData.depthSegments,
        q,
        coverProgress,
      )
      if (!Number.isFinite(previousTurnStep)) updatePageBlockGeometry(
        pageBlock.geometry,
        blockData.widthSegments,
        blockData.depthSegments,
        PAGE_FRACTION,
      )
      for (const [index, leaf] of leaves.entries()) {
        const progress = clamp01(turnStep - leaf.pageNumber)
        if (q === previousQ && progress === previousLeafProgress[index]) continue
        updateLeafGeometry(
          leaf.geometry,
          leaf.widthSegments,
          leaf.depthSegments,
          leaf.columnU,
          leaf.profile,
          leaf.pageNumber,
          progress,
          q,
        )
        previousLeafProgress[index] = progress
      }
    }
    previousQ = q
    previousTurnStep = turnStep
  }

  pose(0)
  return {
    pose,
    dispose() {
      for (const [node, wasVisible] of originalVisibility) node.visible = wasVisible
      group.removeFromParent()
      wrapper.geometry.dispose()
      pageBlock.geometry.dispose()
      leaves.forEach((leaf) => leaf.geometry.dispose())
      ownedMaterials.forEach((material) => material.dispose())
    },
  }
}

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

const findFirstMaterial = (model: THREE.Object3D, objectName: string) => {
  const root = model.getObjectByName(objectName)
  let result: THREE.Material | null = null
  root?.traverse((node) => {
    if (result || !(node instanceof THREE.Mesh)) return
    result = Array.isArray(node.material) ? node.material[0] : node.material
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
  for (let index = 1; index <= filletSegments; index += 1) {
    const s = index / filletSegments
    const theta = Math.PI * 0.5 * s
    points.push({
      x: upper.x - fillet + fillet * Math.cos(theta),
      y: upper.y + fillet * Math.sin(theta),
      region: 2,
      u: t1 + (s * fillet) / BOOK_THICKNESS,
    })
  }

  const root = points[points.length - 1]
  const turn = smootherStep(coverProgress)
  const theta = Math.PI * turn
  const settle = smootherStep((turn - 0.62) / 0.38)
  for (let index = 1; index <= coverSegments; index += 1) {
    const u = index / coverSegments
    const eased = smoothstep(u)
    const rotatedX = root.x + BOOK_WIDTH * u * Math.cos(theta)
    const rotatedY =
      root.y +
      BOOK_WIDTH * u * Math.sin(theta) +
      0.0105 * Math.sin(Math.PI * u) ** 1.15 * Math.sin(Math.PI * turn) ** 0.9
    const targetX = root.x - BOOK_WIDTH * u
    const targetY =
      root.y * (1 - eased) +
      (BOTTOM + 0.0076) * eased +
      0.0084 * Math.sin(Math.PI * u) ** 1.05
    points.push({
      x: THREE.MathUtils.lerp(rotatedX, targetX, settle),
      y: THREE.MathUtils.lerp(rotatedY, targetY, settle),
      region: 0,
      u,
    })
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
  geometry.computeBoundingSphere()
}

const createGridSolidGeometry = (widthSegments: number, depthSegments: number) => {
  const row = widthSegments + 1
  const layerSize = row * (depthSegments + 1)
  const vertexCount = layerSize * 2
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3))
  const uvs = new Float32Array(vertexCount * 2)
  const groups = [[], []] as number[][]
  const vertex = (layer: number, widthIndex: number, depthIndex: number) =>
    layer * layerSize + depthIndex * row + widthIndex

  for (let layer = 0; layer < 2; layer += 1) {
    for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
      const v = depthIndex / depthSegments
      for (let widthIndex = 0; widthIndex <= widthSegments; widthIndex += 1) {
        const u = widthIndex / widthSegments
        const index = vertex(layer, widthIndex, depthIndex)
        uvs[index * 2] = u
        uvs[index * 2 + 1] = v
      }
    }
  }

  for (let layer = 0; layer < 2; layer += 1) {
    for (let depthIndex = 0; depthIndex < depthSegments; depthIndex += 1) {
      for (let widthIndex = 0; widthIndex < widthSegments; widthIndex += 1) {
        pushQuad(
          groups[0],
          vertex(layer, widthIndex, depthIndex),
          vertex(layer, widthIndex + 1, depthIndex),
          vertex(layer, widthIndex + 1, depthIndex + 1),
          vertex(layer, widthIndex, depthIndex + 1),
          layer === 0,
        )
      }
    }
  }

  for (let depthIndex = 0; depthIndex < depthSegments; depthIndex += 1) {
    pushQuad(
      groups[1],
      vertex(0, widthSegments, depthIndex),
      vertex(1, widthSegments, depthIndex),
      vertex(1, widthSegments, depthIndex + 1),
      vertex(0, widthSegments, depthIndex + 1),
    )
  }
  for (const depthIndex of [0, depthSegments]) {
    for (let widthIndex = 0; widthIndex < widthSegments; widthIndex += 1) {
      pushQuad(
        groups[1],
        vertex(0, widthIndex, depthIndex),
        vertex(0, widthIndex + 1, depthIndex),
        vertex(1, widthIndex + 1, depthIndex),
        vertex(1, widthIndex, depthIndex),
        depthIndex === 0,
      )
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  finishIndexedGeometry(geometry, groups)
  return { geometry, widthSegments, depthSegments }
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
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
}

const updateLeafGeometry = (
  geometry: THREE.BufferGeometry,
  widthSegments: number,
  depthSegments: number,
  pageNumber: number,
  turnProgress: number,
  q: number,
) => {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const row = widthSegments + 1
  const layerSize = row * (depthSegments + 1)
  const t = 1 - (pageNumber - 0.5) / TOTAL_PAGES
  const root = spinePoint(t, q)
  root.x += COVER_THICKNESS * 0.5 + GLUE_THICKNESS
  const baseT = 1 - (MAX_OPEN_PAGES - 0.5) / TOTAL_PAGES
  const baseRoot = spinePoint(baseT, q)
  baseRoot.x += COVER_THICKNESS * 0.5 + GLUE_THICKNESS
  const rank = MAX_OPEN_PAGES - pageNumber
  const turn = smootherStep(turnProgress)
  const theta = Math.PI * turn
  const settle = smootherStep((turn - 0.62) / 0.38)

  for (let layer = 0; layer < 2; layer += 1) {
    const thicknessOffset = (layer === 0 ? -0.5 : 0.5) * SINGLE_PAGE_THICKNESS
    for (let depthIndex = 0; depthIndex <= depthSegments; depthIndex += 1) {
      const v = depthIndex / depthSegments
      for (let widthIndex = 0; widthIndex <= widthSegments; widthIndex += 1) {
        const u = widthIndex / widthSegments
        const eased = smoothstep(u)
        const rotatingX = root.x + PAGE_WIDTH * u * Math.cos(theta)
        const rotatingY =
          root.y +
          PAGE_WIDTH * u * Math.sin(theta) +
          0.0105 * Math.sin(Math.PI * u) ** 1.12 * Math.sin(Math.PI * turn) ** 0.9
        const targetX = root.x + (baseRoot.x - PAGE_WIDTH - root.x) * u
        let targetY =
          baseRoot.y * (1 - eased) +
          (BOTTOM + 0.01) * eased +
          0.0119 * Math.sin(Math.PI * u) ** 1.02
        targetY += (root.y - baseRoot.y) * (1 - eased)
        targetY +=
          rank *
          (0.00009 * eased + 0.00018 * Math.sin(Math.PI * u) ** 1.12)
        targetY +=
          0.00075 * Math.sin(Math.PI * v) * Math.sin(Math.PI * u) ** 1.2

        const index = layer * layerSize + depthIndex * row + widthIndex
        positions.setXYZ(
          index,
          THREE.MathUtils.lerp(rotatingX, targetX, settle),
          THREE.MathUtils.lerp(rotatingY, targetY, settle) + thicknessOffset,
          (v - 0.5) * PAGE_HEIGHT,
        )
      }
    }
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
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
    front: cloneMaterial(findFirstMaterial(model, FRONT_COVER_NAME), 0x9e6d37, 0.6),
    back: cloneMaterial(findFirstMaterial(model, BACK_COVER_NAME), 0x9e6d37, 0.62),
    spine: cloneMaterial(findFirstMaterial(model, 'Spine'), 0x80532e, 0.62),
    inside: cloneMaterial(null, 0xd2c39e, 0.86),
    coverEdge: cloneMaterial(null, 0xbb9254, 0.8),
    paper: cloneMaterial(findFirstMaterial(model, PAGE_TEMPLATE_NAME), 0xd8c9a8, 0.91),
    pageEdge: cloneMaterial(findFirstMaterial(model, PAGE_BLOCK_NAME), 0xc5b48e, 0.9),
    leafEdge: cloneMaterial(null, 0xbca982, 0.94),
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
    mesh: new THREE.Mesh(blockData.geometry, [materials.paper, materials.pageEdge]),
  }
  pageBlock.mesh.name = 'OpenReading_Remaining345of350_PageBlock'
  pageBlock.mesh.frustumCulled = false
  group.add(pageBlock.mesh)

  const leaves = Array.from({ length: leafCount }, (_, index) => {
    const data = createGridSolidGeometry(48, 12)
    const leaf: DynamicMesh = {
      geometry: data.geometry,
      mesh: new THREE.Mesh(data.geometry, [materials.paper, materials.leafEdge]),
    }
    leaf.mesh.name = `OpenReading_OpenedLeaf_${String(index + 1).padStart(3, '0')}_DistinctRoot`
    leaf.mesh.frustumCulled = false
    leaf.mesh.renderOrder = index + 1
    group.add(leaf.mesh)
    return { ...leaf, ...data, pageNumber: index + 1 }
  })

  let previousTurnStep = Number.NaN
  const pose = (turnStep: number) => {
    if (Math.abs(turnStep - previousTurnStep) <= 0.000001) return
    const coverProgress = clamp01(turnStep)
    const q = PAGE_FRACTION * smootherStep(coverProgress)
    const showRig = turnStep > 0.0001
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
      updatePageBlockGeometry(
        pageBlock.geometry,
        blockData.widthSegments,
        blockData.depthSegments,
        q,
      )
      for (const leaf of leaves) {
        updateLeafGeometry(
          leaf.geometry,
          leaf.widthSegments,
          leaf.depthSegments,
          leaf.pageNumber,
          clamp01(turnStep - leaf.pageNumber),
          q,
        )
      }
    }
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

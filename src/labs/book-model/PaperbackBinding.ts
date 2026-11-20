import * as THREE from 'three'
import { createBookPageRig, disposeBookPageRig, poseBookPage, type BookPageRig } from './BookPageRig'

// The photographed closed spine runs between these two cover edges (metres).
const HINGE_X = -0.0635
const BOTTOM = -0.0123625
const HEIGHT = 0.024725
const GUTTER_REACH = 0.052

/** One material coordinate across the glue line, shared by paper and wrapper. */
function bindingOffset(y: number, openness: number) {
  const t = THREE.MathUtils.clamp((y - BOTTOM) / HEIGHT, 0, 1)
  // Unroll the vertical wrapper into a shallow concave arc under the gutter.
  // Its ends meet the covers; the middle never projects above the paper.
  const angle = (t - 0.5) * 0.8
  const radius = HEIGHT / 0.8
  const x = -radius * (Math.sin(angle) + Math.sin(0.4))
  const openY = BOTTOM + radius * (Math.cos(0.4) - Math.cos(angle))
  return { x: x * openness, y: (openY - y) * openness }
}

type Surface = {
  source: THREE.Mesh
  mesh: THREE.Mesh
  rest: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
  rig?: BookPageRig
  wrapper: boolean
  spine: boolean
}

export function createPaperbackBinding(
  model: THREE.Group,
  pageBlock: BookPageRig,
  cover: BookPageRig,
  leaves: BookPageRig[],
) {
  const surfaces: Surface[] = []
  const add = (source: THREE.Mesh, rig?: BookPageRig, wrapper = false, spine = false) => {
    const geometry = source.geometry.clone()
    geometry.deleteAttribute('skinIndex')
    geometry.deleteAttribute('skinWeight')
    const mesh = new THREE.Mesh(geometry, source.material)
    mesh.name = `${source.name}_FlexibleBinding`
    mesh.frustumCulled = false
    mesh.renderOrder = source.renderOrder
    source.parent?.add(mesh)
    source.visible = false
    surfaces.push({ source, mesh, rest: source.geometry.getAttribute('position'), rig, wrapper, spine })
  }
  add(pageBlock.mesh, pageBlock)
  add(cover.mesh, cover, true)
  leaves.forEach((leaf) => add(leaf.mesh, leaf))
  const rearRigs: BookPageRig[] = []
  const rearTemplates: THREE.Object3D[] = []
  for (const name of [
    'BackCover_AnimationReady',
    'BackLoosePage_01_AnimationReady',
    'BackLoosePage_02_AnimationReady',
    'BackLoosePage_03_AnimationReady',
    'BackFlyleaf_Blank_AnimationReady',
  ]) {
    const template = model.getObjectByName(name)
    if (!template) continue
    const rig = createBookPageRig(template, {
      name: `${name}_Curved`, segments: 36, turnAngle: 0,
      restingBend: pageBlock.restingBend, turningBend: 0, settledBend: 0, cornerFold: 0,
    })
    template.parent?.add(rig.mesh)
    template.visible = false
    rearTemplates.push(template)
    rearRigs.push(rig)
    add(rig.mesh, rig)
  }
  const originals: THREE.Mesh[] = []
  model.traverse((node) => {
    if (node instanceof THREE.Mesh && node.name === 'Spine') {
      originals.push(node)
    }
  })
  originals.forEach((mesh) => add(mesh, undefined, false, mesh.name === 'Spine'))
  const vertex = new THREE.Vector3()
  let previousOpenness = -1
  let previousTurnStep = -1
  return {
    pose(openness: number, turnStep = 0) {
      if (openness === previousOpenness && turnStep === previousTurnStep) return
      rearRigs.forEach((rig) => poseBookPage(rig, 0, openness))
      for (const surface of surfaces) {
        const { source, mesh, rest, rig, wrapper, spine } = surface
        if (!rig && openness === previousOpenness) continue
        source.updateWorldMatrix(true, true)
        if (rig) rig.skeleton.update()
        mesh.position.copy(source.position)
        mesh.quaternion.copy(source.quaternion)
        mesh.scale.copy(source.scale)
        const positions = mesh.geometry.getAttribute('position')
        for (let i = 0; i < rest.count; i += 1) {
          source.getVertexPosition(i, vertex)
          const originalY = rig && rig !== pageBlock
            ? rig.rightHingeY
            : rest.getY(i) + source.position.y
          const offset = bindingOffset(originalY, openness)
          const distance = Math.max(0, vertex.x - HINGE_X)
          const u = THREE.MathUtils.clamp(distance / GUTTER_REACH, 0, 1)
          const weight = wrapper || spine ? 1 : 1 - u * u * (3 - 2 * u)
          vertex.x += offset.x * weight
          vertex.y += offset.y * weight
          positions.setXYZ(i, vertex.x, vertex.y, vertex.z)
        }
        positions.needsUpdate = true
        mesh.geometry.computeVertexNormals()
      }
      previousOpenness = openness
      previousTurnStep = turnStep
    },
    dispose() {
      surfaces.forEach(({ source, mesh }) => {
        source.visible = true
        mesh.removeFromParent()
        mesh.geometry.dispose()
      })
      rearRigs.forEach((rig) => {
        rig.mesh.removeFromParent()
        disposeBookPageRig(rig)
      })
      rearTemplates.forEach((template) => { template.visible = true })
    },
  }
}

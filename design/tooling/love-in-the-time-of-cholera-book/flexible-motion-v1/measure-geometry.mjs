// Geometry inspection, not a test suite: records measured tolerances for review.
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import ts from 'typescript'
import * as THREE from 'three'
const dir = path.dirname(fileURLToPath(import.meta.url))
const files = {
  original: 'EarlyPageOpenRig.before.txt',
  restart: 'EarlyPageOpenRig.restart.txt',
  candidate: '../../../../src/labs/book-model/EarlyPageOpenRig.ts',
}
const measurements = {}
for (const [name, filename] of Object.entries(files)) {
  const source = (await fs.readFile(path.resolve(dir, filename), 'utf8')).replaceAll('geometry.computeBoundingSphere()', '')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const temp = path.join(dir, `.geometry-${name}.mjs`)
  await fs.writeFile(temp, compiled)
  const { createEarlyPageOpenRig } = await import(pathToFileURL(temp).href)
  const model = new THREE.Group()
  const rig = createEarlyPageOpenRig(model, 5)
  let minWidth = Infinity, maxWidth = -Infinity, minThickness = Infinity, maxThickness = -Infinity
  let maxRootYDrift = 0, minRootInterval = Infinity
  let minSettledNormalSeparation = Infinity
  let minSettledBodySeparation = Infinity
  let invalidLeafPoses = 0
  const poseTimes = []
  const rootYs = []
  let endpoint
  for (let step = 0.025; step <= 6.00001; step += 0.025) {
    const started = performance.now()
    rig.pose(step)
    poseTimes.push(performance.now() - started)
    const leaves = model.children.flatMap(group => group.children).filter(mesh => mesh.name.includes('OpenedLeaf_'))
    const centers = []
    for (const [leafIndex, mesh] of leaves.entries()) {
      const a = mesh.geometry.getAttribute('position')
      if (a.array.some(value => !Number.isFinite(value))) {
        invalidLeafPoses++
        centers.push(null)
        continue
      }
      const segments = name === 'original' ? 48 : 96
      const row = segments + 1, layerSize = row * 13
      const positions = []
      for (let j = 0; j <= 12; j++) {
        let width = 0
        let last
        for (let i = 0; i <= segments; i++) {
          const k = j * row + i
          const lower = new THREE.Vector3().fromBufferAttribute(a, k)
          const upper = new THREE.Vector3().fromBufferAttribute(a, k + layerSize)
          const thickness = lower.distanceTo(upper)
          minThickness = Math.min(minThickness, thickness)
          maxThickness = Math.max(maxThickness, thickness)
          const center = lower.add(upper).multiplyScalar(0.5)
          if (last) width += center.distanceTo(last)
          last = center
          if (j === 6) positions.push(center)
        }
        minWidth = Math.min(minWidth, width)
        maxWidth = Math.max(maxWidth, width)
      }
      if (!rootYs[leafIndex]) rootYs[leafIndex] = positions[0].y
      maxRootYDrift = Math.max(maxRootYDrift, Math.abs(rootYs[leafIndex] - positions[0].y))
      centers.push(positions)
    }
    for (let i = 1; i < centers.length; i++) {
      if (centers[i - 1] && centers[i]) minRootInterval = Math.min(minRootInterval, centers[i - 1][0].distanceTo(centers[i][0]))
    }
    if (step > 5.999) {
      for (let j = 1; j < centers.length; j++) {
        if (!centers[j] || !centers[j - 1]) continue
        for (let i = 1; i < centers[j].length - 1; i++) {
          const tangent = centers[j][i + 1].clone().sub(centers[j][i - 1]).normalize()
          const normal = new THREE.Vector3(-tangent.y, tangent.x, 0)
          const separation = centers[j - 1][i].clone().sub(centers[j][i]).dot(normal)
          minSettledNormalSeparation = Math.min(minSettledNormalSeparation, separation)
          if (i > 12) minSettledBodySeparation = Math.min(minSettledBodySeparation, separation)
        }
      }
      endpoint = centers.map(points => points && ({ root: points[0].toArray(), tip: points.at(-1).toArray() }))
    }
  }
  const meshes = model.children.flatMap(group => group.children).filter(mesh => mesh.isMesh)
  poseTimes.sort((a, b) => a - b)
  measurements[name] = { widthMM: [minWidth * 1000, maxWidth * 1000], thicknessMM: [minThickness * 1000, maxThickness * 1000], maxRootYDriftMM: maxRootYDrift * 1000, minRootIntervalMM: minRootInterval * 1000, minSettledNormalSeparationMM: minSettledNormalSeparation * 1000, minSettledBodySeparationMM: minSettledBodySeparation * 1000, invalidLeafPoses, cpuPoseMS: { p50: poseTimes[Math.floor(poseTimes.length * 0.5)], p95: poseTimes[Math.floor(poseTimes.length * 0.95)], context: 'Node geometry posing only; excludes rendering/GPU' }, vertices: meshes.reduce((n, m) => n + m.geometry.getAttribute('position').count, 0), triangles: meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0), endpoint }
  rig.dispose()
  await fs.unlink(temp)
}
await fs.writeFile(path.join(dir, 'geometry-measurements.json'), JSON.stringify(measurements, null, 2))
console.log(JSON.stringify(measurements, null, 2))

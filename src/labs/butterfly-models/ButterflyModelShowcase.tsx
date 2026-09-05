import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  createButterflyGeometrySet,
  createButterflyModelView,
} from '../../components/butterflyModel'
import './butterflyModelShowcase.css'

type ModelState = {
  label: string
  flap: number
  pitch: number
  yaw: number
  roll: number
}

const MODEL_STATES: readonly ModelState[] = [
  { label: 'Open / dorsal', flap: 0.06, pitch: 0, yaw: 0, roll: 0 },
  { label: 'Three-quarter', flap: 0.48, pitch: 0.16, yaw: 0.34, roll: -0.08 },
  { label: 'Folded / side', flap: 1.2, pitch: 0.66, yaw: 0.12, roll: 0.05 },
  { label: 'Banked turn', flap: 0.76, pitch: -0.24, yaw: -0.46, roll: -0.13 },
]

const MODEL_DIMENSIONS = {
  wingSpan: 1.87,
  wingLength: 3.2,
  bodyLength: 2.4,
  bodyRadius: 0.18,
}

function ButterflyAngleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-8.5, 8.5, 2.6, -2.6, 0.1, 40)
    camera.position.z = 14
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)

    const geometry = createButterflyGeometrySet(MODEL_DIMENSIONS)
    const materials = {
      body: new THREE.MeshBasicMaterial({ color: 0x65471f }),
      forewing: new THREE.MeshBasicMaterial({
        color: 0xf4d66f,
        side: THREE.DoubleSide,
      }),
      hindwing: new THREE.MeshBasicMaterial({
        color: 0xffe8a0,
        side: THREE.DoubleSide,
      }),
    }
    const positions = [-5.4, -1.8, 1.8, 5.4]

    MODEL_STATES.forEach((state, index) => {
      const model = createButterflyModelView(geometry, materials)
      model.leftWing.rotation.x = state.flap
      model.rightWing.rotation.x = -state.flap
      model.root.rotation.set(
        state.pitch,
        state.yaw,
        Math.PI * 0.5 + state.roll,
        'ZXY',
      )
      model.root.position.x = positions[index]
      model.root.scale.setScalar(0.74)
      scene.add(model.root)
    })

    const render = () => {
      const width = Math.max(canvas.clientWidth, 1)
      const height = Math.max(canvas.clientHeight, 1)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(width, height, false)
      const halfHeight = 2.6
      const halfWidth = halfHeight * (width / height)
      camera.left = -halfWidth
      camera.right = halfWidth
      camera.top = halfHeight
      camera.bottom = -halfHeight
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
    }

    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    render()

    return () => {
      observer.disconnect()
      for (const item of geometry.all) item.dispose()
      materials.body.dispose()
      materials.forewing.dispose()
      materials.hindwing.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <canvas
      aria-label="One butterfly model shown open, at three-quarter angle, folded in side profile, and banking"
      className="butterfly-model-study__canvas"
      ref={canvasRef}
    />
  )
}

export function ButterflyModelShowcase() {
  return (
    <main className="butterfly-model-study">
      <header>
        <h1>Butterfly model</h1>
        <p>One shared four-wing model, shown from four flight angles.</p>
      </header>
      <section>
        <ButterflyAngleCanvas />
        <div className="butterfly-model-study__labels" aria-hidden="true">
          {MODEL_STATES.map((state) => (
            <span key={state.label}>{state.label}</span>
          ))}
        </div>
      </section>
    </main>
  )
}

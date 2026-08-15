import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { PassageLeaf } from '../content/passages'
import type { AmbientWindField } from '../motion/AmbientWindField'
import { RELEASE_CONTACT_TIME } from '../motion/WindField'
import {
  PAPER_SCRIPTED_RELEASE_PITCH,
  PaperSheet,
  type PaperEnvironment,
  type PaperReleaseMotionTuning,
} from '../motion/PaperSheet'
import {
  APPROVED_PAPER_LAB_PRESET,
  PaperPhysicsLabSolver,
  type PaperLabSettings,
} from '../labs/paper-physics/PaperPhysicsLabSolver'

type WindPageProps = {
  ambientWind: AmbientWindField
  anchorRef: RefObject<HTMLElement | null>
  originRef: RefObject<HTMLElement | null>
  passage: PassageLeaf
  state: 'opening' | 'open' | 'closing'
  onReady: (ready: boolean) => void
  onOpened: () => void
  onGone: () => void
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

type QuoteLayout = {
  displayWidth: number
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  lineHeight: number
}

const GHOST_PAGE_OPACITY = {
  highlight: 0.75,
  body: 0.65,
  edge: 0.35,
} as const

const OPENING_MOTION = {
  duration: 3,
  revealDuration: 0.46,
  startScale: 0.066,
  arcHeight: 52,
  lateralBow: 24,
  rippleDepth: 22,
  rippleCycles: 2.15,
} as const

type RoadBoundaryPoint = readonly [x: number, y: number]

// Normalized source-image coordinates traced from the two visible road edges
// in the approved Study Q composition. They are projected through the same
// centered object-fit: cover transform as the scene artwork.
const ROAD_TOP: readonly RoadBoundaryPoint[] = [
  [0.316, 0.671],
  [0.406, 0.704],
  [0.486, 0.725],
  [0.508, 0.742],
  [0.581, 0.748],
  [0.669, 0.748],
  [0.781, 0.779],
  [0.884, 0.78],
  [0.992, 0.811],
]

// Keep the enforced upper limit visually calm while preserving the detailed
// curb trace above for reference. Two endpoints produce a straight guide.
const ROAD_TOP_ENFORCED: readonly RoadBoundaryPoint[] = [ROAD_TOP[0], ROAD_TOP[ROAD_TOP.length - 1]]

const ROAD_BOTTOM: readonly RoadBoundaryPoint[] = [
  [0.316, 0.74],
  [0.418, 0.761],
  [0.557, 0.798],
  [0.739, 0.846],
  [0.884, 0.87],
  [0.994, 0.894],
]

// The traced points run along the visible curb stones themselves. Keep the
// simulated leaf inside those lines, rather than treating the stones as usable
// roadway, so a small projection or anti-aliasing difference cannot read as an
// overlap in the rendered scene.
const ROAD_VISUAL_INSET_PX = 7
const ROAD_TOP_OFFSET_PX = -20
const ROAD_BOTTOM_OFFSET_PX = -15
const PRODUCTION_WIND_SEED = 2465284871

const sampleBoundary = (points: readonly RoadBoundaryPoint[], x: number) => {
  if (x <= points[0][0]) return points[0][1]
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (x <= current[0]) {
      const progress = (x - previous[0]) / (current[0] - previous[0])
      return mix(previous[1], current[1], progress)
    }
  }
  return points[points.length - 1][1]
}

const PRODUCTION_PAPER_MOTION: PaperReleaseMotionTuning = {
  horizontalWindScale: 0.5,
  horizontalDrag: 0.7,
  shortGustStrength: 0.58,
  stallStrength: 0.5,
  depthWindScale: 0.025,
  depthGustStrength: 0.055,
  depthDrag: 1.8,
  verticalWindScale: 1,
  verticalDrag: 0,
  preserveScriptedVelocity: true,
  contactSolverProvidesSupport: true,
  preserveRoadContactPosition: true,
  perVertexGroundContact: true,
  aerodynamicAreaReferenceHeight: 46,
  gustLiftAcceleration: 130,
  edgeOnStabilityStrength: 42,
  edgeOnStabilityDamping: 9,
  handoffForceRampDuration: 0.5,
  handoffShapeRampDuration: 0.45,
}

const PRODUCTION_PAPER_DEFORMATION: Partial<PaperLabSettings> = {
  broadBendAmplitude: 0.11,
  broadBendEdgeEmphasis: 0.24,
  broadBendIrregularity: 0.75,
  broadBendLateralBias: 0.72,
  perVertexGroundContact: true,
}

const wrapLines = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) => {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }

  if (line) lines.push(line)
  return lines
}

const makePaperPath = (width: number, height: number) => {
  const path = new Path2D()
  path.moveTo(width * 0.075, height * 0.07)
  path.bezierCurveTo(
    width * 0.22,
    height * 0.025,
    width * 0.55,
    height * 0.08,
    width * 0.88,
    height * 0.035,
  )
  path.quadraticCurveTo(
    width * 0.96,
    height * 0.035,
    width * 0.975,
    height * 0.115,
  )
  path.bezierCurveTo(
    width * 0.995,
    height * 0.28,
    width * 0.945,
    height * 0.52,
    width * 0.98,
    height * 0.88,
  )
  path.quadraticCurveTo(
    width * 0.99,
    height * 0.96,
    width * 0.93,
    height * 0.968,
  )
  path.bezierCurveTo(
    width * 0.72,
    height * 0.94,
    width * 0.48,
    height * 0.99,
    width * 0.09,
    height * 0.96,
  )
  path.quadraticCurveTo(
    width * 0.035,
    height * 0.965,
    width * 0.05,
    height * 0.88,
  )
  path.bezierCurveTo(
    width * 0.015,
    height * 0.7,
    width * 0.085,
    height * 0.48,
    width * 0.045,
    height * 0.25,
  )
  path.quadraticCurveTo(
    width * 0.03,
    height * 0.12,
    width * 0.075,
    height * 0.07,
  )
  path.closePath()
  return path
}

const textureSize = (passage: PassageLeaf, aspect: number) => {
  const width = 1000
  void passage
  return { width, height: Math.round(width / aspect) }
}

const createPaperTexture = (
  passage: PassageLeaf,
  aspect: number,
  solid: boolean,
) => {
  const { width, height } = textureSize(passage, aspect)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create page texture')

  const path = makePaperPath(width, height)
  context.save()
  context.clip(path)
  const wash = context.createRadialGradient(
    width * 0.42,
    height * 0.4,
    width * 0.03,
    width * 0.49,
    height * 0.52,
    width * 0.72,
  )
  if (solid) {
    wash.addColorStop(0, 'rgba(255, 252, 239, 0.985)')
    wash.addColorStop(0.58, 'rgba(247, 239, 220, 0.98)')
    wash.addColorStop(1, 'rgba(229, 216, 192, 0.965)')
  } else {
    wash.addColorStop(0, `rgba(255, 250, 232, ${GHOST_PAGE_OPACITY.highlight})`)
    wash.addColorStop(0.58, `rgba(248, 237, 211, ${GHOST_PAGE_OPACITY.body})`)
    wash.addColorStop(1, `rgba(235, 219, 184, ${GHOST_PAGE_OPACITY.edge})`)
  }
  context.fillStyle = wash
  context.fillRect(0, 0, width, height)

  context.save()
  context.globalCompositeOperation = 'screen'
  const lightPools = [
    [0.04, 0.17, 0.15],
    [0.08, 0.37, 0.12],
    [0.93, 0.72, 0.16],
    [0.84, 0.89, 0.14],
  ] as const
  for (const [x, y, radius] of lightPools) {
    const pool = context.createRadialGradient(
      width * x,
      height * y,
      0,
      width * x,
      height * y,
      width * radius,
    )
    pool.addColorStop(0, solid ? 'rgba(255, 248, 218, 0.07)' : 'rgba(255, 246, 208, 0.16)')
    pool.addColorStop(0.42, solid ? 'rgba(255, 244, 207, 0.03)' : 'rgba(255, 241, 194, 0.07)')
    pool.addColorStop(1, 'rgba(255, 240, 190, 0)')
    context.fillStyle = pool
    context.fillRect(0, 0, width, height)
  }
  context.restore()

  let randomState = 1729
  const random = () => {
    randomState = (randomState * 1664525 + 1013904223) >>> 0
    return randomState / 4294967296
  }
  context.lineWidth = Math.max(0.45, width / 1900)
  for (let fiber = 0; fiber < 250; fiber += 1) {
    const startX = random() * width
    const startY = random() * height
    const length = width * (0.012 + random() * 0.055)
    context.beginPath()
    context.moveTo(startX, startY)
    context.quadraticCurveTo(
      startX + length * 0.48,
      startY + (random() - 0.5) * height * 0.008,
      startX + length,
      startY + (random() - 0.5) * height * 0.011,
    )
    context.strokeStyle =
      random() > 0.45
        ? solid
          ? 'rgba(255,255,239,0.11)'
          : 'rgba(255,255,238,0.025)'
        : solid
          ? 'rgba(91,63,33,0.075)'
          : 'rgba(99,68,34,0.014)'
    context.stroke()
  }
  context.restore()

  context.save()
  context.shadowColor = solid ? 'rgba(74, 61, 43, 0.1)' : 'rgba(255, 237, 188, 0.24)'
  context.shadowBlur = width * 0.013
  context.strokeStyle = solid ? 'rgba(104, 88, 63, 0.25)' : 'rgba(255, 249, 226, 0.46)'
  context.lineWidth = Math.max(1.6, width / 680)
  context.stroke(path)
  context.restore()

  context.beginPath()
  context.moveTo(width * 0.89, height * 0.047)
  context.quadraticCurveTo(width * 0.945, height * 0.05, width * 0.97, height * 0.11)
  context.quadraticCurveTo(width * 0.947, height * 0.09, width * 0.91, height * 0.06)
  context.closePath()
  context.fillStyle = solid ? 'rgba(226, 211, 184, 0.22)' : 'rgba(255, 246, 211, 0.075)'
  context.fill()
  context.strokeStyle = solid ? 'rgba(105, 89, 65, 0.13)' : 'rgba(255, 248, 218, 0.15)'
  context.lineWidth = Math.max(0.9, width / 1200)
  context.stroke()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

const createQuoteTexture = (
  passage: PassageLeaf,
  aspect: number,
  layout: QuoteLayout,
) => {
  const { width, height } = textureSize(passage, aspect)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create quotation texture')

  context.fillStyle = 'rgba(18, 12, 7, 1)'
  context.strokeStyle = 'rgba(18, 12, 7, 0.88)'
  context.lineWidth = passage.treatment === 'prose' ? 1.35 : 0.8
  context.lineJoin = 'round'
  context.shadowColor = 'rgba(255, 246, 218, 0.18)'
  context.shadowBlur = width * 0.0008
  context.textBaseline = 'alphabetic'
  context.textAlign = passage.treatment === 'aphorism' ? 'center' : 'left'

  const displayScale = width / layout.displayWidth
  const fontSize = layout.fontSize * displayScale
  const lineHeight = layout.lineHeight * displayScale
  const textLeft = layout.left * displayScale
  const textTop = layout.top * displayScale
  const textWidth = layout.width * displayScale
  const textHeight = layout.height * displayScale

  if (passage.treatment === 'aphorism') {
    context.font = `italic 500 ${fontSize}px "EB Garamond", Georgia, serif`
    const lines = wrapLines(context, passage.text, textWidth)
    const renderedHeight = (lines.length - 1) * lineHeight + fontSize
    const firstBaseline = textTop + (textHeight - renderedHeight) / 2 + fontSize * 0.79
    const textCenter = textLeft + textWidth / 2
    lines.forEach((line, index) => {
      const baseline = firstBaseline + index * lineHeight
      context.strokeText(line, textCenter, baseline)
      context.fillText(line, textCenter, baseline)
    })
  } else {
    context.font = `500 ${fontSize}px "EB Garamond", Georgia, serif`
    const lines = wrapLines(context, passage.text, textWidth)
    const renderedHeight = (lines.length - 1) * lineHeight + fontSize
    const firstBaseline = textTop + (textHeight - renderedHeight) / 2 + fontSize * 0.79
    lines.forEach((line, index) => {
      const baseline = firstBaseline + index * lineHeight
      context.strokeText(line, textLeft, baseline)
      context.fillText(line, textLeft, baseline)
    })
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

const createScrawlTexture = (
  passage: PassageLeaf,
  aspect: number,
  layout: QuoteLayout,
) => {
  const { width, height } = textureSize(passage, aspect)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create distant writing texture')

  const displayScale = width / layout.displayWidth
  const fontSize = layout.fontSize * displayScale
  const lineHeight = layout.lineHeight * displayScale
  const textLeft = layout.left * displayScale
  const textTop = layout.top * displayScale
  const textWidth = layout.width * displayScale
  const textHeight = layout.height * displayScale
  context.font = `${passage.treatment === 'aphorism' ? 'italic ' : ''}500 ${fontSize}px "EB Garamond", Georgia, serif`
  const lines = wrapLines(context, passage.text, textWidth)
  const renderedHeight = (lines.length - 1) * lineHeight + fontSize
  const firstBaseline = textTop + (textHeight - renderedHeight) / 2 + fontSize * 0.79
  const textCenter = textLeft + textWidth / 2

  context.strokeStyle = 'rgba(28, 19, 11, 0.72)'
  context.lineWidth = passage.treatment === 'aphorism' ? 12 : 9
  context.lineCap = 'round'

  lines.forEach((line, index) => {
    const measuredWidth = Math.min(context.measureText(line).width, textWidth)
    const startX = passage.treatment === 'aphorism' ? textCenter - measuredWidth / 2 : textLeft
    const baseline = firstBaseline + index * lineHeight
    const strokeY = baseline - fontSize * 0.27
    const gapShift = (index % 3) * 0.018
    const strokes = [
      [0, 0.38 + gapShift],
      [0.45 + gapShift, 0.69],
      [0.76, 1],
    ] as const

    for (const [from, to] of strokes) {
      const x1 = startX + measuredWidth * from
      const x2 = startX + measuredWidth * to
      const bow = ((index % 4) - 1.5) * 0.7
      context.beginPath()
      context.moveTo(x1, strokeY)
      context.quadraticCurveTo((x1 + x2) / 2, strokeY + bow, x2, strokeY)
      context.stroke()
    }
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

export function WindPage({
  ambientWind,
  anchorRef,
  originRef,
  passage,
  state,
  onReady,
  onOpened,
  onGone,
}: WindPageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(state)
  const onOpenedRef = useRef(onOpened)
  const onGoneRef = useRef(onGone)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    onOpenedRef.current = onOpened
  }, [onOpened])

  useEffect(() => {
    onGoneRef.current = onGone
  }, [onGone])

  useEffect(() => {
    const host = hostRef.current
    const anchor = anchorRef.current
    const origin = originRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!host || !anchor || !origin || reducedMotion.matches) {
      onReady(false)
      return
    }
    let renderer: THREE.WebGLRenderer | null = null
    let animationFrame: number | null = null
    let resizeObserver: ResizeObserver | null = null
    let disposed = false
    let lastTime = performance.now()
    let releaseStarted = false
    let goneReported = false
    let openingActive = false
    let openingReported = false
    let openingTime = 0
    let sheet: PaperSheet | null = null
    let prototypeSolver: PaperPhysicsLabSolver | null = null
    let prototypeGeometryActive = false
    let openingPose: Float32Array | null = null
    let geometry: THREE.PlaneGeometry | null = null
    let openingGeometry: THREE.PlaneGeometry | null = null
    let ghostMaterial: THREE.MeshStandardMaterial | null = null
    let solidMaterial: THREE.MeshStandardMaterial | null = null
    let quoteMaterial: THREE.MeshBasicMaterial | null = null
    let scrawlMaterial: THREE.MeshBasicMaterial | null = null
    let ghostTexture: THREE.CanvasTexture | null = null
    let solidTexture: THREE.CanvasTexture | null = null
    let quoteTexture: THREE.CanvasTexture | null = null
    let scrawlTexture: THREE.CanvasTexture | null = null
    let contactShadowTexture: THREE.CanvasTexture | null = null
    let contactShadowMaterial: THREE.SpriteMaterial | null = null
    let ghostMesh: THREE.Mesh | null = null
    let solidMesh: THREE.Mesh | null = null
    let quoteMesh: THREE.Mesh | null = null
    let scrawlMesh: THREE.Mesh | null = null
    let contactShadow: THREE.Sprite | null = null
    let pageGroup: THREE.Group | null = null
    let scene: THREE.Scene | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let pageWorldX = 0
    let pageWorldY = 0
    let originWorldX = 0
    let originWorldY = 0

    const environmentFor = (viewportWidth: number, viewportHeight: number): PaperEnvironment => {
      const anchorBounds = anchor.getBoundingClientRect()
      const hostBounds = host.getBoundingClientRect()
      const pageScreenX = anchorBounds.left - hostBounds.left + anchorBounds.width / 2
      const pageScreenY = anchorBounds.top - hostBounds.top + anchorBounds.height / 2
      const finalHeight = clamp(viewportWidth * 0.03, 38, 46)
      const finalWidth = finalHeight * (20 / 27)
      const sourceWidth = 1672
      const sourceHeight = 941
      const coverScale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
      const renderedWidth = sourceWidth * coverScale
      const renderedHeight = sourceHeight * coverScale
      const artworkOffsetX = (viewportWidth - renderedWidth) * 0.5
      const artworkOffsetY = (viewportHeight - renderedHeight) * 0.5
      const sourceXFor = (screenX: number) => (screenX - artworkOffsetX) / renderedWidth
      const roadTopY = (screenX: number) =>
        artworkOffsetY +
        sampleBoundary(ROAD_TOP_ENFORCED, sourceXFor(screenX)) * renderedHeight +
        ROAD_TOP_OFFSET_PX +
        ROAD_VISUAL_INSET_PX
      const roadBottomY = (screenX: number) =>
        artworkOffsetY +
        sampleBoundary(ROAD_BOTTOM, sourceXFor(screenX)) * renderedHeight +
        ROAD_BOTTOM_OFFSET_PX -
        ROAD_VISUAL_INSET_PX
      const landingX = finalWidth * 0.9
      const landingZ = -finalHeight * 0.12
      const landingScreenX = pageScreenX + landingX
      const roadCenterY = (screenX: number) =>
        (roadTopY(screenX) + roadBottomY(screenX)) * 0.5
      const landingScreenY =
        roadCenterY(landingScreenX)
      const slopeSampleDistance = Math.max(12, viewportWidth * 0.02)
      const tracedRoadSlope =
        (roadCenterY(landingScreenX + slopeSampleDistance) -
          roadCenterY(landingScreenX - slopeSampleDistance)) /
        (slopeSampleDistance * 2)
      const landingPitch = PAPER_SCRIPTED_RELEASE_PITCH
      const landingSupport =
        finalHeight * Math.abs(Math.cos(landingPitch)) * 0.5 + 1.4
      const groundSlopeX = -tracedRoadSlope
      const groundSlopeZ = -0.06
      const cameraDistance =
        viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(35 / 2)))
      return {
        targetWidth: finalWidth,
        targetHeight: finalHeight,
        groundY:
          pageScreenY -
          landingScreenY -
          landingX * groundSlopeX -
          landingZ * groundSlopeZ -
          landingSupport,
        groundSlopeX,
        groundSlopeZ,
        pageScreenX,
        pageScreenY,
        cameraDistance,
        roadTopY,
        roadBottomY,
      }
    }

    const resize = () => {
      if (!renderer || !camera || !sheet || !pageGroup) return
      const viewportWidth = host.clientWidth
      const viewportHeight = host.clientHeight
      const anchorBounds = anchor.getBoundingClientRect()
      const originBounds = origin.getBoundingClientRect()
      const hostBounds = host.getBoundingClientRect()
      const cameraDistance = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      camera.aspect = viewportWidth / viewportHeight
      camera.position.set(0, 0, cameraDistance)
      camera.updateProjectionMatrix()
      renderer.setSize(viewportWidth, viewportHeight, false)
      pageWorldX = anchorBounds.left - hostBounds.left + anchorBounds.width / 2 - viewportWidth / 2
      pageWorldY = viewportHeight / 2 - (anchorBounds.top - hostBounds.top + anchorBounds.height / 2)
      originWorldX =
        originBounds.left - hostBounds.left + originBounds.width * 0.58 - viewportWidth / 2
      originWorldY =
        viewportHeight / 2 - (originBounds.top - hostBounds.top + originBounds.height * 0.45)
      if (!openingActive) {
        pageGroup.position.set(pageWorldX, pageWorldY, 0)
        pageGroup.scale.setScalar(1)
        pageGroup.rotation.set(0, 0, 0)
      }
      const environment = environmentFor(viewportWidth, viewportHeight)
      prototypeSolver?.setEnvironment(environment)
    }

    const activatePrototypeGeometry = () => {
      if (
        !prototypeSolver ||
        prototypeGeometryActive ||
        !ghostMesh ||
        !solidMesh ||
        !quoteMesh ||
        !scrawlMesh
      ) {
        return
      }
      geometry = prototypeSolver.visualGeometry
      ghostMesh.geometry = geometry
      solidMesh.geometry = geometry
      quoteMesh.geometry = geometry
      scrawlMesh.geometry = geometry
      prototypeGeometryActive = true
    }

    const render = (time: number) => {
      animationFrame = null
      if (
        disposed ||
        !renderer ||
        !scene ||
        !camera ||
        !geometry ||
        !sheet ||
        !prototypeSolver ||
        !ghostMaterial ||
        !solidMaterial ||
        !quoteMaterial ||
        !scrawlMaterial
      ) {
        return
      }
      if (document.visibilityState !== 'visible') return

      const delta = Math.min((time - lastTime) / 1000, 1 / 20)
      lastTime = time

      if (stateRef.current === 'opening' && !openingActive) {
        openingActive = true
        openingReported = false
        openingTime = 0
        releaseStarted = false
        goneReported = false
        if (openingPose) {
          sheet.positions.set(openingPose)
          sheet.previous.set(openingPose)
        }
        solidMaterial.opacity = 1
        ghostMaterial.opacity = 0
        quoteMaterial.opacity = 0
        scrawlMaterial.opacity = 0
      }

      if (openingActive && openingPose && pageGroup) {
        openingTime += delta
        const progress = clamp(openingTime / OPENING_MOTION.duration, 0, 1)
        const travel = smoothstep(0, 1, progress)
        const arc = Math.sin(progress * Math.PI)
        const gustTail = (1 - travel) * 2.2
        const rippleEnvelope =
          smoothstep(0.035, 0.24, progress) * (1 - smoothstep(0.62, 0.985, progress))
        const vertexCount = sheet.positions.length / 3

        for (let vertex = 0; vertex < vertexCount; vertex += 1) {
          const offset = vertex * 3
          const row = Math.floor(vertex / (sheet.segmentsX + 1))
          const column = vertex % (sheet.segmentsX + 1)
          const normalizedX = column / sheet.segmentsX
          const normalizedY = row / sheet.segmentsY
          const travellingWave = Math.sin(
            normalizedX * Math.PI * 2.15 -
              openingTime * OPENING_MOTION.rippleCycles * Math.PI +
              normalizedY * Math.PI * 0.62,
          )
          const crossWave = Math.sin(
            normalizedY * Math.PI * 1.28 + openingTime * Math.PI * 1.54,
          )
          const broadRipple = travellingWave * 0.76 + crossWave * 0.24

          sheet.positions[offset] = openingPose[offset]
          sheet.positions[offset + 1] =
            openingPose[offset + 1] + travellingWave * 3.4 * rippleEnvelope
          sheet.positions[offset + 2] =
            openingPose[offset + 2] +
            broadRipple * OPENING_MOTION.rippleDepth * rippleEnvelope
        }

        const lateralDrift = arc * OPENING_MOTION.lateralBow * gustTail
        pageGroup.position.set(
          mix(originWorldX, pageWorldX, travel) + lateralDrift,
          mix(originWorldY, pageWorldY, travel) + arc * OPENING_MOTION.arcHeight * gustTail,
          arc * 14 * gustTail,
        )
        const scale = mix(OPENING_MOTION.startScale, 1, travel)
        pageGroup.scale.setScalar(scale)
        pageGroup.rotation.set(
          arc * 0.045,
          mix(-0.11, 0, travel) + rippleEnvelope * Math.sin(openingTime * 2.7) * 0.028,
          mix(-0.105, 0, travel) + rippleEnvelope * Math.sin(openingTime * 2.15) * 0.022,
        )
        solidMaterial.opacity = 1 - smoothstep(0.18, 0.93, progress)
        ghostMaterial.opacity = smoothstep(0.12, 0.92, progress)
        quoteMaterial.opacity = 0
        host.dataset.openingTime = openingTime.toFixed(2)
        host.dataset.openingProgress = progress.toFixed(3)
        host.dataset.openingScale = scale.toFixed(3)
        host.dataset.openingX = (pageGroup.position.x + host.clientWidth / 2).toFixed(1)
        host.dataset.openingY = (host.clientHeight / 2 - pageGroup.position.y).toFixed(1)

        if (progress >= 1 && !openingReported) {
          openingReported = true
          pageGroup.position.set(pageWorldX, pageWorldY, 0)
          pageGroup.scale.setScalar(1)
          pageGroup.rotation.set(0, 0, 0)
          sheet.positions.set(openingPose)
          sheet.previous.set(openingPose)
        }

        if (openingTime >= OPENING_MOTION.duration + OPENING_MOTION.revealDuration) {
          openingActive = false
          ghostMaterial.opacity = 1
          solidMaterial.opacity = 0
          // A canvas texture is useful while the page is in flight, but at rest
          // native text is sharper, selectable, and unaffected by GPU compositing.
          quoteMaterial.opacity = 0
          scrawlMaterial.opacity = 0
          pageGroup.position.set(pageWorldX, pageWorldY, 0)
          pageGroup.scale.setScalar(1)
          pageGroup.rotation.set(0, 0, 0)
          sheet.positions.set(openingPose)
          sheet.previous.set(openingPose)
          onOpenedRef.current()
        }
      } else {
        if (stateRef.current === 'closing' && !releaseStarted) {
          releaseStarted = true
          prototypeSolver.beginRelease()
          activatePrototypeGeometry()
        }
        prototypeSolver.updateVisualMesh(delta)
      }

      if (!prototypeGeometryActive) {
        const position = geometry.attributes.position as THREE.BufferAttribute
        position.array.set(sheet.positions)
        position.needsUpdate = true
        geometry.computeVertexNormals()
      }

      const motion = sheet.getMotionState()
      if (releaseStarted) {
        quoteMaterial.opacity = mix(
          1,
          0.6,
          smoothstep(0.08, 1.75, motion.releaseTime),
        )
        scrawlMaterial.opacity =
          smoothstep(0.72, 1.72, motion.releaseTime) * 0.46
        ghostMaterial.opacity =
          1 - smoothstep(0.18, 1.55, motion.releaseTime) * 0.96
        solidMaterial.opacity = smoothstep(0.12, 1.62, motion.releaseTime)
        const groundHeight = sheet.getGroundHeight(motion.averageX, motion.averageZ)
        const clearance = Math.max(0, motion.averageY - groundHeight)
        host.dataset.releaseTime = motion.releaseTime.toFixed(2)
        host.dataset.contact = motion.contactRatio.toFixed(2)
        host.dataset.pageWidth = motion.width.toFixed(1)
        host.dataset.pageHeight = motion.height.toFixed(1)
        host.dataset.averageX = motion.averageX.toFixed(1)
        host.dataset.averageY = motion.averageY.toFixed(1)
        host.dataset.averageZ = motion.averageZ.toFixed(1)
        host.dataset.velocityX = motion.velocityX.toFixed(1)
        host.dataset.velocityY = motion.velocityY.toFixed(1)
        host.dataset.velocityZ = motion.velocityZ.toFixed(1)
        host.dataset.normalZ = motion.normalZ.toFixed(3)
        host.dataset.groundY = groundHeight.toFixed(1)
        host.dataset.clearance = clearance.toFixed(1)
        const roadClearance = sheet.getRoadClearance()
        if (Number.isFinite(roadClearance)) {
          host.dataset.roadClearance = roadClearance.toFixed(1)
        }
        const minimumRoadClearance = sheet.getMinimumRoadClearance()
        if (Number.isFinite(minimumRoadClearance)) {
          host.dataset.minimumRoadClearance = minimumRoadClearance.toFixed(1)
          host.dataset.minimumRoadClearanceTime = sheet
            .getMinimumRoadClearanceTime()
            .toFixed(2)
        }
        host.dataset.coarseGroundClearance = sheet
          .getMinimumGroundClearance()
          .toFixed(2)
        const visualGroundClearance = prototypeSolver.getMinimumVisualGroundClearance()
        if (Number.isFinite(visualGroundClearance)) {
          host.dataset.visualGroundClearance = visualGroundClearance.toFixed(2)
        }
        if (contactShadow && contactShadowMaterial) {
          const minimumGroundClearance = Math.max(0, sheet.getMinimumGroundClearance())
          const heightResponse = smoothstep(
            0.35,
            Math.max(18, motion.height * 0.9),
            minimumGroundClearance,
          )
          const landingVisibility = smoothstep(5.25, RELEASE_CONTACT_TIME, motion.releaseTime)
          contactShadow.visible = landingVisibility > 0.001
          contactShadow.position.set(
            motion.averageX,
            groundHeight + 0.16,
            motion.averageZ - 1.2,
          )
          contactShadow.scale.set(
            Math.max(12, motion.width * mix(0.72, 1.08, heightResponse)),
            Math.max(4.5, motion.height * mix(0.16, 0.31, heightResponse)),
            1,
          )
          contactShadowMaterial.opacity =
            landingVisibility * mix(0.17, 0.025, heightResponse)
        }
      }

      const cameraDepth = camera.position.z - motion.averageZ
      const perspectiveScale =
        cameraDepth > camera.near ? camera.position.z / cameraDepth : Number.POSITIVE_INFINITY
      const projectedCenterX =
        host.clientWidth / 2 + (pageWorldX + motion.averageX) * perspectiveScale
      const projectedCenterY =
        host.clientHeight / 2 - (pageWorldY + motion.averageY) * perspectiveScale
      const projectedRadius =
        Math.hypot(motion.width, motion.height) * 0.65 * Math.abs(perspectiveScale) + 4
      const gentleDriftExitedViewport =
        motion.releaseTime > RELEASE_CONTACT_TIME &&
        (cameraDepth <= camera.near ||
          projectedCenterX - projectedRadius > host.clientWidth ||
          projectedCenterX + projectedRadius < 0 ||
          projectedCenterY - projectedRadius > host.clientHeight ||
          projectedCenterY + projectedRadius < 0)
      if (releaseStarted && gentleDriftExitedViewport && !goneReported) {
        goneReported = true
        onGoneRef.current()
        return
      }

      renderer.render(scene, camera)
      const rightBoundary = host.clientWidth / 2 - pageWorldX + 28
      if (releaseStarted && sheet.isBeyond(rightBoundary) && !goneReported) {
        goneReported = true
        onGoneRef.current()
        return
      }
      animationFrame = requestAnimationFrame(render)
    }

    const start = () => {
      if (animationFrame === null && document.visibilityState === 'visible') {
        lastTime = performance.now()
        animationFrame = requestAnimationFrame(render)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && animationFrame !== null) {
        cancelAnimationFrame(animationFrame)
        animationFrame = null
      } else {
        start()
      }
    }

    const initialise = async () => {
      try {
        await document.fonts.load('400 36px "EB Garamond"')
        await document.fonts.load('500 36px "EB Garamond"')
        await document.fonts.load('italic 500 72px "EB Garamond"')
        if (disposed) return

        const anchorBounds = anchor.getBoundingClientRect()
        const seed = PRODUCTION_WIND_SEED
        const initialEnvironment = environmentFor(host.clientWidth, host.clientHeight)
        sheet = new PaperSheet(
          anchorBounds.width,
          anchorBounds.height,
          initialEnvironment,
          seed,
          22,
          17,
          ambientWind,
          PRODUCTION_PAPER_MOTION,
        )
        prototypeSolver = new PaperPhysicsLabSolver(
          anchorBounds.width,
          anchorBounds.height,
          initialEnvironment,
          seed,
          { ...APPROVED_PAPER_LAB_PRESET, ...PRODUCTION_PAPER_DEFORMATION },
          sheet,
          ambientWind,
        )
        openingPose = new Float32Array(sheet.positions)
        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera(35, 1, 1, 5000)
        openingGeometry = new THREE.PlaneGeometry(
          anchorBounds.width,
          anchorBounds.height,
          sheet.segmentsX,
          sheet.segmentsY,
        )
        geometry = openingGeometry
        const passageElement = anchor.querySelector<HTMLElement>('.reading-sheet__passage p')
        const passageBounds = passageElement?.getBoundingClientRect()
        const passageStyle = passageElement ? getComputedStyle(passageElement) : null
        const displayFontSize = passageStyle
          ? Number.parseFloat(passageStyle.fontSize)
          : passage.treatment === 'aphorism'
            ? 40
            : 18
        const displayLineHeight = passageStyle
          ? Number.parseFloat(passageStyle.lineHeight)
          : displayFontSize * (passage.treatment === 'aphorism' ? 1.4 : 1.42)
        const quoteLayout: QuoteLayout = {
          displayWidth: anchorBounds.width,
          left: passageBounds ? passageBounds.left - anchorBounds.left : anchorBounds.width * 0.14,
          top: passageBounds ? passageBounds.top - anchorBounds.top : anchorBounds.height * 0.16,
          width: passageBounds?.width ?? anchorBounds.width * 0.72,
          height: passageBounds?.height ?? anchorBounds.height * 0.68,
          fontSize: displayFontSize,
          lineHeight: displayLineHeight,
        }
        const aspect = anchorBounds.width / anchorBounds.height
        ghostTexture = createPaperTexture(passage, aspect, false)
        solidTexture = createPaperTexture(passage, aspect, true)
        quoteTexture = createQuoteTexture(passage, aspect, quoteLayout)
        scrawlTexture = createScrawlTexture(passage, aspect, quoteLayout)
        ghostMaterial = new THREE.MeshStandardMaterial({
          map: ghostTexture,
          transparent: true,
          alphaTest: 0.003,
          depthWrite: false,
          roughness: 0.96,
          metalness: 0,
          side: THREE.DoubleSide,
          opacity: stateRef.current === 'opening' ? 0 : 1,
        })
        solidMaterial = new THREE.MeshStandardMaterial({
          map: solidTexture,
          transparent: true,
          opacity: stateRef.current === 'opening' ? 1 : 0,
          alphaTest: 0.003,
          depthWrite: false,
          roughness: 0.98,
          metalness: 0,
          side: THREE.DoubleSide,
        })
        quoteMaterial = new THREE.MeshBasicMaterial({
          map: quoteTexture,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          // Native text is the settled, selectable reading layer. The mapped
          // quote is enabled only for opening/release motion; starting it opaque
          // after a leaf change draws a second, differently wrapped passage.
          opacity: 0,
        })
        scrawlMaterial = new THREE.MeshBasicMaterial({
          map: scrawlTexture,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          opacity: 0,
        })
        ghostMesh = new THREE.Mesh(geometry, ghostMaterial)
        solidMesh = new THREE.Mesh(geometry, solidMaterial)
        quoteMesh = new THREE.Mesh(geometry, quoteMaterial)
        scrawlMesh = new THREE.Mesh(geometry, scrawlMaterial)
        const shadowCanvas = document.createElement('canvas')
        shadowCanvas.width = 192
        shadowCanvas.height = 96
        const shadowContext = shadowCanvas.getContext('2d')
        if (shadowContext) {
          const shadowGradient = shadowContext.createRadialGradient(96, 48, 3, 96, 48, 88)
          shadowGradient.addColorStop(0, 'rgba(43, 31, 20, 0.62)')
          shadowGradient.addColorStop(0.38, 'rgba(43, 31, 20, 0.32)')
          shadowGradient.addColorStop(0.72, 'rgba(43, 31, 20, 0.1)')
          shadowGradient.addColorStop(1, 'rgba(43, 31, 20, 0)')
          shadowContext.fillStyle = shadowGradient
          shadowContext.fillRect(0, 0, shadowCanvas.width, shadowCanvas.height)
          contactShadowTexture = new THREE.CanvasTexture(shadowCanvas)
          contactShadowTexture.colorSpace = THREE.SRGBColorSpace
          contactShadowMaterial = new THREE.SpriteMaterial({
            map: contactShadowTexture,
            color: 0x6a4b31,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
          })
          contactShadow = new THREE.Sprite(contactShadowMaterial)
          contactShadow.visible = false
          contactShadow.renderOrder = 0
        }
        ghostMesh.position.z = 0
        solidMesh.position.z = 0.12
        quoteMesh.position.z = 0.02
        scrawlMesh.position.z = 0.025
        ghostMesh.frustumCulled = false
        solidMesh.frustumCulled = false
        quoteMesh.frustumCulled = false
        scrawlMesh.frustumCulled = false
        ghostMesh.renderOrder = 1
        solidMesh.renderOrder = 2
        quoteMesh.renderOrder = 3
        scrawlMesh.renderOrder = 4
        pageGroup = new THREE.Group()
        if (contactShadow) pageGroup.add(contactShadow)
        pageGroup.add(ghostMesh, solidMesh, quoteMesh, scrawlMesh)
        scene.add(pageGroup)
        scene.add(new THREE.HemisphereLight(0xfff5d8, 0x51432e, 1.5))
        const sun = new THREE.DirectionalLight(0xffe2a7, 2.2)
        sun.position.set(-0.8, 1.1, 1.8)
        scene.add(sun)

        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.setClearColor(0x000000, 0)
        renderer.domElement.className = 'wind-page__canvas'
        renderer.domElement.setAttribute('aria-hidden', 'true')
        host.append(renderer.domElement)
        resize()
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(host)
        resizeObserver.observe(anchor)
        document.addEventListener('visibilitychange', handleVisibilityChange)
        onReady(true)
        start()
      } catch (error) {
        console.error('Wind page renderer unavailable; using the static reading sheet.', error)
        onReady(false)
        if (stateRef.current === 'opening') onOpenedRef.current()
      }
    }

    void initialise()

    return () => {
      disposed = true
      onReady(false)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      resizeObserver?.disconnect()
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      openingGeometry?.dispose()
      prototypeSolver?.visualGeometry.dispose()
      ghostMaterial?.dispose()
      solidMaterial?.dispose()
      quoteMaterial?.dispose()
      scrawlMaterial?.dispose()
      ghostTexture?.dispose()
      solidTexture?.dispose()
      quoteTexture?.dispose()
      scrawlTexture?.dispose()
      contactShadowTexture?.dispose()
      contactShadowMaterial?.dispose()
      renderer?.dispose()
      renderer?.domElement.remove()
    }
  }, [ambientWind, anchorRef, onReady, originRef, passage])

  return <div className="wind-page" ref={hostRef} aria-hidden="true" />
}

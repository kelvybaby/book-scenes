import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { PassageLeaf } from '../content/passages'
import { PaperSheet, type PaperEnvironment } from '../motion/PaperSheet'

type WindPageProps = {
  anchorRef: RefObject<HTMLElement | null>
  passage: PassageLeaf
  state: 'open' | 'closing'
  onReady: (ready: boolean) => void
  onGone: () => void
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

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

const releaseSeed = () => {
  const requested = new URLSearchParams(window.location.search).get('windSeed')
  const parsed = requested === null ? Number.NaN : Number.parseInt(requested, 10)
  if (Number.isFinite(parsed)) return parsed >>> 0
  return window.crypto.getRandomValues(new Uint32Array(1))[0]
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

  context.fillStyle =
    passage.treatment === 'prose' ? 'rgba(27, 20, 13, 1)' : 'rgba(34, 25, 16, 0.995)'
  context.shadowColor = 'rgba(255, 246, 218, 0.24)'
  context.shadowBlur = width * 0.0012
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
    lines.forEach((line, index) =>
      context.fillText(line, textCenter, firstBaseline + index * lineHeight),
    )
  } else {
    context.font = `500 ${fontSize}px "EB Garamond", Georgia, serif`
    const lines = wrapLines(context, passage.text, textWidth)
    const renderedHeight = (lines.length - 1) * lineHeight + fontSize
    const firstBaseline = textTop + (textHeight - renderedHeight) / 2 + fontSize * 0.79
    lines.forEach((line, index) =>
      context.fillText(line, textLeft, firstBaseline + index * lineHeight),
    )
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

const createShadowTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create contact shadow')
  const gradient = context.createRadialGradient(124, 50, 6, 128, 48, 118)
  gradient.addColorStop(0, 'rgba(48, 34, 20, 0.54)')
  gradient.addColorStop(0.46, 'rgba(48, 34, 20, 0.3)')
  gradient.addColorStop(0.78, 'rgba(48, 34, 20, 0.09)')
  gradient.addColorStop(1, 'rgba(48, 34, 20, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.globalCompositeOperation = 'destination-out'
  context.fillStyle = 'rgba(0,0,0,0.12)'
  context.fillRect(28, 37, 34, 4)
  context.fillRect(166, 55, 47, 3)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export function WindPage({ anchorRef, passage, state, onReady, onGone }: WindPageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(state)
  const onGoneRef = useRef(onGone)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    onGoneRef.current = onGone
  }, [onGone])

  useEffect(() => {
    const host = hostRef.current
    const anchor = anchorRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!host || !anchor || reducedMotion.matches) {
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
    let sheet: PaperSheet | null = null
    let geometry: THREE.PlaneGeometry | null = null
    let shadowGeometry: THREE.PlaneGeometry | null = null
    let ghostMaterial: THREE.MeshStandardMaterial | null = null
    let solidMaterial: THREE.MeshStandardMaterial | null = null
    let quoteMaterial: THREE.MeshBasicMaterial | null = null
    let shadowMaterial: THREE.MeshBasicMaterial | null = null
    let ghostTexture: THREE.CanvasTexture | null = null
    let solidTexture: THREE.CanvasTexture | null = null
    let quoteTexture: THREE.CanvasTexture | null = null
    let shadowTexture: THREE.CanvasTexture | null = null
    let ghostMesh: THREE.Mesh | null = null
    let solidMesh: THREE.Mesh | null = null
    let quoteMesh: THREE.Mesh | null = null
    let shadowMesh: THREE.Mesh | null = null
    let scene: THREE.Scene | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let pageWorldX = 0
    let pageWorldY = 0

    const environmentFor = (viewportWidth: number, viewportHeight: number): PaperEnvironment => {
      const anchorBounds = anchor.getBoundingClientRect()
      const anchorCenterY = anchorBounds.top + anchorBounds.height / 2
      const finalHeight = clamp(viewportWidth * 0.03, 38, 46)
      return {
        targetWidth: finalHeight * (20 / 27),
        targetHeight: finalHeight,
        groundY: anchorCenterY - viewportHeight * 0.74,
        groundSlopeX: -0.112,
        groundSlopeZ: -0.06,
      }
    }

    const resize = () => {
      if (!renderer || !camera || !sheet || !ghostMesh || !solidMesh || !quoteMesh) return
      const viewportWidth = host.clientWidth
      const viewportHeight = host.clientHeight
      const anchorBounds = anchor.getBoundingClientRect()
      const hostBounds = host.getBoundingClientRect()
      const cameraDistance = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      camera.aspect = viewportWidth / viewportHeight
      camera.position.set(0, 0, cameraDistance)
      camera.updateProjectionMatrix()
      renderer.setSize(viewportWidth, viewportHeight, false)
      pageWorldX = anchorBounds.left - hostBounds.left + anchorBounds.width / 2 - viewportWidth / 2
      pageWorldY = viewportHeight / 2 - (anchorBounds.top - hostBounds.top + anchorBounds.height / 2)
      ghostMesh.position.set(pageWorldX, pageWorldY, 0)
      solidMesh.position.set(pageWorldX, pageWorldY, 0.12)
      quoteMesh.position.set(pageWorldX, pageWorldY, 0.3)
      sheet.setEnvironment(environmentFor(viewportWidth, viewportHeight))
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
        !ghostMaterial ||
        !solidMaterial ||
        !quoteMaterial ||
        !shadowMaterial ||
        !shadowMesh
      ) {
        return
      }
      if (document.visibilityState !== 'visible') return

      const delta = Math.min((time - lastTime) / 1000, 1 / 20)
      lastTime = time
      if (stateRef.current === 'closing' && !releaseStarted) {
        releaseStarted = true
        sheet.beginRelease()
      }
      sheet.advance(delta)

      const position = geometry.attributes.position as THREE.BufferAttribute
      position.array.set(sheet.positions)
      position.needsUpdate = true
      geometry.computeVertexNormals()

      const motion = sheet.getMotionState()
      if (releaseStarted) {
        quoteMaterial.opacity = 1 - smoothstep(0.08, 1.35, motion.releaseTime)
        ghostMaterial.opacity = 1 - smoothstep(0.18, 1.55, motion.releaseTime) * 0.96
        solidMaterial.opacity = smoothstep(0.12, 1.62, motion.releaseTime)
        const groundHeight = sheet.getGroundHeight(motion.averageX, motion.averageZ)
        const clearance = Math.max(0, motion.averageY - groundHeight)
        const physicalPresence = smoothstep(0.45, 0.86, motion.condensation)
        const heightFalloff = Math.exp(-clearance / 46)
        shadowMaterial.opacity = physicalPresence * (0.1 + heightFalloff * 0.27)
        shadowMesh.position.set(
          pageWorldX + motion.averageX,
          pageWorldY + groundHeight - 2.2,
          -2.2,
        )
        shadowMesh.scale.set(
          clamp(motion.width * (0.86 + clearance * 0.0012), 18, 64),
          clamp(motion.width * (0.11 + clearance * 0.0013), 4, 14),
          1,
        )
        host.dataset.releaseTime = motion.releaseTime.toFixed(2)
        host.dataset.contact = motion.contactRatio.toFixed(2)
        host.dataset.pageWidth = motion.width.toFixed(1)
        host.dataset.pageHeight = motion.height.toFixed(1)
        host.dataset.averageX = motion.averageX.toFixed(1)
        host.dataset.averageY = motion.averageY.toFixed(1)
        host.dataset.averageZ = motion.averageZ.toFixed(1)
        host.dataset.groundY = groundHeight.toFixed(1)
        host.dataset.clearance = clearance.toFixed(1)
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
        const seed = releaseSeed()
        host.dataset.windSeed = String(seed)
        sheet = new PaperSheet(
          anchorBounds.width,
          anchorBounds.height,
          environmentFor(host.clientWidth, host.clientHeight),
          seed,
          22,
          17,
        )
        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera(35, 1, 1, 5000)
        geometry = new THREE.PlaneGeometry(
          anchorBounds.width,
          anchorBounds.height,
          sheet.segmentsX,
          sheet.segmentsY,
        )
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
        shadowTexture = createShadowTexture()
        ghostMaterial = new THREE.MeshStandardMaterial({
          map: ghostTexture,
          transparent: true,
          alphaTest: 0.003,
          depthWrite: false,
          roughness: 0.96,
          metalness: 0,
          side: THREE.DoubleSide,
        })
        solidMaterial = new THREE.MeshStandardMaterial({
          map: solidTexture,
          transparent: true,
          opacity: 0,
          alphaTest: 0.003,
          depthWrite: false,
          roughness: 0.98,
          metalness: 0,
          side: THREE.DoubleSide,
        })
        quoteMaterial = new THREE.MeshBasicMaterial({
          map: quoteTexture,
          transparent: true,
          alphaTest: 0.003,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
        shadowMaterial = new THREE.MeshBasicMaterial({
          map: shadowTexture,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          color: 0x5a4027,
        })
        ghostMesh = new THREE.Mesh(geometry, ghostMaterial)
        solidMesh = new THREE.Mesh(geometry, solidMaterial)
        quoteMesh = new THREE.Mesh(geometry, quoteMaterial)
        shadowGeometry = new THREE.PlaneGeometry(1, 1)
        shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial)
        ghostMesh.frustumCulled = false
        solidMesh.frustumCulled = false
        quoteMesh.frustumCulled = false
        shadowMesh.frustumCulled = false
        ghostMesh.renderOrder = 1
        solidMesh.renderOrder = 2
        quoteMesh.renderOrder = 3
        scene.add(shadowMesh, ghostMesh, solidMesh, quoteMesh)
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
      }
    }

    void initialise()

    return () => {
      disposed = true
      onReady(false)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      resizeObserver?.disconnect()
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      geometry?.dispose()
      shadowGeometry?.dispose()
      ghostMaterial?.dispose()
      solidMaterial?.dispose()
      quoteMaterial?.dispose()
      shadowMaterial?.dispose()
      ghostTexture?.dispose()
      solidTexture?.dispose()
      quoteTexture?.dispose()
      shadowTexture?.dispose()
      renderer?.dispose()
      renderer?.domElement.remove()
    }
  }, [anchorRef, onReady, passage])

  return <div className="wind-page" ref={hostRef} aria-hidden="true" />
}

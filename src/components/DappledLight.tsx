import { useEffect, useMemo, useRef } from 'react'
import {
  DEFAULT_DAPPLED_LIGHT_SETTINGS,
  type DappledLightSettings,
} from './dappledLightSettings'

const SOURCE_WIDTH = 1672
const SOURCE_HEIGHT = 941
const RENDER_SCALE = 1
const RENDER_WIDTH = Math.round(SOURCE_WIDTH * RENDER_SCALE)
const RENDER_HEIGHT = Math.round(SOURCE_HEIGHT * RENDER_SCALE)
const TAU = Math.PI * 2
const TARGET_FRAME_MS = 1000 / 30
const RECEIVER_SOURCE =
  '/assets/scenes/under-the-almond-trees/under-the-almond-trees-dapple-receiver-v1.png'

type Leaf = {
  x: number
  y: number
  length: number
  width: number
  angle: number
  phase: number
  harmonic: number
  opacity: number
  softness: number
}

type Branch = {
  angle: number
  length: number
  width: number
  leaves: Leaf[]
}

type BranchGroup = {
  x: number
  y: number
  phase: number
  harmonic: number
  travel: number
  rotation: number
  shear: number
  scale: number
  branches: Branch[]
}

type SunOpening = {
  x: number
  y: number
  length: number
  width: number
  angle: number
  phase: number
  harmonic: number
  secondaryHarmonic: number
  travel: number
  opacity: number
  softness: number
}

function createCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = RENDER_WIDTH
  canvas.height = RENDER_HEIGHT
  return canvas
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function mix(minimum: number, maximum: number, amount: number) {
  return minimum + (maximum - minimum) * amount
}

function smoothstep(minimum: number, maximum: number, value: number) {
  const amount = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)))
  return amount * amount * (3 - 2 * amount)
}

function drawLeaf(
  context: CanvasRenderingContext2D,
  length: number,
  widthRatio: number,
) {
  const halfLength = length * 0.5
  const halfWidth = length * widthRatio * 0.5
  context.beginPath()
  context.moveTo(-halfLength, 0)
  context.bezierCurveTo(
    -halfLength * 0.28,
    -halfWidth,
    halfLength * 0.42,
    -halfWidth * 0.78,
    halfLength,
    0,
  )
  context.bezierCurveTo(
    halfLength * 0.4,
    halfWidth * 0.78,
    -halfLength * 0.25,
    halfWidth,
    -halfLength,
    0,
  )
  context.closePath()
  context.fill()
}

function createBranchGroups(): BranchGroup[] {
  const random = mulberry32(8041)
  const anchors = [
    [286, 747],
    [393, 790],
    [506, 766],
    [610, 821],
    [720, 794],
    [820, 853],
    [910, 824],
    [1003, 875],
  ] as const

  return anchors.map(([x, y], groupIndex) => {
    const branches: Branch[] = []
    const branchCount = 4 + Math.round(random() * 2)
    for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
      const branchLength = mix(62, 126, random())
      const branchAngle = mix(-0.42, 0.48, random()) + (branchIndex - 2) * 0.11
      const leaves: Leaf[] = []
      const leafCount = 6 + Math.round(random() * 5)
      for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
        const progress = mix(0.18, 1, (leafIndex + random() * 0.55) / leafCount)
        const side = leafIndex % 2 === 0 ? -1 : 1
        leaves.push({
          x: branchLength * progress,
          y: side * mix(5, 17, random()) * (0.5 + progress * 0.5),
          length: mix(18, 39, random()),
          width: mix(0.25, 0.43, random()),
          angle: branchAngle + side * mix(0.34, 0.82, random()),
          phase: random() * TAU,
          harmonic: 4 + Math.floor(random() * 5),
          opacity: mix(0.55, 0.95, random()),
          softness: mix(1.2, 3.8, random()),
        })
      }
      branches.push({
        angle: branchAngle,
        length: branchLength,
        width: mix(2.2, 5.2, random()),
        leaves,
      })
    }

    return {
      x,
      y,
      phase: random() * TAU,
      harmonic: groupIndex % 3 === 0 ? 2 : 1,
      travel: mix(15, 29, random()),
      rotation: mix(0.035, 0.065, random()),
      shear: mix(0.035, 0.075, random()),
      scale: mix(0.82, 1.26, random()),
      branches,
    }
  })
}

function createSunOpenings(): SunOpening[] {
  const random = mulberry32(4903)
  const openings: SunOpening[] = []
  for (let index = 0; index < 108; index += 1) {
    const progress = random()
    const x = mix(238, 1052, progress)
    const upperBoundary = mix(704, 833, progress)
    const lowerBoundary = mix(930, 905, progress)
    openings.push({
      x: x + mix(-48, 48, random()),
      y: mix(upperBoundary, lowerBoundary, random()),
      length: mix(10, 39, random()),
      width: mix(0.24, 0.58, random()),
      angle: mix(-0.82, 0.9, random()),
      phase: random() * TAU,
      harmonic: 5 + Math.floor(random() * 5),
      secondaryHarmonic: 3 + Math.floor(random() * 4),
      travel: mix(2.5, 9, random()),
      opacity: mix(0.54, 1, random()),
      softness: mix(0.5, 4.4, random()),
    })
  }
  return openings
}

function loadReceiverMask() {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      const mask = createCanvas()
      const context = mask.getContext('2d')
      if (!context) {
        reject(new Error('Receiver-mask canvas is unavailable.'))
        return
      }
      context.drawImage(image, 0, 0, RENDER_WIDTH, RENDER_HEIGHT)
      resolve(mask)
    }
    image.onerror = () => reject(new Error('The dappled-light receiver mask failed to load.'))
    image.src = RECEIVER_SOURCE
  })
}

function clipToReceiver(field: HTMLCanvasElement, receiver: HTMLCanvasElement) {
  const context = field.getContext('2d')
  if (!context) return
  context.save()
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(receiver, 0, 0)
  context.restore()
}

function drawBranchMasses(
  target: HTMLCanvasElement,
  groups: readonly BranchGroup[],
  phase: number,
  settings: DappledLightSettings,
) {
  const context = target.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT)
  context.save()
  context.scale(RENDER_SCALE, RENDER_SCALE)
  context.fillStyle = '#3f4132'
  context.strokeStyle = '#3f4132'
  const theta = phase * TAU

  for (const group of groups) {
    const primary = theta * group.harmonic + group.phase
    const secondary = theta * (group.harmonic + 1) + group.phase * 0.63
    const travel = group.travel * settings.deformation
    const x = group.x + Math.sin(primary) * travel + Math.sin(secondary) * travel * 0.22
    const y = group.y + Math.cos(primary) * travel * 0.24
    const rotation = Math.sin(primary) * group.rotation * settings.deformation
    const shear = Math.sin(secondary) * group.shear * settings.deformation
    const stretch = 1 + Math.cos(primary) * 0.045 * settings.deformation

    context.save()
    context.translate(x, y)
    context.rotate(rotation)
    context.transform(1, shear, 0, stretch, 0, 0)
    context.scale(group.scale * settings.depthRegionScale, group.scale)

    for (const branch of group.branches) {
      context.save()
      context.rotate(branch.angle)
      context.globalAlpha = 0.72
      context.lineWidth = branch.width
      context.lineCap = 'round'
      context.beginPath()
      context.moveTo(-20, 0)
      context.bezierCurveTo(
        branch.length * 0.2,
        Math.sin(primary) * 3,
        branch.length * 0.68,
        Math.cos(secondary) * 5,
        branch.length,
        0,
      )
      context.stroke()

      for (const leaf of branch.leaves) {
        const flutter = Math.sin(theta * leaf.harmonic + leaf.phase)
        context.save()
        context.translate(leaf.x, leaf.y)
        context.rotate(leaf.angle - branch.angle + flutter * 0.055)
        context.globalAlpha = leaf.opacity * (0.82 + flutter * 0.12)
        context.filter = `blur(${leaf.softness * settings.edgeSoftness}px)`
        drawLeaf(context, leaf.length, leaf.width)
        context.restore()
      }
      context.restore()
    }
    context.restore()
  }
  context.restore()
}

function drawSunOpenings(
  target: HTMLCanvasElement,
  openings: readonly SunOpening[],
  phase: number,
  settings: DappledLightSettings,
) {
  const context = target.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT)
  context.save()
  context.scale(RENDER_SCALE, RENDER_SCALE)
  context.fillStyle = '#ffe2a0'
  const theta = phase * TAU

  for (const opening of openings) {
    const flutter =
      Math.sin(theta * opening.harmonic + opening.phase) * 0.68 +
      Math.sin(theta * opening.secondaryHarmonic + opening.phase * 1.71) * 0.32
    const visibility = smoothstep(-0.42, 0.52, flutter)
    if (visibility < 0.012) continue

    const split = smoothstep(0.34, 0.88, Math.sin(theta * 7 + opening.phase))
    const travelX = Math.sin(theta * 3 + opening.phase) * opening.travel
    const travelY = Math.cos(theta * 4 + opening.phase * 0.74) * opening.travel * 0.42
    const stretch = 0.68 + visibility * 0.58
    const softness =
      opening.softness * settings.edgeSoftness * (1.18 - visibility * 0.48)

    context.save()
    context.translate(opening.x + travelX, opening.y + travelY)
    context.rotate(opening.angle + Math.sin(theta * 5 + opening.phase) * 0.08)
    context.scale(stretch, 0.82 + visibility * 0.25)
    context.filter = `blur(${softness}px)`
    context.globalAlpha = opening.opacity * visibility
    drawLeaf(context, opening.length, opening.width)

    if (split > 0.06) {
      context.translate(opening.length * 0.34 * split, opening.length * 0.15 * split)
      context.scale(0.58, 0.64)
      context.globalAlpha = opening.opacity * visibility * split * 0.74
      drawLeaf(context, opening.length, opening.width)
    }
    context.restore()
  }
  context.restore()
}

function getFixedPhase() {
  const value = new URLSearchParams(window.location.search).get('dapplePhase')
  if (value === null) return null
  const phase = Number(value)
  return Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : null
}

function isReducedMotionForced() {
  return new URLSearchParams(window.location.search).get('dappleMotion') === 'reduce'
}

function isMaskDebugEnabled() {
  return new URLSearchParams(window.location.search).get('dappleDebug') === 'mask'
}

function countEscapedPixels(
  shadow: HTMLCanvasElement,
  sunlight: HTMLCanvasElement,
  receiver: HTMLCanvasElement,
) {
  const shadowPixels = shadow.getContext('2d')?.getImageData(0, 0, RENDER_WIDTH, RENDER_HEIGHT)
    .data
  const sunlightPixels = sunlight
    .getContext('2d')
    ?.getImageData(0, 0, RENDER_WIDTH, RENDER_HEIGHT).data
  const receiverPixels = receiver
    .getContext('2d')
    ?.getImageData(0, 0, RENDER_WIDTH, RENDER_HEIGHT).data
  if (!shadowPixels || !sunlightPixels || !receiverPixels) return -1

  let escaped = 0
  for (let offset = 3; offset < receiverPixels.length; offset += 4) {
    if (receiverPixels[offset] === 0 && (shadowPixels[offset] > 0 || sunlightPixels[offset] > 0)) {
      escaped += 1
    }
  }
  return escaped
}

function alphaStats(canvas: HTMLCanvasElement) {
  const pixels = canvas
    .getContext('2d')
    ?.getImageData(0, 0, RENDER_WIDTH, RENDER_HEIGHT).data
  if (!pixels) return { nonzero: 0, maximum: 0, mean: 0 }
  let nonzero = 0
  let maximum = 0
  let total = 0
  for (let offset = 3; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset]
    if (alpha === 0) continue
    nonzero += 1
    total += alpha
    maximum = Math.max(maximum, alpha)
  }
  return { nonzero, maximum, mean: nonzero === 0 ? 0 : total / nonzero }
}

type DappledLightProps = {
  settings?: Partial<DappledLightSettings>
}

export function DappledLight({ settings: overrides }: DappledLightProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLCanvasElement>(null)
  const sunlightRef = useRef<HTMLCanvasElement>(null)
  const settings = useMemo(
    () => ({ ...DEFAULT_DAPPLED_LIGHT_SETTINGS, ...overrides }),
    [overrides],
  )

  useEffect(() => {
    const host = hostRef.current
    const shadow = shadowRef.current
    const sunlight = sunlightRef.current
    if (!host || !shadow || !sunlight) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fixedPhase = getFixedPhase()
    const forcedReducedMotion = isReducedMotionForced()
    const debugMask = isMaskDebugEnabled()
    const branchGroups = createBranchGroups()
    const openings = createSunOpenings()
    const branchField = createCanvas()
    const openingField = createCanvas()
    let receiver: HTMLCanvasElement | null = null
    let animationFrame: number | null = null
    let lastPaint = -Infinity
    let loopStart = performance.now()
    let visible = true
    let disposed = false

    const paint = (phase: number) => {
      if (!receiver) return
      const shadowContext = shadow.getContext('2d')
      const sunlightContext = sunlight.getContext('2d')
      if (!shadowContext || !sunlightContext) return

      drawBranchMasses(branchField, branchGroups, phase, settings)
      drawSunOpenings(openingField, openings, phase, settings)
      clipToReceiver(branchField, receiver)
      clipToReceiver(openingField, receiver)

      shadowContext.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT)
      shadowContext.globalAlpha = settings.shadowStrength
      shadowContext.drawImage(branchField, 0, 0)
      shadowContext.globalAlpha = 1

      sunlightContext.clearRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT)
      sunlightContext.globalAlpha = settings.sunlightRecovery
      sunlightContext.drawImage(openingField, 0, 0)
      sunlightContext.globalAlpha = 1

      host.dataset.loopPhase = phase.toFixed(5)
      if (fixedPhase !== null || debugMask) {
        host.dataset.escapedPixels = String(countEscapedPixels(shadow, sunlight, receiver))
        const shadowStats = alphaStats(shadow)
        const sunlightStats = alphaStats(sunlight)
        host.dataset.shadowStats = `${shadowStats.nonzero},${shadowStats.maximum},${shadowStats.mean.toFixed(2)}`
        host.dataset.sunlightStats = `${sunlightStats.nonzero},${sunlightStats.maximum},${sunlightStats.mean.toFixed(2)}`
      }
    }

    const stop = () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      animationFrame = null
    }

    const effectiveLoopSeconds = settings.loopSeconds / Math.max(settings.motionSpeed, 0.05)

    const render = (time: number) => {
      animationFrame = null
      if (
        disposed ||
        !receiver ||
        reducedMotion.matches ||
        forcedReducedMotion ||
        debugMask ||
        !visible ||
        document.visibilityState !== 'visible'
      ) {
        return
      }
      if (time - lastPaint >= TARGET_FRAME_MS) {
        paint(((time - loopStart) / 1000 / effectiveLoopSeconds) % 1)
        lastPaint = time
      }
      animationFrame = window.requestAnimationFrame(render)
    }

    const start = () => {
      if (
        animationFrame === null &&
        receiver &&
        fixedPhase === null &&
        !debugMask &&
        !reducedMotion.matches &&
        !forcedReducedMotion &&
        visible &&
        document.visibilityState === 'visible'
      ) {
        animationFrame = window.requestAnimationFrame(render)
      }
    }

    const handleMotionPreference = () => {
      if (!receiver) return
      if (reducedMotion.matches || forcedReducedMotion || debugMask) {
        stop()
        paint(0)
        host.dataset.motion = debugMask ? 'debug-mask' : 'reduced'
      } else {
        host.dataset.motion = fixedPhase === null ? 'live' : 'fixed-phase'
        loopStart = performance.now()
        if (fixedPhase === null) start()
        else paint(fixedPhase)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') stop()
      else start()
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false
        if (visible) start()
        else stop()
      },
      { threshold: 0.01 },
    )

    host.dataset.loopSeconds = effectiveLoopSeconds.toFixed(2)
    host.dataset.receiverRegions = 'existing-left-canopy-shadow'
    host.dataset.debug = debugMask ? 'mask' : 'off'
    observer.observe(host)
    document.addEventListener('visibilitychange', handleVisibility)
    reducedMotion.addEventListener('change', handleMotionPreference)

    void loadReceiverMask()
      .then((loadedReceiver) => {
        if (disposed) return
        receiver = loadedReceiver
        host.dataset.receiverReady = 'true'
        handleMotionPreference()
      })
      .catch((error) => {
        console.error('Dappled-light receiver unavailable; lighting remains static.', error)
        host.dataset.receiverReady = 'false'
      })

    return () => {
      disposed = true
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
      reducedMotion.removeEventListener('change', handleMotionPreference)
    }
  }, [settings])

  return (
    <div className="scene__dappled-light" ref={hostRef} aria-hidden="true">
      <canvas
        className="scene__dappled-shadow"
        ref={shadowRef}
        width={RENDER_WIDTH}
        height={RENDER_HEIGHT}
      />
      <canvas
        className="scene__dappled-sunlight"
        ref={sunlightRef}
        width={RENDER_WIDTH}
        height={RENDER_HEIGHT}
      />
      <img
        className="scene__dappled-mask-debug"
        src={RECEIVER_SOURCE}
        width={SOURCE_WIDTH}
        height={SOURCE_HEIGHT}
        alt=""
        draggable="false"
      />
    </div>
  )
}

import type {
  ButterflyPoint,
  ButterflySettings,
} from '../components/butterflySettings'
import type { AmbientWindField, AmbientWindSample } from './AmbientWindField'

type Vector3Value = {
  x: number
  y: number
  z: number
}

export type ButterflyBehavior = 'hover' | 'wander' | 'approach'

export type ButterflyAgent = {
  id: number
  position: Vector3Value
  velocity: Vector3Value
  target: Vector3Value
  behavior: ButterflyBehavior
  stateRemaining: number
  targetRemaining: number
  cruiseSpeed: number
  hoverSpeed: number
  flapFrequency: number
  flapPhase: number
  flapAmplitude: number
  scale: number
  noiseStrength: number
  noiseFrequency: number
  noiseOffset: number
  windPosition: number
  depthBand: 0 | 1 | 2
}

const TAU = Math.PI * 2

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const mix = (minimum: number, maximum: number, amount: number) =>
  minimum + (maximum - minimum) * amount

const smoothstep = (minimum: number, maximum: number, value: number) => {
  const amount = clamp((value - minimum) / (maximum - minimum), 0, 1)
  return amount * amount * (3 - 2 * amount)
}

const hash = (value: number, seed: number) => {
  const hashed = Math.sin(value * 127.1 + seed * 311.7) * 43758.5453
  return hashed - Math.floor(hashed)
}

const valueNoise = (value: number, seed: number) => {
  const start = Math.floor(value)
  const fraction = value - start
  const eased = fraction * fraction * (3 - 2 * fraction)
  return mix(hash(start, seed), hash(start + 1, seed), eased)
}

const length2 = (x: number, y: number) => Math.hypot(x, y)

const normalize2 = (x: number, y: number) => {
  const length = length2(x, y)
  return length > 0.0001 ? { x: x / length, y: y / length } : { x: 0, y: 0 }
}

const mulberry32 = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export class ButterflyFlock {
  readonly agents: ButterflyAgent[] = []

  private readonly settings: ButterflySettings
  private readonly wind: AmbientWindField
  private readonly windSample: AmbientWindSample = { broad: 0, detail: 0 }
  private random: () => number

  constructor(
    settings: ButterflySettings,
    wind: AmbientWindField,
    count: number,
    seed: number,
  ) {
    this.settings = settings
    this.wind = wind
    this.random = mulberry32(seed)
    this.reset(count, seed)
  }

  reset(count: number, seed: number) {
    this.agents.length = 0
    this.random = mulberry32(seed)

    for (let index = 0; index < count; index += 1) {
      const position = this.initialPosition(index, count)
      const depthAmount = this.random()
      const speed = mix(
        this.settings.cruiseSpeed[0],
        this.settings.cruiseSpeed[1],
        this.random(),
      )
      const heading = this.random() * TAU
      const agent: ButterflyAgent = {
        id: index,
        position,
        velocity: {
          x: Math.cos(heading) * speed * 0.28,
          y: Math.sin(heading) * speed * 0.28,
          z: 0,
        },
        target: { ...position },
        behavior: 'wander',
        stateRemaining: 0,
        targetRemaining: 0,
        cruiseSpeed: speed,
        hoverSpeed: mix(
          this.settings.hoverSpeed[0],
          this.settings.hoverSpeed[1],
          this.random(),
        ),
        flapFrequency: mix(
          this.settings.flapFrequency[0],
          this.settings.flapFrequency[1],
          this.random(),
        ),
        flapPhase: this.random() * TAU,
        flapAmplitude: mix(
          this.settings.flapAmplitude[0],
          this.settings.flapAmplitude[1],
          this.random(),
        ),
        scale:
          mix(this.settings.scale[0], this.settings.scale[1], depthAmount) *
          mix(0.88, 1.08, this.random()),
        noiseStrength: mix(
          this.settings.noiseStrength[0],
          this.settings.noiseStrength[1],
          this.random(),
        ),
        noiseFrequency: mix(
          this.settings.noiseFrequency[0],
          this.settings.noiseFrequency[1],
          this.random(),
        ),
        noiseOffset: this.random() * 1000,
        windPosition: mix(8.2, 9.5, this.random()),
        depthBand: depthAmount < 0.34 ? 0 : depthAmount < 0.69 ? 1 : 2,
      }
      this.chooseTarget(agent)
      this.agents.push(agent)
    }
  }

  update(delta: number, time: number, readingBlend: number) {
    const speedScale = mix(1, this.settings.readingSpeedScale, readingBlend)
    const noiseScale = mix(1, this.settings.readingNoiseScale, readingBlend)
    const windTime = this.wind.time(time * 1000)

    for (const agent of this.agents) {
      agent.stateRemaining -= delta
      agent.targetRemaining -= delta

      const targetDx = agent.target.x - agent.position.x
      const targetDy = agent.target.y - agent.position.y
      const targetDistance = length2(targetDx, targetDy)

      if (agent.behavior === 'hover') {
        if (agent.stateRemaining <= 0) this.chooseTarget(agent)
      } else if (
        targetDistance <= this.settings.arrivalRadius ||
        agent.targetRemaining <= 0
      ) {
        this.beginHover(agent)
      }

      const currentTargetDx = agent.target.x - agent.position.x
      const currentTargetDy = agent.target.y - agent.position.y
      const currentTargetDistance = length2(currentTargetDx, currentTargetDy)
      const targetDirection = normalize2(currentTargetDx, currentTargetDy)
      const arrival = smoothstep(
        this.settings.arrivalRadius,
        this.settings.slowdownRadius,
        currentTargetDistance,
      )
      const baseSpeed =
        agent.behavior === 'hover'
          ? agent.hoverSpeed
          : mix(agent.hoverSpeed, agent.cruiseSpeed, arrival)

      const noiseClock = time * agent.noiseFrequency
      const noiseX =
        (valueNoise(noiseClock + agent.noiseOffset, 31 + agent.id * 7) - 0.5) * 2
      const noiseY =
        (valueNoise(noiseClock * 0.83 + agent.noiseOffset * 1.73, 67 + agent.id * 11) -
          0.5) *
        2

      this.wind.sample(agent.windPosition, windTime, this.windSample)
      const desiredX =
        targetDirection.x * baseSpeed * speedScale +
        noiseX * agent.noiseStrength * noiseScale +
        this.windSample.broad * this.settings.windStrength * speedScale
      const desiredY =
        targetDirection.y * baseSpeed * speedScale +
        noiseY * agent.noiseStrength * noiseScale +
        this.windSample.detail * this.settings.windStrength * 0.22 * speedScale

      let accelerationX =
        (desiredX - agent.velocity.x) * this.settings.steeringResponse
      let accelerationY =
        (desiredY - agent.velocity.y) * this.settings.steeringResponse

      const boundaryForce = this.boundaryForce(agent.position)
      accelerationX += boundaryForce.x
      accelerationY += boundaryForce.y

      const avoidanceForce = this.avoidanceForce(agent.position)
      accelerationX += avoidanceForce.x
      accelerationY += avoidanceForce.y

      for (const other of this.agents) {
        if (other === agent) continue
        const separationX = agent.position.x - other.position.x
        const separationY = agent.position.y - other.position.y
        const separationDistance = length2(separationX, separationY)
        if (
          separationDistance <= 0.001 ||
          separationDistance >= this.settings.separationRadius
        ) {
          continue
        }
        const separationAmount =
          1 - separationDistance / this.settings.separationRadius
        accelerationX +=
          (separationX / separationDistance) *
          separationAmount *
          this.settings.separationStrength
        accelerationY +=
          (separationY / separationDistance) *
          separationAmount *
          this.settings.separationStrength
      }

      const accelerationLength = length2(accelerationX, accelerationY)
      if (accelerationLength > this.settings.maximumAcceleration) {
        const accelerationScale =
          this.settings.maximumAcceleration / accelerationLength
        accelerationX *= accelerationScale
        accelerationY *= accelerationScale
      }

      agent.velocity.x += accelerationX * delta
      agent.velocity.y += accelerationY * delta
      const maximumSpeed = agent.cruiseSpeed * speedScale * 1.18
      const velocityLength = length2(agent.velocity.x, agent.velocity.y)
      if (velocityLength > maximumSpeed) {
        const velocityScale = maximumSpeed / velocityLength
        agent.velocity.x *= velocityScale
        agent.velocity.y *= velocityScale
      }

      agent.position.x += agent.velocity.x * delta
      agent.position.y += agent.velocity.y * delta

      const targetDepthVelocity = clamp(
        (agent.target.z - agent.position.z) * 0.72,
        -this.settings.depthSpeed,
        this.settings.depthSpeed,
      )
      agent.velocity.z +=
        (targetDepthVelocity - agent.velocity.z) * (1 - Math.exp(-1.8 * delta))
      agent.position.z += agent.velocity.z * delta
      this.constrain(agent.position)
    }
  }

  private initialPosition(index: number, count: number): Vector3Value {
    const angle = (index / Math.max(count, 1)) * TAU + this.random() * 0.42
    const radius = mix(0.28, 0.86, Math.sqrt(this.random()))
    const activity = this.settings.activity
    return {
      x: clamp(
        activity.x + Math.cos(angle) * activity.radiusX * radius,
        activity.minimumX,
        activity.maximumX,
      ),
      y: clamp(
        activity.y + Math.sin(angle) * activity.radiusY * radius,
        activity.minimumY,
        activity.maximumY,
      ),
      z: mix(this.settings.depth[0], this.settings.depth[1], this.random()),
    }
  }

  private beginHover(agent: ButterflyAgent) {
    agent.behavior = 'hover'
    agent.stateRemaining = mix(
      this.settings.hoverDuration[0],
      this.settings.hoverDuration[1],
      this.random(),
    )
    agent.targetRemaining = agent.stateRemaining
    agent.target = {
      x: agent.position.x + mix(-7, 7, this.random()),
      y: agent.position.y + mix(-9, 9, this.random()),
      z: clamp(
        agent.position.z + mix(-0.08, 0.08, this.random()),
        this.settings.depth[0],
        this.settings.depth[1],
      ),
    }
    this.constrain(agent.target)
  }

  private chooseTarget(agent: ButterflyAgent) {
    const approachAnchor = this.random() < this.settings.anchorApproachChance
    const target = approachAnchor
      ? this.targetNearAnchor()
      : this.targetNearAgent(agent.position)
    agent.target = target
    agent.behavior = approachAnchor ? 'approach' : 'wander'
    agent.stateRemaining = 0
    agent.targetRemaining = mix(
      this.settings.targetDuration[0],
      this.settings.targetDuration[1],
      this.random(),
    )
  }

  private targetNearAnchor(): Vector3Value {
    const anchor =
      this.settings.leafAnchors[
        Math.floor(this.random() * this.settings.leafAnchors.length)
      ]
    const target = {
      x: anchor.x + mix(-18, 18, this.random()),
      y: anchor.y + mix(-16, 16, this.random()),
      z: mix(this.settings.depth[0], this.settings.depth[1], this.random()),
    }
    this.constrain(target)
    return target
  }

  private targetNearAgent(position: Vector3Value): Vector3Value {
    // Some agents traverse more of this one plant, but every candidate is
    // still clamped back into the same hard habitat before it is accepted.
    const longLocalTravel = this.random() < this.settings.longLocalTravelChance
    const minimum = this.settings.localTravel[0]
    const maximum = this.settings.localTravel[1] * (longLocalTravel ? 1.42 : 1)

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const angle = this.random() * TAU
      const distance = mix(minimum, maximum, Math.sqrt(this.random()))
      const candidate = {
        x: position.x + Math.cos(angle) * distance,
        y: position.y + Math.sin(angle) * distance,
        z: mix(this.settings.depth[0], this.settings.depth[1], this.random()),
      }
      if (this.isAllowed(candidate)) return candidate
    }

    const fallback = this.randomRegionPoint()
    this.constrain(fallback)
    return fallback
  }

  private randomRegionPoint(): Vector3Value {
    const activity = this.settings.activity
    const angle = this.random() * TAU
    const radius = Math.sqrt(this.random())
    return {
      x: activity.x + Math.cos(angle) * activity.radiusX * radius,
      y: activity.y + Math.sin(angle) * activity.radiusY * radius,
      z: mix(this.settings.depth[0], this.settings.depth[1], this.random()),
    }
  }

  private isAllowed(point: Vector3Value | ButterflyPoint) {
    const activity = this.settings.activity
    if (
      point.x < activity.minimumX ||
      point.x > activity.maximumX ||
      point.y < activity.minimumY ||
      point.y > activity.maximumY
    ) {
      return false
    }
    const ellipseDistance =
      ((point.x - activity.x) / activity.radiusX) ** 2 +
      ((point.y - activity.y) / activity.radiusY) ** 2
    if (ellipseDistance > 1) return false

    return this.settings.avoidance.every((avoidance) => {
      const avoidanceDistance =
        ((point.x - avoidance.x) / avoidance.radiusX) ** 2 +
        ((point.y - avoidance.y) / avoidance.radiusY) ** 2
      return avoidanceDistance >= 1
    })
  }

  private constrain(point: Vector3Value) {
    const activity = this.settings.activity
    point.x = clamp(point.x, activity.minimumX, activity.maximumX)
    point.y = clamp(point.y, activity.minimumY, activity.maximumY)
    point.z = clamp(point.z, this.settings.depth[0], this.settings.depth[1])

    const normalizedX = (point.x - activity.x) / activity.radiusX
    const normalizedY = (point.y - activity.y) / activity.radiusY
    const ellipseDistance = Math.hypot(normalizedX, normalizedY)
    if (ellipseDistance > 1) {
      point.x = activity.x + (normalizedX / ellipseDistance) * activity.radiusX
      point.y = activity.y + (normalizedY / ellipseDistance) * activity.radiusY
    }
  }

  private boundaryForce(position: Vector3Value) {
    const activity = this.settings.activity
    const normalizedX = (position.x - activity.x) / activity.radiusX
    const normalizedY = (position.y - activity.y) / activity.radiusY
    const distance = Math.hypot(normalizedX, normalizedY)
    const amount = smoothstep(0.72, 1.04, distance)
    if (amount <= 0) return { x: 0, y: 0 }
    const direction = normalize2(-normalizedX, -normalizedY)
    return {
      x: direction.x * amount * this.settings.boundaryStrength,
      y: direction.y * amount * this.settings.boundaryStrength,
    }
  }

  private avoidanceForce(position: Vector3Value) {
    let forceX = 0
    let forceY = 0
    for (const avoidance of this.settings.avoidance) {
      const normalizedX = (position.x - avoidance.x) / avoidance.radiusX
      const normalizedY = (position.y - avoidance.y) / avoidance.radiusY
      const distance = Math.hypot(normalizedX, normalizedY)
      if (distance >= 1.38) continue
      const direction = normalize2(normalizedX, normalizedY)
      const amount = 1 - smoothstep(0.72, 1.38, distance)
      forceX +=
        direction.x *
        amount *
        this.settings.avoidanceStrength *
        avoidance.strength
      forceY +=
        direction.y *
        amount *
        this.settings.avoidanceStrength *
        avoidance.strength
    }
    return { x: forceX, y: forceY }
  }
}

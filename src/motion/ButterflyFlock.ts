import type {
  ButterflyPoint,
  ButterflyRange,
  ButterflySettings,
} from '../components/butterflySettings'
import type { AmbientWindField, AmbientWindSample } from './AmbientWindField'

type Vector3Value = {
  x: number
  y: number
  z: number
}

export type ButterflyBehavior =
  | 'hover'
  | 'flutter'
  | 'dart'
  | 'inspect'
  | 'wander'

export type ButterflyAgent = {
  id: number
  position: Vector3Value
  velocity: Vector3Value
  home: Vector3Value
  // The path diagnostic draws this local tether. It is not a flight target.
  target: Vector3Value
  behavior: ButterflyBehavior
  travelHeading: number
  turnRate: number
  turnCommand: number
  turnControlRemaining: number
  turnSign: -1 | 1
  speed: number
  speedCommand: number
  speedControlRemaining: number
  flutterVelocity: ButterflyPoint
  flutterCommand: ButterflyPoint
  flutterControlRemaining: number
  depthCommand: number
  depthControlRemaining: number
  homeRadiusX: number
  homeRadiusY: number
  cruiseSpeed: number
  flapFrequency: number
  flapPhase: number
  flapAmplitude: number
  flapEnergy: number
  bobPhase: number
  scale: number
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

const length2 = (x: number, y: number) => Math.hypot(x, y)

const normalize2 = (x: number, y: number) => {
  const length = length2(x, y)
  return length > 0.0001 ? { x: x / length, y: y / length } : { x: 0, y: 0 }
}

const shortestAngle = (angle: number) =>
  ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI

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
    const placementRotation = this.random() * TAU

    for (let index = 0; index < count; index += 1) {
      const position = this.initialPosition(index, count, placementRotation)
      const home = this.localHome(position)
      const depthAmount = this.random()
      const cruiseSpeed = this.randomRange(this.settings.cruiseSpeed)
      const travelHeading = this.random() * TAU
      const turnSign: -1 | 1 = this.random() < 0.5 ? -1 : 1
      const speed = cruiseSpeed * this.randomRange(this.settings.activeSpeedScale)
      const horizontalClearance = Math.min(
        home.x - this.settings.activity.minimumX,
        this.settings.activity.maximumX - home.x,
      )
      const verticalClearance = Math.min(
        home.y - this.settings.activity.minimumY,
        this.settings.activity.maximumY - home.y,
      )
      const agent: ButterflyAgent = {
        id: index,
        position,
        velocity: {
          x: Math.cos(travelHeading) * speed,
          y: Math.sin(travelHeading) * speed,
          z: 0,
        },
        home,
        target: home,
        behavior: 'wander',
        travelHeading,
        turnRate: 0,
        turnCommand: turnSign * this.randomRange(this.settings.turnRate),
        turnControlRemaining: 0,
        turnSign,
        speed,
        speedCommand: speed,
        speedControlRemaining: 0,
        flutterVelocity: { x: 0, y: 0 },
        flutterCommand: { x: 0, y: 0 },
        flutterControlRemaining: 0,
        depthCommand: 0,
        depthControlRemaining: 0,
        homeRadiusX: Math.max(
          8,
          Math.min(
            this.randomRange(this.settings.homeRadiusX),
            horizontalClearance * 0.72,
          ),
        ),
        homeRadiusY: Math.max(
          12,
          Math.min(
            this.randomRange(this.settings.homeRadiusY),
            verticalClearance * 0.72,
          ),
        ),
        cruiseSpeed,
        flapFrequency: this.randomRange(this.settings.flapFrequency),
        flapPhase: this.random() * TAU,
        flapAmplitude: this.randomRange(this.settings.flapAmplitude),
        flapEnergy: mix(0.36, 0.78, this.random()),
        bobPhase: this.random() * TAU,
        scale:
          mix(this.settings.scale[0], this.settings.scale[1], depthAmount) *
          mix(0.9, 1.07, this.random()),
        windPosition: mix(8.2, 9.5, this.random()),
        depthBand: depthAmount < 0.34 ? 0 : depthAmount < 0.69 ? 1 : 2,
      }

      this.chooseSpeedCommand(agent)
      this.chooseTurnCommand(agent)
      this.chooseFlutterCommand(agent)
      this.chooseDepthCommand(agent)
      agent.speedControlRemaining *= this.random()
      agent.turnControlRemaining *= this.random()
      agent.flutterControlRemaining *= this.random()
      agent.depthControlRemaining *= this.random()
      this.agents.push(agent)
    }
  }

  update(delta: number, time: number, readingBlend: number) {
    const speedScale = mix(1, this.settings.readingSpeedScale, readingBlend)
    const flutterScale = mix(1, this.settings.readingJitterScale, readingBlend)
    const flapScale = mix(1, this.settings.readingFlapScale, readingBlend)
    const controlDelta = delta * mix(1, 0.58, readingBlend)
    const windTime = this.wind.time(time * 1000)

    for (const agent of this.agents) {
      agent.speedControlRemaining -= controlDelta
      agent.turnControlRemaining -= controlDelta
      agent.flutterControlRemaining -= controlDelta
      agent.depthControlRemaining -= controlDelta

      if (agent.speedControlRemaining <= 0) this.chooseSpeedCommand(agent)
      if (agent.turnControlRemaining <= 0) this.chooseTurnCommand(agent)
      if (agent.flutterControlRemaining <= 0) this.chooseFlutterCommand(agent)
      if (agent.depthControlRemaining <= 0) this.chooseDepthCommand(agent)

      agent.speed +=
        (agent.speedCommand - agent.speed) *
        (1 - Math.exp(-this.settings.speedResponse * delta))

      const homeDx = agent.home.x - agent.position.x
      const homeDy = agent.home.y - agent.position.y
      const homeDistance = Math.hypot(
        homeDx / agent.homeRadiusX,
        homeDy / agent.homeRadiusY,
      )
      const homeAmount = smoothstep(0.78, 1.08, homeDistance)
      const homeHeading = Math.atan2(homeDy, homeDx)
      const homeHeadingDelta = shortestAngle(homeHeading - agent.travelHeading)
      const homeTurn =
        clamp(homeHeadingDelta / 1.35, -1, 1) *
        this.settings.homeTurnStrength *
        homeAmount

      const boundaryForce = this.boundaryForce(agent.position)
      const boundaryLength = length2(boundaryForce.x, boundaryForce.y)
      let boundaryTurn = 0
      if (boundaryLength > 0.001) {
        const boundaryHeading = Math.atan2(boundaryForce.y, boundaryForce.x)
        boundaryTurn =
          clamp(shortestAngle(boundaryHeading - agent.travelHeading) / 1.2, -1, 1) *
          smoothstep(0, this.settings.boundaryStrength, boundaryLength) *
          this.settings.homeTurnStrength
      }

      const desiredTurnRate =
        (agent.turnCommand + homeTurn + boundaryTurn) * flutterScale
      agent.turnRate +=
        (desiredTurnRate - agent.turnRate) *
        (1 - Math.exp(-this.settings.turnRateResponse * delta))
      agent.travelHeading += agent.turnRate * delta

      agent.flutterVelocity.x +=
        (agent.flutterCommand.x - agent.flutterVelocity.x) *
        (1 - Math.exp(-this.settings.flutterResponse * delta))
      agent.flutterVelocity.y +=
        (agent.flutterCommand.y - agent.flutterVelocity.y) *
        (1 - Math.exp(-this.settings.flutterResponse * delta))

      const directionX = Math.cos(agent.travelHeading)
      const directionY = Math.sin(agent.travelHeading)
      this.wind.sample(agent.windPosition, windTime, this.windSample)
      const desiredX =
        directionX * agent.speed * speedScale +
        agent.flutterVelocity.x * flutterScale +
        this.windSample.broad * this.settings.windStrength * speedScale
      const desiredY =
        directionY * agent.speed * speedScale +
        agent.flutterVelocity.y * flutterScale +
        this.windSample.detail * this.settings.windStrength * 0.18 * speedScale

      let accelerationX =
        (desiredX - agent.velocity.x) * this.settings.velocityResponse
      let accelerationY =
        (desiredY - agent.velocity.y) * this.settings.velocityResponse

      const homeDirection = normalize2(homeDx, homeDy)
      const homeReturn =
        smoothstep(0.86, 1.2, homeDistance) * this.settings.homeReturnStrength
      accelerationX += homeDirection.x * homeReturn
      accelerationY += homeDirection.y * homeReturn

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
      const maximumSpeed =
        agent.cruiseSpeed * this.settings.burstSpeedScale[1] +
        this.settings.flutterSpeed[1]
      const velocityLength = length2(agent.velocity.x, agent.velocity.y)
      if (velocityLength > maximumSpeed) {
        const velocityScale = maximumSpeed / velocityLength
        agent.velocity.x *= velocityScale
        agent.velocity.y *= velocityScale
      }

      agent.position.x += agent.velocity.x * delta
      agent.position.y += agent.velocity.y * delta

      const desiredDepthVelocity = clamp(
        agent.depthCommand * speedScale +
          (agent.home.z - agent.position.z) * this.settings.depthResponse * 0.28,
        -this.settings.depthSpeed,
        this.settings.depthSpeed,
      )
      agent.velocity.z +=
        (desiredDepthVelocity - agent.velocity.z) *
        (1 - Math.exp(-this.settings.depthResponse * delta))
      agent.position.z += agent.velocity.z * delta

      const unconstrainedX = agent.position.x
      const unconstrainedY = agent.position.y
      this.constrain(agent.position)
      if (
        Math.abs(agent.position.x - unconstrainedX) > 0.001 ||
        Math.abs(agent.position.y - unconstrainedY) > 0.001
      ) {
        agent.speed *= 0.72
        agent.turnControlRemaining = 0
      }

      this.updateFlightReadout(agent)
      const speedRatio = agent.speed / Math.max(agent.cruiseSpeed, 0.001)
      const turnActivity = clamp(
        Math.abs(agent.turnRate) / this.settings.turnRate[1],
        0,
        1,
      )
      const flutterActivity = clamp(
        length2(agent.flutterVelocity.x, agent.flutterVelocity.y) /
          this.settings.flutterSpeed[1],
        0,
        1,
      )
      const flapEnergyTarget = clamp(
        0.24 + speedRatio * 0.46 + turnActivity * 0.18 + flutterActivity * 0.12,
        0.24,
        1.08,
      )
      agent.flapEnergy +=
        (flapEnergyTarget - agent.flapEnergy) * (1 - Math.exp(-9 * delta))
      agent.flapPhase =
        (agent.flapPhase +
          delta *
            agent.flapFrequency *
            flapScale *
            mix(0.64, this.settings.dartFlapScale, agent.flapEnergy) *
            TAU) %
        TAU
    }
  }

  private chooseSpeedCommand(agent: ButterflyAgent) {
    const roll = this.random()
    let scale: number
    let durationScale = 1
    if (roll < this.settings.slowChance) {
      scale = this.randomRange(this.settings.slowSpeedScale)
      durationScale = mix(0.9, 1.45, this.random())
    } else if (roll < this.settings.slowChance + this.settings.burstChance) {
      scale = this.randomRange(this.settings.burstSpeedScale)
      durationScale = mix(0.5, 0.82, this.random())
    } else {
      scale = this.randomRange(this.settings.activeSpeedScale)
    }
    agent.speedCommand = agent.cruiseSpeed * scale
    agent.speedControlRemaining =
      this.randomRange(this.settings.speedControlInterval) * durationScale
  }

  private chooseTurnCommand(agent: ButterflyAgent) {
    if (this.random() > this.settings.turnPersistence) {
      agent.turnSign = agent.turnSign === 1 ? -1 : 1
    }
    const softened = this.random() < 0.18
    const magnitude =
      this.randomRange(this.settings.turnRate) *
      (softened ? mix(0.12, 0.42, this.random()) : 1)
    agent.turnCommand = agent.turnSign * magnitude
    agent.turnControlRemaining = this.randomRange(
      this.settings.turnControlInterval,
    )
  }

  private chooseFlutterCommand(agent: ButterflyAgent) {
    const angle = this.random() * TAU
    const magnitude = this.randomRange(this.settings.flutterSpeed)
    agent.flutterCommand.x = Math.cos(angle) * magnitude
    agent.flutterCommand.y = Math.sin(angle) * magnitude
    agent.flutterControlRemaining = this.randomRange(
      this.settings.flutterControlInterval,
    )
  }

  private chooseDepthCommand(agent: ButterflyAgent) {
    agent.depthCommand = mix(
      -this.settings.depthSpeed,
      this.settings.depthSpeed,
      this.random(),
    )
    agent.depthControlRemaining = this.randomRange(
      this.settings.depthControlInterval,
    )
  }

  private updateFlightReadout(agent: ButterflyAgent) {
    const speedRatio = agent.speed / Math.max(agent.cruiseSpeed, 0.001)
    if (speedRatio < 0.24) {
      agent.behavior =
        this.nearestAnchorDistance(agent.position) < 24 ? 'inspect' : 'hover'
    } else if (speedRatio > 1.1) {
      agent.behavior = 'dart'
    } else if (Math.abs(agent.turnRate) > 1.3) {
      agent.behavior = 'flutter'
    } else {
      agent.behavior = 'wander'
    }
  }

  private initialPosition(index: number, count: number, rotation: number): Vector3Value {
    const angle = index * Math.PI * (3 - Math.sqrt(5)) + rotation
    const radius = Math.sqrt((index + 0.5) / Math.max(count, 1)) * 0.68
    const activity = this.settings.activity
    return {
      x: clamp(
        activity.x + Math.cos(angle) * activity.radiusX * radius,
        activity.minimumX + 2,
        activity.maximumX - 2,
      ),
      y: clamp(
        activity.y + Math.sin(angle) * activity.radiusY * radius,
        activity.minimumY + 2,
        activity.maximumY - 2,
      ),
      z: mix(this.settings.depth[0], this.settings.depth[1], this.random()),
    }
  }

  private localHome(position: Vector3Value): Vector3Value {
    return {
      x: position.x,
      y: position.y,
      z: position.z,
    }
  }

  private nearestAnchorDistance(position: Vector3Value) {
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const anchor of this.settings.leafAnchors) {
      nearestDistance = Math.min(
        nearestDistance,
        length2(anchor.x - position.x, anchor.y - position.y),
      )
    }
    return nearestDistance
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
    const amount = smoothstep(0.7, 1.03, distance)
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

  private randomRange(range: ButterflyRange) {
    return mix(range[0], range[1], this.random())
  }
}

export type AmbientWindSample = {
  broad: number
  detail: number
}

export const SCENE_WIND_SEED = 0x414c4d4f

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

const hash = (value: number, seed: number) => {
  const hashed = Math.sin(value * 127.1 + seed * 311.7) * 43758.5453
  return hashed - Math.floor(hashed)
}

const valueNoise = (value: number, seed: number) => {
  const start = Math.floor(value)
  const fraction = value - start
  const eased = fraction * fraction * (3 - 2 * fraction)
  return hash(start, seed) + (hash(start + 1, seed) - hash(start, seed)) * eased
}

/** A low-energy, scene-scale breeze signal. Material responders decide how
 * far and how quickly they move; the field only supplies shared air motion. */
export class AmbientWindField {
  private readonly seed: number
  private readonly startedAt: number

  constructor(seed: number) {
    this.seed = seed >>> 0
    this.startedAt = performance.now()
  }

  time(now = performance.now()) {
    return (now - this.startedAt) / 1000
  }

  sample(position: number, time: number, target: AmbientWindSample) {
    const broadNoise = valueNoise(time * 0.075 + position * 0.42, (this.seed % 97) + 5)
    const returningNoise = valueNoise(
      time * 0.12 - position * 0.31 + 19.7,
      (this.seed % 131) + 23,
    )
    const leafNoise = valueNoise(time * 0.31 + position * 1.17, (this.seed % 173) + 47)

    target.broad = clamp((broadNoise - 0.5) * 1.34 + (returningNoise - 0.5) * 0.46, -1, 1)
    target.detail = clamp((leafNoise - 0.5) * 2, -1, 1)
    return target
  }
}

export const sceneAmbientWind = new AmbientWindField(SCENE_WIND_SEED)

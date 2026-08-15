export const PAPER_PROBE_IDS = [
  'corner-tl',
  'corner-tr',
  'corner-bl',
  'corner-br',
  'edge-top',
  'edge-right',
  'edge-bottom',
  'edge-left',
  'center',
] as const

export type PaperProbeId = (typeof PAPER_PROBE_IDS)[number]

export type PaperProbeSample = {
  wallTime: number
  physicsTime: number
  deformationTime: number
  /** Frame-local xyz displacement divided by the paper's smaller dimension. */
  displacements: readonly number[]
  windStrength: number
  angularBias: number
  curlAngle: number
  flutterAmplitude: number
  groundContact: number
}

export type PaperProbeSummary = {
  zeroCrossingFrequency: number
  maximumDisplacement: number
  maximumFrameDisplacement: number
}

export type PaperProbeAnalysis = {
  duration: number
  sampleCount: number
  sampleRate: number
  physicsDuration: number
  deformationDuration: number
  firstContactPhysicsTime: number | null
  maximumGroundContact: number
  broadBendFrequency: number
  cornerFlutterFrequency: number
  maximumDisplacement: number
  maximumFrameDisplacement: number
  maximumWindFrameDelta: number
  maximumAngularBiasFrameDelta: number
  maximumCurlFrameDelta: number
  maximumFlutterAmplitudeFrameDelta: number
  probes: Record<PaperProbeId, PaperProbeSummary>
}

const PROBE_COMPONENTS = 3
const CORNER_COUNT = 4

const vectorLength = (values: readonly number[], offset: number) =>
  Math.hypot(values[offset], values[offset + 1], values[offset + 2])

const estimateZeroCrossingFrequency = (
  samples: readonly PaperProbeSample[],
  probeIndex: number,
  highPassTimeConstant = 0,
) => {
  if (samples.length < 2) return 0
  const offset = probeIndex * PROBE_COMPONENTS + 2
  const values: number[] = []
  let trend = samples[0].displacements[offset]

  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index].displacements[offset]
    if (index > 0 && highPassTimeConstant > 0) {
      const delta = Math.max(samples[index].wallTime - samples[index - 1].wallTime, 0)
      const blend = 1 - Math.exp(-delta / highPassTimeConstant)
      trend += (value - trend) * blend
    }
    values.push(highPassTimeConstant > 0 ? value - trend : value)
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  let peak = 0
  for (const value of values) peak = Math.max(peak, Math.abs(value - mean))
  const threshold = Math.max(peak * 0.1, 0.00002)
  let sign = 0
  let crossings = 0
  for (const value of values) {
    const centered = value - mean
    const nextSign = centered > threshold ? 1 : centered < -threshold ? -1 : 0
    if (nextSign === 0) continue
    if (sign !== 0 && nextSign !== sign) crossings += 1
    sign = nextSign
  }

  const duration = samples.at(-1)!.wallTime - samples[0].wallTime
  return duration > 0 ? crossings / (duration * 2) : 0
}

const estimateCornerFlutterFrequency = (
  samples: readonly PaperProbeSample[],
  cornerIndex: number,
) => {
  const adjacentEdges = [
    [4, 7],
    [4, 5],
    [6, 7],
    [6, 5],
  ] as const
  const cornerOffset = cornerIndex * PROBE_COMPONENTS + 2
  const edgeAOffset = adjacentEdges[cornerIndex][0] * PROBE_COMPONENTS + 2
  const edgeBOffset = adjacentEdges[cornerIndex][1] * PROBE_COMPONENTS + 2
  const isolatedSamples = samples.map((sample) => {
    const displacement = Array.from(sample.displacements)
    displacement[cornerOffset] =
      sample.displacements[cornerOffset] -
      (sample.displacements[edgeAOffset] + sample.displacements[edgeBOffset]) * 0.5
    return { ...sample, displacements: displacement }
  })
  return estimateZeroCrossingFrequency(isolatedSamples, cornerIndex, 0.16)
}

const summarizeProbe = (
  samples: readonly PaperProbeSample[],
  probeIndex: number,
): PaperProbeSummary => {
  const offset = probeIndex * PROBE_COMPONENTS
  let maximumDisplacement = 0
  let maximumFrameDisplacement = 0

  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index].displacements
    maximumDisplacement = Math.max(maximumDisplacement, vectorLength(current, offset))
    if (index === 0) continue
    const previous = samples[index - 1].displacements
    maximumFrameDisplacement = Math.max(
      maximumFrameDisplacement,
      Math.hypot(
        current[offset] - previous[offset],
        current[offset + 1] - previous[offset + 1],
        current[offset + 2] - previous[offset + 2],
      ),
    )
  }

  return {
    zeroCrossingFrequency: estimateZeroCrossingFrequency(samples, probeIndex),
    maximumDisplacement,
    maximumFrameDisplacement,
  }
}

export class PaperProbeRecorder {
  private readonly samples: PaperProbeSample[] = []
  private completedAnalysis: PaperProbeAnalysis | null = null

  reset() {
    this.samples.length = 0
    this.completedAnalysis = null
  }

  record(sample: PaperProbeSample) {
    if (this.completedAnalysis) return
    this.samples.push(sample)
  }

  getProgress() {
    if (this.samples.length < 2) return 0
    return this.samples.at(-1)!.wallTime - this.samples[0].wallTime
  }

  analyze(): PaperProbeAnalysis | null {
    if (this.completedAnalysis) return this.completedAnalysis
    if (this.samples.length < 2) return null
    const last = this.samples.at(-1)!
    const windowStart = last.wallTime - 7
    const samples = this.samples.filter((sample) => sample.wallTime >= windowStart)
    const duration = samples.at(-1)!.wallTime - samples[0].wallTime
    if (duration < 6.95) return null

    const summaries = {} as Record<PaperProbeId, PaperProbeSummary>
    let maximumDisplacement = 0
    let maximumFrameDisplacement = 0
    for (let index = 0; index < PAPER_PROBE_IDS.length; index += 1) {
      const summary = summarizeProbe(samples, index)
      summaries[PAPER_PROBE_IDS[index]] = summary
      maximumDisplacement = Math.max(maximumDisplacement, summary.maximumDisplacement)
      maximumFrameDisplacement = Math.max(
        maximumFrameDisplacement,
        summary.maximumFrameDisplacement,
      )
    }

    const cornerFrequencies = Array.from({ length: CORNER_COUNT }, (_, index) =>
      estimateCornerFlutterFrequency(samples, index),
    ).filter((frequency) => frequency > 0)

    let maximumWindFrameDelta = 0
    let maximumAngularBiasFrameDelta = 0
    let maximumCurlFrameDelta = 0
    let maximumFlutterAmplitudeFrameDelta = 0
    for (let index = 1; index < samples.length; index += 1) {
      const current = samples[index]
      const previous = samples[index - 1]
      maximumWindFrameDelta = Math.max(
        maximumWindFrameDelta,
        Math.abs(current.windStrength - previous.windStrength),
      )
      maximumAngularBiasFrameDelta = Math.max(
        maximumAngularBiasFrameDelta,
        Math.abs(current.angularBias - previous.angularBias),
      )
      maximumCurlFrameDelta = Math.max(
        maximumCurlFrameDelta,
        Math.abs(current.curlAngle - previous.curlAngle),
      )
      maximumFlutterAmplitudeFrameDelta = Math.max(
        maximumFlutterAmplitudeFrameDelta,
        Math.abs(current.flutterAmplitude - previous.flutterAmplitude),
      )
    }

    this.completedAnalysis = {
      duration,
      sampleCount: samples.length,
      sampleRate: (samples.length - 1) / duration,
      physicsDuration: samples.at(-1)!.physicsTime - samples[0].physicsTime,
      deformationDuration:
        samples.at(-1)!.deformationTime - samples[0].deformationTime,
      firstContactPhysicsTime:
        samples.find((sample) => sample.groundContact > 0.01)?.physicsTime ?? null,
      maximumGroundContact: samples.reduce(
        (maximum, sample) => Math.max(maximum, sample.groundContact),
        0,
      ),
      broadBendFrequency: estimateZeroCrossingFrequency(samples, 8, 1.8),
      cornerFlutterFrequency:
        cornerFrequencies.length > 0
          ? cornerFrequencies.reduce((sum, frequency) => sum + frequency, 0) /
            cornerFrequencies.length
          : 0,
      maximumDisplacement,
      maximumFrameDisplacement,
      maximumWindFrameDelta,
      maximumAngularBiasFrameDelta,
      maximumCurlFrameDelta,
      maximumFlutterAmplitudeFrameDelta,
      probes: summaries,
    }
    return this.completedAnalysis
  }
}

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

export type SceneSoundscapeHandle = {
  playBookOpening: () => void
  playWordReveal: (durationMs: number) => void
  resetPageInteraction: () => void
  stopWordReveal: () => void
  updatePageFlutter: (motion: PageFlutterSoundMotion) => void
}

export type PageFlutterSoundMotion = {
  active: boolean
  afterGroundContact: boolean
  horizontalPosition: number
  horizontalSpeed: number
  lift: number
}

type ClipSegment = {
  offset: number
  duration: number
}

type SpatialTrack = {
  filter: BiquadFilterNode
  panner: StereoPannerNode
}

type SpatialMix = {
  context: AudioContext
  wind: SpatialTrack
  birdBed: SpatialTrack
  birdAccent: SpatialTrack
  cicada: SpatialTrack
  page: SpatialTrack
  writing: SpatialTrack
  flutter: SpatialTrack
}

type SoundEngine = {
  wind: HTMLAudioElement
  birdBed: HTMLAudioElement
  birdAccent: HTMLAudioElement
  cicada: HTMLAudioElement
  page: HTMLAudioElement
  writing: HTMLAudioElement
  flutter: HTMLAudioElement
  spatial: SpatialMix | null
  animationFrame: number | null
  startedAt: number
  ambientFadeStartedAt: number
  nextBirdAccentAt: number
  birdAccentStartedAt: number | null
  birdAccentEndsAt: number | null
  nextCicadaAt: number
  cicadaStartedAt: number | null
  cicadaEndsAt: number | null
  cicadaIndex: number
  writingStartedAt: number | null
  writingEndsAt: number | null
  flutterVolume: number
  flutterTargetVolume: number
  flutterPlaybackRate: number
  flutterTargetPlaybackRate: number
  flutterPan: number
  flutterTargetPan: number
  nextWindGustAt: number
  windGustStartedAt: number | null
  windGustEndsAt: number | null
  windGustStrength: number
  pageWindActive: boolean
  pageWindSpeed: number
  pageWindSmoothedSpeed: number
  windDrive: number
  startLoop: () => void
}

const AUDIO_ROOT = '/assets/scenes/under-the-almond-trees/audio'
const AUDIO_FILES = {
  wind: `${AUDIO_ROOT}/soft-foliage-wind-cc0.mp3`,
  birds: `${AUDIO_ROOT}/residential-birds-cc0.mp3`,
  birdAccents: `${AUDIO_ROOT}/residential-bird-accents-cleaned-cc0.mp3`,
  cicada: `${AUDIO_ROOT}/cicada-calls-user.mp3`,
  page: `${AUDIO_ROOT}/page-turn-cc0.mp3`,
  writing: `${AUDIO_ROOT}/fountain-pen-writing-cc0.mp3`,
  flutter: `${AUDIO_ROOT}/page-flutter-wind-cc0.mp3`,
} as const

// Offsets are selected from visible call clusters in the edited recordings.
// The cicada source retains its internal pulses but never runs continuously.
const CICADA_SEGMENTS: readonly ClipSegment[] = [
  { offset: 0.05, duration: 2.9 },
  { offset: 3.94, duration: 3 },
  { offset: 8.84, duration: 3.2 },
  { offset: 13.75, duration: 3.1 },
  { offset: 18.76, duration: 3 },
  { offset: 23.56, duration: 3.3 },
]

const BIRD_ACCENT_SEGMENTS: readonly ClipSegment[] = [
  { offset: 7.2, duration: 2.2 },
  { offset: 16.1, duration: 2.4 },
  { offset: 31.2, duration: 2.1 },
  { offset: 38.2, duration: 2.6 },
  { offset: 46.5, duration: 2.2 },
  { offset: 62, duration: 2.5 },
]

const randomBetween = (minimum: number, maximum: number) =>
  minimum + Math.random() * (maximum - minimum)

const smoothstep01 = (value: number) => {
  const progress = Math.min(1, Math.max(0, value))
  return progress * progress * (3 - 2 * progress)
}

const segmentEnvelope = (
  now: number,
  startedAt: number,
  endsAt: number,
  attackMs: number,
  releaseMs: number,
) =>
  Math.min(
    smoothstep01((now - startedAt) / attackMs),
    smoothstep01((endsAt - now) / releaseMs),
  )

const makeAudio = (source: string, loop = false) => {
  const audio = new Audio(source)
  audio.preload = 'auto'
  audio.loop = loop
  return audio
}

const connectSpatialTrack = (
  context: AudioContext,
  audio: HTMLAudioElement,
  pan: number,
  lowpassFrequency: number,
): SpatialTrack => {
  const source = context.createMediaElementSource(audio)
  const filter = context.createBiquadFilter()
  const panner = context.createStereoPanner()
  filter.type = 'lowpass'
  filter.frequency.value = lowpassFrequency
  filter.Q.value = 0.4
  panner.pan.value = pan
  source.connect(filter).connect(panner).connect(context.destination)
  return { filter, panner }
}

const makeSpatialMix = (audio: {
  wind: HTMLAudioElement
  birdBed: HTMLAudioElement
  birdAccent: HTMLAudioElement
  cicada: HTMLAudioElement
  page: HTMLAudioElement
  writing: HTMLAudioElement
  flutter: HTMLAudioElement
}): SpatialMix | null => {
  if (!window.AudioContext) return null

  try {
    const context = new AudioContext()
    const spatial = {
      context,
      wind: connectSpatialTrack(context, audio.wind, 0, 9000),
      birdBed: connectSpatialTrack(context, audio.birdBed, 0.08, 3800),
      birdAccent: connectSpatialTrack(context, audio.birdAccent, 0.34, 16000),
      cicada: connectSpatialTrack(context, audio.cicada, -0.12, 4800),
      page: connectSpatialTrack(context, audio.page, 0, 16000),
      writing: connectSpatialTrack(context, audio.writing, 0, 9000),
      flutter: connectSpatialTrack(context, audio.flutter, 0, 12000),
    }
    void context.resume()
    return spatial
  } catch {
    return null
  }
}

const play = (audio: HTMLAudioElement) => {
  void audio.play().catch(() => {
    // Automated clicks can be rejected by autoplay policy. The visible sound
    // control supplies the required user gesture in ordinary use.
  })
}

const startSegment = (
  audio: HTMLAudioElement,
  segment: ClipSegment,
  now: number,
) => {
  audio.currentTime = segment.offset
  audio.volume = 0
  play(audio)
  return now + segment.duration * 1000
}

const makeEngine = () => {
  const wind = makeAudio(AUDIO_FILES.wind, true)
  const birdBed = makeAudio(AUDIO_FILES.birds, true)
  const birdAccent = makeAudio(AUDIO_FILES.birdAccents, true)
  const cicada = makeAudio(AUDIO_FILES.cicada, true)
  const page = makeAudio(AUDIO_FILES.page)
  const writing = makeAudio(AUDIO_FILES.writing, true)
  const flutter = makeAudio(AUDIO_FILES.flutter, true)
  const startedAt = performance.now()

  wind.volume = 0
  wind.preservesPitch = false
  wind.playbackRate = 0.75
  birdBed.volume = 0
  birdAccent.volume = 0
  cicada.volume = 0
  page.volume = 0.7
  writing.volume = 0
  flutter.volume = 0
  flutter.preservesPitch = false
  flutter.playbackRate = 0.7
  const spatial = makeSpatialMix({
    wind,
    birdBed,
    birdAccent,
    cicada,
    page,
    writing,
    flutter,
  })

  const engine: SoundEngine = {
    wind,
    birdBed,
    birdAccent,
    cicada,
    page,
    writing,
    flutter,
    spatial,
    animationFrame: null,
    startedAt,
    ambientFadeStartedAt: startedAt,
    nextBirdAccentAt: startedAt + randomBetween(8000, 12000),
    birdAccentStartedAt: null,
    birdAccentEndsAt: null,
    nextCicadaAt: startedAt + randomBetween(1800, 3400),
    cicadaStartedAt: null,
    cicadaEndsAt: null,
    cicadaIndex: Math.floor(Math.random() * CICADA_SEGMENTS.length),
    writingStartedAt: null,
    writingEndsAt: null,
    flutterVolume: 0,
    flutterTargetVolume: 0,
    flutterPlaybackRate: 0.7,
    flutterTargetPlaybackRate: 0.7,
    flutterPan: 0,
    flutterTargetPan: 0,
    nextWindGustAt: startedAt + randomBetween(2200, 5200),
    windGustStartedAt: null,
    windGustEndsAt: null,
    windGustStrength: 0,
    pageWindActive: false,
    pageWindSpeed: 0,
    pageWindSmoothedSpeed: 0,
    windDrive: 0,
    startLoop: () => undefined,
  }
  let birdAccentIndex = Math.floor(Math.random() * BIRD_ACCENT_SEGMENTS.length)

  const update = () => {
    if (document.visibilityState !== 'visible') {
      engine.animationFrame = null
      return
    }

    const now = performance.now()
    const elapsed = (now - engine.startedAt) / 1000
    const fadeIn = Math.min(
      1,
      Math.max(0, (now - engine.ambientFadeStartedAt) / 1400),
    )
    if (engine.windGustEndsAt !== null && now >= engine.windGustEndsAt) {
      engine.windGustStartedAt = null
      engine.windGustEndsAt = null
      engine.windGustStrength = 0
      engine.nextWindGustAt = now + randomBetween(3500, 9500)
    } else if (engine.windGustEndsAt === null && now >= engine.nextWindGustAt) {
      const duration = randomBetween(3200, 7200)
      engine.windGustStartedAt = now
      engine.windGustEndsAt = now + duration
      engine.windGustStrength = randomBetween(0.72, 1)
    }

    let windGust = 0
    if (engine.windGustStartedAt !== null && engine.windGustEndsAt !== null) {
      const gustProgress =
        (now - engine.windGustStartedAt) /
        (engine.windGustEndsAt - engine.windGustStartedAt)
      const gustEnvelope = Math.sin(Math.PI * Math.min(1, Math.max(0, gustProgress)))
      const gustTexture =
        0.94 +
        Math.sin(elapsed * 0.81 + 1.7) * 0.035 +
        Math.sin(elapsed * 0.37 + 4.2) * 0.025
      windGust = engine.windGustStrength * gustEnvelope ** 1.18 * gustTexture
    }

    engine.pageWindSmoothedSpeed +=
      (engine.pageWindSpeed - engine.pageWindSmoothedSpeed) * 0.065
    const targetWindDrive = engine.pageWindActive
      ? Math.min(1, Math.max(0, engine.pageWindSmoothedSpeed))
      : windGust
    engine.windDrive +=
      (targetWindDrive - engine.windDrive) *
      (targetWindDrive > engine.windDrive ? 0.028 : 0.02)

    const calmVolumeDrift =
      Math.sin(elapsed * 0.071 + 0.8) * 0.008 +
      Math.sin(elapsed * 0.023 + 3.4) * 0.005
    wind.volume = Math.min(
      1,
      Math.max(0, (0.17 + calmVolumeDrift + engine.windDrive * 0.115) * fadeIn),
    )
    wind.playbackRate = Math.min(
      1,
      Math.max(0.75, 0.75 + engine.windDrive * 0.25),
    )
    if (engine.spatial) {
      const targetWindPan =
        Math.sin(elapsed * 0.055 + 0.4) * 0.18 +
        Math.sin(elapsed * 0.021 + 2.1) * 0.08
      engine.spatial.wind.panner.pan.value +=
        (targetWindPan - engine.spatial.wind.panner.pan.value) * 0.006
    }
    birdBed.volume = 0.23625 * fadeIn

    if (engine.cicadaEndsAt !== null && now >= engine.cicadaEndsAt) {
      cicada.volume = 0
      engine.cicadaStartedAt = null
      engine.cicadaEndsAt = null
      engine.nextCicadaAt = now + randomBetween(7000, 10000)
    } else if (engine.cicadaEndsAt === null && now >= engine.nextCicadaAt) {
      const segment = CICADA_SEGMENTS[engine.cicadaIndex]
      engine.cicadaStartedAt = now
      engine.cicadaEndsAt = startSegment(cicada, segment, now)
      if (engine.spatial) {
        engine.spatial.cicada.panner.pan.value = randomBetween(-0.32, 0.22)
      }
      engine.cicadaIndex = (engine.cicadaIndex + 1) % CICADA_SEGMENTS.length
    }
    if (engine.cicadaStartedAt !== null && engine.cicadaEndsAt !== null) {
      cicada.volume =
        0.3 *
        segmentEnvelope(
          now,
          engine.cicadaStartedAt,
          engine.cicadaEndsAt,
          320,
          520,
        )
    }

    if (engine.birdAccentEndsAt !== null && now >= engine.birdAccentEndsAt) {
      birdAccent.volume = 0
      engine.birdAccentStartedAt = null
      engine.birdAccentEndsAt = null
      engine.nextBirdAccentAt = now + randomBetween(8000, 12000)
    } else if (engine.birdAccentEndsAt === null && now >= engine.nextBirdAccentAt) {
      const segment = BIRD_ACCENT_SEGMENTS[birdAccentIndex]
      engine.birdAccentStartedAt = now
      engine.birdAccentEndsAt = startSegment(birdAccent, segment, now)
      if (engine.spatial) {
        engine.spatial.birdAccent.panner.pan.value =
          Math.random() < 0.78
            ? randomBetween(0.18, 0.52)
            : randomBetween(-0.28, 0.12)
      }
      birdAccentIndex = (birdAccentIndex + 1) % BIRD_ACCENT_SEGMENTS.length
    }
    if (engine.birdAccentStartedAt !== null && engine.birdAccentEndsAt !== null) {
      birdAccent.volume =
        0.54 *
        segmentEnvelope(
          now,
          engine.birdAccentStartedAt,
          engine.birdAccentEndsAt,
          260,
          460,
        )
    }

    if (
      engine.writingStartedAt !== null &&
      engine.writingEndsAt !== null &&
      now < engine.writingEndsAt
    ) {
      const fadeIn = Math.min(1, (now - engine.writingStartedAt) / 180)
      const fadeOut = Math.min(1, (engine.writingEndsAt - now) / 260)
      writing.volume = 0.204 * Math.max(0, Math.min(fadeIn, fadeOut))
    } else {
      writing.volume = 0
      engine.writingStartedAt = null
      engine.writingEndsAt = null
    }

    engine.flutterVolume +=
      (engine.flutterTargetVolume - engine.flutterVolume) *
      (engine.flutterTargetVolume > engine.flutterVolume ? 0.14 : 0.075)
    flutter.volume = Math.max(0, Math.min(1, engine.flutterVolume))
    engine.flutterPlaybackRate +=
      (engine.flutterTargetPlaybackRate - engine.flutterPlaybackRate) * 0.08
    flutter.playbackRate = engine.flutterPlaybackRate
    engine.flutterPan += (engine.flutterTargetPan - engine.flutterPan) * 0.12
    if (engine.spatial) {
      engine.spatial.flutter.panner.pan.value = engine.flutterPan
    }

    engine.animationFrame = window.requestAnimationFrame(update)
  }

  engine.startLoop = () => {
    if (engine.animationFrame === null) {
      engine.animationFrame = window.requestAnimationFrame(update)
    }
  }
  engine.startLoop()
  play(wind)
  play(birdBed)
  play(birdAccent)
  play(cicada)
  play(writing)
  play(flutter)
  return engine
}

const pauseAll = (engine: SoundEngine) => {
  engine.wind.pause()
  engine.birdBed.pause()
  engine.birdAccent.pause()
  engine.cicada.pause()
  engine.page.pause()
  engine.writing.pause()
  engine.flutter.pause()
}

const disposeEngine = (engine: SoundEngine) => {
  if (engine.animationFrame !== null) window.cancelAnimationFrame(engine.animationFrame)
  pauseAll(engine)
  if (engine.spatial) void engine.spatial.context.close()
}

export const SceneSoundscape = forwardRef<SceneSoundscapeHandle, object>(
  function SceneSoundscape(_props, ref) {
    const engineRef = useRef<SoundEngine | null>(null)
    const firstBookClickHandled = useRef(false)
    const [enabled, setEnabled] = useState(false)
    const [spatialEnabled, setSpatialEnabled] = useState(false)

    useImperativeHandle(
      ref,
      () => ({
        playBookOpening: () => {
          if (firstBookClickHandled.current) return
          firstBookClickHandled.current = true
          const page = engineRef.current?.page
          if (!page) return
          page.currentTime = 0
          play(page)
        },
        playWordReveal: (durationMs) => {
          const engine = engineRef.current
          if (!engine) return
          const now = performance.now()
          const alreadyWriting =
            engine.writingEndsAt !== null && now < engine.writingEndsAt
          if (!alreadyWriting) {
            engine.writing.currentTime = 0
            engine.writingStartedAt = now
          }
          engine.writingEndsAt = now + durationMs
          play(engine.writing)
        },
        resetPageInteraction: () => {
          firstBookClickHandled.current = false
          const engine = engineRef.current
          if (!engine) return
          engine.page.pause()
          engine.page.currentTime = 0
          engine.writingStartedAt = null
          engine.writingEndsAt = null
          engine.writing.volume = 0
          engine.flutter.volume = 0
          engine.flutter.currentTime = 0
          engine.flutterVolume = 0
          engine.flutterTargetVolume = 0
          engine.flutterPlaybackRate = 0.7
          engine.flutterTargetPlaybackRate = 0.7
          engine.flutterPan = 0
          engine.flutterTargetPan = 0
          if (engine.spatial) engine.spatial.flutter.panner.pan.value = 0
          engine.pageWindActive = false
          engine.pageWindSpeed = 0
          engine.pageWindSmoothedSpeed = 0
        },
        stopWordReveal: () => {
          const engine = engineRef.current
          if (!engine) return
          if (engine.writingEndsAt !== null) {
            engine.writingEndsAt = Math.min(
              engine.writingEndsAt,
              performance.now() + 260,
            )
          }
        },
        updatePageFlutter: ({
          active,
          afterGroundContact,
          horizontalPosition,
          horizontalSpeed,
          lift,
        }) => {
          const engine = engineRef.current
          if (!engine) return
          engine.pageWindActive = active && afterGroundContact
          engine.pageWindSpeed = engine.pageWindActive ? horizontalSpeed : 0
          engine.flutterTargetPan = active
            ? Math.min(0.6, Math.max(-0.6, horizontalPosition * 0.6))
            : engine.flutterPan
          if (!active) {
            engine.flutterTargetVolume = 0
            engine.flutterTargetPlaybackRate = 0.7
          } else if (!afterGroundContact) {
            engine.flutterTargetVolume = 0.20
            engine.flutterTargetPlaybackRate = 0.7
          } else {
            engine.flutterTargetVolume = Math.min(
              0.5,
              0.075 + horizontalSpeed * 0.16 + lift * 0.265,
            )
            engine.flutterTargetPlaybackRate = 0.5 + horizontalSpeed * 0.5
          }
        },
      }),
      [],
    )

    const toggleSound = useCallback(() => {
      if (engineRef.current) {
        disposeEngine(engineRef.current)
        engineRef.current = null
        setEnabled(false)
        setSpatialEnabled(false)
        return
      }

      engineRef.current = makeEngine()
      setEnabled(true)
      setSpatialEnabled(engineRef.current.spatial !== null)
    }, [])

    useEffect(() => {
      const handleVisibilityChange = () => {
        const engine = engineRef.current
        if (!engine) return
        if (document.visibilityState === 'hidden') {
          pauseAll(engine)
          if (engine.spatial) void engine.spatial.context.suspend()
          return
        }

        const now = performance.now()
        engine.ambientFadeStartedAt = now
        engine.wind.volume = 0
        engine.birdBed.volume = 0
        engine.nextCicadaAt = now + randomBetween(1800, 3400)
        engine.cicadaStartedAt = null
        engine.cicadaEndsAt = null
        engine.cicada.volume = 0
        engine.nextBirdAccentAt = now + randomBetween(8000, 12000)
        engine.birdAccentStartedAt = null
        engine.birdAccentEndsAt = null
        engine.birdAccent.volume = 0
        engine.windGustStartedAt = null
        engine.windGustEndsAt = null
        engine.windGustStrength = 0
        engine.nextWindGustAt = now + randomBetween(2200, 5200)
        if (engine.writingEndsAt !== null && now < engine.writingEndsAt) {
          engine.writingStartedAt = now
        }
        engine.writing.volume = 0
        engine.flutterVolume = 0
        engine.flutter.volume = 0
        if (engine.spatial) void engine.spatial.context.resume()
        play(engine.wind)
        play(engine.birdBed)
        play(engine.birdAccent)
        play(engine.cicada)
        play(engine.writing)
        play(engine.flutter)
        engine.startLoop()
      }

      document.addEventListener('visibilitychange', handleVisibilityChange)
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [])

    useEffect(
      () => () => {
        if (engineRef.current) disposeEngine(engineRef.current)
        engineRef.current = null
      },
      [],
    )

    return (
      <button
        className="sound-toggle"
        type="button"
        aria-label={enabled ? 'Turn scene sound off' : 'Turn scene sound on'}
        aria-pressed={enabled}
        data-spatial-audio={spatialEnabled ? 'active' : 'fallback'}
        onClick={toggleSound}
      >
        sound {enabled ? 'on' : 'off'}
      </button>
    )
  },
)

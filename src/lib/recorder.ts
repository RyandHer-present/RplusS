import { Mp3Encoder } from '@breezystack/lamejs'

/**
 * Voice recording, encoded to MP3.
 *
 * MediaRecorder would be simpler, but it produces WebM/Opus in Chrome and
 * MP4/AAC in Safari — and Safari cannot play WebM at all. Sarah records on
 * Android and Ry listens on an iPhone, so the browser default would leave half
 * the voice notes silently unplayable. MP3 is the one format both agree on.
 *
 * Raw PCM is captured, then encoded on stop.
 */

const BITRATE = 48 // kbps mono: roughly 360 KB per minute
const MP3_FRAME = 1152 // samples per MP3 frame; the encoder expects this size
const PEAK_BUCKETS = 96 // waveform resolution kept for playback

export interface Recording {
  blob: Blob
  durationMs: number
  peaks: number[]
}

export class VoiceRecorder {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private chunks: Float32Array[] = []
  private sampleRate = 48000
  private startedAt = 0

  /** Live levels for the waveform while recording. */
  onLevel: ((level: number) => void) | null = null

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })

    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.context = new AudioCtx()
    // iOS starts contexts suspended until a gesture has run through them.
    if (this.context.state === 'suspended') await this.context.resume()

    this.sampleRate = this.context.sampleRate
    const source = this.context.createMediaStreamSource(this.stream)

    // ScriptProcessorNode is deprecated in favour of AudioWorklet, but it needs
    // no separate module file and is supported everywhere this has to run.
    this.processor = this.context.createScriptProcessor(4096, 1, 1)
    this.chunks = []

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      this.chunks.push(new Float32Array(input))

      if (this.onLevel) {
        let sum = 0
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
        this.onLevel(Math.sqrt(sum / input.length))
      }
    }

    source.connect(this.processor)
    // A muted destination keeps the processor pulling without echoing the mic
    // back out of the speaker.
    const silent = this.context.createGain()
    silent.gain.value = 0
    this.processor.connect(silent)
    silent.connect(this.context.destination)

    this.startedAt = performance.now()
  }

  /** Stops capture and encodes what was recorded. */
  async stop(): Promise<Recording> {
    const durationMs = Math.round(performance.now() - this.startedAt)

    this.processor?.disconnect()
    this.processor = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    await this.context?.close()
    this.context = null

    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const samples = new Float32Array(total)
    let offset = 0
    for (const chunk of this.chunks) {
      samples.set(chunk, offset)
      offset += chunk.length
    }
    this.chunks = []

    return {
      blob: encodeMp3(samples, this.sampleRate),
      durationMs,
      peaks: buildPeaks(samples),
    }
  }

  cancel() {
    this.processor?.disconnect()
    this.processor = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    void this.context?.close()
    this.context = null
    this.chunks = []
  }
}

function encodeMp3(samples: Float32Array, sampleRate: number): Blob {
  const encoder = new Mp3Encoder(1, sampleRate, BITRATE)
  const output: Uint8Array[] = []

  // Float -1..1 to signed 16-bit, which is what the encoder takes.
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }

  for (let i = 0; i < pcm.length; i += MP3_FRAME) {
    const frame = encoder.encodeBuffer(pcm.subarray(i, i + MP3_FRAME))
    if (frame.length) output.push(frame)
  }
  const tail = encoder.flush()
  if (tail.length) output.push(tail)

  return new Blob(output as BlobPart[], { type: 'audio/mpeg' })
}

/** Reduces the whole recording to a fixed number of levels for the waveform. */
function buildPeaks(samples: Float32Array, buckets = PEAK_BUCKETS): number[] {
  if (!samples.length) return new Array(buckets).fill(0)

  const size = Math.floor(samples.length / buckets) || 1
  const peaks: number[] = []

  for (let b = 0; b < buckets; b++) {
    let sum = 0
    const start = b * size
    const end = Math.min(start + size, samples.length)
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    peaks.push(Math.sqrt(sum / Math.max(1, end - start)))
  }

  // Normalise so a quiet recording still draws a readable shape.
  const loudest = Math.max(...peaks, 0.01)
  return peaks.map((p) => Math.min(1, p / loudest))
}

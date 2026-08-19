/**
 * Tiny synthesised UI sounds.
 *
 * Generated with the Web Audio API rather than shipped as files: each one is a
 * few lines of maths, costs no download, and stays crisp at any volume. Muting
 * is remembered per device.
 */

const MUTE_KEY = 'rpluss.muted'

let context: AudioContext | null = null
let muted = localStorage.getItem(MUTE_KEY) === 'true'

export const isMuted = () => muted

export function setMuted(value: boolean) {
  muted = value
  localStorage.setItem(MUTE_KEY, String(value))
}

function ctx(): AudioContext | null {
  if (muted) return null
  if (!context) {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    context = new AudioCtx()
  }
  // iOS suspends the context until a gesture runs through it.
  if (context.state === 'suspended') void context.resume()
  return context
}

interface Blip {
  freq: number
  duration: number
  type?: OscillatorType
  gain?: number
  /** Slide to this frequency over the note, for a rising or falling feel. */
  to?: number
}

function play({ freq, duration, type = 'sine', gain = 0.05, to }: Blip) {
  const audio = ctx()
  if (!audio) return

  const osc = audio.createOscillator()
  const amp = audio.createGain()
  const now = audio.currentTime

  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, now + duration)

  // A quick attack and exponential decay keeps it a tick rather than a beep.
  amp.gain.setValueAtTime(0, now)
  amp.gain.linearRampToValueAtTime(gain, now + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  osc.connect(amp).connect(audio.destination)
  osc.start(now)
  osc.stop(now + duration + 0.02)
}

export const sfx = {
  /** Keypad tap. Pitch rises slightly with each digit so entry feels like progress. */
  key: (index = 0) => play({ freq: 620 + index * 55, duration: 0.07, type: 'triangle', gain: 0.045 }),
  back: () => play({ freq: 420, to: 300, duration: 0.09, type: 'triangle', gain: 0.04 }),
  unlock: () => {
    play({ freq: 660, duration: 0.12, type: 'sine', gain: 0.05 })
    window.setTimeout(() => play({ freq: 990, duration: 0.18, type: 'sine', gain: 0.045 }), 90)
  },
  reject: () => play({ freq: 220, to: 150, duration: 0.22, type: 'sawtooth', gain: 0.035 }),
  send: () => play({ freq: 880, to: 1180, duration: 0.09, type: 'sine', gain: 0.035 }),
  tab: () => play({ freq: 520, duration: 0.05, type: 'sine', gain: 0.03 }),
}

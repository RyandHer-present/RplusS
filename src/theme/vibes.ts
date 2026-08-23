/*
 * Vibes.
 *
 * A theme belongs to a person and lives on their device. A vibe belongs to the
 * pair: setting one recolours the app for both of you at once, and the other
 * person watches it change under them. That is the whole appeal, so a vibe
 * outranks a personal theme while it is set and hands control back when it is
 * cleared.
 *
 * Each one goes further than a theme does. Beyond the palette and the three
 * colours fed to the WebGL background, a vibe names a `wash` — a pair of
 * coloured lights laid over the whole app — and a `mood` class that switches
 * on the heavier effects in vibes.css. The point is that they should not look
 * like the same screen with the hue nudged.
 */

export type VibeId =
  | 'neon'
  | 'goldenhour'
  | 'deepsea'
  | 'cherry'
  | 'forest'
  | 'lavender'
  | 'ember'
  | 'frost'

export interface Vibe {
  id: VibeId
  name: string
  /** One line, shown under the name in the picker. */
  blurb: string
  tokens: Record<string, string>
  /** Three accents for the background shader, as 0..1 RGB. */
  shader: [number[], number[], number[]]
  /** Two colours for the light laid over everything. */
  wash: [string, string]
}

export const VIBES: Record<VibeId, Vibe> = {
  neon: {
    id: 'neon',
    name: 'Neon',
    blurb: 'Loud, electric, three in the morning',
    tokens: {
      '--bg': '#04030a',
      '--surface': '#0d0a1d',
      '--surface-2': '#161029',
      '--border': '#2c1f52',
      '--text': '#f4f0ff',
      '--muted': '#9b8ec7',
      '--a1': '#00f0ff',
      '--a2': '#ff2bd6',
      '--a3': '#7b5cff',
    },
    shader: [[0.0, 0.94, 1.0], [1.0, 0.17, 0.84], [0.48, 0.36, 1.0]],
    wash: ['#00f0ff', '#ff2bd6'],
  },
  goldenhour: {
    id: 'goldenhour',
    name: 'Golden hour',
    blurb: 'Late sun, warm and slow',
    tokens: {
      '--bg': '#0e0704',
      '--surface': '#1d1109',
      '--surface-2': '#2b1a0e',
      '--border': '#4a2d17',
      '--text': '#fff3e6',
      '--muted': '#c09b7a',
      '--a1': '#ffb347',
      '--a2': '#ff7e5f',
      '--a3': '#ffd76e',
    },
    shader: [[1.0, 0.7, 0.28], [1.0, 0.49, 0.37], [1.0, 0.84, 0.43]],
    wash: ['#ffb347', '#ff5f6d'],
  },
  deepsea: {
    id: 'deepsea',
    name: 'Deep sea',
    blurb: 'Cold, quiet, a long way down',
    tokens: {
      '--bg': '#02080f',
      '--surface': '#07141f',
      '--surface-2': '#0c1e2e',
      '--border': '#153347',
      '--text': '#e4f4ff',
      '--muted': '#6f96ad',
      '--a1': '#12b8c9',
      '--a2': '#2b6fff',
      '--a3': '#00e0b0',
    },
    shader: [[0.07, 0.72, 0.79], [0.17, 0.44, 1.0], [0.0, 0.88, 0.69]],
    wash: ['#12b8c9', '#1b3fbf'],
  },
  cherry: {
    id: 'cherry',
    name: 'Cherry',
    blurb: 'Sweet and a bit much',
    tokens: {
      '--bg': '#0d0308',
      '--surface': '#1d0813',
      '--surface-2': '#2c0d1d',
      '--border': '#4d1733',
      '--text': '#ffeef4',
      '--muted': '#c8899e',
      '--a1': '#ff4d7d',
      '--a2': '#ff9ec7',
      '--a3': '#ff2e63',
    },
    shader: [[1.0, 0.3, 0.49], [1.0, 0.62, 0.78], [1.0, 0.18, 0.39]],
    wash: ['#ff4d7d', '#ff9ec7'],
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    blurb: 'Moss, pine, light through leaves',
    tokens: {
      '--bg': '#040a06',
      '--surface': '#0b1710',
      '--surface-2': '#122318',
      '--border': '#1f3d2a',
      '--text': '#ecf7ee',
      '--muted': '#84a68f',
      '--a1': '#4ade80',
      '--a2': '#a3e635',
      '--a3': '#14b8a6',
    },
    shader: [[0.29, 0.87, 0.5], [0.64, 0.9, 0.21], [0.08, 0.72, 0.65]],
    wash: ['#4ade80', '#0f766e'],
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender',
    blurb: 'Soft, hazy, half asleep',
    tokens: {
      '--bg': '#0a0812',
      '--surface': '#151024',
      '--surface-2': '#1f1833',
      '--border': '#332a52',
      '--text': '#f3eeff',
      '--muted': '#a396c4',
      '--a1': '#c4a7ff',
      '--a2': '#e0c3fc',
      '--a3': '#8ec5ff',
    },
    shader: [[0.77, 0.65, 1.0], [0.88, 0.76, 0.99], [0.56, 0.77, 1.0]],
    wash: ['#c4a7ff', '#8ec5ff'],
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    blurb: 'Banked coals, nearly out',
    tokens: {
      '--bg': '#0b0503',
      '--surface': '#180b06',
      '--surface-2': '#26120a',
      '--border': '#432015',
      '--text': '#ffeee6',
      '--muted': '#b3877a',
      '--a1': '#ff5722',
      '--a2': '#ff8a3d',
      '--a3': '#c2410c',
    },
    shader: [[1.0, 0.34, 0.13], [1.0, 0.54, 0.24], [0.76, 0.26, 0.05]],
    wash: ['#ff5722', '#7c2d12'],
  },
  frost: {
    id: 'frost',
    name: 'Frost',
    blurb: 'Clean, cold, very bright',
    tokens: {
      '--bg': '#05080e',
      '--surface': '#0e141f',
      '--surface-2': '#161f2e',
      '--border': '#243347',
      '--text': '#f0f7ff',
      '--muted': '#8ba3bd',
      '--a1': '#a5d8ff',
      '--a2': '#e8f4ff',
      '--a3': '#67b7ff',
    },
    shader: [[0.65, 0.85, 1.0], [0.91, 0.96, 1.0], [0.4, 0.72, 1.0]],
    wash: ['#a5d8ff', '#4c7fbf'],
  },
}

export const VIBE_LIST: Vibe[] = Object.values(VIBES)

export function isVibeId(value: unknown): value is VibeId {
  return typeof value === 'string' && value in VIBES
}

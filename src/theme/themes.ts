export type ThemeId = 'aurora' | 'sunset' | 'midnight' | 'bubblegum'

export interface Theme {
  id: ThemeId
  name: string
  /** CSS custom properties applied to :root */
  tokens: Record<string, string>
  /** Three accent colours fed to the WebGL background, as 0..1 RGB */
  shader: [number[], number[], number[]]
}

export const THEMES: Record<ThemeId, Theme> = {
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    tokens: {
      '--bg': '#07070c',
      '--surface': '#11111c',
      '--surface-2': '#1a1a2b',
      '--border': '#262640',
      '--text': '#f2f2f7',
      '--muted': '#8e8ea6',
      '--a1': '#7b5cff',
      '--a2': '#21d4fd',
      '--a3': '#ff5cf0',
    },
    shader: [[0.48, 0.36, 1.0], [0.13, 0.83, 0.99], [1.0, 0.36, 0.94]],
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    tokens: {
      '--bg': '#0d0509',
      '--surface': '#1c0c14',
      '--surface-2': '#2a1220',
      '--border': '#431d2f',
      '--text': '#fdf3ee',
      '--muted': '#b08a92',
      '--a1': '#ff7a45',
      '--a2': '#ffc93c',
      '--a3': '#ff4d8d',
    },
    shader: [[1.0, 0.48, 0.27], [1.0, 0.79, 0.24], [1.0, 0.3, 0.55]],
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    tokens: {
      '--bg': '#05070d',
      '--surface': '#0d1220',
      '--surface-2': '#141c30',
      '--border': '#1f2a45',
      '--text': '#e8eefc',
      '--muted': '#7c8aa8',
      '--a1': '#3d7dff',
      '--a2': '#2ee6c5',
      '--a3': '#8f6bff',
    },
    shader: [[0.24, 0.49, 1.0], [0.18, 0.9, 0.77], [0.56, 0.42, 1.0]],
  },
  bubblegum: {
    id: 'bubblegum',
    name: 'Bubblegum',
    tokens: {
      '--bg': '#0b0610',
      '--surface': '#1a0d22',
      '--surface-2': '#271234',
      '--border': '#3d1d4f',
      '--text': '#fdeeff',
      '--muted': '#a583b5',
      '--a1': '#ff4fa3',
      '--a2': '#57d9ff',
      '--a3': '#9dff5c',
    },
    shader: [[1.0, 0.31, 0.64], [0.34, 0.85, 1.0], [0.62, 1.0, 0.36]],
  },
}

export const THEME_LIST = Object.values(THEMES)
export const DEFAULT_THEME: ThemeId = 'aurora'

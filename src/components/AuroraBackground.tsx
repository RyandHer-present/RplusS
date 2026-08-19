import { useEffect, useRef } from 'react'
import { Renderer, Triangle, Program, Mesh, Color } from 'ogl'
import { THEMES } from '../theme/themes'
import { useTheme } from '../theme/useTheme'

const VERT = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2  uRes;
  uniform vec3  uC1;
  uniform vec3  uC2;
  uniform vec3  uC3;
  uniform vec3  uBg;
  uniform float uIntensity;
  varying vec2  vUv;

  // Cheap value noise. Deliberately not simplex — this runs every frame on a
  // phone GPU and the visual difference is invisible once it is this blurred.
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    // Correct for aspect so the bands do not stretch on landscape/desktop.
    vec2 p = uv;
    p.x *= uRes.x / uRes.y;

    float t = uTime * 0.06;

    // Domain warp: noise fed back into itself is what gives the flowing,
    // liquid look rather than a static blob.
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3 - t)));
    vec2 r = vec2(fbm(p + 2.0 * q + vec2(1.7, 9.2) + 0.4 * t),
                  fbm(p + 2.0 * q + vec2(8.3, 2.8) - 0.3 * t));
    float f = fbm(p + 2.5 * r);

    float m1 = smoothstep(0.05, 0.75, f + 0.25 * r.x);
    float m2 = smoothstep(0.15, 0.85, q.y + 0.35 * f);
    float m3 = smoothstep(0.10, 0.80, r.y - 0.20 * q.x);

    vec3 col = uBg;
    col = mix(col, uC1, m1 * 0.75);
    col = mix(col, uC2, m2 * 0.55);
    col = mix(col, uC3, m3 * 0.45);
    col *= uIntensity;

    // Fade toward the bottom so UI text sitting over it always stays readable.
    col = mix(col, uBg, smoothstep(0.35, 1.0, uv.y) * 0.55);

    // Dither. Without this, dark gradients band badly on OLED phone screens.
    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * 0.015;

    gl_FragColor = vec4(col, 1.0);
  }
`

interface Props {
  /** Dial the whole effect down behind busy UI. */
  intensity?: number
  className?: string
}

export function AuroraBackground({ intensity = 1, className }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const themeId = useTheme((s) => s.themeId)

  useEffect(() => {
    const el = host.current
    if (!el) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // DPR is capped at 1.5: retina phones would otherwise render 3x the pixels
    // for an effect this soft, which is where the framerate actually goes.
    const renderer = new Renderer({
      alpha: false,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    })
    const gl = renderer.gl
    const theme = THEMES[themeId]
    const bg = new Color(theme.tokens['--bg'])
    gl.clearColor(bg.r, bg.g, bg.b, 1)
    el.appendChild(gl.canvas)
    gl.canvas.style.cssText = 'display:block;width:100%;height:100%;'

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: [1, 1] },
        uC1: { value: theme.shader[0] },
        uC2: { value: theme.shader[1] },
        uC3: { value: theme.shader[2] },
        uBg: { value: [bg.r, bg.g, bg.b] },
        uIntensity: { value: intensity },
      },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el
      renderer.setSize(w, h)
      program.uniforms.uRes.value = [w, h]
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let raf = 0
    let running = true
    let last = performance.now()
    let elapsed = 0

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      elapsed += dt
      program.uniforms.uTime.value = elapsed
      renderer.render({ scene: mesh })
    }

    if (reduced) {
      // Respect the OS setting: render one frame, then stop entirely.
      program.uniforms.uTime.value = 12
      renderer.render({ scene: mesh })
    } else {
      raf = requestAnimationFrame(frame)
    }

    // Backgrounded tabs must not burn battery redrawing a shader nobody sees.
    const onVisibility = () => {
      if (reduced) return
      if (document.hidden && running) {
        cancelAnimationFrame(raf)
        running = false
      } else if (!document.hidden && !running) {
        running = true
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      ro.disconnect()
      gl.canvas.remove()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [themeId, intensity])

  return <div ref={host} className={className} aria-hidden="true" />
}

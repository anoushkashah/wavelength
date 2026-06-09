'use client'

import { useEffect, useRef, useState } from 'react'

// ── Types (unchanged for external compatibility) ──────────────────────────────

export interface VisualWorld {
  colorPalette: string[]
  motionStyle: string
  intensity: number
  atmosphere: string
  shapeLanguage: string
  backgroundType?: 'dark' | 'light'
}

export interface AudioFeatures {
  energy: number
  valence: number
  tempo: number       // raw BPM (60–200)
  danceability: number
  acousticness: number
  loudness: number    // normalised 0–1
}

export interface UserMood {
  query: string
  mood: string
  arc: string
}

export interface VisualizerProps {
  visualWorld: VisualWorld
  audioFeatures: AudioFeatures
  userMood: UserMood
  isBreathing?: boolean
  opacity?: number
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const defaultVisualWorld: VisualWorld = {
  colorPalette: ['#F5F0E8', '#F0EBE0', '#EDE8DC', '#E8E3D8', '#E3DED3'],
  motionStyle: 'ethereal',
  intensity: 0.0,
  atmosphere: 'void',
  shapeLanguage: 'organic',
  backgroundType: 'light' as const,
}

export const defaultAudioFeatures: AudioFeatures = {
  energy: 0.0,
  valence: 0.5,
  tempo: 80,
  danceability: 0.3,
  acousticness: 0.9,
  loudness: 0.1,
}

// ── Mode mapping ──────────────────────────────────────────────────────────────

function toShaderMode(motionStyle: string): number {
  const s = (motionStyle ?? '').toLowerCase()
  if (s === 'ethereal' || s === 'fluid') return 0
  return 1
}

// ── Shaders ───────────────────────────────────────────────────────────────────

const vertSrc = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const fragSrc = `
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform float u_energy;
uniform float u_mode;
uniform float u_breathing;

// ── Fixed 7-color palette ──────────────────────────────────────────
const vec3 PC1 = vec3(1.0,  0.08, 0.58);   // hot pink
const vec3 PC2 = vec3(1.0,  0.35, 0.0 );   // deep orange
const vec3 PC3 = vec3(0.72, 0.55, 0.98);   // lavender
const vec3 PC4 = vec3(0.85, 0.72, 0.82);   // light mauve
const vec3 PC5 = vec3(0.4,  0.47, 0.15);   // olive green
const vec3 PC6 = vec3(1.0,  0.72, 0.1 );   // yellow-orange
const vec3 PC7 = vec3(0.0,  0.72, 0.72);   // teal

vec3 pastelise(vec3 color) {
  return mix(color, vec3(1.0), 0.45);
}

vec3 pal(float t) {
  t = mod(t, 7.0);
  float f = smoothstep(0.0, 1.0, fract(t));
  int i = int(floor(t));
  vec3 raw;
  if (i == 0) raw = mix(PC1, PC2, f);
  else if (i == 1) raw = mix(PC2, PC3, f);
  else if (i == 2) raw = mix(PC3, PC4, f);
  else if (i == 3) raw = mix(PC4, PC5, f);
  else if (i == 4) raw = mix(PC5, PC6, f);
  else if (i == 5) raw = mix(PC6, PC7, f);
  else              raw = mix(PC7, PC1, f);
  return pastelise(raw);
}

// ── Mode 0: Ethereal ───────────────────────────────────────────────
// 3 large radial blobs drifting slowly, overlapping additively.
// Each blob cycles through palette at a different offset so
// multiple colors are always visible simultaneously.
vec3 mode_ethereal(vec2 st) {
  vec3 bg = vec3(0.031, 0.031, 0.031);
  float T = u_time;

  // Blob radii breathe between 0.4 and 0.65 with ~4 s period (2π/1.5708 ≈ 4 s)
  float r1 = 0.525 + sin(T * 1.5708)         * 0.125;
  float r2 = 0.500 + sin(T * 1.5708 + 2.094) * 0.125;
  float r3 = 0.480 + sin(T * 1.5708 + 4.189) * 0.125;

  vec2 p1 = vec2(sin(T * 0.12) * 0.35,  cos(T * 0.09) * 0.28);
  vec2 p2 = vec2(cos(T * 0.10) * 0.30,  sin(T * 0.13) * 0.32);
  vec2 p3 = vec2(sin(T * 0.08) * 0.25 + cos(T * 0.14) * 0.12,
                 cos(T * 0.11) * 0.35);

  // Soft exponential falloff — no defined edge
  float b1 = exp(-length(st - p1) / r1);
  float b2 = exp(-length(st - p2) / r2);
  float b3 = exp(-length(st - p3) / r3);

  // Each blob at a different point in the 7-color cycle
  vec3 col1 = pal(T * 0.1);
  vec3 col2 = pal(T * 0.1 + 2.333);
  vec3 col3 = pal(T * 0.1 + 4.667);

  vec3 color = bg;
  color += col1 * b1 * 0.80;
  color += col2 * b2 * 0.75;
  color += col3 * b3 * 0.70;

  return clamp(color, 0.0, 1.0);
}

// ── Effect A: Flowing waves ────────────────────────────────────────
// Horizontal sine bands drifting upward, domain-warped for softness.
// Three overlapping layers at different frequencies so colors bleed.
vec3 effect_waves(vec2 st) {
  float warp = 0.12 + u_energy * 0.20;

  // Primary domain warp
  vec2 ws = st + vec2(
    sin(st.y * 2.5 + u_time * 0.50) * warp,
    cos(st.x * 2.0 + u_time * 0.42) * warp * 0.7
  );
  // Secondary warp layer for richer undulation
  ws.x += sin(ws.y * 4.5 + u_time * 0.35) * warp * 0.40;

  float freq  = 1.8 + u_energy * 2.0;
  float drift = 0.18 + u_energy * 0.35;

  float w1 = ws.y * freq                       - u_time * drift;
  float w2 = ws.y * freq * 1.5                 - u_time * drift * 1.2 + 1.8;
  float w3 = (ws.y * 0.8 + ws.x * 0.35) * freq - u_time * drift * 0.9 + 3.5;

  // S-curve maps sin output to smooth 0–1 — no hard boundaries
  float b1 = smoothstep(0.0, 1.0, sin(w1) * 0.5 + 0.5);
  float b2 = smoothstep(0.0, 1.0, sin(w2) * 0.5 + 0.5);
  float b3 = smoothstep(0.0, 1.0, sin(w3) * 0.5 + 0.5);

  const float K = 1.1141;  // 7.0 / (2*PI): maps wave phase to palette index
  vec3 lc1 = pal(mod(w1 * K + u_time * 0.10,        7.0));
  vec3 lc2 = pal(mod(w2 * K + u_time * 0.10 + 2.33, 7.0));
  vec3 lc3 = pal(mod(w3 * K + u_time * 0.10 + 4.67, 7.0));

  vec3 color = vec3(0.031);
  color += lc1 * b1 * 0.55;
  color += lc2 * b2 * 0.45;
  color += lc3 * b3 * 0.38;

  return clamp(color, 0.0, 1.0);
}

// ── Effect B: Vortex bloom ─────────────────────────────────────────
// Polar-coordinate petal bloom with pure UV warping for distortion.
// No drawn rings — all structure comes from warped coordinate space.
vec3 effect_bloom(vec2 st) {
  float r     = length(st);
  float theta = atan(st.y, st.x);

  // Radial UV distortion — no visible rings, just warped coordinates
  float rw = r * (1.0 + sin(r * 8.0 - u_time * 3.0) * 0.06);

  // 4-petal shape via smooth sin on theta — dissolves at petal edges
  float petalPhase = sin(theta * 4.0 + u_time * 2.0) * 0.5 + 0.5;
  float petal      = smoothstep(0.0, 1.0, petalPhase);

  // Colors mix across petal phase and angular position — always multiple hues
  vec3 pc_a = pal(mod(u_time * 0.10,              7.0));
  vec3 pc_b = pal(mod(u_time * 0.10 + 3.50,       7.0));
  vec3 pc_c = pal(mod(theta / 6.2832 * 7.0 + u_time * 0.08, 7.0));

  vec3 petalColor = mix(mix(pc_a, pc_b, petal), pc_c, 0.30);

  // Exponential radial fade — petals dissolve outward, no edge
  float radFade = exp(-rw * (1.5 + u_energy * 0.5));

  // Pulsing core — purely exponential, no visible boundary
  float core      = exp(-r * (5.0 + u_energy * 3.0)) * (0.6 + u_energy * 0.4);
  vec3  coreColor = pal(mod(u_time * 0.10 + 1.17, 7.0));

  vec3 color = vec3(0.031);
  color += petalColor * radFade * (0.8 + petal * 0.4);
  color += coreColor  * core;

  return clamp(color, 0.0, 1.0);
}

// ── Mode 1: Energetic ──────────────────────────────────────────────
// Smooth crossfade between waves (low energy) and bloom (high energy)
vec3 mode_energetic(vec2 st) {
  float blend = smoothstep(0.5, 0.7, u_energy);
  return mix(effect_waves(st), effect_bloom(st), blend);
}

// ── Mode B: Breathing ──────────────────────────────────────────────
// Cream background, large slow blobs, 0.65 pastelisation.
// Always used for breathing/meditation regardless of u_energy.
vec3 palB(float t) {
  t = mod(t, 7.0);
  float f = smoothstep(0.0, 1.0, fract(t));
  int i = int(floor(t));
  vec3 raw;
  if (i == 0) raw = mix(PC1, PC2, f);
  else if (i == 1) raw = mix(PC2, PC3, f);
  else if (i == 2) raw = mix(PC3, PC4, f);
  else if (i == 3) raw = mix(PC4, PC5, f);
  else if (i == 4) raw = mix(PC5, PC6, f);
  else if (i == 5) raw = mix(PC6, PC7, f);
  else              raw = mix(PC7, PC1, f);
  return mix(raw, vec3(1.0), 0.30);
}

vec3 mode_breathing(vec2 st) {
  vec3 bg = vec3(0.980, 0.973, 0.957);  // #FAF8F4
  float T = u_time;

  // Larger, slower blobs — radius 0.5–0.8, ~6 s period (2π/1.047 ≈ 6 s)
  float r1 = 0.650 + sin(T * 1.047)         * 0.150;
  float r2 = 0.600 + sin(T * 1.047 + 2.094) * 0.150;
  float r3 = 0.575 + sin(T * 1.047 + 4.189) * 0.150;

  vec2 p1 = vec2(sin(T * 0.08) * 0.25,  cos(T * 0.06) * 0.20);
  vec2 p2 = vec2(cos(T * 0.07) * 0.22,  sin(T * 0.09) * 0.24);
  vec2 p3 = vec2(sin(T * 0.05) * 0.18 + cos(T * 0.10) * 0.10,
                 cos(T * 0.08) * 0.26);

  float b1 = exp(-length(st - p1) / r1);
  float b2 = exp(-length(st - p2) / r2);
  float b3 = exp(-length(st - p3) / r3);

  vec3 col1 = palB(T * 0.1);
  vec3 col2 = palB(T * 0.1 + 2.333);
  vec3 col3 = palB(T * 0.1 + 4.667);

  // mix() blending keeps light colors from blowing out on the cream bg
  vec3 color = bg;
  color = mix(color, col1, b1 * 0.78);
  color = mix(color, col2, b2 * 0.72);
  color = mix(color, col3, b3 * 0.68);

  return clamp(color, 0.0, 1.0);
}

// ── Main ───────────────────────────────────────────────────────────
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 st = uv * 2.0 - 1.0;
  st.x   *= u_resolution.x / u_resolution.y;

  vec3 color;
  if (u_breathing > 0.5) {
    color = mode_breathing(st);
  } else {
    float m = smoothstep(0.0, 1.0, clamp(u_mode, 0.0, 1.0));
    color = mix(mode_ethereal(st), mode_energetic(st), m);
  }

  gl_FragColor = vec4(color, 1.0);
}
`

// ── WebGL helpers ─────────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown'
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${log}`)
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  const prog = gl.createProgram()!
  gl.attachShader(prog, vert)
  gl.attachShader(prog, frag)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`)
  }
  gl.deleteShader(vert)
  gl.deleteShader(frag)
  return prog
}

// ── CSS fallback ──────────────────────────────────────────────────────────────

function FallbackGradient() {
  return (
    <>
      <style>{`
        @keyframes fallbackShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'linear-gradient(135deg, #FF147A, #FF5900, #B78CFA, #FFB81A, #00B8B8)',
        backgroundSize: '300% 300%',
        animation: 'fallbackShift 8s ease-in-out infinite',
      }} />
    </>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

const LERP_MS = 1500  // mode transition duration in milliseconds

export default function Visualizer({ visualWorld, audioFeatures, isBreathing, opacity }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef     = useRef<WebGLRenderingContext | null>(null)
  const locsRef   = useRef<{
    time:      WebGLUniformLocation | null
    res:       WebGLUniformLocation | null
    energy:    WebGLUniformLocation | null
    mode:      WebGLUniformLocation | null
    breathing: WebGLUniformLocation | null
  } | null>(null)
  const rafRef    = useRef(0)
  const startRef  = useRef(0)

  // Mode lerp — all mutable refs so the rAF loop picks them up without re-renders
  const currentModeRef = useRef(0)
  const startModeRef   = useRef(0)
  const targetModeRef  = useRef(0)
  const lerpStartRef   = useRef<number | null>(null)

  const energyRef    = useRef(audioFeatures.energy)
  const breathingRef = useRef(isBreathing ?? false)
  const [webglFailed, setWebglFailed] = useState(false)

  // ── Mount: init WebGL once ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = (
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    ) as WebGLRenderingContext | null

    if (!gl) { setWebglFailed(true); return }
    glRef.current = gl

    let prog: WebGLProgram
    try {
      prog = createProgram(gl)
    } catch {
      setWebglFailed(true)
      return
    }

    gl.useProgram(prog)

    // Full-screen triangle pair
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,   1, -1,  -1,  1,
      -1,  1,   1, -1,   1,  1,
    ]), gl.STATIC_DRAW)

    const posLoc = gl.getAttribLocation(prog, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const locs = {
      time:      gl.getUniformLocation(prog, 'u_time'),
      res:       gl.getUniformLocation(prog, 'u_resolution'),
      energy:    gl.getUniformLocation(prog, 'u_energy'),
      mode:      gl.getUniformLocation(prog, 'u_mode'),
      breathing: gl.getUniformLocation(prog, 'u_breathing'),
    }
    locsRef.current = locs

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width  = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      gl.uniform2f(locs.res, w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    startRef.current = performance.now()

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      if (!locs.time || !locs.energy || !locs.mode) return

      const nowMs = performance.now()
      gl.uniform1f(locs.time,      (nowMs - startRef.current) / 1000)
      gl.uniform1f(locs.energy,    energyRef.current)
      gl.uniform1f(locs.breathing, breathingRef.current ? 1.0 : 0.0)

      // Lerp mode 0↔1 over LERP_MS
      const ls = lerpStartRef.current
      if (ls !== null) {
        const progress = Math.min((nowMs - ls) / LERP_MS, 1)
        currentModeRef.current =
          startModeRef.current + (targetModeRef.current - startModeRef.current) * progress
        if (progress >= 1) lerpStartRef.current = null
      }
      gl.uniform1f(locs.mode, currentModeRef.current)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafRef.current)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync energy + breathing ───────────────────────────────────────
  useEffect(() => {
    energyRef.current = audioFeatures.energy
  }, [audioFeatures.energy])

  useEffect(() => {
    breathingRef.current = isBreathing ?? false
  }, [isBreathing])

  // ── Trigger mode transition ───────────────────────────────────────
  useEffect(() => {
    const target = toShaderMode(visualWorld.motionStyle)
    if (target !== targetModeRef.current) {
      startModeRef.current  = currentModeRef.current
      targetModeRef.current = target
      lerpStartRef.current  = performance.now()
    }
  }, [visualWorld.motionStyle])

  if (webglFailed) return <FallbackGradient />

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, zIndex: 0, width: '100%', height: '100%', opacity: opacity ?? 1, transition: 'opacity 0.5s ease' }}
    />
  )
}

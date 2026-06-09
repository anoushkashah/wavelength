'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { onQueueUpdate, skipToNext, type QueueState } from '@/lib/queue-manager'
import { previousTrack, togglePlay, nextTrack, resumePlayer, initPlayer } from '@/lib/spotify-player'
import Visualizer, {
  defaultVisualWorld,
  defaultAudioFeatures,
  type AudioFeatures,
} from './Visualizer'
import type { BreathingConfig, FocusConfig } from '@/types/session'

const FIGTREE = 'var(--font-figtree), system-ui, sans-serif'

function getPaletteForMode(motionStyle: string, existingPalette: string[]): { palette: string[], backgroundType: 'dark' | 'light' } {
  switch(motionStyle) {
    case 'turbulent':
      return {
        palette: ['#FF2D6B', '#FF6B00', '#FF3CAC', '#FF9E00', '#CC1C00'],
        backgroundType: 'light'
      }
    case 'landscape':
      return {
        palette: ['#FF6FB4', '#FFB347', '#FFE566', '#FF7F5C', '#C77DFF'],
        backgroundType: 'light'
      }
    case 'fluid':
      return {
        palette: ['#9B5DE5', '#F15BB5', '#C77DFF', '#E040FB', '#FF6B9D'],
        backgroundType: 'light'
      }
    case 'geometric':
      return {
        palette: ['#0096FF', '#00C9FF', '#48CAE4', '#0077B6', '#90E0EF'],
        backgroundType: 'light'
      }
    case 'ethereal':
      return {
        palette: ['#B5EAD7', '#FFDAC1', '#C7CEEA', '#FFB7B2', '#E2F0CB'],
        backgroundType: 'light'
      }
    default:
      return { palette: existingPalette, backgroundType: 'light' }
  }
}

function getMotionStyleFromAudioFeatures(features: AudioFeatures): string {
  const { tempo, energy, valence, danceability, acousticness } = features
  if (tempo > 125 && energy > 0.65)                              return 'turbulent'
  if (acousticness > 0.45 || energy < 0.30)                     return 'ethereal'
  if (valence > 0.60 && danceability > 0.55)                    return 'landscape'
  if (energy > 0.40 && energy < 0.75 && danceability < 0.60)   return 'geometric'
  return 'fluid'
}

interface PlayingViewProps {
  onBack: () => void
  vibeDescription: string
  breathingMode?: boolean
  sessionType?: 'breathing' | 'focus' | null
  sessionConfig?: BreathingConfig | FocusConfig | null
}

// ─── Breathing overlay ────────────────────────────────────────────────────────
// Data flow: config comes from BreathingWidget state (pattern, duration, intention)
//   → onStreamStart(config) → dashboard sessionConfig → here.
// All phase durations read ONLY from config — no fallbacks.
function BreathingOverlay({
  config,
  darkText,
  onDimChange,
}: {
  config: BreathingConfig
  darkText: boolean
  onDimChange: (o: number) => void
}) {
  const primary = darkText ? '#1a1a1a' : 'rgba(255,255,255,0.90)'
  const muted   = darkText ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.50)'

  // Build phase list strictly from config — omit absent phases
  const phases = useMemo(() => {
    const p: { label: string; duration: number; name: string }[] = []
    p.push({ name: 'inhale', label: 'Inhale', duration: config.inhale })
    if (config.hold)            p.push({ name: 'hold',            label: 'Hold',   duration: config.hold })
    p.push({ name: 'exhale', label: 'Exhale', duration: config.exhale })
    if (config.holdAfterExhale) p.push({ name: 'holdAfterExhale', label: 'Hold',   duration: config.holdAfterExhale })
    return p
  }, [config])

  const [phaseIdx,       setPhaseIdx]       = useState(0)
  const [phaseSecsLeft,  setPhaseSecsLeft]  = useState(phases[0].duration)
  const [totalSecsLeft,  setTotalSecsLeft]  = useState(config.totalDuration * 60)
  const [cycleCount,     setCycleCount]     = useState(1)
  const [completed,      setCompleted]      = useState(false)
  const [orbScale,       setOrbScale]       = useState(1.0)
  const [orbTransition,  setOrbTransition]  = useState(config.inhale)

  // Refs so the interval closure always sees current values
  const phaseIdxRef    = useRef(0)
  const phaseSecsRef   = useRef(phases[0].duration)
  const totalSecsRef   = useRef(config.totalDuration * 60)
  const cycleCountRef  = useRef(1)

  function applyPhaseOrb(name: string, duration: number) {
    if (name === 'inhale') { setOrbTransition(duration); setOrbScale(1.45) }
    else if (name === 'exhale') { setOrbTransition(duration); setOrbScale(0.80) }
    // hold: keep current scale, no transition change needed
  }

  useEffect(() => {
    applyPhaseOrb(phases[0].name, phases[0].duration)
    const iv = setInterval(() => {
      totalSecsRef.current  -= 1
      phaseSecsRef.current  -= 1
      setTotalSecsLeft(totalSecsRef.current)

      if (totalSecsRef.current <= 0) {
        clearInterval(iv)
        setCompleted(true)
        onDimChange(0.3)
        togglePlay().catch(() => {})
        return
      }

      if (phaseSecsRef.current <= 0) {
        const next = (phaseIdxRef.current + 1) % phases.length
        const isNewCycle = next === 0
        phaseIdxRef.current  = next
        phaseSecsRef.current = phases[next].duration
        if (isNewCycle) { cycleCountRef.current += 1; setCycleCount(cycleCountRef.current) }
        setPhaseIdx(next)
        setPhaseSecsLeft(phases[next].duration)
        applyPhaseOrb(phases[next].name, phases[next].duration)
      } else {
        setPhaseSecsLeft(phaseSecsRef.current)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const minsLeft = Math.floor(totalSecsLeft / 60)
  const secsLeft = totalSecsLeft % 60
  const currentPhase = phases[phaseIdx]

  if (completed) {
    return (
      <div style={{ paddingTop: 32, opacity: 1, transition: 'opacity 0.8s ease', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontFamily: FIGTREE, fontSize: 28, fontWeight: 300, color: primary, margin: 0 }}>Session complete</p>
        <p style={{ fontFamily: FIGTREE, fontSize: 14, fontWeight: 300, color: muted,   margin: 0 }}>
          You breathed for {config.totalDuration} minutes
        </p>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Orb */}
      <div style={{ position: 'relative', width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          position: 'absolute', width: 140, height: 140, borderRadius: '50%',
          background: darkText
            ? 'radial-gradient(circle, rgba(130,100,200,0.45) 0%, rgba(255,100,20,0.18) 60%, transparent 100%)'
            : 'radial-gradient(circle, rgba(200,150,255,0.40) 0%, rgba(255,150,80,0.20) 60%, transparent 100%)',
          filter: 'blur(14px)',
          transform: `scale(${orbScale})`,
          transition: `transform ${orbTransition}s ease-in-out`,
        }} />
        <div style={{
          position: 'absolute', width: 72, height: 72, borderRadius: '50%',
          background: darkText
            ? 'radial-gradient(circle, rgba(100,70,180,0.60) 0%, rgba(200,80,160,0.25) 70%, transparent 100%)'
            : 'radial-gradient(circle, rgba(220,180,255,0.55) 0%, rgba(255,180,120,0.25) 70%, transparent 100%)',
          filter: 'blur(6px)',
          transform: `scale(${orbScale})`,
          transition: `transform ${orbTransition}s ease-in-out`,
        }} />
        {/* Phase label + countdown */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <p style={{ fontFamily: FIGTREE, fontSize: 16, fontWeight: 300, color: primary, margin: 0, letterSpacing: '0.08em' }}>
            {currentPhase.label}
          </p>
          <p style={{ fontFamily: FIGTREE, fontSize: 36, fontWeight: 200, color: primary, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
            {phaseSecsLeft}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p style={{ fontFamily: FIGTREE, fontSize: 13, fontWeight: 300, color: muted, margin: 0 }}>
          {minsLeft}:{String(secsLeft).padStart(2, '0')} remaining
        </p>
        <p style={{ fontFamily: FIGTREE, fontSize: 11, fontWeight: 300, color: muted, margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
          Cycle {cycleCount}
        </p>
      </div>
    </div>
  )
}

// ─── Focus overlay ────────────────────────────────────────────────────────────
// Data flow: config comes from FocusWidget state (effectiveFocus, breakMinutes, cycles)
//   → onStreamStart(config) → dashboard sessionConfig → here.
// All durations read ONLY from config — no fallbacks.
function FocusOverlay({
  config,
  darkText,
  onDimChange,
}: {
  config: FocusConfig
  darkText: boolean
  onDimChange: (o: number) => void
}) {
  const primary = darkText ? '#1a1a1a' : 'rgba(255,255,255,0.90)'
  const muted   = darkText ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.50)'
  const dim     = darkText ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.35)'

  const [phase,        setPhase]        = useState<'focus' | 'break'>('focus')
  const [currentCycle, setCurrentCycle] = useState(1)
  const [secsLeft,     setSecsLeft]     = useState(config.focusDuration * 60)
  const [completed,    setCompleted]    = useState(false)
  const [showResume,   setShowResume]   = useState(false)

  const phaseRef        = useRef<'focus' | 'break'>('focus')
  const currentCycleRef = useRef(1)
  const secsLeftRef     = useRef(config.focusDuration * 60)
  const pausedRef       = useRef(false)
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const focusTotalSecs = config.focusDuration * 60
  const breakTotalSecs = config.breakDuration * 60

  useEffect(() => {
    const iv = setInterval(() => {
      secsLeftRef.current -= 1
      const sl = secsLeftRef.current
      setSecsLeft(sl)

      // "Music resumes in Xs" when <10s remain in a break
      if (phaseRef.current === 'break' && sl > 0 && sl <= 10) setShowResume(true)

      if (sl <= 0) {
        if (phaseRef.current === 'focus') {
          if (currentCycleRef.current >= config.cycles) {
            // All cycles complete
            clearInterval(iv)
            setCompleted(true)
            onDimChange(0.3)
            resumePlayer().catch(() => {})
            completionTimerRef.current = setTimeout(() => {
              togglePlay().catch(() => {})
            }, 30000)
          } else {
            // Start break
            phaseRef.current = 'break'
            setPhase('break')
            secsLeftRef.current = breakTotalSecs
            setSecsLeft(breakTotalSecs)
            setShowResume(false)
            onDimChange(0.2)
            if (!pausedRef.current) { pausedRef.current = true; togglePlay().catch(() => {}) }
          }
        } else {
          // Break over — start next focus block
          phaseRef.current = 'focus'
          setPhase('focus')
          currentCycleRef.current += 1
          setCurrentCycle(currentCycleRef.current)
          secsLeftRef.current = focusTotalSecs
          setSecsLeft(focusTotalSecs)
          setShowResume(false)
          onDimChange(1)
          pausedRef.current = false
          resumePlayer().catch(() => {})
        }
      }
    }, 1000)

    return () => {
      clearInterval(iv)
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const mins = Math.floor(secsLeft / 60)
  const secs = secsLeft % 60
  const totalPhase = phase === 'focus' ? focusTotalSecs : breakTotalSecs
  const progress   = Math.max(0, 1 - secsLeft / totalPhase)

  const focusedMins = config.focusDuration * (currentCycle - 1) +
    (phase === 'focus' ? Math.floor((focusTotalSecs - secsLeft) / 60) : config.focusDuration)

  if (completed) {
    return (
      <div style={{ paddingTop: 32, opacity: 1, transition: 'opacity 0.8s ease', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontFamily: FIGTREE, fontSize: 28, fontWeight: 300, color: primary, margin: 0 }}>Session complete</p>
        <p style={{ fontFamily: FIGTREE, fontSize: 14, fontWeight: 300, color: muted,   margin: 0 }}>
          You focused for {focusedMins} minutes
        </p>
      </div>
    )
  }

  if (phase === 'break') {
    return (
      <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontFamily: FIGTREE, fontSize: 11, fontWeight: 500, color: dim, letterSpacing: '0.12em', textTransform: 'uppercase' as const, margin: 0 }}>Break</p>
        <p style={{ fontFamily: FIGTREE, fontSize: 56, fontWeight: 200, color: primary, margin: 0, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </p>
        {showResume && (
          <p style={{ fontFamily: FIGTREE, fontSize: 13, fontWeight: 300, color: muted, margin: 0 }}>
            Music resumes in {secsLeft}s
          </p>
        )}
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontFamily: FIGTREE, fontSize: 11, fontWeight: 500, color: dim, letterSpacing: '0.12em', textTransform: 'uppercase' as const, margin: 0 }}>Focus</p>
      <p style={{ fontFamily: FIGTREE, fontSize: 56, fontWeight: 200, color: primary, margin: 0, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </p>
      <p style={{ fontFamily: FIGTREE, fontSize: 13, fontWeight: 300, color: dim, margin: 0 }}>
        Block {currentCycle} of {config.cycles}
      </p>
      {/* Thin progress bar */}
      <div style={{ maxWidth: 320, height: 2, background: darkText ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress * 100}%`, background: darkText ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.60)', borderRadius: 1, transition: 'width 1s linear' }} />
      </div>
    </div>
  )
}

export default function PlayingView({ onBack, vibeDescription, breathingMode, sessionType, sessionConfig }: PlayingViewProps) {
  const [queueState, setQueueState] = useState<QueueState | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [audioFeatures, setAudioFeatures] = useState<AudioFeatures>(defaultAudioFeatures)
  const [hasRealVisualWorld, setHasRealVisualWorld] = useState(false)
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [overlayFading, setOverlayFading] = useState(false)
  const [visualizerOpacity, setVisualizerOpacity] = useState(1)
  const playerInitialized = useRef(false)

  useEffect(() => onQueueUpdate(setQueueState), [])

  useEffect(() => {
    if (playerInitialized.current) return
    playerInitialized.current = true
    initPlayer().catch(() => {})
  }, [])

  // Estimate audio features via Claude whenever the current track changes
  const currentTrack = queueState?.currentTrack ?? null
  useEffect(() => {
    if (queueState?.visualWorld && queueState.visualWorld.colorPalette[0] !== '#F5F0E8') {
      setHasRealVisualWorld(true)
    }
  }, [queueState?.visualWorld])

  useEffect(() => {
    if (!currentTrack?.id) return
    const trackName = currentTrack.name
    const artistName = currentTrack.artists[0]?.name ?? ''
    const mood = queueState?.mood ?? ''
    ;(async () => {
      try {
        const res = await fetch('/api/ai/estimate-features', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackName, artistName, mood }),
        })
        const data = await res.json()
        if (res.ok && data && !data.error) setAudioFeatures(data as AudioFeatures)
      } catch {
        // Non-critical: visualizer falls back to default audio features
      }
    })()
  }, [currentTrack?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = queueState?.isLoading ?? true

  useEffect(() => {
    if (!isLoading) {
      setOverlayFading(true)
      const t = setTimeout(() => setOverlayVisible(false), 900)
      return () => clearTimeout(t)
    }
  }, [isLoading])
  const dynamicVisualWorld = useMemo(() => {
    if (breathingMode) {
      const { palette, backgroundType } = getPaletteForMode('ethereal', [])
      return { ...defaultVisualWorld, motionStyle: 'ethereal', intensity: 0.05, colorPalette: palette, backgroundType }
    }
    const base = queueState?.visualWorld ?? defaultVisualWorld
    const motionStyle = getMotionStyleFromAudioFeatures(audioFeatures)
    const { palette, backgroundType } = getPaletteForMode(motionStyle, base.colorPalette)
    return { ...base, motionStyle, colorPalette: palette, backgroundType }
  }, [queueState?.visualWorld, audioFeatures, breathingMode])
  const playlistName = queueState?.playlistName ?? ''

  const isBreathing = breathingMode || /breath|meditat/i.test(playlistName)

  // Text + button colors flip to dark for breathing/meditation (light background)
  const textPrimary   = isBreathing ? '#1a1a1a'             : '#ffffff'
  const textSecondary = isBreathing ? 'rgba(0,0,0,0.55)'    : 'rgba(255,255,255,0.55)'
  const textTertiary  = isBreathing ? 'rgba(0,0,0,0.35)'    : 'rgba(255,255,255,0.35)'
  const textMuted     = isBreathing ? 'rgba(0,0,0,0.28)'    : 'rgba(255,255,255,0.28)'
  const textLabel     = isBreathing ? 'rgba(0,0,0,0.5)'     : 'rgba(255,255,255,0.5)'
  const textQueue     = isBreathing ? 'rgba(0,0,0,0.65)'    : 'rgba(255,255,255,0.7)'

  const pillBtnBg     = isBreathing ? 'rgba(0,0,0,0.07)'    : 'rgba(255,255,255,0.12)'
  const pillBtnBorder = isBreathing ? '1px solid rgba(0,0,0,0.12)' : '1px solid rgba(255,255,255,0.2)'

  const pillBtn: React.CSSProperties = {
    background: pillBtnBg,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: pillBtnBorder,
    borderRadius: 50,
    padding: '10px 22px',
    color: textPrimary,
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    fontFamily: FIGTREE,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s',
  }

  const userMood = {
    query: '',
    mood: queueState?.mood ?? '',
    arc: '',
  }

  async function handlePrev(e: React.MouseEvent) {
    e.stopPropagation()
    await previousTrack().catch(() => {})
  }

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await togglePlay()
      setIsPaused((p) => !p)
    } catch {
      // Ignore — player may be in a transient state
    }
  }

  async function handleSkip(e: React.MouseEvent) {
    e.stopPropagation()
    await skipToNext()
    await nextTrack().catch(() => {})
    setTimeout(() => resumePlayer().catch(() => {}), 500)
  }

  async function handleClose(e: React.MouseEvent) {
    e.stopPropagation()
    if (!isPaused) {
      try { await togglePlay() } catch { /* ignore if already paused */ }
    }
    onBack()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: FIGTREE }}>
      {/* Full-screen generative art visualizer */}
      <Visualizer
        visualWorld={hasRealVisualWorld ? dynamicVisualWorld : defaultVisualWorld}
        audioFeatures={hasRealVisualWorld ? audioFeatures : defaultAudioFeatures}
        userMood={userMood}
        isBreathing={isBreathing}
        opacity={visualizerOpacity}
      />

      {/* Left readability veil */}
      <div style={{
        position: 'fixed', top: 0, bottom: 0, left: 0,
        width: 420,
        background: isBreathing
          ? 'linear-gradient(to right, rgba(250,248,244,0.5), transparent)'
          : 'linear-gradient(to right, rgba(0,0,0,0.35), transparent)',
        zIndex: 5,
        pointerEvents: 'none',
      }} />

      {/* Loading screen */}
      {overlayVisible && (
        <div style={{
          position: 'fixed', inset: 0, background: '#f0ece4',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 20, overflow: 'hidden',
          opacity: overlayFading ? 0 : 1,
          transition: 'opacity 0.9s ease',
        }}>
          <style>{`
            @keyframes loadRipple {
              0%, 100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.85; }
              50%       { transform: translate(-50%, -50%) scale(1.05); opacity: 0.70; }
            }
            @keyframes loadRipple2 {
              0%, 100% { transform: translate(-50%, -50%) scale(1.0); opacity: 0.70; }
              50%       { transform: translate(-50%, -50%) scale(0.92); opacity: 0.88; }
            }
            @keyframes dotFade {
              0%, 100% { opacity: 0.18; }
              50%       { opacity: 1; }
            }
          `}</style>

          {/* Layer 1 — deep navy center */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(20,30,120,0.78) 0%, rgba(20,30,120,0) 38%)', filter: 'blur(20px)', animation: 'loadRipple 7s ease-in-out infinite' }} />
          {/* Layer 2 — navy body */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(40,50,180,0.55) 0%, rgba(40,50,180,0.24) 42%, rgba(40,50,180,0) 70%)', filter: 'blur(35px)', animation: 'loadRipple2 9s ease-in-out infinite' }} />
          {/* Layer 3 — magenta ring */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', width: 850, height: 850, borderRadius: '50%', background: 'radial-gradient(circle, rgba(210,20,150,0) 30%, rgba(210,20,150,0.36) 54%, rgba(210,20,150,0) 74%)', filter: 'blur(30px)', animation: 'loadRipple 7s ease-in-out infinite' }} />
          {/* Layer 4 — orange outer */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', width: 1100, height: 1100, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,100,20,0) 44%, rgba(255,100,20,0.24) 60%, rgba(255,100,20,0) 78%)', filter: 'blur(55px)', animation: 'loadRipple2 9s ease-in-out infinite' }} />

          {/* Text — absolutely above center */}
          <p style={{ position: 'absolute', top: 'calc(50% - 84px)', left: 0, right: 0, textAlign: 'center', fontFamily: FIGTREE, fontSize: 20, fontWeight: 300, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.07em', margin: 0, zIndex: 10 }}>
            Curating Your Vibe
          </p>

          {/* Dot spinner — exactly at viewport center */}
          <div style={{ position: 'relative', zIndex: 10, width: 80, height: 80 }}>
            {Array.from({ length: 10 }).map((_, i) => {
              const angle = (i / 10) * 2 * Math.PI - Math.PI / 2
              const r = 32
              const x = Math.cos(angle) * r + 40 - 3.5
              const y = Math.sin(angle) * r + 40 - 3.5
              return (
                <div key={i} style={{
                  position: 'absolute',
                  left: x, top: y,
                  width: 7, height: 7,
                  borderRadius: '50%',
                  background: '#f0ece4',
                  animation: 'dotFade 1.6s ease-in-out infinite',
                  animationDelay: `${(i / 10) * 1.6}s`,
                }} />
              )
            })}
          </div>
        </div>
      )}

      {/* Header — z-index 10 so it sits above the canvas */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '32px 40px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '65%' }}>
          <button
            onClick={onBack}
            style={{
              fontFamily: FIGTREE,
              fontSize: 13,
              fontWeight: 300,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: textLabel,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              textAlign: 'left',
            }}
          >
            Wavelength
          </button>

          {playlistName && (
            <p style={{ fontFamily: FIGTREE, fontSize: 18, fontWeight: 400, color: textPrimary, margin: 0, lineHeight: 1.2 }}>
              {playlistName}
            </p>
          )}

          {vibeDescription && (
            <p
              style={{
                fontFamily: FIGTREE,
                fontSize: 13,
                fontWeight: 300,
                color: textLabel,
                margin: 0,
                lineHeight: 1.45,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {vibeDescription}
            </p>
          )}
        </div>

        {/* X close button — stops playback and returns to dashboard */}
        <button
          onClick={handleClose}
          aria-label="Stop and close"
          style={{
            background: pillBtnBg,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: pillBtnBorder,
            borderRadius: '50%',
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: textPrimary,
            cursor: 'pointer',
            fontSize: 15,
            fontFamily: FIGTREE,
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* Current track + controls + Up Next */}
      <div
        style={{
          position: 'absolute',
          top: 160,
          left: 40,
          maxWidth: 520,
          zIndex: 10,
        }}
      >
        {isLoading ? (
          <p style={{ fontFamily: FIGTREE, fontSize: 14, fontWeight: 300, color: textTertiary, margin: 0 }}>
            {playlistName ? `Building "${playlistName}"…` : 'Generating your playlist…'}
          </p>
        ) : (
          <>
            <p
              style={{
                fontFamily: FIGTREE,
                fontSize: 32,
                fontWeight: 300,
                color: textPrimary,
                margin: '0 0 14px 0',
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
              }}
            >
              {currentTrack?.name}
            </p>

            {/* Album art + artist name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              {currentTrack?.album?.images[0]?.url && (
                <img
                  src={currentTrack.album.images[0].url}
                  alt={currentTrack.album.name}
                  style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                />
              )}
              <p style={{ fontFamily: FIGTREE, fontSize: 13, fontWeight: 300, color: textSecondary, margin: 0 }}>
                {currentTrack?.artists.map((a) => a.name).join(', ')}
              </p>
            </div>

            {/* Playback controls */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={pillBtn} onClick={handlePrev} aria-label="Previous">⏮</button>
              <button style={pillBtn} onClick={handleToggle} aria-label={isPaused ? 'Resume' : 'Pause'}>
                {isPaused ? '▶' : '⏸'}
              </button>
              <button style={pillBtn} onClick={handleSkip} aria-label="Skip">⏭</button>
            </div>

            {/* Session overlay replaces Up Next when a timed session is active */}
            {sessionType === 'breathing' && sessionConfig ? (
              <BreathingOverlay
                config={sessionConfig as BreathingConfig}
                darkText={isBreathing}
                onDimChange={setVisualizerOpacity}
              />
            ) : sessionType === 'focus' && sessionConfig ? (
              <FocusOverlay
                config={sessionConfig as FocusConfig}
                darkText={isBreathing}
                onDimChange={setVisualizerOpacity}
              />
            ) : queueState && queueState.queue.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <p
                  style={{
                    fontFamily: FIGTREE,
                    fontSize: 10,
                    fontWeight: 500,
                    color: textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    margin: '0 0 10px 0',
                  }}
                >
                  Up next
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {queueState.queue.slice(0, 10).map((track, i) => (
                    <div key={track.id ?? i} style={{ maxWidth: 400 }}>
                      <p
                        style={{
                          fontFamily: FIGTREE,
                          fontSize: 13,
                          fontWeight: 300,
                          color: textQueue,
                          margin: '0 0 1px 0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {track.name}
                      </p>
                      <p
                        style={{
                          fontFamily: FIGTREE,
                          fontSize: 12,
                          fontWeight: 300,
                          color: textTertiary,
                          margin: 0,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {track.artists.map((a) => a.name).join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

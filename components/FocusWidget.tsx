'use client'

import { useState } from 'react'
import type { SpotifyTrack } from '@/types/spotify'
import type { FocusConfig } from '@/types/session'

type TrackSource = 'liked' | 'recommended' | 'discovery'

interface VisualWorld {
  colorPalette: string[]
  motionStyle: string
  intensity: number
  atmosphere: string
  shapeLanguage: string
  backgroundType?: 'dark' | 'light'
}

export interface StreamChunk {
  track: SpotifyTrack & { source: TrackSource }
  visualWorld: VisualWorld
  isFirst: boolean
  playlistName?: string
  mood?: string
  arc?: string
}

interface FocusWidgetProps {
  onStreamStart: (config: FocusConfig) => void
  onFirstChunk: (chunk: StreamChunk) => void
  onChunk: (chunk: StreamChunk) => void
  onError: (err: string) => void
}

type SessionType = 'lofi' | 'deephouse'

const FOCUS_OPTS: { minutes: number; label: string }[] = [
  { minutes: 25, label: '25 min' },
  { minutes: 45, label: '45 min' },
  { minutes: 60, label: '60 min' },
]

const BREAK_OPTS = [5, 10]
const CYCLE_OPTS = [1, 2, 3, 4]

export default function FocusWidget({ onStreamStart, onFirstChunk, onChunk, onError }: FocusWidgetProps) {
  const [sessionType, setSessionType] = useState<SessionType>('lofi')
  const [focusMinutes, setFocusMinutes] = useState<number>(25)
  const [customFocus, setCustomFocus] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const [cycles, setCycles] = useState(2)
  const [loading, setLoading] = useState(false)

  const effectiveFocus = useCustom ? (parseInt(customFocus) || 25) : focusMinutes

  async function handleGenerate() {
    if (loading) return
    if (useCustom && (!customFocus || parseInt(customFocus) < 5)) {
      onError('Please enter a valid focus duration (min 5 minutes)')
      return
    }
    setLoading(true)
    const config: FocusConfig = { focusDuration: effectiveFocus, breakDuration: breakMinutes, cycles }
    onStreamStart(config)

    try {
      const res = await fetch('/api/ai/focus-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focusDuration: effectiveFocus,
          breakDuration: breakMinutes,
          cycles,
          sessionType,
        }),
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let isFirst = true

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue
          const chunk = JSON.parse(line) as StreamChunk & { error?: string }
          if (chunk.error) throw new Error(chunk.error)
          if (isFirst) {
            isFirst = false
            onFirstChunk(chunk)
          } else {
            onChunk(chunk)
          }
        }
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const sl: React.CSSProperties = { fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.95)', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4 }

  return (
    <div style={{
      flex: 1,
      background: 'transparent',
      padding: '14px 16px 12px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxSizing: 'border-box',
      fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
      gap: 8,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.95)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        Focus Timer
      </div>

      {/* Three-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.3fr 0.85fr', gap: '0 10px', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* Col 1 — Session Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={sl}>Session Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {([['lofi', 'Lo-Fi Beats'], ['deephouse', 'Deep House']] as [SessionType, string][]).map(([val, label]) => {
              const sel = sessionType === val
              return (
                <button key={val} onClick={() => setSessionType(val)} style={{
                  width: '100%',
                  textAlign: 'left' as const,
                  padding: '6px 12px',
                  fontSize: 11,
                  background: sel
                    ? 'linear-gradient(135deg, rgba(160,50,15,0.85) 0%, rgba(190,90,90,0.72) 50%, rgba(200,130,140,0.65) 100%)'
                    : 'linear-gradient(135deg, rgba(200,80,30,0.42) 0%, rgba(220,140,140,0.30) 50%, rgba(230,180,190,0.26) 100%)',
                  border: sel ? '2px solid rgba(180,120,140,0.85)' : '1px solid rgba(230,160,150,0.30)',
                  borderRadius: 100,
                  color: sel ? 'white' : '#2C1810',
                  fontWeight: sel ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: sel ? '0 2px 12px rgba(160,50,15,0.30)' : 'none',
                }}>{label}</button>
              )
            })}
          </div>
        </div>

        {/* Col 2 — Focus Duration + Break Duration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={sl}>Focus Duration</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {FOCUS_OPTS.map(({ minutes, label }) => {
                const sel = !useCustom && focusMinutes === minutes
                return <button key={minutes} onClick={() => { setFocusMinutes(minutes); setUseCustom(false) }} style={{ padding: '4px 8px', fontSize: 10, background: sel ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.18)', border: sel ? '1px solid rgba(255,255,255,0.65)' : '1px solid rgba(255,255,255,0.28)', borderRadius: 100, color: sel ? '#2C1810' : 'rgba(255,255,255,0.80)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'none' }}>{label}</button>
              })}
              <button onClick={() => setUseCustom(true)} style={{ padding: '4px 8px', fontSize: 10, background: useCustom ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.18)', border: useCustom ? '1px solid rgba(255,255,255,0.65)' : '1px solid rgba(255,255,255,0.28)', borderRadius: 100, color: useCustom ? '#2C1810' : 'rgba(255,255,255,0.80)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'none' }}>Custom</button>
              {useCustom && (
                <input
                  type="number" min={5} max={180} placeholder="min" value={customFocus}
                  onChange={(e) => setCustomFocus(e.target.value)}
                  style={{ width: 46, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 10, padding: '4px 6px', fontSize: 11, fontFamily: 'inherit', color: 'white', outline: 'none' }}
                />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={sl}>Break Duration</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {BREAK_OPTS.map((min) => {
                const sel = breakMinutes === min
                return <button key={min} onClick={() => setBreakMinutes(min)} style={{ padding: '4px 8px', fontSize: 10, background: sel ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.18)', border: sel ? '1px solid rgba(255,255,255,0.65)' : '1px solid rgba(255,255,255,0.28)', borderRadius: 100, color: sel ? '#2C1810' : 'rgba(255,255,255,0.80)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'none' }}>{min} min</button>
              })}
            </div>
          </div>
        </div>

        {/* Col 3 — Cycles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={sl}>Cycles</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {CYCLE_OPTS.map((n) => {
              const sel = cycles === n
              return <button key={n} onClick={() => setCycles(n)} style={{ padding: '4px 8px', fontSize: 10, background: sel ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.18)', border: sel ? '1px solid rgba(255,255,255,0.65)' : '1px solid rgba(255,255,255,0.28)', borderRadius: 100, color: sel ? '#2C1810' : 'rgba(255,255,255,0.80)', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'none', textAlign: 'center' as const }}>{n}</button>
            })}
          </div>
        </div>

      </div>

      <button
        onClick={handleGenerate}
        disabled={loading}
        style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.90)', borderRadius: 100, color: '#2C1810', fontWeight: 500, fontSize: 12, padding: '11px', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {loading ? 'Building your focus session...' : 'Start Focus Session →'}
      </button>
    </div>
  )
}

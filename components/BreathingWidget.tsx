'use client'

import { useState } from 'react'
import type { SpotifyTrack } from '@/types/spotify'
import type { BreathingConfig } from '@/types/session'

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

type BreathingPattern = 'box' | '478' | 'deep'

// Phase timings derived from pattern — these ARE the source of truth for PlayingView
const PATTERN_TIMINGS: Record<BreathingPattern, Omit<BreathingConfig, 'pattern' | 'totalDuration'>> = {
  box:  { inhale: 4, hold: 4, exhale: 4, holdAfterExhale: 4 },
  '478': { inhale: 4, hold: 7, exhale: 8 },
  deep: { inhale: 5, exhale: 7 },
}

interface BreathingWidgetProps {
  onStreamStart: (config: BreathingConfig) => void
  onFirstChunk: (chunk: StreamChunk) => void
  onChunk: (chunk: StreamChunk) => void
  onError: (err: string) => void
}

const PATTERNS: { value: BreathingPattern; label: string; description: string }[] = [
  { value: 'box', label: 'Box Breathing', description: '4 counts in · hold · out · hold' },
  { value: '478', label: '4-7-8', description: 'Inhale 4 · hold 7 · exhale 8' },
  { value: 'deep', label: 'Deep Breathing', description: 'Slow natural breath · restorative' },
]

const DURATION_OPTS = [5, 10, 15, 20]

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.95)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 500,
  color: 'rgba(255,255,255,0.95)',
  textTransform: 'uppercase',
  letterSpacing: '0.10em',
  marginBottom: 4,
}


export default function BreathingWidget({ onStreamStart, onFirstChunk, onChunk, onError }: BreathingWidgetProps) {
  const [pattern, setPattern] = useState<BreathingPattern>('box')
  const [duration, setDuration] = useState(10)

  const patternStyle = (p: string): React.CSSProperties => ({
    background: pattern === p
      ? 'linear-gradient(135deg, rgba(160,50,15,0.85) 0%, rgba(190,90,90,0.72) 50%, rgba(200,130,140,0.65) 100%)'
      : 'linear-gradient(135deg, rgba(200,80,30,0.42) 0%, rgba(220,140,140,0.30) 50%, rgba(230,180,190,0.26) 100%)',
    border: pattern === p ? '2px solid rgba(180,120,140,0.85)' : '1px solid rgba(230,160,150,0.30)',
    boxShadow: pattern === p ? '0 2px 12px rgba(160,50,15,0.30)' : 'none',
    borderRadius: 100,
    padding: '4px 10px',
    fontSize: 11,
    width: '100%',
    textAlign: 'left' as const,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    fontFamily: 'inherit',
  })

  const durationStyle = (d: number): React.CSSProperties => ({
    background: duration === d ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.18)',
    border: duration === d ? '1px solid rgba(255,255,255,0.65)' : '1px solid rgba(255,255,255,0.28)',
    borderRadius: 100,
    padding: '5px 10px',
    fontSize: 11,
    color: duration === d ? '#2C1810' : 'rgba(255,255,255,0.80)',
    cursor: 'pointer',
    boxShadow: 'none',
    fontFamily: 'inherit',
  })
  const [intention, setIntention] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleBegin() {
    if (loading) return
    setLoading(true)
    const config: BreathingConfig = { pattern, ...PATTERN_TIMINGS[pattern], totalDuration: duration }
    onStreamStart(config)

    try {
      const res = await fetch('/api/ai/meditation-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration, breathingPattern: pattern, intention: intention || undefined }),
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

  return (
    <div style={{
      flex: 1,
      background: 'transparent',
      padding: '16px 18px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      height: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box',
      fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
    }}>
      <span style={labelStyle}>Breathing &amp; Meditation</span>

      {/* Breathing pattern */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={sectionLabel}>Breathing Pattern</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {PATTERNS.map(({ value, label, description }) => (
            <button
              key={value}
              onClick={() => setPattern(value)}
              style={patternStyle(value)}
            >
              <span style={{ fontWeight: 600, color: pattern === value ? 'white' : '#2C1810', fontSize: 11 }}>{label}</span>
              <span style={{ fontWeight: 300, color: pattern === value ? 'rgba(255,255,255,0.75)' : '#7a4a5a', fontSize: 10 }}>{description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
        <span style={sectionLabel}>Duration</span>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {DURATION_OPTS.map((min) => (
            <button
              key={min}
              onClick={() => setDuration(min)}
              style={durationStyle(min)}
            >
              {min} min
            </button>
          ))}
        </div>
      </div>

      {/* Intention */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
        <span style={sectionLabel}>Intention</span>
        <input
          style={{
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.28)',
            color: 'white',
            borderRadius: 12,
            padding: '5px 8px',
            fontSize: 12,
            width: '100%',
            boxSizing: 'border-box' as const,
            outline: 'none',
            fontFamily: 'inherit',
          }}
          placeholder="e.g. calm anxiety, prepare for sleep..."
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
        />
      </div>

      <button
        onClick={handleBegin}
        disabled={loading}
        style={{
          marginTop: 'auto',
          width: '100%',
          padding: '11px',
          background: 'rgba(255,255,255,0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.90)',
          borderRadius: 100,
          fontSize: 12,
          color: '#2C1810',
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {loading ? 'Preparing your meditation...' : 'Begin →'}
      </button>
    </div>
  )
}

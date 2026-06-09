'use client'

import { useState, useEffect } from 'react'
import type { SpotifyTrack } from '@/types/spotify'
import type { StravaActivity, ActivityProfile, WorkoutIntensity } from '@/types/strava'
import { buildActivityProfile } from '@/lib/strava'

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

interface WorkoutWidgetProps {
  onStreamStart: () => void
  onFirstChunk: (chunk: StreamChunk) => void
  onChunk: (chunk: StreamChunk) => void
  onError: (err: string) => void
}

type ConnectionState = 'loading' | 'not-connected' | 'connected'

const SPORT_COLORS: Record<string, string> = {
  Run: '#FF6B6B',
  Ride: '#4ECDC4',
  Walk: '#95E1D3',
  Hike: '#A8D8A8',
  WeightTraining: '#C77DFF',
}

const DEFAULT_BAR_COLOR = '#B8B8B8'

const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const INTENSITY_OPTIONS: { value: WorkoutIntensity; label: string }[] = [
  { value: 'recovery', label: 'Recovery' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'push', label: 'Push It' },
  { value: 'max', label: 'Max Effort' },
]


interface ActivityBarChartProps {
  activities: StravaActivity[]
  onSelect: (activity: StravaActivity) => void
}

function ActivityBarChart({ activities, onSelect }: ActivityBarChartProps) {
  const BAR_WIDTH = 28.2
  const BAR_GAP = 2
  const CHART_WIDTH = 300
  const CHART_HEIGHT = 80
  const MAX_BAR_HEIGHT = 60
  const LABEL_HEIGHT = 20

  const values = activities.map((a) => a.suffer_score ?? a.moving_time / 60)
  const maxVal = Math.max(...values, 1)

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      style={{ width: '100%', maxWidth: CHART_WIDTH, display: 'block' }}
      aria-label="Recent workout activity chart"
    >
      {activities.map((activity, i) => {
        const val = activity.suffer_score ?? activity.moving_time / 60
        const barHeight = Math.max(2, (val / maxVal) * MAX_BAR_HEIGHT)
        const x = i * (BAR_WIDTH + BAR_GAP)
        const y = CHART_HEIGHT - LABEL_HEIGHT - barHeight
        const color = SPORT_COLORS[activity.sport_type] ?? DEFAULT_BAR_COLOR
        const day = DAY_ABBRS[new Date(activity.start_date).getDay()] ?? ''
        const durationMin = Math.round(activity.moving_time / 60)

        return (
          <g key={activity.id} onClick={() => onSelect(activity)} style={{ cursor: 'pointer' }}>
            <rect
              x={x}
              y={y}
              width={BAR_WIDTH}
              height={barHeight}
              fill={color}
              rx={3}
              opacity={0.85}
            >
              <title>{activity.name} — {durationMin} min</title>
            </rect>
            <text
              x={x + BAR_WIDTH / 2}
              y={CHART_HEIGHT - 2}
              textAnchor="middle"
              fontSize={6}
              fill="#b0b0a8"
            >
              {day}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDistance(meters: number): string {
  if (meters === 0) return '—'
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

interface ActivityDetailProps {
  activity: StravaActivity
  onClose: () => void
}

function ActivityDetail({ activity, onClose }: ActivityDetailProps) {
  const color = SPORT_COLORS[activity.sport_type] ?? DEFAULT_BAR_COLOR
  const stats: { label: string; value: string }[] = [
    { label: 'Duration', value: formatDuration(activity.moving_time) },
    { label: 'Distance', value: formatDistance(activity.distance) },
    { label: 'Elevation', value: `${Math.round(activity.total_elevation_gain)}m` },
  ]
  if (activity.average_heartrate) {
    stats.push({ label: 'Avg HR', value: `${Math.round(activity.average_heartrate)} bpm` })
  }
  if (activity.suffer_score) {
    stats.push({ label: 'Suffer', value: String(activity.suffer_score) })
  }

  return (
    <div style={{
      background: color,
      borderRadius: 10,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>
            {activity.name}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
            {activity.sport_type} · {formatDate(activity.start_date)}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.65)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: '0 0 0 8px',
            fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {stats.map((s) => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {s.label}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.95)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.50)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.18)',
  border: '1px solid rgba(255,255,255,0.28)',
  borderRadius: 10,
  padding: '7px 10px',
  fontSize: 12,
  color: 'white',
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const,
}



export default function WorkoutWidget({
  onStreamStart,
  onFirstChunk,
  onChunk,
  onError,
}: WorkoutWidgetProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading')
  const [activities, setActivities] = useState<StravaActivity[]>([])
  const [activityProfile, setActivityProfile] = useState<ActivityProfile | null>(null)
  const [selectedActivity, setSelectedActivity] = useState<StravaActivity | null>(null)
  const [activityText, setActivityText] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [intensity, setIntensity] = useState<WorkoutIntensity | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/strava/activities')
      .then(async (res) => {
        if (res.status === 401) {
          setConnectionState('not-connected')
          return
        }
        if (!res.ok) {
          setConnectionState('not-connected')
          return
        }
        const data: StravaActivity[] = await res.json()
        setActivities(data)
        setActivityProfile(buildActivityProfile(data))
        setConnectionState('connected')
      })
      .catch(() => {
        setConnectionState('not-connected')
      })
  }, [])

  async function handleDisconnect() {
    await fetch('/api/strava/disconnect', { method: 'POST' })
    window.location.reload()
  }

  async function handleGenerate() {
    if (!activityText.trim()) {
      setError('Please describe your workout')
      return
    }
    if (!durationMinutes || durationMinutes < 5) {
      setError('Duration must be at least 5 minutes')
      return
    }
    if (!activityProfile) {
      setError('Activity profile not loaded')
      return
    }

    setLoading(true)
    setError(null)
    onStreamStart()

    try {
      const res = await fetch('/api/ai/workout-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: activityText,
          durationMinutes,
          intensity,
          activityProfile,
        }),
      })

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error((errData as { error?: string }).error ?? `HTTP ${res.status}`)
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
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      onError(msg)
    } finally {
      setLoading(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    flex: 1,
    background: 'transparent',
    padding: '20px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
  }

  if (connectionState === 'loading') {
    return (
      <div style={cardStyle}>
        <span style={labelStyle}>Workout Mode</span>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0 }}>Loading activity data...</p>
      </div>
    )
  }

  if (connectionState === 'not-connected') {
    return (
      <div style={cardStyle}>
        <span style={labelStyle}>Workout Mode</span>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', margin: 0 }}>
          Connect your Strava to generate playlists for your workouts
        </p>
        <a
          href="/api/auth/strava"
          style={{
            background: '#FC4C02',
            color: '#fff',
            borderRadius: 50,
            padding: '9px 18px',
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 500,
            alignSelf: 'flex-start',
          }}
        >
          Connect Strava
        </a>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={labelStyle}>Workout Mode</span>
        <button
          onClick={() => { handleDisconnect().catch(() => {}) }}
          style={{
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.22)',
            borderRadius: 100,
            padding: '4px 10px',
            fontSize: 10,
            color: 'rgba(255,255,255,0.60)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Disconnect
        </button>
      </div>

      {/* Powered by Strava */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#FC4C02">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
        </svg>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.04em' }}>
          Powered by Strava
        </span>
      </div>

      {/* Recent Activity */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...sectionLabelStyle, color: 'rgba(255,255,255,0.95)' }}>Recent Activity</span>
        {activities.length > 0 ? (
          selectedActivity ? (
            <ActivityDetail activity={selectedActivity} onClose={() => setSelectedActivity(null)} />
          ) : (
            <>
              <ActivityBarChart activities={activities} onSelect={setSelectedActivity} />
              <p style={{ fontSize: 11, color: '#7D5266', margin: 0 }}>
                Avg intensity: {activityProfile?.avgIntensity ?? '—'}
                {' • '}
                Most common: {activityProfile?.mostCommonType ?? '—'}
                {' • '}
                Last workout: {activityProfile?.lastActivityDaysAgo ?? 0} days ago
              </p>
            </>
          )
        ) : (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: 0 }}>No recent activities found</p>
        )}
      </div>

      {/* Activity */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...sectionLabelStyle, color: 'rgba(255,255,255,0.95)' }}>Activity</span>
        <input
          style={inputStyle}
          placeholder="e.g. 45 min trail run, feeling strong"
          value={activityText}
          onChange={(e) => setActivityText(e.target.value)}
        />
      </div>

      {/* Duration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.10em', color: 'rgba(255,255,255,0.95)', textTransform: 'uppercase' as const, marginBottom: 4 }}>
          Duration
        </div>
        <input
          style={inputStyle}
          type="number"
          placeholder="minutes"
          min={5}
          max={240}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
        />
      </div>

      {/* Intensity selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...sectionLabelStyle, color: 'rgba(255,255,255,0.95)' }}>Intensity</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {INTENSITY_OPTIONS.map((opt) => {
            const sel = intensity === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setIntensity(opt.value)}
                style={{
                  padding: '4px 8px',
                  fontSize: 10,
                  background: sel ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.18)',
                  border: sel ? '1px solid rgba(255,255,255,0.65)' : '1px solid rgba(255,255,255,0.28)',
                  borderRadius: 100,
                  color: sel ? '#2C1810' : 'rgba(255,255,255,0.80)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: 'none',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={() => { handleGenerate().catch(() => {}) }}
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
          letterSpacing: '0.02em',
        }}
      >
        {loading ? 'Generating...' : 'Generate Workout Playlist →'}
      </button>

      {error && (
        <p style={{ fontSize: 11, color: '#ffb3b3', margin: 0 }}>{error}</p>
      )}
    </div>
  )
}

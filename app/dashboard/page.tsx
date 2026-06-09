'use client'

import { useState, useEffect, useRef } from 'react'
import { Figtree } from 'next/font/google'
import type { SpotifyTrack } from '@/types/spotify'
import { initQueue, enqueue, resetQueue } from '@/lib/queue-manager'
import { initPlayer } from '@/lib/spotify-player'
import PlayingView from '@/components/PlayingView'
import WorkoutWidget from '@/components/WorkoutWidget'
import type { StreamChunk as WorkoutStreamChunk } from '@/components/WorkoutWidget'
import FocusWidget from '@/components/FocusWidget'
import type { StreamChunk as FocusStreamChunk } from '@/components/FocusWidget'
import BreathingWidget from '@/components/BreathingWidget'
import type { StreamChunk as BreathingStreamChunk } from '@/components/BreathingWidget'
import type { BreathingConfig, FocusConfig } from '@/types/session'

const figtree = Figtree({ subsets: ['latin'], weight: ['300', '400', '500'] })

interface VisualWorld {
  colorPalette: string[]
  motionStyle: string
  intensity: number
  atmosphere: string
  shapeLanguage: string
}

type TrackSource = 'liked' | 'recommended' | 'discovery'

interface StreamChunk {
  track: SpotifyTrack & { source?: TrackSource }
  visualWorld: VisualWorld
  isFirst: boolean
  playlistName?: string
  mood?: string
  arc?: string
  error?: string
}

const cardBase: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.45)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255, 255, 255, 0.65)',
  borderRadius: 24,
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
  padding: 28,
  overflow: 'hidden',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  boxSizing: 'border-box',
}


function GlowOrb() {
  return (
    <div style={{
      position: 'absolute',
      width: 200,
      height: 200,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 70%)',
      top: -40,
      right: -40,
      filter: 'blur(20px)',
      pointerEvents: 'none',
    }} />
  )
}

async function* streamPlaylist(
  type: 'checkin' | 'mood' | 'activity',
  context: object,
): AsyncGenerator<StreamChunk> {
  const res = await fetch('/api/ai/stream-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, query: '', context }),
  })
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      const chunk = JSON.parse(line) as StreamChunk
      if (chunk.error) throw new Error(chunk.error)
      yield chunk
    }
  }
}


export default function Dashboard() {
  const [playing, setPlaying] = useState(false)
  const [vibeDescription, setVibeDescription] = useState('')

  // Profile
  const [firstName, setFirstName] = useState('there')
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [spotifyUserId, setSpotifyUserId] = useState('')

  // Mood right now
  const [rightNowMood, setRightNowMood] = useState('')
  const [energyLevel, setEnergyLevel] = useState<number | null>(null)
  const [moodLoading, setMoodLoading] = useState(false)

  // Activity
  const [activity, setActivity] = useState('')
  const [actLoading, setActLoading] = useState(false)

  // Breathing mode
  const [breathingMode, setBreathingMode] = useState(false)

  // Session overlays
  const [sessionType, setSessionType] = useState<'breathing' | 'focus' | null>(null)
  const [sessionConfig, setSessionConfig] = useState<BreathingConfig | FocusConfig | null>(null)

  // Last played track for continuation
  const [lastPlayed, setLastPlayed] = useState<{
    track: { id: string; name: string; uri: string; artists: { name: string }[]; album: { images: { url: string }[] } }
    played_at: string
  } | null>(null)

  const playerReady = useRef(false)

  useEffect(() => {
    if (playerReady.current) return
    playerReady.current = true
    initPlayer().catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/spotify/last-played')
      .then((r) => r.json())
      .then((data) => { if (data.track) setLastPlayed(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/spotify/me')
      .then((r) => r.json())
      .then((data: { id?: string; display_name?: string; images?: { url: string }[] }) => {
        if (data.display_name) {
          setFirstName(data.display_name.split(' ')[0] ?? data.display_name)
        }
        if (data.images?.[0]?.url) setProfileImage(data.images[0].url)
        if (data.id) setSpotifyUserId(data.id)
      })
      .catch(() => {})
  }, [])

  async function startStream(
    type: 'checkin' | 'mood' | 'activity',
    context: object,
    setLoading: (v: boolean) => void,
    setError: (v: string | null) => void,
  ) {
    setLoading(true)
    setError(null)
    resetQueue()
    setBreathingMode(false)
    setPlaying(true)
    let firstChunk = true
    try {
      for await (const chunk of streamPlaylist(type, context)) {
        if (firstChunk) {
          firstChunk = false
          setVibeDescription(`${chunk.visualWorld?.atmosphere ?? ''} — ${chunk.arc ?? ''}`)
          initQueue(chunk.track, { type, context }, {
            visualWorld: chunk.visualWorld,
            playlistName: chunk.playlistName ?? '',
            mood: chunk.mood ?? '',
          })
        } else {
          enqueue(chunk.track)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (playing) {
    return (
      <PlayingView
        onBack={() => { setPlaying(false); setBreathingMode(false); setSessionType(null); setSessionConfig(null) }}
        vibeDescription={vibeDescription}
        breathingMode={breathingMode}
        sessionType={sessionType}
        sessionConfig={sessionConfig}
      />
    )
  }

  const ff = figtree.style.fontFamily

  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  async function handleContinuation() {
    if (!lastPlayed) return
    setPlaying(true)
    resetQueue()

    const seedTrack = {
      id: lastPlayed.track.id,
      name: lastPlayed.track.name,
      artist: lastPlayed.track.artists[0]?.name ?? '',
      uri: lastPlayed.track.uri,
    }

    try {
      const response = await fetch('/api/ai/continuation-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedTrack }),
      })
      if (!response.body) return

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let isFirst = true
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue
          try {
            const chunk = JSON.parse(line) as { track?: { id: string; name: string; uri: string; artists: { name: string }[] }; visualWorld?: { colorPalette: string[]; motionStyle: string; intensity: number; atmosphere: string; shapeLanguage: string }; playlistName?: string; mood?: string; arc?: string }
            if (chunk.track) {
              if (isFirst) {
                setVibeDescription(`${chunk.visualWorld?.atmosphere ?? ''} — ${chunk.arc ?? ''}`)
                initQueue(
                  chunk.track as Parameters<typeof initQueue>[0],
                  { type: 'activity', context: { activity: 'continuation' } },
                  {
                    visualWorld: chunk.visualWorld ?? { colorPalette: [], motionStyle: 'fluid', intensity: 0.5, atmosphere: '', shapeLanguage: 'flowing' },
                    playlistName: chunk.playlistName ?? '',
                    mood: chunk.mood ?? '',
                  },
                )
                isFirst = false
              } else {
                enqueue(chunk.track as Parameters<typeof enqueue>[0])
              }
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setPlaying(false)
    }
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      backgroundImage: `url('/dashboard-bg.jpg')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      padding: 24,
      gap: 20,
      boxSizing: 'border-box',
      fontFamily: ff,
    }}>

      {/* Grain overlay */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%', height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.045,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
        backgroundSize: '128px 128px',
      }} />

      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: '56px',
        marginBottom: '16px',
        width: '100%',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 1,
      }}>
        <span style={{ fontFamily: ff, fontWeight: 200, fontSize: '20px', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.08em' }}>
          Wavelength
        </span>

<a
          href={spotifyUserId ? `https://open.spotify.com/user/${spotifyUserId}` : '#'}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 16px 9px 10px',
            background: 'rgba(255,255,255,0.30)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.50)',
            borderRadius: '100px',
            textDecoration: 'none',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, borderRadius: '100px', boxShadow: 'inset 0 0 18px 4px rgba(255,60,140,0.18), inset 0 0 6px 1px rgba(255,60,140,0.10)', pointerEvents: 'none' }} />
          {profileImage && (
            <img src={profileImage} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', position: 'relative', zIndex: 1 }} />
          )}
          <span style={{ fontFamily: ff, fontWeight: 300, fontSize: '13px', color: 'rgba(255,255,255,0.90)', position: 'relative', zIndex: 1 }}>
            {firstName.toLowerCase()}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.80)" style={{ position: 'relative', zIndex: 1 }}>
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
        </a>
      </header>

      {/* Bento grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 0.9fr 1.1fr 0.8fr',
        gridTemplateRows: '1fr 1fr 1fr',
        gap: 14,
        height: 'calc(100vh - 100px)',
        gridTemplateAreas: `
          'today    today    activity  breathing'
          'rightnow workout  activity  breathing'
          'rightnow workout  focus     focus    '
        `,
      }}>

        {/* Card 1 — Today */}
        <div style={{ ...cardBase, gridArea: 'today', flexDirection: 'row', alignItems: 'stretch', gap: 16 }}>
          <GlowOrb />

          {/* Left side */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
            <h2 style={{
              fontFamily: ff,
              fontWeight: 500,
              fontSize: 'clamp(26px, 2.6vw, 38px)',
              color: 'rgba(255,255,255,0.95)',
              margin: 0,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              textTransform: 'capitalize',
            }}>
              Good {timeOfDay},<br />{firstName}
            </h2>
            <div style={{ flex: 1 }} />
            <button
              onClick={handleContinuation}
              disabled={!lastPlayed}
              style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.90)', borderRadius: 100, color: '#2C1810', fontWeight: 500, fontSize: 12, padding: '9px 20px', alignSelf: 'flex-start', cursor: lastPlayed ? 'pointer' : 'default', fontFamily: ff, opacity: lastPlayed ? 1 : 0.4 }}
            >
              {lastPlayed ? 'Pick up where you left off →' : 'Pick up where you left off →'}
            </button>
          </div>

          {/* Right side — album art + track info */}
          {lastPlayed && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 8, minWidth: 120 }}>
              {lastPlayed.track.album.images[0]?.url && (
                <img
                  src={lastPlayed.track.album.images[0].url}
                  alt={lastPlayed.track.name}
                  style={{ width: 90, height: 90, borderRadius: 12, objectFit: 'cover', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
                />
              )}
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: ff, fontWeight: 400, fontSize: 12, color: '#1a1a1a', margin: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lastPlayed.track.name}
                </p>
                <p style={{ fontFamily: ff, fontWeight: 300, fontSize: 11, color: 'rgba(0,0,0,0.50)', margin: '2px 0 0 0' }}>
                  {lastPlayed.track.artists[0]?.name}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Card 2 — Right Now (now holds WorkoutWidget) */}
        <div style={{ ...cardBase, gridArea: 'rightnow', padding: 0 }}>
          <GlowOrb />
          <WorkoutWidget
            onStreamStart={() => { setBreathingMode(false); resetQueue(); setPlaying(true) }}
            onFirstChunk={(chunk: WorkoutStreamChunk) => {
              setVibeDescription(`${chunk.visualWorld?.atmosphere ?? ''} — ${chunk.arc ?? ''}`)
              initQueue(chunk.track, { type: 'activity', context: { activity: 'workout' } }, {
                visualWorld: chunk.visualWorld,
                playlistName: chunk.playlistName ?? '',
                mood: chunk.mood ?? '',
              })
            }}
            onChunk={(chunk: WorkoutStreamChunk) => { enqueue(chunk.track) }}
            onError={() => setPlaying(false)}
          />
        </div>

        {/* Card 3 — Activity (now holds BreathingWidget) */}
        <div style={{ ...cardBase, gridArea: 'activity', padding: 0 }}>
          <GlowOrb />
          <BreathingWidget
            onStreamStart={(config) => {
              setBreathingMode(true)
              setSessionType('breathing')
              setSessionConfig(config)
              resetQueue()
              setPlaying(true)
            }}
            onFirstChunk={(chunk: BreathingStreamChunk) => {
              setVibeDescription(`${chunk.visualWorld?.atmosphere ?? ''} — ${chunk.arc ?? ''}`)
              initQueue(chunk.track, { type: 'activity', context: { activity: 'meditation' } }, {
                visualWorld: chunk.visualWorld,
                playlistName: chunk.playlistName ?? '',
                mood: chunk.mood ?? '',
              })
            }}
            onChunk={(chunk: BreathingStreamChunk) => { enqueue(chunk.track) }}
            onError={() => { setPlaying(false); setBreathingMode(false) }}
          />
        </div>

        {/* Card 4 — Workout (now holds Right Now form) */}
        <div style={{ ...cardBase, gridArea: 'workout' }}>
          <GlowOrb />
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>

            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.95)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, fontFamily: ff }}>
              How are you feeling right now?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.95)', letterSpacing: '0.10em', textTransform: 'uppercase' as const, fontFamily: ff }}>Mood</div>
              <input
                type="text"
                placeholder="e.g. calm, excited, tranquil"
                value={rightNowMood}
                onChange={(e) => setRightNowMood(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 12, padding: '8px 12px', fontSize: 13, color: 'white', fontFamily: ff, outline: 'none', width: '100%', boxSizing: 'border-box' as const }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.95)', letterSpacing: '0.10em', textTransform: 'uppercase' as const, fontFamily: ff }}>Energy</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => (
                    <button
                      key={value}
                      onClick={() => setEnergyLevel(value)}
                      style={{
                        width: 10, height: 10, borderRadius: '50%', border: 'none',
                        background: energyLevel === value ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.55)',
                        cursor: 'pointer', padding: 0, flexShrink: 0,
                        transition: 'all 0.2s ease',
                        boxShadow: energyLevel === value ? '0 0 8px 3px rgba(255,255,255,0.55)' : 'none',
                        transform: energyLevel === value ? 'scale(1.25)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
                {energyLevel !== null && (
                  <span style={{ fontFamily: ff, fontSize: 12, fontWeight: 400, color: 'rgba(220,60,160,0.85)', marginLeft: 4, minWidth: 36 }}>
                    {energyLevel}%
                  </span>
                )}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 60 }}>
              <svg viewBox="0 0 100 90" fill="none" stroke="rgba(255,255,255,0.40)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 140, height: 126 }}>
                {/* Center petal */}
                <path d="M50,72 C36,60 36,36 50,14 C64,36 64,60 50,72 Z" />
                {/* Inner left petal */}
                <path d="M50,72 C36,66 18,50 20,32 C22,16 36,14 44,28 C48,38 50,56 50,70" />
                {/* Inner right petal */}
                <path d="M50,72 C64,66 82,50 80,32 C78,16 64,14 56,28 C52,38 50,56 50,70" />
                {/* Outer left petal */}
                <path d="M47,72 C28,70 8,56 8,40 C8,24 20,20 30,28 C37,34 44,52 46,70" />
                {/* Outer right petal */}
                <path d="M53,72 C72,70 92,56 92,40 C92,24 80,20 70,28 C63,34 56,52 54,70" />
                {/* Left leaf */}
                <path d="M50,74 C42,78 24,84 14,80 C12,76 16,70 26,70 C36,70 46,72 50,74 Z" />
                {/* Left leaf midrib */}
                <path d="M50,74 C36,74 22,76 14,80" />
                {/* Right leaf */}
                <path d="M50,74 C58,78 76,84 86,80 C88,76 84,70 74,70 C64,70 54,72 50,74 Z" />
                {/* Right leaf midrib */}
                <path d="M50,74 C64,74 78,76 86,80" />
              </svg>
            </div>

            <button
              onClick={() => {
                if (!rightNowMood.trim()) return
                setBreathingMode(false)
                resetQueue()
                setPlaying(true)
                setMoodLoading(true)
                startStream('mood', { emotion: rightNowMood, energy: (energyLevel ?? 50) / 100 }, setMoodLoading, () => {})
                  .catch(() => {})
              }}
              disabled={moodLoading}
              style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.90)', borderRadius: 100, color: '#2C1810', fontWeight: 500, fontSize: 12, padding: '11px', width: '100%', cursor: 'pointer', fontFamily: ff }}
            >
              {moodLoading ? 'Generating…' : 'Play this mood →'}
            </button>
          </div>
        </div>

        {/* Card 5 — Focus */}
        <div style={{ ...cardBase, gridArea: 'focus', padding: 0 }}>
          <GlowOrb />
          <FocusWidget
            onStreamStart={(config) => { setBreathingMode(false); setSessionType('focus'); setSessionConfig(config); resetQueue(); setPlaying(true) }}
            onFirstChunk={(chunk: FocusStreamChunk) => {
              setVibeDescription(`${chunk.visualWorld?.atmosphere ?? ''} — ${chunk.arc ?? ''}`)
              initQueue(chunk.track, { type: 'activity', context: { activity: 'focus session' } }, {
                visualWorld: chunk.visualWorld,
                playlistName: chunk.playlistName ?? '',
                mood: chunk.mood ?? '',
              })
            }}
            onChunk={(chunk: FocusStreamChunk) => { enqueue(chunk.track) }}
            onError={() => setPlaying(false)}
          />
        </div>

        {/* Card 6 — Breathing slot (now holds Activity form) */}
        <div style={{ ...cardBase, gridArea: 'breathing' }}>
          <GlowOrb />
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>

            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.95)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, fontFamily: ff }}>
              Activity
            </div>

            <p style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 12, color: 'rgba(255,255,255,0.92)', margin: 0, lineHeight: 1.5, fontWeight: 400 }}>
              Give a description of your current task to curate its defining sound
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.95)', letterSpacing: '0.10em', textTransform: 'uppercase' as const, fontFamily: ff }}>What are you doing?</div>
              <input
                type="text"
                placeholder="I'm..."
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 12, padding: '8px 12px', fontSize: 13, color: 'white', fontFamily: ff, outline: 'none', width: '100%', boxSizing: 'border-box' as const }}
              />
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 60 }}>
              <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle at 40% 40%, rgba(20,140,120,0.55) 0%, rgba(255,60,140,0.35) 45%, rgba(255,100,20,0.25) 70%, rgba(255,100,20,0) 100%)', filter: 'blur(22px)', animation: 'orbPulse 6s ease-in-out infinite' }} />
              <div style={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, rgba(45,200,170,0.65) 0%, rgba(255,60,140,0.45) 50%, rgba(255,120,30,0.35) 80%, transparent 100%)', filter: 'blur(12px)', animation: 'orbPulse 6s ease-in-out infinite reverse' }} />
            </div>

            <button
              onClick={() => {
                if (!activity.trim()) return
                setBreathingMode(false)
                resetQueue()
                setPlaying(true)
                startStream('activity', { activity }, setActLoading, () => {}).catch(() => {})
              }}
              disabled={actLoading}
              style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.90)', borderRadius: 100, color: '#2C1810', fontWeight: 500, fontSize: 12, padding: '11px', width: '100%', cursor: 'pointer', fontFamily: ff }}
            >
              {actLoading ? 'Generating…' : 'Find my sound →'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

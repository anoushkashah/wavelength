// Spotify Web Playback SDK wrapper — client-side only.
// Import only in 'use client' components.

declare global {
  interface Window {
    Spotify: typeof SpotifySDK
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

declare namespace SpotifySDK {
  interface PlayerOptions {
    name: string
    getOAuthToken: (cb: (token: string) => void) => void
    volume?: number
  }

  interface WebPlaybackTrack {
    id: string
    uri: string
    name: string
    duration_ms: number
    artists: { name: string }[]
    album: { name: string; images: { url: string }[] }
  }

  interface PlaybackState {
    paused: boolean
    position: number
    duration: number
    track_window: { current_track: WebPlaybackTrack; next_tracks: WebPlaybackTrack[] }
  }

  class Player {
    constructor(options: PlayerOptions)
    connect(): Promise<boolean>
    disconnect(): void
    addListener(event: 'ready', cb: (data: { device_id: string }) => void): boolean
    addListener(event: 'not_ready', cb: (data: { device_id: string }) => void): boolean
    addListener(event: 'player_state_changed', cb: (state: PlaybackState | null) => void): boolean
    addListener(event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error', cb: (data: { message: string }) => void): boolean
    removeListener(event: string): boolean
    pause(): Promise<void>
    resume(): Promise<void>
    nextTrack(): Promise<void>
    previousTrack(): Promise<void>
    seek(positionMs: number): Promise<void>
    getCurrentState(): Promise<PlaybackState | null>
    setVolume(volume: number): Promise<void>
  }
}

let player: SpotifySDK.Player | null = null
let deviceId: string | null = null
let trackEndCallback: (() => void) | null = null
let lastTrackUri: string | null = null
let wasPlaying = false

function loadSDKScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Not in browser'))

    // SDK already loaded
    if (window.Spotify) {
      resolve()
      return
    }

    // Script already injected, waiting for ready callback
    if (document.getElementById('spotify-sdk-script')) {
      const orig = window.onSpotifyWebPlaybackSDKReady
      window.onSpotifyWebPlaybackSDKReady = () => {
        orig?.()
        resolve()
      }
      return
    }

    window.onSpotifyWebPlaybackSDKReady = resolve

    const script = document.createElement('script')
    script.id = 'spotify-sdk-script'
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.onerror = () => reject(new Error('Failed to load Spotify SDK'))
    document.head.appendChild(script)
  })
}

async function fetchToken(): Promise<string> {
  const res = await fetch('/api/spotify/token')
  if (!res.ok) throw new Error('Failed to fetch Spotify token')
  const { accessToken } = await res.json()
  return accessToken
}

export async function initPlayer(onReady?: (deviceId: string) => void): Promise<void> {
  await loadSDKScript()

  if (player) return // already initialized

  player = new window.Spotify.Player({
    name: 'Wavelength',
    getOAuthToken: (cb) => {
      fetchToken().then(cb).catch(() => cb(''))
    },
    volume: 0.8,
  })

  player.addListener('ready', ({ device_id }) => {
    deviceId = device_id
    onReady?.(device_id)
  })

  player.addListener('not_ready', () => {
    deviceId = null
  })

  player.addListener('player_state_changed', (state) => {
    if (!state) return
    const uri = state.track_window.current_track.uri

    if (!state.paused) {
      wasPlaying = true
      lastTrackUri = uri
      return
    }

    // Was playing, now paused — detect why
    if (wasPlaying) {
      wasPlaying = false
      const atEnd = state.duration > 0 && state.position >= state.duration - 2000
      const trackChanged = lastTrackUri !== null && uri !== lastTrackUri
      if (atEnd || trackChanged) {
        lastTrackUri = uri
        trackEndCallback?.()
      }
      return
    }

    lastTrackUri = uri
  })

  player.addListener('initialization_error', ({ message }) => {
    console.error('Spotify SDK init error:', message)
  })
  player.addListener('authentication_error', ({ message }) => {
    console.error('Spotify SDK auth error:', message)
  })
  player.addListener('account_error', ({ message }) => {
    console.error('Spotify SDK account error:', message)
  })

  await player.connect()
}

export async function playTrack(uri: string): Promise<void> {
  if (!deviceId) throw new Error('Spotify player not ready — no device ID')

  const res = await fetch('/api/spotify/playback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uri, device_id: deviceId }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Playback failed' }))
    throw new Error(err.error ?? 'Playback failed')
  }

  lastTrackUri = uri
}

export async function pausePlayer(): Promise<void> {
  if (!player) throw new Error('Player not initialized')
  await player.pause()
}

export async function resumePlayer(): Promise<void> {
  if (!player) throw new Error('Player not initialized')
  await player.resume()
}

export async function getPlayerState(): Promise<SpotifySDK.PlaybackState | null> {
  if (!player) return null
  return player.getCurrentState()
}

export function onTrackEnd(cb: () => void): void {
  trackEndCallback = cb
}

export function getDeviceId(): string | null {
  return deviceId
}

export async function previousTrack(): Promise<void> {
  if (!player) throw new Error('Player not initialized')
  await player.previousTrack()
}

export async function togglePlay(): Promise<void> {
  if (!player) throw new Error('Player not initialized')
  const state = await player.getCurrentState()
  if (!state) return
  if (state.paused) {
    await player.resume()
  } else {
    await player.pause()
  }
}

// Called after queue-manager's skipToNext() has already queued the next track.
// Provides a direct SDK-level skip as a best-effort signal.
export async function nextTrack(): Promise<void> {
  if (!player) return
  await player.nextTrack().catch(() => {})
}

export function disconnectPlayer(): void {
  player?.disconnect()
  player = null
  deviceId = null
  wasPlaying = false
  lastTrackUri = null
}

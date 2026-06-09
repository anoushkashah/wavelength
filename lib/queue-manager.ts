import type { SpotifyTrack } from '@/types/spotify'
import type { TrackSource } from '@/app/api/ai/stream-playlist/route'

export type QueueTrack = SpotifyTrack & { source?: TrackSource }

interface VisualWorld {
  colorPalette: string[]
  motionStyle: string
  intensity: number
  atmosphere: string
  shapeLanguage: string
  backgroundType?: 'dark' | 'light'
}

export interface QueueState {
  currentTrack: QueueTrack | null
  queue: QueueTrack[]
  isLoading: boolean
  visualWorld: VisualWorld | null
  playlistName: string
  mood: string
}

// ---------- module-level singleton ----------

const state: QueueState = {
  currentTrack: null,
  queue: [],
  isLoading: false,
  visualWorld: null,
  playlistName: '',
  mood: '',
}

const playedIds = new Set<string>()
let savedQuery: { type: string; context: object } | null = null
const listeners = new Set<(s: QueueState) => void>()
let isRefetching = false

// ---------- internal helpers ----------

function snapshot(): QueueState {
  return {
    currentTrack: state.currentTrack,
    queue: [...state.queue],
    isLoading: state.isLoading,
    visualWorld: state.visualWorld,
    playlistName: state.playlistName,
    mood: state.mood,
  }
}

function emit(): void {
  const s = snapshot()
  listeners.forEach((cb) => cb(s))
}

async function advance(): Promise<void> {
  const next = state.queue.shift()
  if (!next) {
    state.currentTrack = null
    state.isLoading = true
    emit()
    return
  }

  state.currentTrack = next
  state.isLoading = false
  emit()

  try {
    const { playTrack } = await import('./spotify-player')
    await playTrack(next.uri)
  } catch (e) {
    console.error('[queue-manager] playback error:', e)
  }

  if (state.queue.length < 10 && savedQuery && !isRefetching) {
    refetch().catch(console.error)
  }
}

async function refetch(): Promise<void> {
  if (!savedQuery || isRefetching) return
  isRefetching = true

  try {
    const res = await fetch('/api/ai/stream-playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...savedQuery, query: '' }),
    })
    if (!res.ok || !res.body) return

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
        try {
          const chunk = JSON.parse(line) as { track?: QueueTrack }
          if (chunk.track?.id) enqueue(chunk.track)
        } catch {
          // skip malformed
        }
      }
    }
  } catch {
    // silently ignore refetch errors
  } finally {
    isRefetching = false
  }
}

// ---------- public API ----------

export function resetQueue(): void {
  state.currentTrack = null
  state.queue = []
  state.isLoading = true
  state.visualWorld = null
  state.playlistName = ''
  state.mood = ''
  playedIds.clear()
  savedQuery = null
  isRefetching = false
  emit()
}

export function onQueueUpdate(cb: (s: QueueState) => void): () => void {
  listeners.add(cb)
  cb(snapshot())
  return () => {
    listeners.delete(cb)
  }
}

export function getQueue(): QueueState {
  return snapshot()
}

export function enqueue(track: QueueTrack): void {
  if (!track.id || playedIds.has(track.id)) return
  playedIds.add(track.id)
  state.queue.push(track)
  emit()
}

export function initQueue(
  firstTrack: QueueTrack,
  query: { type: 'checkin' | 'mood' | 'activity'; context: object },
  meta: { visualWorld: VisualWorld; playlistName: string; mood: string },
): void {
  // Synchronous reset — expose the first track immediately so the UI renders
  // and the Visualizer can start without waiting for any async work.
  state.currentTrack = firstTrack
  state.queue = []
  state.isLoading = false
  state.visualWorld = meta.visualWorld
  state.playlistName = meta.playlistName
  state.mood = meta.mood
  playedIds.clear()
  if (firstTrack.id) playedIds.add(firstTrack.id)
  savedQuery = query
  isRefetching = false
  emit()

  // Start playback immediately — single dynamic import, no intermediate advance().
  // onTrackEnd is registered before playTrack to avoid any race on very short tracks.
  ;(async () => {
    const { playTrack, onTrackEnd } = await import('./spotify-player')
    onTrackEnd(() => { advance().catch(console.error) })
    await playTrack(firstTrack.uri)
  })().catch(console.error)
}

export async function skipToNext(): Promise<void> {
  await advance()
  await new Promise((resolve) => setTimeout(resolve, 300))
  const { resumePlayer } = await import('./spotify-player')
  await resumePlayer().catch(console.error)
}

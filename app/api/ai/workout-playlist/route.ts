import { type NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSpotifyToken } from '@/lib/spotify-auth'
import { fetchLikedTracks } from '@/lib/spotify-data'
import { getMoodPalette } from '@/lib/color-palettes'
import type { SpotifyTrack } from '@/types/spotify'
import type { ActivityProfile, WorkoutIntensity } from '@/types/strava'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

interface VisualWorld {
  colorPalette: string[]
  motionStyle: string
  intensity: number
  atmosphere: string
  shapeLanguage: string
  backgroundType?: 'dark' | 'light'
}

interface DiscoveryTrack {
  title: string
  artist: string
}

interface MetaLine {
  playlistName: string
  mood: string
  arc: string
  visualWorld: VisualWorld
  discoveryTracks?: DiscoveryTrack[]
}

export type TrackSource = 'liked' | 'recommended' | 'discovery'

interface StreamChunk {
  track: SpotifyTrack & { source: TrackSource }
  visualWorld: VisualWorld
  isFirst: boolean
  playlistName?: string
  mood?: string
  arc?: string
}

interface RequestBody {
  activity: string
  durationMinutes: number
  intensity: WorkoutIntensity
  activityProfile: ActivityProfile
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function formatTrackList(tracks: SpotifyTrack[], label: string): string {
  if (tracks.length === 0) return ''
  return `${label} (${tracks.length}):\n${tracks
    .map((t) => `${t.name} — ${t.artists.map((a) => a.name).join(', ')} [id:${t.id}][uri:${t.uri}]`)
    .join('\n')}`
}

function buildSystemPrompt(
  activity: string,
  durationMinutes: number,
  intensity: WorkoutIntensity,
  songsNeeded: number,
  activityProfile: ActivityProfile,
): string {
  const activityProfileSummary = `${activityProfile.totalActivities} recent activities, mostly ${activityProfile.mostCommonType}, avg ${Math.round(activityProfile.avgDuration)} min, avg intensity ${activityProfile.avgIntensity}, last workout ${activityProfile.lastActivityDaysAgo} days ago`

  return `You are a world-class workout music curator. You understand how music drives physical performance.

Your job: create a perfectly timed playlist for a specific workout.

WORKOUT CONTEXT:
- Activity: ${activity}
- Duration: ${durationMinutes} minutes
- Songs needed: ${songsNeeded} songs (avg 3.5 min each)
- Intensity goal: ${intensity}
- Athlete profile: ${activityProfileSummary}

INTENSITY GUIDE:
Recovery: BPM 100-130, energy 0.2-0.4, gentle and sustainable
Moderate: BPM 130-155, energy 0.4-0.65, steady and focused
Push It: BPM 155-175, energy 0.65-0.8, challenging and driving
Max Effort: BPM 175-195, energy 0.8-1.0, explosive and relentless

PLAYLIST ARC BY INTENSITY:

Recovery:
- All songs: consistent low energy, no peaks, conversational pace
- Mood: relaxed, enjoyable, moving but not straining

Moderate:
- First 20%: ease in, slightly below target energy
- Middle 60%: sustain target energy consistently
- Last 20%: maintain with slight wind-down
- Mood: focused, steady, controlled

Push It:
- First 15%: warmup, building energy
- Next 70%: high intensity sustained, 2-3 energy peaks
- Last 15%: cooldown, gradually reducing
- Mood: driven, powerful, resilient

Max Effort:
- First 10%: explosive start
- Middle 80%: maximum intensity, no recovery
- Last 10%: everything left in the tank
- Mood: unstoppable, raw power, peak performance

SONIC REQUIREMENTS:
- All songs must exist in the same sonic universe — no genre mixing
- BPM of songs must match the intensity BPM range as closely as possible
- Songs with driving consistent rhythm appropriate for physical exertion
- No slow intros, no sudden quiet sections, no jarring drops
- Adjacent songs should be within 15 BPM of each other
- Discovery tracks should be sonically similar to the user's library

Parse the activity description carefully:
- "trail run" → organic, earthy sounds work well; avoid aggressive electronic
- "cycling" → steady driving beats, good for high cadence
- "gym/weights" → high energy, hip-hop and rock work well
- "yoga/stretching" → lower energy even for moderate intensity
- "HIIT" → very punchy, short sharp bursts of high energy

Output NDJSON only — no markdown, no code fences, no extra text.
Line 1 (output IMMEDIATELY): {"playlistName":"...","mood":"...","arc":"...","visualWorld":{"motionStyle":"...","intensity":0.0-1.0,"atmosphere":"...","shapeLanguage":"..."},"discoveryTracks":[{"title":"...","artist":"..."},...]}
Lines 2+: exactly ${songsNeeded} library tracks, one per line: {"id":"...","name":"...","uri":"...","artists":[{"name":"..."}]}
- Output line 1 before anything else
- Never invent tracks — only use provided library IDs
- discoveryTracks: 3-5 real songs outside the library matching the workout sonic requirements
- motionStyle: turbulent=high energy fast tempo | landscape=uplifting euphoric | geometric=rhythmic focused | ethereal=acoustic meditative | fluid=melancholic slow
- intensity 0.0-1.0
- arc field must describe energy journey from start to finish`
}

export async function POST(request: NextRequest) {
  const routeStart = Date.now()
  try {
    const body: RequestBody = await request.json()
    const { activity, durationMinutes, intensity, activityProfile } = body

    const songsNeeded = Math.ceil(durationMinutes / 3.5)

    const { accessToken } = await getSpotifyToken()
    console.log('[workout-playlist] token fetched in', Date.now() - routeStart, 'ms')

    const likedTracks = await fetchLikedTracks(accessToken, 20).catch(() => [] as SpotifyTrack[])
    console.log('[workout-playlist] library fetched in', Date.now() - routeStart, 'ms — liked:', likedTracks.length)

    const likedIds = new Set(likedTracks.map((t) => t.id))

    // Shuffle liked songs with session randomization
    const sessionId = Math.random().toString(36).slice(2, 8)
    const randomSeed = Math.random().toFixed(4)
    const shuffledLiked = shuffleArray(likedTracks)

    const userPrompt = `Session context: ${sessionId}. Random seed: ${randomSeed}.
Use this seed to vary your song selection — choose tracks that best match the workout intensity and sonic requirements.

---
MUSIC LIBRARY:

${formatTrackList(shuffledLiked, 'LIKED SONGS')}
---

Output line 1 (metadata + discoveryTracks) immediately, then output each library track on its own line.`

    const encoder = new TextEncoder()

    console.log('[workout-playlist] starting Claude stream at', Date.now() - routeStart, 'ms')
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const claudeStream = client.messages.stream({
          model: MODEL,
          max_tokens: 2000,
          system: buildSystemPrompt(activity, durationMinutes, intensity, songsNeeded, activityProfile),
          messages: [{ role: 'user', content: userPrompt }],
        })

        let buffer = ''
        const metaStore: MetaLine[] = []
        let pendingPalettePromise: Promise<void> | null = null
        let paletteApplied = false
        let trackIndex = 0
        let libraryEmitCount = 0
        const discoveryQueue: SpotifyTrack[] = []
        let allDiscoveryDone: Promise<void> = Promise.resolve()

        function resolveSource(id: string): TrackSource {
          if (likedIds.has(id)) return 'liked'
          return 'liked'
        }

        function emitTrack(track: SpotifyTrack, source: TrackSource): void {
          const meta = metaStore[0]!
          const isFirst = trackIndex === 0
          const chunk: StreamChunk = {
            track: { ...track, source },
            visualWorld: meta.visualWorld,
            isFirst,
            ...(isFirst
              ? { playlistName: meta.playlistName, mood: meta.mood, arc: meta.arc }
              : {}),
          }
          controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'))
          trackIndex++
        }

        async function processLibraryTrack(track: SpotifyTrack): Promise<void> {
          if (!paletteApplied && pendingPalettePromise) {
            await pendingPalettePromise
            paletteApplied = true
          }
          emitTrack(track, resolveSource(track.id))
          libraryEmitCount++
          // After every 3rd library track, slot in a discovery track if one has resolved
          if (libraryEmitCount % 3 === 0 && discoveryQueue.length > 0) {
            emitTrack(discoveryQueue.shift()!, 'discovery')
          }
        }

        try {
          for await (const event of claudeStream) {
            if (
              event.type !== 'content_block_delta' ||
              event.delta.type !== 'text_delta'
            ) continue

            buffer += event.delta.text
            let idx: number
            while ((idx = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, idx).trim()
              buffer = buffer.slice(idx + 1)
              if (!line) continue
              try {
                const parsed = JSON.parse(line)
                if (metaStore.length === 0 && 'visualWorld' in parsed) {
                  const m = parsed as MetaLine
                  m.visualWorld.colorPalette = []
                  metaStore.push(m)

                  // Fire individual Spotify searches so results trickle into discoveryQueue
                  if (m.discoveryTracks?.length) {
                    const individualPromises = m.discoveryTracks.map(({ title, artist }) =>
                      fetch(
                        `https://api.spotify.com/v1/search?q=${encodeURIComponent(`track:${title} artist:${artist}`)}&type=track&limit=1`,
                        { headers: { Authorization: `Bearer ${accessToken}` } },
                      )
                        .then((r) => r.json())
                        .then((data) => {
                          const track = (data as { tracks?: { items?: SpotifyTrack[] } }).tracks?.items?.[0]
                          if (track) discoveryQueue.push(track)
                        })
                        .catch(() => {}),
                    )
                    allDiscoveryDone = Promise.allSettled(individualPromises).then(() => {})
                  }

                  console.log('[workout-playlist] meta line received at', Date.now() - routeStart, 'ms')
                  pendingPalettePromise = getMoodPalette(m.mood, m.arc, activity).then((palette) => {
                    m.visualWorld.colorPalette = palette.colors
                    m.visualWorld.backgroundType = palette.background
                  })
                } else if (metaStore.length > 0 && 'id' in parsed) {
                  await processLibraryTrack(parsed as SpotifyTrack)
                }
              } catch {
                // skip malformed lines
              }
            }
          }

          // Handle any buffered remainder
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim())
              if (metaStore.length > 0 && 'id' in parsed) {
                await processLibraryTrack(parsed as SpotifyTrack)
              }
            } catch {
              // skip
            }
          }

          // Wait for all discovery searches to finish then emit whatever's left
          if (metaStore[0]) {
            await allDiscoveryDone
            for (const dt of discoveryQueue) {
              emitTrack(dt, 'discovery')
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream error'
          controller.enqueue(encoder.encode(JSON.stringify({ error: msg }) + '\n'))
        }

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

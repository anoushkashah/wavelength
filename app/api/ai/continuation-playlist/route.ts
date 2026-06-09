import { type NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSpotifyToken } from '@/lib/spotify-auth'
import type { SpotifyTrack } from '@/types/spotify'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

interface VisualWorld {
  colorPalette: string[]
  motionStyle: string
  intensity: number
  atmosphere: string
  shapeLanguage: string
  backgroundType: 'dark' | 'light'
}

interface StreamChunk {
  track: SpotifyTrack & { source: 'discovery' }
  visualWorld: VisualWorld
  isFirst: boolean
  playlistName?: string
  mood?: string
  arc?: string
}

interface RequestBody {
  seedTrack: { id: string; name: string; artist: string; uri: string }
}

const DEFAULT_VISUAL: VisualWorld = {
  colorPalette: ['#C7CEEA', '#B5EAD7', '#FFDAC1', '#FFB7B2', '#E2F0CB'],
  motionStyle: 'fluid',
  intensity: 0.5,
  atmosphere: 'familiar territory',
  shapeLanguage: 'flowing',
  backgroundType: 'light',
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json()
    const { seedTrack } = body

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: `You are a music curator. The user just listened to "${seedTrack.name}" by "${seedTrack.artist}".

Generate 15 songs that would naturally follow this track — same sonic universe, similar genre, similar energy, similar era. Think of this as the perfect continuation of what they were listening to.

RULES:
- Same genre and sonic world as the seed track
- Similar BPM and energy level
- Mix of well-known tracks and deeper cuts
- No genre mixing — stay in the same universe
- Only tracks you are confident exist on Spotify

Return ONLY a JSON array:
[{"title": "exact track name", "artist": "exact artist name"}, ...]`,
      messages: [{ role: 'user', content: 'Generate the continuation playlist.' }],
    })

    const claudeText = message.content[0]?.type === 'text' ? message.content[0].text : '[]'
    const cleaned = claudeText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const trackList: { title: string; artist: string }[] = JSON.parse(cleaned)

    const { accessToken } = await getSpotifyToken()

    const results = await Promise.all(
      trackList.map(async ({ title, artist }) => {
        try {
          const query = encodeURIComponent(`track:${title} artist:${artist}`)
          const res = await fetch(
            `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )
          const data = await res.json()
          const track = data.tracks?.items?.[0] as SpotifyTrack | undefined
          if (!track) return null
          return { ...track, source: 'discovery' as const }
        } catch {
          return null
        }
      }),
    )

    const foundTracks = results.filter(
      (t): t is SpotifyTrack & { source: 'discovery' } => t !== null,
    )

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Seed track first
        const seedChunk: StreamChunk = {
          track: {
            id: seedTrack.id,
            name: seedTrack.name,
            uri: seedTrack.uri,
            artists: [{ id: '', name: seedTrack.artist }],
            album: { id: '', name: '', images: [] },
            duration_ms: 0,
            explicit: false,
            preview_url: null,
            source: 'discovery',
          },
          visualWorld: DEFAULT_VISUAL,
          isFirst: true,
          playlistName: `More like ${seedTrack.name}`,
          mood: 'continuation',
          arc: `Flowing naturally from ${seedTrack.name}`,
        }
        controller.enqueue(encoder.encode(JSON.stringify(seedChunk) + '\n'))

        for (const track of foundTracks) {
          const chunk: StreamChunk = {
            track,
            visualWorld: DEFAULT_VISUAL,
            isFirst: false,
          }
          controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'))
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
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

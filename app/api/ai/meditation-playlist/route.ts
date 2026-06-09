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
  duration: number
  breathingPattern: 'box' | '478' | 'deep'
  intention?: string
}

const MEDITATION_VISUAL: VisualWorld = {
  colorPalette: ['#B5EAD7', '#FFDAC1', '#C7CEEA', '#FFB7B2', '#E2F0CB'],
  motionStyle: 'ethereal',
  intensity: 0.05,
  atmosphere: 'breathwork stillness',
  shapeLanguage: 'flowing',
  backgroundType: 'light',
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json()
    const { duration, breathingPattern, intention } = body
    const songsNeeded = Math.ceil(duration / 4)

    const systemPrompt = `You are a music curator specializing in meditation and breathwork music.

Generate a meditation playlist. Return ONLY a valid JSON array, no other text, no markdown.

Duration: ${duration} minutes
Songs needed: ${songsNeeded}
Breathing pattern: ${breathingPattern}
Intention: ${intention ?? 'general meditation and calm'}

STRICT RULES — ALL MUST BE FOLLOWED:
- PURE AMBIENT ONLY — absolutely zero beats, zero rhythm, zero percussion
- Zero lyrics, zero vocals of any kind
- Only sustained tones, drone, gentle piano, or atmospheric texture
- Only tracks you are 100% confident exist on Spotify
- Tracks must feel continuous and still — no jarring moments

AMBIENT artists to use:
Brian Eno (Music for Airports, Ambient series), Stars of the Lid, William Basinski (Disintegration Loops), Harold Budd, Grouper, Tim Hecker, Max Richter (Sleep album), Nils Frahm (slower ambient works only), Moby (Long Ambients series), Ólafur Arnalds (ambient works only), Johann Johannsson, The Caretaker

Example well-known tracks:
"1/1" by Brian Eno, "Avril 14th" by Aphex Twin, "On the Nature of Daylight" by Max Richter, "Nuvole Bianche" by Ludovico Einaudi, "Experience" by Ludovico Einaudi

ARC:
- First 20% of songs: gentle ease in — slightly more present
- Middle 60%: deepest stillness — most sparse and ambient
- Last 20%: soft return — slightly warmer

BREATHING PATTERN CHARACTER:
box (4-4-4-4): steady and grounding — choose balanced sustained tones
478 (4-7-8): deeply calming — choose very sparse, long decay tracks
deep: restorative and gentle — choose warm minimal tracks

Return ONLY this JSON format:
[{"title": "exact track name", "artist": "exact artist name on Spotify"}, ...]`

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Generate ${songsNeeded} ambient meditation tracks.` }],
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

    const validTracks = results.filter(
      (t): t is SpotifyTrack & { source: 'discovery' } => t !== null,
    )

    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < validTracks.length; i++) {
          const chunk: StreamChunk = {
            track: validTracks[i],
            visualWorld: MEDITATION_VISUAL,
            isFirst: i === 0,
            ...(i === 0
              ? {
                  playlistName: 'Breathing Session',
                  mood: 'meditative stillness',
                  arc: 'ease in, deepen, soft return',
                }
              : {}),
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

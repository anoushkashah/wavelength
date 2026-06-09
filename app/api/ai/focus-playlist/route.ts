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
  focusDuration: number
  breakDuration: number
  cycles: number
  sessionType: 'lofi' | 'deephouse'
}

const FOCUS_VISUAL: VisualWorld = {
  colorPalette: ['#B5EAD7', '#FFDAC1', '#C7CEEA', '#FFB7B2', '#E2F0CB'],
  motionStyle: 'ethereal',
  intensity: 0.15,
  atmosphere: 'focused stillness',
  shapeLanguage: 'flowing',
  backgroundType: 'light',
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json()
    const { focusDuration, cycles, sessionType } = body
    const songsNeeded = Math.ceil((focusDuration * cycles) / 3.5)

    const systemPrompt = `You are a music curator specializing in focus and productivity music.

Generate a focus session playlist. Return ONLY a valid JSON array, no other text, no markdown.

Session type: ${sessionType}
Songs needed: ${songsNeeded}

RULES — ALL MUST BE FOLLOWED:
- INSTRUMENTAL ONLY — zero lyrics, zero vocals of any kind
- Only tracks you are 100% confident exist on Spotify with this exact title and artist
- Consistent tempo — no sudden energy changes
- No tracks that have lyrics even in sections

LOFI style:
Artists to use: Idealism, Philanthrope, Flawed Mangoes, tomppabeats, Kupla, j^p^n, Vanilla, Sleepy Fish, Aso, Homage
Sound: warm vinyl, mellow beats, jazz samples, nostalgic
BPM: 75-95
Example tracks: "snowfall" by Øneheart & reidenshi, "affection" by Jinsang, "the search" by Philanthrope & Idealism

DEEP HOUSE style:
Artists to use: Nils Frahm, Jon Hopkins, Floating Points, Four Tet, Bicep, Lone, Bonobo, Tycho, Khruangbin
Sound: hypnotic repetitive patterns, subtle bass, minimal electronic
BPM: 90-115
Example tracks: "Cascade" by Jon Hopkins, "LDN Funk" by Floating Points, "Glassfields" by Bicep

Vary artists — no artist appears more than twice.
Order for sustained focus — consistent energy throughout, no peaks or valleys.

Return ONLY this JSON format:
[{"title": "exact track name", "artist": "exact artist name on Spotify"}, ...]`

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Generate ${songsNeeded} ${sessionType} focus tracks.` }],
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

    const playlistName = sessionType === 'lofi' ? 'Lo-Fi Focus Session' : 'Deep Focus Session'
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < validTracks.length; i++) {
          const chunk: StreamChunk = {
            track: validTracks[i],
            visualWorld: FOCUS_VISUAL,
            isFirst: i === 0,
            ...(i === 0
              ? { playlistName, mood: 'deep focus', arc: 'sustained concentration throughout' }
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

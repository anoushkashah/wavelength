import { type NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DEFAULT_FEATURES = {
  energy: 0.5,
  valence: 0.5,
  tempo: 120,
  danceability: 0.5,
  acousticness: 0.3,
}

interface RequestBody {
  trackName: string
  artistName: string
  mood: string
}

export async function POST(request: NextRequest) {
  try {
    const { trackName, artistName, mood }: RequestBody = await request.json()

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `You are a music analysis expert. Estimate audio features for this track.
Track: ${trackName} by ${artistName}
Playlist mood context: ${mood}

Return ONLY a JSON object with these exact fields and realistic values:
{ "energy": 0-1, "valence": 0-1, "tempo": 60-200, "danceability": 0-1, "acousticness": 0-1 }

Base your estimates on your knowledge of this specific song's sonic character.
For example, Enter Sandman by Metallica: {"energy":0.85,"valence":0.35,"tempo":123,"danceability":0.45,"acousticness":0.02}
Return JSON only, no markdown.`,
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
    console.log('[estimate-features]', trackName, 'by', artistName, '→', text)

    const jsonMatch = text.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) return NextResponse.json(DEFAULT_FEATURES)

    const features = JSON.parse(jsonMatch[0]) as Record<string, number>
    return NextResponse.json({
      energy:       Math.min(1, Math.max(0, features.energy       ?? 0.5)),
      valence:      Math.min(1, Math.max(0, features.valence      ?? 0.5)),
      tempo:        Math.min(200, Math.max(60, features.tempo     ?? 120)),
      danceability: Math.min(1, Math.max(0, features.danceability ?? 0.5)),
      acousticness: Math.min(1, Math.max(0, features.acousticness ?? 0.3)),
    })
  } catch (err) {
    console.error('[estimate-features] error:', err)
    return NextResponse.json(DEFAULT_FEATURES)
  }
}

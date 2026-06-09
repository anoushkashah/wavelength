import Anthropic from '@anthropic-ai/sdk'
import type { SpotifyTrack, SpotifyTrackWithFeatures, PlaylistResponse } from '@/types/spotify'

const MODEL = 'claude-sonnet-4-6'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface MusicContext {
  likedTracks: SpotifyTrackWithFeatures[]
  recentTracks: SpotifyTrack[]
  recommendations: SpotifyTrack[]
}

function formatTrackList(tracks: SpotifyTrack[], limit = 60): string {
  return tracks
    .slice(0, limit)
    .map((t) => `"${t.name}" by ${t.artists.map((a) => a.name).join(', ')} [uri:${t.uri}]`)
    .join('\n')
}

function buildSystemPrompt(): string {
  return `You are a music curation AI. Your task is to select and sequence 20 tracks from a provided music library into a cohesive playlist, and describe its mood and visual world.

RULES:
- You MUST return ONLY valid JSON — no markdown, no prose, no code fences.
- Choose ~70% from liked songs and ~30% from recommendations when both are available.
- The "tracks" array must contain exactly 20 track objects, each with these fields from the original data: id, name, uri, duration_ms, explicit, preview_url, artists, album. Copy them exactly — do not invent new tracks.
- audio_features may be null on tracks; that is fine.
- intensity must be a number between 0 and 1.
- colorPalette must be an array of 3-5 hex color strings.

RESPONSE SCHEMA (strict):
{
  "tracks": [ /* 20 SpotifyTrack objects */ ],
  "playlistName": "string",
  "mood": "string",
  "arc": "string",
  "visualWorld": {
    "colorPalette": ["#xxxxxx", ...],
    "motionStyle": "string",
    "intensity": 0.0-1.0,
    "atmosphere": "string",
    "shapeLanguage": "string"
  }
}`
}

export async function streamPlaylistResponse(
  userPrompt: string,
  context: MusicContext,
): Promise<ReadableStream<Uint8Array>> {
  const likedSection = context.likedTracks.length > 0
    ? `LIKED SONGS (pool of ${context.likedTracks.length}, shown up to 80):\n${formatTrackList(context.likedTracks, 80)}`
    : 'LIKED SONGS: unavailable'

  const recentSection = context.recentTracks.length > 0
    ? `RECENTLY PLAYED (last ${context.recentTracks.length}):\n${formatTrackList(context.recentTracks, 30)}`
    : ''

  const recsSection = context.recommendations.length > 0
    ? `RECOMMENDATIONS (${context.recommendations.length}):\n${formatTrackList(context.recommendations)}`
    : ''

  const fullPrompt = `${userPrompt}

---
MUSIC LIBRARY:

${likedSection}

${recentSection}

${recsSection}
---

Return the JSON response now.`

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: fullPrompt }],
  })

  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
    cancel() {
      stream.controller.abort()
    },
  })
}

export async function getPlaylistJSON(
  userPrompt: string,
  context: MusicContext,
): Promise<PlaylistResponse> {
  const likedSection = context.likedTracks.length > 0
    ? `LIKED SONGS (pool of ${context.likedTracks.length}, shown up to 80):\n${formatTrackList(context.likedTracks, 80)}`
    : 'LIKED SONGS: unavailable'

  const recentSection = context.recentTracks.length > 0
    ? `RECENTLY PLAYED (last ${context.recentTracks.length}):\n${formatTrackList(context.recentTracks, 30)}`
    : ''

  const recsSection = context.recommendations.length > 0
    ? `RECOMMENDATIONS (${context.recommendations.length}):\n${formatTrackList(context.recommendations)}`
    : ''

  const fullPrompt = `${userPrompt}

---
MUSIC LIBRARY:

${likedSection}

${recentSection}

${recsSection}
---

Return the JSON response now.`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: fullPrompt }],
  })

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  return JSON.parse(stripMarkdownFences(text)) as PlaylistResponse
}

function stripMarkdownFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

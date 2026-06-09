import { type NextRequest, NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'
import {
  fetchLikedTracksWithFeatures,
  fetchRecentlyPlayed,
  fetchRecommendations,
  pickSeedTracks,
} from '@/lib/spotify-data'
import { getPlaylistJSON } from '@/lib/playlist-ai'

interface MoodPlaylistBody {
  emotion: string
  energy: number
}

export async function POST(request: NextRequest) {
  try {
    const body: MoodPlaylistBody = await request.json()
    const { emotion, energy } = body

    const { accessToken } = await getSpotifyToken()

    const [likedTracks, recentTracks] = await Promise.all([
      fetchLikedTracksWithFeatures(accessToken).catch(() => []),
      fetchRecentlyPlayed(accessToken).catch(() => []),
    ])

    const targetEnergy = Math.max(0, Math.min(1, energy))

    // Map named emotion to a rough valence target
    const positiveEmotions = ['happy', 'joyful', 'excited', 'euphoric', 'content', 'elated', 'grateful', 'hopeful']
    const negativeEmotions = ['sad', 'melancholy', 'anxious', 'angry', 'frustrated', 'heartbroken', 'lonely', 'depressed']
    const emotionLower = emotion.toLowerCase()
    const targetValence = positiveEmotions.some((e) => emotionLower.includes(e))
      ? 0.75
      : negativeEmotions.some((e) => emotionLower.includes(e))
        ? 0.3
        : 0.5

    const seeds =
      likedTracks.length > 0
        ? pickSeedTracks(likedTracks, { valence: targetValence, energy: targetEnergy })
        : recentTracks.slice(0, 5).map((t) => t.id)

    const recommendations =
      seeds.length > 0
        ? await fetchRecommendations(accessToken, {
            seedTrackIds: seeds,
            targetValence,
            targetEnergy,
          }).catch(() => [])
        : []

    const userPrompt = `Mood state:
- Emotion: "${emotion}"
- Energy level: ${targetEnergy} (0 = very low, 1 = very high)

Task: Match this exact emotional state right now. No arc needed — sustain the mood throughout all 20 tracks. Every track should feel like it belongs to this specific headspace. Use ~70% liked songs and ~30% recommendations.`

    const data = await getPlaylistJSON(userPrompt, {
      likedTracks,
      recentTracks,
      recommendations,
    })

    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

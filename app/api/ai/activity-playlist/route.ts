import { type NextRequest, NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'
import {
  fetchLikedTracksWithFeatures,
  fetchRecentlyPlayed,
  fetchRecommendations,
  pickSeedTracks,
} from '@/lib/spotify-data'
import { getPlaylistJSON } from '@/lib/playlist-ai'

interface ActivityPlaylistBody {
  activity: string
}

interface ActivityProfile {
  energy: number
  valence: number
  tempo: number
  danceability: number
}

/** Infer audio targets from common activity keywords. */
function inferActivityProfile(activity: string): ActivityProfile {
  const lower = activity.toLowerCase()

  if (/\b(run|running|jog|sprint|workout|gym|hiit|cycling|cardio)\b/.test(lower)) {
    return { energy: 0.9, valence: 0.7, tempo: 150, danceability: 0.75 }
  }
  if (/\b(study|studying|focus|work|coding|reading|writing|concentrate)\b/.test(lower)) {
    return { energy: 0.35, valence: 0.5, tempo: 90, danceability: 0.3 }
  }
  if (/\b(sleep|sleeping|rest|relax|nap|wind down|meditate|meditation)\b/.test(lower)) {
    return { energy: 0.15, valence: 0.45, tempo: 65, danceability: 0.2 }
  }
  if (/\b(cook|cooking|dinner|lunch|breakfast|commute|drive|driving)\b/.test(lower)) {
    return { energy: 0.55, valence: 0.65, tempo: 110, danceability: 0.6 }
  }
  if (/\b(party|dancing|dance|club|celebrate|celebration)\b/.test(lower)) {
    return { energy: 0.85, valence: 0.8, tempo: 128, danceability: 0.88 }
  }
  if (/\b(yoga|stretch|walk|walking|hike|hiking|swim|swimming)\b/.test(lower)) {
    return { energy: 0.45, valence: 0.6, tempo: 95, danceability: 0.45 }
  }

  // Default: moderate everything
  return { energy: 0.55, valence: 0.6, tempo: 105, danceability: 0.55 }
}

export async function POST(request: NextRequest) {
  try {
    const body: ActivityPlaylistBody = await request.json()
    const { activity } = body

    const { accessToken } = await getSpotifyToken()

    const [likedTracks, recentTracks] = await Promise.all([
      fetchLikedTracksWithFeatures(accessToken).catch(() => []),
      fetchRecentlyPlayed(accessToken).catch(() => []),
    ])

    const profile = inferActivityProfile(activity)

    const seeds =
      likedTracks.length > 0
        ? pickSeedTracks(likedTracks, { valence: profile.valence, energy: profile.energy })
        : recentTracks.slice(0, 5).map((t) => t.id)

    const recommendations =
      seeds.length > 0
        ? await fetchRecommendations(accessToken, {
            seedTrackIds: seeds,
            targetValence: profile.valence,
            targetEnergy: profile.energy,
            targetTempo: profile.tempo,
            targetDanceability: profile.danceability,
          }).catch(() => [])
        : []

    const userPrompt = `Activity: "${activity}"

Task: Parse this activity and infer exactly what music serves it — the right energy level, focus or distraction balance, tempo, and intensity. Sequence 20 tracks optimized for this specific activity from start to finish. Consider pacing: warming up, peak activity, cool-down if appropriate. Use ~70% liked songs and ~30% recommendations.`

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

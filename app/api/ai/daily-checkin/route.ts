import { type NextRequest, NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'
import {
  fetchLikedTracksWithFeatures,
  fetchRecentlyPlayed,
  fetchRecommendations,
  pickSeedTracks,
} from '@/lib/spotify-data'
import { getPlaylistJSON } from '@/lib/playlist-ai'

interface DailyCheckinBody {
  answers: {
    feeling: string
    dayOutlook: string
    energyLevel: string
  }
}

/** Derive rough audio targets from free-text energy level description. */
function deriveTargets(answers: DailyCheckinBody['answers']) {
  const energyKeywords = ['high', 'energized', 'pumped', 'excited', 'great', 'amazing']
  const lowEnergyKeywords = ['tired', 'exhausted', 'low', 'drained', 'sleepy', 'slow']
  const happyKeywords = ['happy', 'good', 'great', 'amazing', 'excited', 'positive', 'joyful']
  const sadKeywords = ['sad', 'down', 'bad', 'anxious', 'stressed', 'melancholy', 'rough']

  const text = `${answers.feeling} ${answers.dayOutlook} ${answers.energyLevel}`.toLowerCase()

  const energyScore = energyKeywords.some((k) => text.includes(k))
    ? 0.7
    : lowEnergyKeywords.some((k) => text.includes(k))
      ? 0.3
      : 0.5

  const valenceScore = happyKeywords.some((k) => text.includes(k))
    ? 0.7
    : sadKeywords.some((k) => text.includes(k))
      ? 0.35
      : 0.5

  return { energy: energyScore, valence: valenceScore }
}

export async function POST(request: NextRequest) {
  try {
    const body: DailyCheckinBody = await request.json()
    const { answers } = body

    const { accessToken } = await getSpotifyToken()

    const [likedTracks, recentTracks] = await Promise.all([
      fetchLikedTracksWithFeatures(accessToken).catch(() => []),
      fetchRecentlyPlayed(accessToken).catch(() => []),
    ])

    const targets = deriveTargets(answers)
    const seeds =
      likedTracks.length > 0
        ? pickSeedTracks(likedTracks, targets)
        : recentTracks.slice(0, 5).map((t) => t.id)

    const recommendations =
      seeds.length > 0
        ? await fetchRecommendations(accessToken, {
            seedTrackIds: seeds,
            targetValence: targets.valence,
            targetEnergy: targets.energy,
          }).catch(() => [])
        : []

    const userPrompt = `Daily check-in answers:
- How are you feeling? "${answers.feeling}"
- Day outlook: "${answers.dayOutlook}"
- Energy level: "${answers.energyLevel}"

Task: Interpret the emotional state from these answers. Understand what kind of day this person is having. Sequence 20 tracks with an emotional arc — start where they are, then guide them gently toward where they want to be. Use ~70% liked songs and ~30% recommendations. Write the playlistName, mood, and arc to reflect this journey.`

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

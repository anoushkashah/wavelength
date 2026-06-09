import { type NextRequest, NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'
import type { SpotifyTrack } from '@/types/spotify'

export async function GET(request: NextRequest) {
  try {
    const { accessToken } = await getSpotifyToken()
    const { searchParams } = new URL(request.url)

    const params = new URLSearchParams({ limit: '20' })

    const seedTracks = searchParams.get('seed_tracks')
    if (seedTracks) params.set('seed_tracks', seedTracks)

    const numericParams = ['target_valence', 'target_energy', 'target_tempo', 'target_danceability']
    for (const key of numericParams) {
      const val = searchParams.get(key)
      if (val !== null) params.set(key, val)
    }

    const res = await fetch(
      `https://api.spotify.com/v1/recommendations?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!res.ok) {
      throw new Error(`Spotify recommendations error: ${res.status}`)
    }

    const data = await res.json()
    const tracks: SpotifyTrack[] = data.tracks

    return NextResponse.json(tracks)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

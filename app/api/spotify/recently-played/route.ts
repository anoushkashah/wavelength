import { type NextRequest, NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'
import type { SpotifyTrack } from '@/types/spotify'

export interface RecentlyPlayedItem {
  track: SpotifyTrack
  played_at: string
}

export async function GET(_request: NextRequest) {
  try {
    const { accessToken } = await getSpotifyToken()

    const res = await fetch(
      'https://api.spotify.com/v1/me/player/recently-played?limit=50',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!res.ok) {
      throw new Error(`Spotify recently-played error: ${res.status}`)
    }

    const data = await res.json()
    const items: RecentlyPlayedItem[] = data.items.map(
      (item: { track: SpotifyTrack; played_at: string }) => ({
        track: item.track,
        played_at: item.played_at,
      }),
    )

    return NextResponse.json(items)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

import { NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'

interface SpotifyTrackItem {
  track: {
    id: string
    name: string
    uri: string
    artists: { name: string }[]
    album: { images: { url: string }[] }
  }
  played_at: string
}

interface RecentlyPlayedResponse {
  items: SpotifyTrackItem[]
}

export async function GET() {
  try {
    const { accessToken } = await getSpotifyToken()
    const res = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch recently played' }, { status: res.status })
    }
    const data: RecentlyPlayedResponse = await res.json()
    const item = data.items[0]
    if (!item) {
      return NextResponse.json({ error: 'No recent tracks' }, { status: 404 })
    }
    return NextResponse.json({ track: item.track, played_at: item.played_at })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

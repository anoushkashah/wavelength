import { NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'

interface SpotifyProfile {
  id: string
  display_name: string
  images: { url: string }[]
}

export async function GET() {
  try {
    const { accessToken } = await getSpotifyToken()
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: res.status })
    }
    const data: SpotifyProfile = await res.json()
    return NextResponse.json({
      id: data.id,
      display_name: data.display_name,
      images: data.images,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

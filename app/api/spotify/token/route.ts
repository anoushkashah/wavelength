import { NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'

// Used by the Spotify Web Playback SDK to obtain a current access token client-side.
export async function GET() {
  try {
    const { accessToken } = await getSpotifyToken()
    return NextResponse.json({ accessToken })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

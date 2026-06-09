import { type NextRequest, NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'

interface CreatePlaylistBody {
  name: string
  trackUris: string[]
  description?: string
}

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await getSpotifyToken()
    const body: CreatePlaylistBody = await request.json()
    const { name, trackUris, description = '' } = body

    // Get current user's Spotify ID
    const profileRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!profileRes.ok) throw new Error(`Failed to fetch profile: ${profileRes.status}`)
    const profile = await profileRes.json()

    // Create the playlist
    const createRes = await fetch(
      `https://api.spotify.com/v1/users/${profile.id}/playlists`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, description, public: false }),
      },
    )
    if (!createRes.ok) throw new Error(`Failed to create playlist: ${createRes.status}`)
    const playlist = await createRes.json()

    // Add tracks in batches of 100
    for (let i = 0; i < trackUris.length; i += 100) {
      const batch = trackUris.slice(i, i + 100)
      const addRes = await fetch(
        `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: batch }),
        },
      )
      if (!addRes.ok) throw new Error(`Failed to add tracks: ${addRes.status}`)
    }

    return NextResponse.json({
      id: playlist.id,
      url: playlist.external_urls.spotify,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

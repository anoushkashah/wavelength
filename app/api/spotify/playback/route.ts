import { type NextRequest, NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await getSpotifyToken()
    const { uri, device_id } = await request.json() as { uri: string; device_id?: string }

    const url = device_id
      ? `https://api.spotify.com/v1/me/player/play?device_id=${device_id}`
      : 'https://api.spotify.com/v1/me/player/play'

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uris: [uri] }),
    })

    // 204 No Content is success
    if (res.status === 204 || res.ok) {
      return NextResponse.json({ ok: true })
    }

    const err = await res.json().catch(() => ({ error: `Spotify error ${res.status}` }))
    return NextResponse.json({ error: err.error?.message ?? `Spotify error ${res.status}` }, { status: res.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function GET() {
  try {
    const { accessToken } = await getSpotifyToken()

    const res = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    // 204 = no active player
    if (res.status === 204) {
      return NextResponse.json({ isPlaying: false, device: null, track: null })
    }
    if (!res.ok) {
      return NextResponse.json({ error: `Spotify error ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({
      isPlaying: data.is_playing ?? false,
      device: data.device ?? null,
      track: data.item ?? null,
      progressMs: data.progress_ms ?? 0,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

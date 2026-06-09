import { type NextRequest, NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify-auth'
import type { SpotifyTrack, SpotifyAudioFeatures, SpotifyTrackWithFeatures, SpotifyPlaylist } from '@/types/spotify'

async function fetchAllLikedSongs(accessToken: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = []
  let url: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50'

  while (url && tracks.length < 200) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Spotify liked songs error: ${res.status}`)

    const data: { items: { track: SpotifyTrack }[]; next: string | null } = await res.json()
    for (const item of data.items) {
      tracks.push(item.track)
    }
    url = data.next
  }

  return tracks.slice(0, 200)
}

async function fetchUserPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  const data: { items: SpotifyPlaylist[] } = await res.json()
  return data.items ?? []
}

async function fetchPlaylistTracks(accessToken: string, playlistId: string): Promise<SpotifyTrack[]> {
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(id,name,uri,duration_ms,explicit,preview_url,artists,album))`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return []
  const data: { items: { track: SpotifyTrack | null }[] } = await res.json()
  return data.items.map((i) => i.track).filter((t): t is SpotifyTrack => t !== null && !!t.id)
}

async function fetchAudioFeaturesBatch(
  accessToken: string,
  ids: string[],
): Promise<SpotifyAudioFeatures[]> {
  const res = await fetch(
    `https://api.spotify.com/v1/audio-features?ids=${ids.join(',')}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.audio_features ?? []
}

async function fetchAllAudioFeatures(
  accessToken: string,
  ids: string[],
): Promise<Map<string, SpotifyAudioFeatures>> {
  const batches: Promise<SpotifyAudioFeatures[]>[] = []
  for (let i = 0; i < ids.length; i += 100) {
    batches.push(fetchAudioFeaturesBatch(accessToken, ids.slice(i, i + 100)))
  }
  const results = await Promise.all(batches)
  const featuresMap = new Map<string, SpotifyAudioFeatures>()
  for (const batch of results) {
    for (const f of batch) {
      if (f) featuresMap.set(f.id, f)
    }
  }
  return featuresMap
}

export async function GET(_request: NextRequest) {
  try {
    const { accessToken } = await getSpotifyToken()

    const [likedSongs, playlists] = await Promise.all([
      fetchAllLikedSongs(accessToken).catch(() => [] as SpotifyTrack[]),
      fetchUserPlaylists(accessToken),
    ])

    const playlistTracks = await Promise.all(
      playlists.slice(0, 5).map((p) => fetchPlaylistTracks(accessToken, p.id)),
    )

    const seen = new Set<string>()
    const allTracks: SpotifyTrack[] = []

    for (const track of [...likedSongs, ...playlistTracks.flat()]) {
      if (!seen.has(track.id)) {
        seen.add(track.id)
        allTracks.push(track)
        if (allTracks.length >= 300) break
      }
    }

    const featuresMap = await fetchAllAudioFeatures(
      accessToken,
      allTracks.map((t) => t.id),
    )

    const tracksWithFeatures: SpotifyTrackWithFeatures[] = allTracks.map((track) => ({
      ...track,
      audio_features: featuresMap.get(track.id) ?? null,
    }))

    return NextResponse.json(tracksWithFeatures)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

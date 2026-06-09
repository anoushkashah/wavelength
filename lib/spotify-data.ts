import type { SpotifyTrack, SpotifyAudioFeatures, SpotifyTrackWithFeatures } from '@/types/spotify'

export async function fetchLikedTracks(
  accessToken: string,
  limit = 50,
): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = []
  let url: string | null = `https://api.spotify.com/v1/me/tracks?limit=${Math.min(limit, 50)}`

  while (url && tracks.length < limit) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Liked songs fetch failed: ${res.status}`)
    const data: { items: { track: SpotifyTrack }[]; next: string | null } = await res.json()
    for (const item of data.items) tracks.push(item.track)
    url = tracks.length < limit ? data.next : null
  }

  return tracks.slice(0, limit)
}

export async function fetchLikedTracksWithFeatures(
  accessToken: string,
  limit = 200,
): Promise<SpotifyTrackWithFeatures[]> {
  const tracks: SpotifyTrack[] = []
  let url: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50'

  while (url && tracks.length < limit) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Liked songs fetch failed: ${res.status}`)
    const data: { items: { track: SpotifyTrack }[]; next: string | null } = await res.json()
    for (const item of data.items) tracks.push(item.track)
    url = data.next
  }

  const trimmed = tracks.slice(0, limit)
  const ids = trimmed.map((t) => t.id)

  const fetchBatch = async (batchIds: string[]): Promise<SpotifyAudioFeatures[]> => {
    const res = await fetch(
      `https://api.spotify.com/v1/audio-features?ids=${batchIds.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.audio_features ?? []).filter(Boolean)
  }

  const [batch1, batch2] = await Promise.all([
    fetchBatch(ids.slice(0, 100)),
    ids.length > 100 ? fetchBatch(ids.slice(100)) : Promise.resolve([]),
  ])

  const featuresMap = new Map<string, SpotifyAudioFeatures>()
  for (const f of [...batch1, ...batch2]) featuresMap.set(f.id, f)

  return trimmed.map((track) => ({
    ...track,
    audio_features: featuresMap.get(track.id) ?? null,
  }))
}

export async function fetchRecentlyPlayed(accessToken: string): Promise<SpotifyTrack[]> {
  const res = await fetch(
    'https://api.spotify.com/v1/me/player/recently-played?limit=50',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.items.map((item: { track: SpotifyTrack }) => item.track)
}

export async function fetchRecommendations(
  accessToken: string,
  params: {
    seedTrackIds: string[]
    targetValence?: number
    targetEnergy?: number
    targetTempo?: number
    targetDanceability?: number
    limit?: number
  },
): Promise<SpotifyTrack[]> {
  const qp = new URLSearchParams({ limit: String(params.limit ?? 20) })
  qp.set('seed_tracks', params.seedTrackIds.slice(0, 5).join(','))
  if (params.targetValence !== undefined) qp.set('target_valence', String(params.targetValence))
  if (params.targetEnergy !== undefined) qp.set('target_energy', String(params.targetEnergy))
  if (params.targetTempo !== undefined) qp.set('target_tempo', String(params.targetTempo))
  if (params.targetDanceability !== undefined)
    qp.set('target_danceability', String(params.targetDanceability))

  const res = await fetch(`https://api.spotify.com/v1/recommendations?${qp}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.tracks ?? []
}

/** Pick seed tracks from liked songs whose audio features best match the target profile. */
export function pickSeedTracks(
  likedTracks: SpotifyTrackWithFeatures[],
  target: { valence: number; energy: number },
  count = 5,
): string[] {
  const scored = likedTracks
    .filter((t) => t.audio_features)
    .map((t) => {
      const f = t.audio_features!
      const dist =
        Math.abs(f.valence - target.valence) + Math.abs(f.energy - target.energy)
      return { id: t.id, dist }
    })
    .sort((a, b) => a.dist - b.dist)

  return scored.slice(0, count).map((s) => s.id)
}

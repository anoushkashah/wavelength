export interface SpotifyTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export interface SpotifyUser {
  id: string
  display_name: string
  email: string
  images: { url: string; width: number; height: number }[]
}

export interface SpotifyTrack {
  id: string
  name: string
  uri: string
  duration_ms: number
  explicit: boolean
  preview_url: string | null
  artists: { id: string; name: string }[]
  album: {
    id: string
    name: string
    images: { url: string; width: number; height: number }[]
  }
}

export interface SpotifySavedTrack {
  added_at: string
  track: SpotifyTrack
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string
  uri: string
  external_urls: { spotify: string }
  tracks: { total: number }
}

export interface SpotifyAudioFeatures {
  id: string
  valence: number
  energy: number
  tempo: number
  danceability: number
  acousticness: number
  instrumentalness: number
  liveness: number
  loudness: number
  speechiness: number
  key: number
  mode: number
  time_signature: number
  duration_ms: number
}

export interface SpotifyTrackWithFeatures extends SpotifyTrack {
  audio_features: SpotifyAudioFeatures | null
}

export interface PlaylistResponse {
  tracks: SpotifyTrackWithFeatures[]
  playlistName: string
  mood: string
  arc: string
  visualWorld: {
    colorPalette: string[]
    motionStyle: string
    intensity: number
    atmosphere: string
    shapeLanguage: string
  }
}

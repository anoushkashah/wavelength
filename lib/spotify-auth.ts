import { cookies } from 'next/headers'
import { refreshAccessToken } from '@/lib/spotify'

export interface SpotifyAuthResult {
  accessToken: string
  /** Call this after setting your response cookies to persist a refreshed token */
  didRefresh: boolean
  newTokens?: {
    access_token: string
    refresh_token: string
    expires_in: number
  }
}

/**
 * Reads spotify_access_token from httpOnly cookies, refreshing via
 * spotify_refresh_token if the token is expired or within 60 s of expiry.
 * Throws if unauthenticated or refresh fails.
 */
export async function getSpotifyToken(): Promise<SpotifyAuthResult> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('spotify_access_token')?.value
  const refreshToken = cookieStore.get('spotify_refresh_token')?.value
  const expiresAt = cookieStore.get('spotify_token_expires_at')?.value

  if (!refreshToken) {
    throw new Error('Not authenticated with Spotify')
  }

  const expiresAtMs = expiresAt ? Number(expiresAt) : 0
  const isExpired = Date.now() >= expiresAtMs - 60_000

  if (accessToken && !isExpired) {
    return { accessToken, didRefresh: false }
  }

  const newTokens = await refreshAccessToken(refreshToken)
  if (!newTokens) {
    throw new Error('Failed to refresh Spotify token')
  }

  const isProduction = process.env.NODE_ENV === 'production'

  cookieStore.set('spotify_access_token', newTokens.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: newTokens.expires_in,
    path: '/',
  })
  cookieStore.set('spotify_refresh_token', newTokens.refresh_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  cookieStore.set('spotify_token_expires_at', String(Date.now() + newTokens.expires_in * 1000), {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: newTokens.expires_in,
    path: '/',
  })

  return { accessToken: newTokens.access_token, didRefresh: true, newTokens }
}

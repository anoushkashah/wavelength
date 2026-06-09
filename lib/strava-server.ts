import { cookies } from 'next/headers'

interface StravaTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
}

export async function getStravaToken(): Promise<string> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('strava_access_token')?.value
  const refreshToken = cookieStore.get('strava_refresh_token')?.value
  const expiresAt = cookieStore.get('strava_token_expires_at')?.value

  if (!refreshToken) {
    throw new Error('Not connected to Strava')
  }

  const expiresAtMs = expiresAt ? Number(expiresAt) : 0
  const isExpired = Date.now() >= expiresAtMs - 60_000

  if (accessToken && !isExpired) {
    return accessToken
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error('Failed to refresh Strava token')
  }

  const data: StravaTokenResponse = await res.json()
  const isProduction = process.env.NODE_ENV === 'production'

  cookieStore.set('strava_access_token', data.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 60 * 60 * 6,
    path: '/',
  })
  cookieStore.set('strava_refresh_token', data.refresh_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  cookieStore.set('strava_token_expires_at', String(data.expires_at * 1000), {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  return data.access_token
}

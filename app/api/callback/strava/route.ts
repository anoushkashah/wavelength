import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

interface StravaTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete: {
    id: number
    firstname: string
    lastname: string
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (error) {
    return NextResponse.redirect(`${appUrl}/?error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/?error=missing_params`)
  }

  const cookieStore = await cookies()
  const storedState = cookieStore.get('strava_oauth_state')?.value

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${appUrl}/?error=state_mismatch`)
  }

  try {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!res.ok) {
      return NextResponse.redirect(`${appUrl}/?error=token_exchange_failed`)
    }

    const data: StravaTokenResponse = await res.json()
    const isProduction = process.env.NODE_ENV === 'production'

    // Store expires_at as ms timestamp
    const expiresAtMs = data.expires_at * 1000

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
    cookieStore.set('strava_token_expires_at', String(expiresAtMs), {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    cookieStore.set('strava_athlete_id', String(data.athlete.id), {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    cookieStore.set('strava_athlete_name', `${data.athlete.firstname} ${data.athlete.lastname}`, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })

    // Non-httpOnly cookie so client JS can read athlete name
    cookieStore.set(
      'strava_athlete_name_display',
      `${data.athlete.firstname} ${data.athlete.lastname}`,
      {
        httpOnly: false,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      },
    )

    // Clean up OAuth state cookie
    cookieStore.delete('strava_oauth_state')

    return NextResponse.redirect(`${appUrl}/dashboard`)
  } catch {
    return NextResponse.redirect(`${appUrl}/?error=token_exchange_failed`)
  }
}

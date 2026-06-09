import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  const cookieStore = await cookies()

  cookieStore.delete('strava_access_token')
  cookieStore.delete('strava_refresh_token')
  cookieStore.delete('strava_token_expires_at')
  cookieStore.delete('strava_athlete_id')
  cookieStore.delete('strava_athlete_name')
  cookieStore.delete('strava_athlete_name_display')
  cookieStore.delete('strava_oauth_state')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  return NextResponse.redirect(`${appUrl}/dashboard`)
}

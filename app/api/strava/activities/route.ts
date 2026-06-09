import { NextResponse } from 'next/server'
import { getStravaToken } from '@/lib/strava-server'
import type { StravaActivity } from '@/types/strava'

export async function GET() {
  try {
    const accessToken = await getStravaToken()

    const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch activities' }, { status: res.status })
    }

    const activities: StravaActivity[] = await res.json()
    return NextResponse.json(activities)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not connected to Strava') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

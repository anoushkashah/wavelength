import type { StravaActivity, ActivityProfile } from '@/types/strava'

export function metersToMiles(meters: number): number {
  return meters / 1609.344
}

export function metersPerSecondToPace(mps: number): string {
  if (mps <= 0) return '0:00'
  const secondsPerMile = 1609.344 / mps
  const minutes = Math.floor(secondsPerMile / 60)
  const seconds = Math.round(secondsPerMile % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function secondsToMinutes(seconds: number): number {
  return seconds / 60
}

export function buildActivityProfile(activities: StravaActivity[]): ActivityProfile {
  const recent = activities.slice(0, 10)

  // mostCommonType
  const typeCounts: Record<string, number> = {}
  for (const a of recent) {
    typeCounts[a.sport_type] = (typeCounts[a.sport_type] ?? 0) + 1
  }
  const mostCommonType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown'

  // avgDuration in minutes
  const avgDuration =
    recent.length > 0
      ? recent.reduce((sum, a) => sum + a.moving_time, 0) / recent.length / 60
      : 0

  // avgHeartRate
  const hrActivities = recent.filter((a) => a.average_heartrate != null)
  const avgHeartRate =
    hrActivities.length > 0
      ? hrActivities.reduce((sum, a) => sum + (a.average_heartrate ?? 0), 0) / hrActivities.length
      : 0

  // avgIntensity based on suffer_score (default 50 if missing)
  const avgSufferScore =
    recent.length > 0
      ? recent.reduce((sum, a) => sum + (a.suffer_score ?? 50), 0) / recent.length
      : 50

  const avgIntensity: 'low' | 'moderate' | 'high' =
    avgSufferScore < 30 ? 'low' : avgSufferScore > 70 ? 'high' : 'moderate'

  // lastActivityDaysAgo
  const lastActivityDaysAgo =
    recent.length > 0
      ? Math.floor((Date.now() - new Date(recent[0].start_date).getTime()) / (1000 * 60 * 60 * 24))
      : 0

  return {
    totalActivities: recent.length,
    mostCommonType,
    avgDuration,
    avgHeartRate,
    avgIntensity,
    lastActivityDaysAgo,
    recentActivities: recent,
  }
}

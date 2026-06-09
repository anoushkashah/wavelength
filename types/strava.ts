export interface StravaActivity {
  id: number
  name: string
  sport_type: string
  distance: number        // meters
  moving_time: number     // seconds
  elapsed_time: number    // seconds
  average_speed: number   // m/s
  max_speed: number       // m/s
  average_heartrate?: number
  max_heartrate?: number
  total_elevation_gain: number  // meters
  suffer_score?: number   // 0-100
  start_date: string
  achievement_count: number
}

export interface ActivityProfile {
  totalActivities: number
  mostCommonType: string
  avgDuration: number      // minutes
  avgHeartRate: number
  avgIntensity: 'low' | 'moderate' | 'high'
  lastActivityDaysAgo: number
  recentActivities: StravaActivity[]
}

export type WorkoutIntensity = 'recovery' | 'moderate' | 'push' | 'max'

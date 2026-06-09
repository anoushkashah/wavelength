// Shared session config types — source of truth flows from widget UI state
// through dashboard into PlayingView. Never provide defaults here.

export interface BreathingConfig {
  pattern: 'box' | '478' | 'deep'
  inhale: number            // seconds
  hold?: number             // seconds; omit if phase not used
  exhale: number            // seconds
  holdAfterExhale?: number  // seconds; omit if phase not used
  totalDuration: number     // minutes
}

export interface FocusConfig {
  focusDuration: number  // minutes per focus block
  breakDuration: number  // minutes per break
  cycles: number         // number of focus+break cycles
}

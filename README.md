# Wavelength

## Live URL
https://wavelength-self.vercel.app

---

## What I Built

Wavelength is an AI-powered music curation app that generates personalized Spotify playlists in real time based on your current mood, physical activity, focus state, and breathing practice. It is not a recommendation engine — it is a context-aware DJ that understands sonic character, emotional arc, and how music should feel for a given moment.

Most music apps optimize for discovery or catalog size. Wavelength optimizes for fit — the right music for exactly where you are right now. The difference between music that helps you focus and music that just plays in the background is intentionality. Wavelength brings that intentionality automatically, without requiring you to hunt through playlists or know exactly what you want.

The product is built around six modes of being, each with its own widget on the dashboard:

- **How you feel right now** — free-text mood input and energy level drive a 15-track playlist matched to your emotional state
- **Workout mode** — Strava activity data gives Claude real context about your fitness history, so a post-trail-run playlist sounds different from a recovery day
- **Breathing session** — Box Breathing, 4-7-8, or Deep Breathing with configurable duration; the playing view becomes a guided breathing interface with phase instructions and timers
- **Focus session** — Pomodoro-style timer with Lo-Fi or Deep House, configurable focus/break durations and cycles; music pauses automatically on breaks and resumes on focus blocks
- **Activity playlist** — describe what you're doing in natural language ("cooking dinner", "commuting", "studying for an exam") and Claude curates a soundtrack for it
- **Continuation** — picks up from your last Spotify track and generates a playlist that flows naturally from where you left off

---

## Product Features

### Landing Page
A full-screen animated splash page with layered concentric teal and mauve radial gradients that breathe via CSS keyframe animations. A grain texture overlay adds analog warmth. The single CTA — "Get Started" — triggers Spotify OAuth.

### Dashboard Bento Grid
After login the user lands on a 4-column × 3-row CSS grid. Each card is a frosted glass panel (backdrop-filter blur, semi-transparent white, rounded corners) over a photographic background image. Six named grid areas: today, rightnow, activity, workout, focus, breathing.

### How Are You Feeling Right Now?
Free-text mood input (e.g. "calm", "excited", "restless") combined with an energy level selector — a row of 10 dots, values 10–100, selected dot glows white. A translucent lotus SVG sits decoratively below. "Play this mood →" streams a 15-track playlist matched to mood and energy level.

### Activity Playlist
A text field — "I'm…" — accepts any natural language description of a current task. Claude interprets the activity and curates a playlist optimized for it: studying, cooking, commuting, creative work, and so on. "Find my sound →" triggers streaming.

### Continuation
Pulls the user's last-played Spotify track on page load. Displays album art, track name, and artist in the Today card. Clicking generates a continuation playlist seeded from that track's sonic universe — same energy, same character, new songs.

### Workout Mode (Strava-Connected)
OAuth connects to Strava and fetches the 10 most recent activities. A bar chart visualizes them — SVG bars colored by sport type (Run = coral, Ride = teal, Walk = seafoam, Hike = sage, WeightTraining = purple). Clicking a bar replaces the chart with a sport-colored detail panel showing name, type, date, duration, distance, elevation, avg HR, and suffer score.

`buildActivityProfile()` computes from the last 10 activities: most common sport type, average duration, average heart rate, average intensity (derived from suffer score thresholds: <30 = low, >70 = high, else moderate), and days since last activity. This profile is passed directly to Claude so workout playlists are calibrated to actual fitness patterns — not self-reported fitness level.

The user then describes their current workout in text, sets duration in minutes, and picks an intensity tier (Recovery / Moderate / Push It / Max Effort). Claude calculates the number of songs needed (duration ÷ 3.5 min) and generates a BPM-matched playlist with an energy arc shaped to that intensity tier.

### Breathing Session
Three breathing patterns:
- **Box Breathing** — 4 counts in · hold · out · hold
- **4-7-8** — Inhale 4 · hold 7 · exhale 8
- **Deep Breathing** — Inhale 5 · exhale 7, slow and restorative

Duration options: 5, 10, 15, or 20 minutes. On start, a meditation playlist begins and the PlayingView switches to a breathing overlay: an animated expanding/contracting orb with phase labels (Inhale / Hold / Exhale), a per-phase countdown, a total session countdown, and a cycle counter. Session-complete state shows "Session Complete" with total time breathed.

The phase sequencer reads exactly from the user's configured values — no fallback defaults. A ref-based interval (not state-based) drives the countdown to avoid re-render lag.

### Focus Session (Pomodoro)
Choose between Lo-Fi Beats or Deep House sonic mode. Set focus duration (25, 45, 60 min, or custom), break duration (5 or 10 min), and number of cycles (1–4). On start, a focus playlist plays and the PlayingView shows a large countdown timer, current cycle indicator, and a progress bar through the current focus block. When a focus block ends, Spotify playback pauses automatically, the visualizer dims, and a break overlay appears with its own countdown. When the break ends, playback resumes and the next focus block begins. After all cycles complete, a session completion screen appears.

---

## AI Architecture

### Core Streaming Pipeline
All playlist generation streams NDJSON line-by-line over a `ReadableStream`. The client reads the stream incrementally and emits tracks to the queue as they arrive — the first song begins playing while Claude is still generating the rest of the list. The stream protocol:

```
Line 1 (immediate): { playlistName, mood, arc, visualWorld, discoveryTracks[] }
Lines 2–N:          { id, name, uri, artists[] }  ← one track per line
```

### stream-playlist (`/api/ai/stream-playlist`)
Model: Claude Sonnet 4.6

The main playlist endpoint. Handles three context types: checkin, mood, and activity. Before calling Claude, it fetches in parallel: 20 liked songs (shuffled, filtered to exclude recently played), 30 recently played tracks, and Spotify recommendations seeded from the 5 most recent tracks. All three track lists are formatted and passed in the user prompt so Claude selects from actual library IDs.

The system prompt encodes a complete philosophy of music curation:
- Sonic character over lyrical theme
- Five genre "sonic universes" that must never be mixed (e.g. hip-hop + classic rock, country + EDM)
- BPM adjacency rules (±15 BPM between consecutive songs)
- Energy arc templates per activity type (workout: warm-up → peak → cooldown; emotional: meet the listener → deepen → resolve)
- Discovery track ratio: ~60% library, ~40% new
- Randomization via session ID + random seed injected into every prompt to prevent repetition

### Discovery Track Interleaving
Claude proposes 5–8 discovery songs by name in the metadata line. The server fires concurrent Spotify search requests for each, and they trickle into a `discoveryQueue`. As library tracks emit, every 3rd one is followed by a discovery track if available — new music surfaces naturally without overwhelming the listening experience.

### workout-playlist (`/api/ai/workout-playlist`)
Model: Claude Sonnet 4.6

Workout-specific variant. Takes the user's Strava `ActivityProfile` and builds a system prompt including exact BPM target ranges per intensity tier, energy arc structure specific to the intensity level, song count derived from duration, and activity-type parsing rules (trail run → organic sounds, gym/weights → hip-hop/rock, yoga → lower energy).

### Color Palette Classifier (`/lib/color-palettes.ts`)
Model: Claude Haiku 4.5

A lightweight call (max 50 tokens, 3-second ceiling) that reads the playlist mood, emotional arc, and original query and returns exactly one category word. Falls back to a default purple palette on timeout or error. Seven palettes: energetic, focused, melancholic, happy, calm, romantic, aggressive.

### continuation-playlist (`/api/ai/continuation-playlist`)
Model: Claude Sonnet 4.6

Unique among all endpoints in that it does not use the user's library at all — it is pure discovery. Given a seed track (name, artist, id, uri), Claude generates 15 songs in the same sonic universe via a non-streaming `messages.create()` call returning a JSON array. The server then fires 15 concurrent Spotify search requests in parallel (`Promise.all`) and streams the resolved tracks immediately without waiting for Claude again. The seed track itself is always the first chunk (`isFirst: true`), so the song that was already playing resumes seamlessly as the starting point of the new playlist.

The visual world defaults to a soft pastel fluid palette (`colorPalette: ['#C7CEEA', '#B5EAD7', '#FFDAC1', '#FFB7B2', '#E2F0CB']`, `motionStyle: 'fluid'`, `intensity: 0.5`) — neutral and flowing, since there's no mood context available.

### focus-playlist (`/api/ai/focus-playlist`)
Model: Claude Sonnet 4.6

Fully curated discovery playlist — ignores the user's library entirely. Takes `focusDuration`, `breakDuration`, `cycles`, and `sessionType` (`lofi` or `deephouse`). Songs needed = `Math.ceil((focusDuration × cycles) / 3.5)`.

The system prompt enforces **instrumental only** — zero vocals, zero lyrics anywhere in any track. Two carefully curated artist rosters:

- **Lo-Fi**: Idealism, Philanthrope, Flawed Mangoes, tomppabeats, Kupla, j^p^n, Vanilla, Sleepy Fish, Aso, Homage — warm vinyl, mellow jazz samples, BPM 75–95
- **Deep House**: Nils Frahm, Jon Hopkins, Floating Points, Four Tet, Bicep, Lone, Bonobo, Tycho, Khruangbin — hypnotic patterns, subtle bass, BPM 90–115

No artist can appear more than twice. Songs are ordered for consistent energy throughout — no peaks or valleys. Claude returns a JSON array, then all tracks are searched on Spotify in parallel and streamed synchronously (no discovery queue interleaving, as everything is already discovery).

### meditation-playlist (`/api/ai/meditation-playlist`)
Model: Claude Sonnet 4.6

The most restrictive of all endpoints. **Pure ambient only** — no beats, no rhythm, no percussion of any kind. Songs needed = `Math.ceil(duration / 4)` (assumes longer average ambient track length).

Curated artist roster: Brian Eno, Stars of the Lid, William Basinski, Harold Budd, Grouper, Tim Hecker, Max Richter, Nils Frahm (slower works only), Moby (Long Ambients series), Ólafur Arnalds, Johann Johannsson, The Caretaker.

The breathing pattern informs the character of track selection:
- **box (4-4-4-4)**: balanced sustained tones — steady and grounding
- **4-7-8**: very sparse, long decay tracks — deeply calming
- **deep**: warm minimal — restorative and gentle

Arc: first 20% of songs ease in (slightly more present), middle 60% are the deepest stillness (most sparse), last 20% soften back out (slightly warmer). Same parallel Spotify search + synchronous stream pattern as focus-playlist.

### estimate-features (`/api/ai/estimate-features`)
Model: Claude Haiku 4.5

When Spotify's audio features API cannot return data for a track (e.g. new releases, regional restrictions), this endpoint estimates them. Takes `trackName`, `artistName`, and `mood` context and returns a JSON object with `energy`, `valence`, `tempo`, `danceability`, and `acousticness` — all clamped to valid ranges. Claude uses its knowledge of the specific song's sonic character rather than genre assumptions. The Visualizer consumes these values to determine `motionStyle` in real time. Falls back to sensible defaults (`energy: 0.5`, `tempo: 120`, etc.) on any parse failure.

---

## Authentication & Token Management

### Spotify — PKCE OAuth 2.0

Wavelength uses the **PKCE (Proof Key for Code Exchange)** flow — no client secret is sent over the wire at any point. This is the correct OAuth 2.0 flow for user-facing web apps.

Flow:
1. **`/api/auth/spotify`** — Generates a 64-byte random `code_verifier` string and derives a `code_challenge` from it via `SHA-256 → base64url`. Both are stored as short-lived (10 min) `httpOnly` cookies alongside a random CSRF `state` value. Redirects the browser to `accounts.spotify.com/authorize` with the challenge and state.

2. **`/api/callback/spotify`** — Receives the `code` and `state` from Spotify. Validates `state` against the stored cookie to prevent CSRF. Exchanges `code + code_verifier` for tokens at `accounts.spotify.com/api/token`. Stores three `httpOnly` cookies: `spotify_access_token` (expires with the token), `spotify_refresh_token` (30-day lifetime), `spotify_token_expires_at` (absolute ms timestamp). PKCE cookies are deleted after exchange.

3. **`getSpotifyToken()` (`/lib/spotify-auth.ts`)** — Called at the top of every API route. Reads the three cookies and returns the access token immediately if valid. Proactively refreshes if the token is within 60 seconds of expiry — swapping all three cookies in the response. Throws `'Not authenticated with Spotify'` if no refresh token exists, which the API routes catch and return as HTTP 401.

**Scopes requested:**
```
user-read-currently-playing   — read what's playing on any device
user-top-read                 — user's top tracks/artists
user-read-recently-played     — recently played history
playlist-modify-private       — create/save playlists
user-library-read             — access liked songs
streaming                     — Web Playback SDK
user-read-email               — profile info
user-read-private             — profile info + country
```

### Strava — Standard OAuth 2.0

Strava does not support PKCE; it uses a standard server-side code exchange with a client secret stored in environment variables. Tokens stored as `httpOnly` cookies: `strava_access_token` (short-lived), `strava_refresh_token` (long-lived), `strava_token_expires_at`. `/api/strava/disconnect` deletes all three. The server-side Strava lib (`/lib/strava-server.ts`) handles token refresh before each API call.

---

## Spotify Data Layer (`/lib/spotify-data.ts`)

Four functions used across the app:

**`fetchLikedTracks(accessToken, limit)`** — Paginated fetch from `/v1/me/tracks`. Default limit 20 for playlist generation (50 for feature-aware flows). Follows Spotify's cursor-based `next` pagination URL automatically.

**`fetchLikedTracksWithFeatures(accessToken, limit)`** — Extended variant that fetches up to 200 liked tracks then retrieves audio features for all of them in two batches of 100 via `/v1/audio-features?ids=...`. Returns `SpotifyTrackWithFeatures[]` — each track augmented with its `energy`, `valence`, `tempo`, `danceability`, `acousticness`, etc.

**`fetchRecentlyPlayed(accessToken)`** — Fetches last 50 played tracks from `/v1/me/player/recently-played`. Used both to build the recommendation seed and to filter recently played songs out of the liked-songs pool (freshness).

**`fetchRecommendations(accessToken, params)`** — Calls `/v1/recommendations` seeded from up to 5 track IDs. Accepts optional target audio feature parameters (`targetValence`, `targetEnergy`, `targetTempo`, `targetDanceability`) for fine-grained similarity. Returns up to 20 recommendation tracks.

**`pickSeedTracks(likedTracks, target, count)`** — Utility used in feature-aware flows. Scores all liked tracks by Euclidean distance from a target `{valence, energy}` profile and returns the `count` closest track IDs to use as recommendation seeds. Enables musically coherent Spotify recommendations seeded from the user's own taste rather than arbitrary recent plays.

---

## Queue Manager Deep Dive (`/lib/queue-manager.ts`)

The queue is a **module-level singleton** — a plain object in module scope, not React state. This is intentional: React component trees unmount and remount, but the music must keep playing. The singleton survives any re-render or navigation within the app.

```ts
const state: QueueState = {
  currentTrack: null,
  queue: [],           // upcoming tracks
  isLoading: false,
  visualWorld: null,
  playlistName: '',
  mood: '',
}
const playedIds = new Set<string>()      // deduplication
const listeners = new Set<cb>()          // pub/sub
```

**`initQueue(firstTrack, query, meta)`** — Synchronously sets `currentTrack` and all visual metadata, emits to all listeners (so the UI renders immediately), then asynchronously imports `spotify-player` (dynamic import avoids SSR errors) and calls `playTrack(firstTrack.uri)`. `onTrackEnd` is registered before `playTrack` to guarantee no race condition on very short tracks.

**`enqueue(track)`** — Deduplicates via `playedIds`. Tracks that have already played in this session are silently dropped, preventing the same song from appearing twice across the initial stream and any subsequent refetch.

**Auto-refetch** — After each `advance()` call, if `state.queue.length < 10`, a background `refetch()` fires. This re-calls `/api/ai/stream-playlist` with the exact same query that started the session (`savedQuery`). New tracks trickle in via the same NDJSON stream parser, and deduplication via `playedIds` ensures nothing repeats. The user never encounters a "queue empty" state.

**`skipToNext()`** — Calls `advance()` then waits 300ms before calling `resumePlayer()`. The delay accounts for Spotify's device-side state propagation — without it, the resume can race the track switch and produce a brief playback stutter.

---

## Spotify Web Playback SDK (`/lib/spotify-player.ts`)

A thin wrapper around the Spotify Web Playback SDK that handles the SDK's awkward global initialization pattern. Key details:

- The SDK is loaded by injecting a `<script>` tag and waiting for the `window.onSpotifyWebPlaybackSDKReady` callback — this must happen client-side only, so the module uses dynamic import patterns
- The `Player` instance and `deviceId` are stored in module-level variables
- `initPlayer()` is called once in the dashboard's `useEffect` on mount and is guarded by a `playerReady` ref to prevent double-initialization in React StrictMode
- `playTrack(uri)` calls `PUT /v1/me/player/play` with `{ device_id, uris: [uri] }` via the `/api/spotify/playback` proxy route — all Spotify API calls are proxied through Next.js API routes so the access token never touches the browser
- `onTrackEnd(callback)` listens to `player_state_changed` events and fires the callback when `position === 0 && paused === true && duration > 0` — Spotify's SDK does not have an explicit "track ended" event, so this state combination is the reliable signal
- `togglePlay()`, `previousTrack()`, `nextTrack()`, `resumePlayer()`, and `setVolume()` are thin wrappers over the SDK's native Player methods

---

## API Route Reference

All routes live under `wavelength/app/api/`. Every route reads the Spotify access token from cookies via `getSpotifyToken()` and returns 401 on auth failure.

### AI Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/ai/stream-playlist` | POST | Main mood/activity/checkin playlist — NDJSON stream |
| `/api/ai/workout-playlist` | POST | Strava-aware workout playlist — NDJSON stream |
| `/api/ai/continuation-playlist` | POST | Seed-from-last-track — NDJSON stream |
| `/api/ai/focus-playlist` | POST | Instrumental focus session — NDJSON stream |
| `/api/ai/meditation-playlist` | POST | Pure ambient breathing session — NDJSON stream |
| `/api/ai/estimate-features` | POST | Audio feature estimation via Haiku |

### Auth Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/auth/spotify` | GET | Initiate Spotify PKCE OAuth — sets verifier/state cookies, redirects |
| `/api/auth/strava` | GET | Initiate Strava OAuth — redirects to Strava authorization |
| `/api/callback/spotify` | GET | Handle Spotify OAuth callback — exchange code, set token cookies |
| `/api/callback/strava` | GET | Handle Strava OAuth callback — exchange code, set token cookies |

### Spotify Proxy Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/spotify/me` | GET | User profile (display_name, images, id) |
| `/api/spotify/liked-songs` | GET | Paginated liked tracks |
| `/api/spotify/recently-played` | GET | Last 50 played tracks |
| `/api/spotify/recommendations` | GET | Spotify recommendations seeded from track IDs |
| `/api/spotify/last-played` | GET | Single most recent track + played_at timestamp |
| `/api/spotify/playback` | PUT | Control playback — play URI on device |
| `/api/spotify/create-playlist` | POST | Save generated playlist back to Spotify |
| `/api/spotify/token` | GET | Return current access token (for SDK initialization) |

### Strava Proxy Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/strava/activities` | GET | Fetch recent activities — returns `StravaActivity[]` |
| `/api/strava/disconnect` | POST | Clear all Strava cookies |

---

## Data Types

### `StravaActivity`
```ts
{
  id: number
  name: string
  sport_type: string          // 'Run' | 'Ride' | 'Walk' | 'Hike' | 'WeightTraining' | ...
  distance: number            // meters
  moving_time: number         // seconds
  elapsed_time: number        // seconds
  average_speed: number       // m/s
  max_speed: number           // m/s
  average_heartrate?: number
  max_heartrate?: number
  total_elevation_gain: number // meters
  suffer_score?: number       // 0–100, Strava's proprietary intensity metric
  start_date: string          // ISO 8601
  achievement_count: number
}
```

### `SpotifyTrack`
```ts
{
  id: string
  name: string
  uri: string                 // 'spotify:track:...'
  artists: { id: string; name: string }[]
  album: { id: string; name: string; images: { url: string }[] }
  duration_ms: number
  explicit: boolean
  preview_url: string | null
}
```

### `SpotifyAudioFeatures`
```ts
{
  id: string
  energy: number              // 0–1, perceptual intensity
  valence: number             // 0–1, musical positivity
  tempo: number               // BPM
  danceability: number        // 0–1
  acousticness: number        // 0–1
  instrumentalness: number    // 0–1
  speechiness: number         // 0–1
  loudness: number            // dB
  key: number                 // Pitch class 0–11
  mode: number                // 0 = minor, 1 = major
  time_signature: number
}
```

### `BreathingConfig` / `FocusConfig`
```ts
interface BreathingConfig {
  pattern: 'box' | '478' | 'deep'
  totalDuration: number       // minutes
  inhale: number              // seconds
  hold?: number               // seconds, absent for 'deep'
  exhale: number              // seconds
  holdAfterExhale?: number    // seconds, only for 'box'
}

interface FocusConfig {
  sessionType: 'lofi' | 'deephouse'
  focusMinutes: number
  breakMinutes: number
  cycles: number
}
```

---

## Visual System

Every playlist carries a `VisualWorld` object:

```ts
{
  motionStyle:   'turbulent' | 'landscape' | 'fluid' | 'geometric' | 'ethereal'
  intensity:     0.0–1.0
  atmosphere:    string
  shapeLanguage: string
  colorPalette:  string[]  // 5 hex colors from mood classifier
  backgroundType: 'dark' | 'light'
}
```

The Visualizer is a WebGL GLSL fullscreen shader. The hard constraint: zero hard edges anywhere. Every shape, form, and color transition uses `smoothstep()`, `mix()`, or continuous `sin/cos` math exclusively — no `step()`, no `floor()` for visual boundaries. The result looks like light through fog rather than a programmatically drawn graphic.

Two shader modes:
- **Ethereal** (calm/fluid): 2–3 large radial blobs drifting slowly, pulsating between radius 0.4–0.65 on a ~4s period, colors cycling slowly through the palette
- **Energetic** (pulse/driving): flowing sine wave bands that morph into a 4-petal vortex bloom at high energy, using polar coordinate math and domain warping. Crossfade between effects uses `smoothstep` on the energy uniform

Breathing mode switches to a cream `#FAF8F4` background with heavily pastelised orbs (`mix(color, vec3(1.0), 0.65)`) and dark text — a completely different feeling from the dark immersive default.

The fixed color palette — hot pink `#FF147A`, deep orange `#FF5900`, lavender `#B78CFA`, light mauve `#D9B8D1`, olive green `#667826`, yellow-orange `#FFB81A`, teal `#00B8B8` — cycles continuously so multiple colors are always visible simultaneously, with different screen regions at different points in the cycle.

If Spotify audio feature data is available (tempo, energy, valence, danceability, acousticness), these override the AI-assigned `motionStyle` using threshold rules — e.g. `tempo > 125 && energy > 0.65` → turbulent.

---

## Queue Manager (`/lib/queue-manager.ts`)

See Queue Manager Deep Dive above for full detail.

---

## Spotify Integration

See Authentication & Token Management, Spotify Data Layer, Spotify Web Playback SDK, and API Route Reference above for full detail.

---

## Strava Integration

See Authentication & Token Management and API Route Reference above for full detail. `buildActivityProfile()` computes aggregate fitness context from the last 10 activities and passes it directly to Claude as the `activityProfileSummary` string in the workout-playlist system prompt.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15, App Router, TypeScript |
| AI | Anthropic SDK — Claude Sonnet 4.6 (playlists), Claude Haiku 4.5 (mood classifier) |
| Music | Spotify Web API + Web Playback SDK |
| Fitness | Strava API v3 |
| Visualizer | WebGL GLSL shaders via HTML5 Canvas |
| Styling | Inline React styles |
| Fonts | Figtree (UI), Georgia italic (body copy) |
| State | Module-level singleton (queue), React useState (widget forms) |
| Deployment | Vercel |

---

## Next Steps

The current version is a desktop web app. The natural evolution is a full cross-platform wellness product with physiological awareness baked in at every layer.

### Mobile App
A native iOS app built to the same design language as the web dashboard. The bento grid adapts to a scrollable card stack — each widget a full-width card you swipe through. The playing view and GLSL visualizer translate directly to mobile. Haptic feedback synced to the breathing phase transitions (inhale → gentle pulse, hold → sustained pressure, exhale → release).

### Apple Watch App
A companion watchOS app that brings the core session experiences to the wrist:
- Breathing sessions with Taptic Engine feedback guiding each phase — no need to look at a screen
- Focus timer with a glanceable complication showing time remaining in the current block
- One-tap mood check-in (5 preset states) that generates a playlist on the phone immediately
- Session summaries surfaced in the Activity rings context

### Apple Watch Health Integration
The watch becomes a real-time physiological input to the AI. Rather than asking how you feel, Wavelength reads it:
- **Heart rate variability (HRV)** — low HRV signals stress or fatigue; Claude receives this as context and biases toward calmer, restorative playlists
- **Resting heart rate trends** — elevated over the past week suggests accumulated fatigue; workout playlists are calibrated down accordingly
- **Sleep data** — poor sleep the night before shifts the morning playlist toward gentle energy-building rather than high-intensity
- **Workout detection** — automatic workout type recognition from motion data triggers a workout playlist without any manual input
- **Blood oxygen** — low SpO2 during a breathing session surfaces a prompt to extend the session or switch to a more restorative pattern

### Real-Time EMG Sensor Integration
The most physiologically direct input: surface electromyography reads muscle electrical activity in real time. Integrated via a wearable forearm sensor (e.g. a next-gen Myo-style band or medical-grade patch):
- **Muscle tension during focus sessions** — elevated forearm EMG signals cognitive load or physical tension; the music shifts toward lower tempo and more harmonic content to ease arousal
- **Fatigue detection during workouts** — declining EMG amplitude and frequency toward end of a set signals muscle fatigue; the playlist arc adjusts to match, transitioning toward cooldown earlier than the timer would
- **Stress response** — combined HRV + EMG gives a richer real-time stress signal than either alone; breathing session phase durations adapt dynamically based on whether the body is responding
- **Post-exercise recovery tracking** — EMG normalization rate after a workout informs how long a cooldown playlist should run

The vision: Wavelength becomes a closed loop between your physiology and your sonic environment. The music isn't just matched to what you say you feel — it's matched to what your body is actually doing, updating in real time as your state changes throughout a session.

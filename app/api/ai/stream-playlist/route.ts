import { type NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSpotifyToken } from '@/lib/spotify-auth'
import { fetchLikedTracks, fetchRecentlyPlayed, fetchRecommendations } from '@/lib/spotify-data'
import { getMoodPalette } from '@/lib/color-palettes'
import type { SpotifyTrack } from '@/types/spotify'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

interface VisualWorld {
  colorPalette: string[]
  motionStyle: string
  intensity: number
  atmosphere: string
  shapeLanguage: string
  backgroundType?: 'dark' | 'light'
}

interface DiscoveryTrack {
  title: string
  artist: string
}

interface MetaLine {
  playlistName: string
  mood: string
  arc: string
  visualWorld: VisualWorld
  discoveryTracks?: DiscoveryTrack[]
}

export type TrackSource = 'liked' | 'recommended' | 'discovery'

interface StreamChunk {
  track: SpotifyTrack & { source: TrackSource }
  visualWorld: VisualWorld
  isFirst: boolean
  playlistName?: string
  mood?: string
  arc?: string
}

interface RequestBody {
  query: string
  type: 'checkin' | 'mood' | 'activity'
  context: Record<string, unknown>
}

function buildSystemPrompt(): string {
  return `You are a world-class music curator with deep knowledge of sonic character, emotional texture, and musical flow. You understand music the way a great DJ does — not just by genre or theme, but by how a song actually FEELS when you listen to it.

YOUR JOB:
Given a user's query (a mood, activity, feeling, or moment), build a playlist that serves that exact experience through sonic character — not just lyrical themes or artist associations.

HOW TO ANALYZE AND SELECT SONGS:

1. SONIC CHARACTER FIRST
   Always prioritize how a song SOUNDS over what it is ABOUT.
   - Tempo, energy, and dynamics are the primary selection criteria
   - A song about heartbreak that sounds triumphant is NOT a sad song
   - A song about partying that sounds melancholic IS appropriate for a melancholic playlist
   - Ask yourself: if someone put this on while in this mood/doing this activity, would it feel right or jarring?

2. INTERPRET THE QUERY DEEPLY
   Parse the user's natural language to understand:
   - The PHYSICAL state (working out, sleeping, driving, cooking, studying)
   - The EMOTIONAL state (sad, anxious, euphoric, focused, nostalgic)
   - The ENERGY LEVEL needed (low, medium, high, building)
   - The ENVIRONMENT implied (late night alone, crowded gym, road trip, bedroom)
   Use all of these to build a precise sonic brief before selecting songs.

3. EMOTIONAL ARC — THIS IS CRITICAL
   Every playlist must tell a story through its song order. Structure it like a DJ set or film score:

   For HIGH ENERGY activities (workout, running, dancing):
   - Songs 1-3: Warm up — medium energy, building momentum
   - Songs 4-8: Peak — highest energy, most intense
   - Songs 9-12: Sustain — maintain intensity with variety
   - Songs 13-15: Cool down — gradually reduce energy

   For FOCUS/STUDY:
   - Songs 1-3: Ease in — gentle, minimal, settling
   - Songs 4-10: Deep focus zone — steady, non-distracting, consistent
   - Songs 11-15: Wind down — slightly softer, completing the session

   For EMOTIONAL moods (sad, nostalgic, romantic, anxious):
   - Songs 1-3: Meet the listener where they are — match the feeling exactly
   - Songs 4-8: Deepen into the emotion — the most emotionally resonant tracks
   - Songs 9-12: Shift slightly — begin processing or moving through the emotion
   - Songs 13-15: Land somewhere — resolution, acceptance, or gentle uplift

   For CASUAL/AMBIENT (cooking, background, chilling):
   - Consistent energy throughout — no jarring peaks or valleys
   - Variety within a narrow sonic band
   - Songs that work as background AND reward close listening

4. SONIC COHERENCE BETWEEN SONGS
   Adjacent songs in the playlist should feel like natural neighbors:
   - Similar tempo range (within 15-20 BPM of each other unless intentional shift)
   - Compatible keys and tonality where possible
   - Matching production era or aesthetic
   - Energy levels that flow — no sudden jumps from quiet to loud

5. DISCOVERY BALANCE
   Mix familiar and new in this ratio:
   - 60% songs the user likely knows and loves (from their library)
   - 40% discovery tracks they might not know but will love

   For discovery tracks, choose:
   - Artists in the same sonic universe as what the user listens to
   - Deep cuts and album tracks over famous singles
   - Songs that feel like natural extensions of the user's taste
   - NOT just the most famous song by a recommended artist

6. WHAT TO AVOID
   - Do not include songs just because they are famous or critically acclaimed if they don't fit the sonic brief
   - Do not mix drastically different energy levels without intentional arc
   - Do not choose songs based on lyrical theme alone
   - Do not repeat artists within 4-5 songs of each other
   - Do not include songs that are associated with a different emotional context (e.g. triumphant anthems in a sad playlist, aggressive trap in a meditation playlist)

7. QUALITY BAR
   Every song you include should pass this test:
   "If I played this song for someone in this exact mood/doing this exact activity, would they feel understood and served?"
   If the answer is no or maybe, do not include it.

8. GENRE AND SONIC UNIVERSE COHERENCE
   A playlist must exist within a coherent sonic universe. Songs should feel like they belong to the same world — even if they span different artists or eras.

   GENRE CLUSTERING RULES:
   - Do not mix genres that have fundamentally different sonic DNA unless the user explicitly asks for a mashup
   - These genres should NEVER appear in the same playlist:
     * Hip-hop/rap with classic rock or folk
     * Heavy metal with jazz or bossa nova
     * Country with electronic/EDM
     * Drill/trap with ambient or new age
     * Opera or classical with trap beats

   WHAT DEFINES A SONIC UNIVERSE:
   - Production style: live band vs electronic vs hybrid
   - Instrumentation: guitar-driven vs synth-driven vs sample-based vs orchestral
   - Vocal style: rapped vs sung vs instrumental
   - Era: analog warmth vs digital crispness vs lo-fi vs hi-fi
   - Cultural context: underground vs mainstream vs indie vs commercial

   EXAMPLES OF COHERENT SONIC UNIVERSES:
   - Sad indie: Phoebe Bridgers, Mitski, Sufjan Stevens, Bon Iver, Adrianne Lenker — all share acoustic intimacy, gentle production, confessional vocals
   - High energy hip-hop: Travis Scott, Playboi Carti, Future, Lil Uzi Vert — all share 808s, trap production, high BPM, aggressive energy
   - Classic rock energy: Led Zeppelin, AC/DC, Foo Fighters, The Black Keys, Queens of the Stone Age — all share guitar-driven, live-band energy
   - Melancholic electronic: James Blake, Burial, Bon Iver (electronic era), The xx, Portishead — all share sparse electronic production with emotional weight
   - Upbeat pop: Dua Lipa, Doja Cat, Lizzo, Cardi B, Beyoncé — all share polished production, danceable beats, confident energy

   CROSS-GENRE RULE:
   Before adding any song ask: "Does this song share instrumentation, production style, AND energy with the other songs in this playlist?"
   If the answer is no to more than one of those — do not include it.

   BPM AND ENERGY MATCHING:
   - Each song should be within 15 BPM of adjacent songs unless there is an intentional arc shift
   - Energy levels should flow — never jump from 0.3 to 0.9 energy without 2-3 bridge songs
   - Valence should be consistent within sections — do not mix deeply sad songs with upbeat ones in the same section

   INSTRUMENTATION COHERENCE:
   - Guitar-based songs should stay with guitar-based songs
   - Electronic production should stay with electronic production
   - Acoustic songs should stay with acoustic songs
   - If mixing, use bridge tracks that blend both worlds

   THE JAY-Z AND LED ZEPPELIN RULE:
   Even if both are "high energy" or both are "classic" — they exist in completely different sonic universes (sample-based hip-hop production vs live rock instrumentation) and should never appear in the same playlist unless the user explicitly asks for a genre-crossing mix.

9. VARIETY AND SURPRISE
   Never default to the most obvious song choices. Each time a query is run:
   - Explore different corners of the user's library
   - Choose different discovery artists than the most famous examples
   - Vary the energy arc — sometimes start slower, sometimes jump in immediately
   - Include at least 3-4 songs the user might not expect but will love
   - If a song is an obvious choice (the most famous song for a mood), skip it and find something more interesting
   - Think of each playlist as a unique session — no two should feel the same

OUTPUT FORMAT — NDJSON only, no markdown, no code fences, no extra text:

Line 1 (output IMMEDIATELY): {"playlistName":"...","mood":"...","arc":"...","visualWorld":{"motionStyle":"...","intensity":0.0-1.0,"atmosphere":"...","shapeLanguage":"..."},"discoveryTracks":[{"title":"...","artist":"..."},...]}
Lines 2–16: exactly 15 library tracks, one per line: {"id":"...","name":"...","uri":"...","artists":[{"name":"..."}]}

The arc field must explicitly describe the emotional/energy journey of the playlist — not just the mood, but how it moves from start to finish (e.g. "Starts low and aching, deepens into the grief through the middle, then gently surfaces toward acceptance by the end").

Additional rules:
- Output line 1 before anything else
- 15 tracks: ~10 liked, ~5 from recently played/recommendations. Never invent tracks — only use provided library IDs.
- discoveryTracks: 5-8 real songs outside the library that pass the sonic character test, exact Spotify artist names
- motionStyle must be one of: turbulent, landscape, fluid, geometric, ethereal
  turbulent=high energy fast tempo | landscape=uplifting euphoric | geometric=rhythmic focused | ethereal=acoustic meditative | fluid=melancholic slow
- intensity 0.0–1.0`
}

function buildUserPrompt(type: string, context: Record<string, unknown>, query: string): string {
  switch (type) {
    case 'checkin': {
      const c = context as { feeling?: string; dayOutlook?: string; energyLevel?: string }
      return `Daily check-in:
- Feeling: "${c.feeling ?? ''}"
- Day outlook: "${c.dayOutlook ?? ''}"
- Energy: "${c.energyLevel ?? ''}"
${query ? `\n${query}` : ''}

Create a 15-track playlist with an emotional arc — start where they are, guide them toward where they want to be.`
    }
    case 'mood': {
      const c = context as { emotion?: string; energy?: number }
      return `Current mood:
- Emotion: "${c.emotion ?? ''}"
- Energy: ${c.energy ?? 0.5} (0=very low, 1=very high)
${query ? `\n${query}` : ''}

Create a 15-track playlist that sustains this exact mood throughout.`
    }
    default: {
      const c = context as { activity?: string }
      return `Activity: "${c.activity ?? ''}"
${query ? `\n${query}` : ''}

Create a 15-track playlist optimized for this activity from start to finish.`
    }
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function formatTrackList(tracks: SpotifyTrack[], label: string): string {
  if (tracks.length === 0) return ''
  return `${label} (${tracks.length}):\n${tracks
    .map((t) => `${t.name} — ${t.artists.map((a) => a.name).join(', ')} [id:${t.id}][uri:${t.uri}]`)
    .join('\n')}`
}


export async function POST(request: NextRequest) {
  const routeStart = Date.now()
  try {
    const body: RequestBody = await request.json()
    const { query = '', type, context } = body

    const { accessToken } = await getSpotifyToken()
    console.log('[stream-playlist] token fetched in', Date.now() - routeStart, 'ms')

    const [likedTracks, recentTracks] = await Promise.all([
      fetchLikedTracks(accessToken, 20).catch(() => [] as SpotifyTrack[]),
      fetchRecentlyPlayed(accessToken).catch(() => [] as SpotifyTrack[]),
    ])
    console.log('[stream-playlist] library fetched in', Date.now() - routeStart, 'ms — liked:', likedTracks.length, 'recent:', recentTracks.length)

    const seedIds = recentTracks.slice(0, 5).map((t) => t.id)
    const recommendations =
      seedIds.length > 0
        ? await fetchRecommendations(accessToken, { seedTrackIds: seedIds }).catch(
            () => [] as SpotifyTrack[],
          )
        : []

    const likedIds = new Set(likedTracks.map((t) => t.id))
    const recommendedIds = new Set(recommendations.map((t) => t.id))
    const recentlyPlayedIds = new Set(recentTracks.map((t) => t.id))

    // Shuffle liked songs and exclude recently played so each session feels fresh
    const freshLiked = shuffleArray(likedTracks)
      .filter((t) => !recentlyPlayedIds.has(t.id))
      .slice(0, 20)

    const sessionId = Math.random().toString(36).slice(2, 8)
    const randomSeed = Math.random().toFixed(4)
    const timeOfDay = new Date().getHours()

    const userPrompt = `Session context: ${sessionId}. Random seed: ${randomSeed}. Time: ${timeOfDay}:00.
Use this seed to vary your song selection — choose different tracks than you might normally default to.
Explore different corners of the user's library and different discovery artists each time.
Avoid defaulting to the most obvious or well-known tracks. Surprise the user with variety.

${buildUserPrompt(type, context, query)}

---
MUSIC LIBRARY:

${formatTrackList(freshLiked, 'LIKED SONGS')}

${formatTrackList(recentTracks.slice(0, 30), 'RECENTLY PLAYED')}

${formatTrackList(recommendations, 'RECOMMENDATIONS')}
---

Output line 1 (metadata + discoveryTracks) immediately, then output each library track on its own line.`

    const encoder = new TextEncoder()

    console.log('[stream-playlist] starting Claude stream at', Date.now() - routeStart, 'ms')
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const claudeStream = client.messages.stream({
          model: MODEL,
          max_tokens: 2000,
          system: buildSystemPrompt(),
          messages: [{ role: 'user', content: userPrompt }],
        })

        let buffer = ''
        const metaStore: MetaLine[] = []
        let pendingPalettePromise: Promise<void> | null = null
        let paletteApplied = false
        let trackIndex = 0
        let libraryEmitCount = 0
        // Discovery tracks trickle in here as individual Spotify searches complete
        const discoveryQueue: SpotifyTrack[] = []
        let allDiscoveryDone: Promise<void> = Promise.resolve()

        function resolveSource(id: string): TrackSource {
          if (likedIds.has(id)) return 'liked'
          if (recommendedIds.has(id)) return 'recommended'
          return 'liked'
        }

        function emitTrack(track: SpotifyTrack, source: TrackSource): void {
          const meta = metaStore[0]!
          const isFirst = trackIndex === 0
          const chunk: StreamChunk = {
            track: { ...track, source },
            visualWorld: meta.visualWorld,
            isFirst,
            ...(isFirst
              ? { playlistName: meta.playlistName, mood: meta.mood, arc: meta.arc }
              : {}),
          }
          controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'))
          trackIndex++
        }

        async function processLibraryTrack(track: SpotifyTrack): Promise<void> {
          if (!paletteApplied && pendingPalettePromise) {
            await pendingPalettePromise
            paletteApplied = true
          }
          emitTrack(track, resolveSource(track.id))
          libraryEmitCount++
          // After every 3rd library track, slot in a discovery track if one has resolved
          if (libraryEmitCount % 3 === 0 && discoveryQueue.length > 0) {
            emitTrack(discoveryQueue.shift()!, 'discovery')
          }
        }

        try {
          for await (const event of claudeStream) {
            if (
              event.type !== 'content_block_delta' ||
              event.delta.type !== 'text_delta'
            ) continue

            buffer += event.delta.text
            let idx: number
            while ((idx = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, idx).trim()
              buffer = buffer.slice(idx + 1)
              if (!line) continue
              try {
                const parsed = JSON.parse(line)
                if (metaStore.length === 0 && 'visualWorld' in parsed) {
                  const m = parsed as MetaLine
                  m.visualWorld.colorPalette = []
                  metaStore.push(m)

                  // Fire individual Spotify searches so results trickle into discoveryQueue
                  if (m.discoveryTracks?.length) {
                    const individualPromises = m.discoveryTracks.map(({ title, artist }) =>
                      fetch(
                        `https://api.spotify.com/v1/search?q=${encodeURIComponent(`track:${title} artist:${artist}`)}&type=track&limit=1`,
                        { headers: { Authorization: `Bearer ${accessToken}` } },
                      )
                        .then((r) => r.json())
                        .then((data) => {
                          const track = data.tracks?.items?.[0] as SpotifyTrack | undefined
                          if (track) discoveryQueue.push(track)
                        })
                        .catch(() => {}),
                    )
                    allDiscoveryDone = Promise.allSettled(individualPromises).then(() => {})
                  }

                  console.log('[stream-playlist] meta line received at', Date.now() - routeStart, 'ms')
                  pendingPalettePromise = getMoodPalette(m.mood, m.arc, query).then((palette) => {
                    m.visualWorld.colorPalette = palette.colors
                    m.visualWorld.backgroundType = palette.background
                  })
                } else if (metaStore.length > 0 && 'id' in parsed) {
                  await processLibraryTrack(parsed as SpotifyTrack)
                }
              } catch {
                // skip malformed lines
              }
            }
          }

          // Handle any buffered remainder
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim())
              if (metaStore.length > 0 && 'id' in parsed) {
                await processLibraryTrack(parsed as SpotifyTrack)
              }
            } catch {
              // skip
            }
          }

          // Wait for all discovery searches to finish then emit whatever's left
          if (metaStore[0]) {
            await allDiscoveryDone
            for (const dt of discoveryQueue) {
              emitTrack(dt, 'discovery')
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream error'
          controller.enqueue(encoder.encode(JSON.stringify({ error: msg }) + '\n'))
        }

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = message.includes('Not authenticated') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

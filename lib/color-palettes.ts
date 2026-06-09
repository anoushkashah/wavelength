export interface ColorPalette {
  name: string
  colors: string[] // exactly 5 hex colors
  background: 'dark' | 'light'
}

export const COLOR_PALETTES: Record<string, ColorPalette> = {
  energetic: {
    name: 'energetic',
    colors: ['#FF2D6B', '#FF6B00', '#CC1C00', '#0A0A0A', '#FFFFFF'],
    background: 'dark',
  },
  focused: {
    name: 'focused',
    colors: ['#1C2B4A', '#8090A8', '#E8EDF5', '#080D1A', '#7ABFCC'],
    background: 'dark',
  },
  melancholic: {
    name: 'melancholic',
    colors: ['#9B8EAD', '#C4A8B8', '#8A8080', '#1A1618', '#EDE0E5'],
    background: 'dark',
  },
  happy: {
    name: 'happy',
    colors: ['#FF2D6B', '#FFB085', '#FFD166', '#FFF8F0', '#FF7F5C'],
    background: 'light',
  },
  calm: {
    name: 'calm',
    colors: ['#B8C9B0', '#F5F0E8', '#D4A8A0', '#C8C4C0', '#F0EDE8'],
    background: 'light',
  },
  romantic: {
    name: 'romantic',
    colors: ['#4A1020', '#C47080', '#E8B0B8', '#0D080A', '#C8A870'],
    background: 'dark',
  },
  aggressive: {
    name: 'aggressive',
    colors: ['#000000', '#8B0000', '#FF4500', '#CCFF00', '#FFFFFF'],
    background: 'dark',
  },
  default: {
    name: 'default',
    colors: ['#1a0533', '#4a0080', '#8b00ff', '#c77dff', '#e0aaff'],
    background: 'dark',
  },
}

export async function getMoodPalette(
  mood: string,
  arc: string,
  query: string,
): Promise<ColorPalette> {
  const start = Date.now()
  console.log('[getMoodPalette] starting call...')

  let resolved = false

  const classifyPromise = fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: `Given this music playlist context, classify it into exactly one of these mood categories: energetic, focused, melancholic, happy, calm, romantic, aggressive.

Playlist mood: "${mood}"
Emotional arc: "${arc}"
User query: "${query}"

Use full semantic understanding — do not look for exact words. Examples:
- "sweat-soaked arena, neon-lit gym, power surge" → energetic
- "quiet sadness and stillness, drifting" → melancholic
- "locked in flow, deep concentration" → focused
- "soft morning light, gentle breathing" → calm
- "celebration, dancing, pure joy" → happy
- "intimate warmth, closeness" → romantic
- "rage, darkness, chaos" → aggressive

Reply with ONLY the single category word, nothing else.`,
        },
      ],
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      console.log('[getMoodPalette] full response:', JSON.stringify(data))
      const textContent = (data.content as Array<{ type: string; text?: string }> | undefined)
        ?.find((c) => c.type === 'text')
      const rawText = textContent?.text ?? ''
      console.log('[getMoodPalette] raw text:', rawText)
      const category = rawText.trim().toLowerCase().split('\n')[0].split(' ')[0]
      console.log('[getMoodPalette] completed in', Date.now() - start, 'ms, category:', category)
      resolved = true
      return COLOR_PALETTES[category] ?? COLOR_PALETTES.default
    })
    .catch((err) => {
      console.log('[getMoodPalette] error:', err)
      resolved = true
      return COLOR_PALETTES.default
    })

  const timeoutPromise = new Promise<ColorPalette>((resolve) =>
    setTimeout(() => {
      if (!resolved) {
        console.log('[getMoodPalette] timed out after 3000ms, using default')
        resolve(COLOR_PALETTES.default)
      }
    }, 3000),
  )

  return Promise.race([classifyPromise, timeoutPromise])
}

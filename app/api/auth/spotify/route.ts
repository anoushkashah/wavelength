import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  buildSpotifyAuthUrl,
  generateCodeChallenge,
  generateCodeVerifier,
} from '@/lib/spotify'

export async function GET() {
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const state = generateCodeVerifier().slice(0, 16)

  const cookieStore = await cookies()
  cookieStore.set('spotify_code_verifier', verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  })
  cookieStore.set('spotify_auth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })

  const authUrl = buildSpotifyAuthUrl(challenge, state)
  return NextResponse.redirect(authUrl)
}

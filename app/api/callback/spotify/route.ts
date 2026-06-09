import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/spotify'

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
  const storedState = cookieStore.get('spotify_auth_state')?.value
  const verifier = cookieStore.get('spotify_code_verifier')?.value

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${appUrl}/?error=state_mismatch`)
  }

  if (!verifier) {
    return NextResponse.redirect(`${appUrl}/?error=missing_verifier`)
  }

  try {
    const tokens = await exchangeCodeForTokens(code, verifier)

    const isProduction = process.env.NODE_ENV === 'production'
    const tokenMaxAge = tokens.expires_in

    cookieStore.set('spotify_access_token', tokens.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: tokenMaxAge,
      path: '/',
    })
    cookieStore.set('spotify_refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
    cookieStore.set('spotify_token_expires_at', String(Date.now() + tokenMaxAge * 1000), {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: tokenMaxAge,
      path: '/',
    })

    // Clean up PKCE cookies
    cookieStore.delete('spotify_code_verifier')
    cookieStore.delete('spotify_auth_state')

    return NextResponse.redirect(`${appUrl}/dashboard`)
  } catch {
    return NextResponse.redirect(`${appUrl}/?error=token_exchange_failed`)
  }
}

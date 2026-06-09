'use client'

import { useState } from 'react'
import { Figtree } from 'next/font/google'

const figtree = Figtree({ subsets: ['latin'], weight: ['300', '500'] })

export default function Home() {
  const [hovered, setHovered] = useState(false)

  return (
    <main style={{
      width: '100vw',
      height: '100vh',
      background: '#f0ece4',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <style>{`
        @keyframes ripple {
          0%   { transform: translate(-50%, -50%) scale(0.95); opacity: 0.85; }
          50%  { transform: translate(-50%, -50%) scale(1.05); opacity: 0.70; }
          100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.85; }
        }
        @keyframes ripple2 {
          0%   { transform: translate(-50%, -50%) scale(1.0); opacity: 0.70; }
          50%  { transform: translate(-50%, -50%) scale(0.92); opacity: 0.88; }
          100% { transform: translate(-50%, -50%) scale(1.0); opacity: 0.70; }
        }
        body { overflow: hidden; margin: 0; padding: 0; }
      `}</style>

      {/* Layer 1 — deep teal center */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        width: '500px', height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(20,110,95,0.75) 0%, rgba(20,110,95,0) 35%)',
        filter: 'blur(20px)',
        animation: 'ripple 7s ease-in-out infinite',
      }} />

      {/* Layer 2 — main teal body */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        width: '750px', height: '750px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(45,160,140,0.60) 0%, rgba(45,160,140,0.28) 40%, rgba(45,160,140,0) 70%)',
        filter: 'blur(35px)',
        animation: 'ripple2 9s ease-in-out infinite',
      }} />

      {/* Layer 3 — mauve ring */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        width: '850px', height: '850px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(160,100,140,0) 30%, rgba(160,100,140,0.35) 55%, rgba(160,100,140,0) 75%)',
        filter: 'blur(30px)',
        animation: 'ripple 7s ease-in-out infinite',
      }} />

      {/* Layer 4 — outer soft fade */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        width: '1100px', height: '1100px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(60,170,150,0.18) 0%, rgba(60,170,150,0) 70%)',
        filter: 'blur(60px)',
        animation: 'ripple2 9s ease-in-out infinite',
      }} />

      {/* Grain overlay */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%', height: '100%',
        zIndex: 5,
        pointerEvents: 'none',
        opacity: 0.035,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
        backgroundSize: '128px 128px',
      }} />

      {/* Wordmark + tagline */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <h1 style={{
          fontFamily: figtree.style.fontFamily,
          fontWeight: 200,
          fontSize: 'clamp(40px, 6vw, 82px)',
          color: 'rgba(255, 255, 255, 0.92)',
          letterSpacing: '0.06em',
          margin: 0,
          textShadow: '0 1px 40px rgba(80,190,175,0.3)',
          userSelect: 'none',
        }}>
          Wavelength
        </h1>
        <p style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: 'clamp(14px, 1.5vw, 19px)',
          color: 'rgba(255, 255, 255, 0.55)',
          letterSpacing: '0.04em',
          margin: '10px 0 0 0',
          userSelect: 'none',
        }}>
          music for the moment
        </p>
      </div>

      {/* Get Started button — fixed bottom center */}
      <div style={{ position: 'fixed', bottom: '44px', left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
        <button
          onClick={() => { window.location.href = '/api/auth/spotify' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: 'relative',
            overflow: 'hidden',
            background: '#f0ece4',
            border: 'none',
            borderRadius: '100px',
            padding: '14px 52px',
            fontFamily: figtree.style.fontFamily,
            fontWeight: 300,
            fontSize: '14px',
            letterSpacing: '0.08em',
            color: '#2a2a2a',
            cursor: 'pointer',
            boxShadow: hovered
              ? '0 4px 28px rgba(0,0,0,0.13)'
              : '0 2px 20px rgba(0,0,0,0.08)',
            transition: 'box-shadow 0.3s ease',
            whiteSpace: 'nowrap',
          }}
        >
          {/* Inner pink glow ring */}
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '100px',
            background: 'transparent',
            boxShadow: 'inset 0 0 18px 4px rgba(255, 60, 140, 0.18), inset 0 0 6px 1px rgba(255, 60, 140, 0.10)',
            pointerEvents: 'none',
          }} />
          <span style={{ position: 'relative', zIndex: 1 }}>Get Started</span>
        </button>
      </div>
    </main>
  )
}

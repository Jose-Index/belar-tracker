'use client'
import { useState, useEffect } from 'react'

export default function Header() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        weekday: 'short', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="bg-white/95 backdrop-blur-sm border-b border-stone-200 px-4 sm:px-6 py-2.5 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-2.5">
        {/* Logo moneda inline (mismo concepto que el favicon) */}
        <div className="relative w-7 h-7 shrink-0">
          <svg viewBox="0 0 32 32" className="w-full h-full">
            <defs>
              <linearGradient id="hdrCoin" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#34c759"/>
                <stop offset="100%" stopColor="#2EA543"/>
              </linearGradient>
            </defs>
            <circle cx="16" cy="17" r="13" fill="#155522" opacity="0.4"/>
            <circle cx="16" cy="16" r="13" fill="url(#hdrCoin)"/>
            <circle cx="16" cy="16" r="10.5" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="0.5"/>
            <text x="16" y="20.5" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="13" fontWeight="800" fill="#ffffff" letterSpacing="-0.5">B</text>
          </svg>
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-bold tracking-[0.18em] text-slate-800">BELAR</h1>
          <span className="text-[9px] text-slate-400 tracking-[0.15em] font-medium uppercase">Tracker · v11</span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60 animate-ping" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-green-500" />
          </span>
          live
        </span>
        <span className="text-stone-300">·</span>
        <span>{time}</span>
      </div>
    </header>
  )
}

'use client'
import { useState, useEffect } from 'react'

export default function Header() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const opts = {
        timeZone: 'Europe/Madrid',
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }
      setTime(now.toLocaleString('es-ES', opts))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-bold tracking-widest text-etoro">BELAR</h1>
        <span className="text-[10px] text-slate-400 tracking-wide">TRACKER v9 · Capa JOSE</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        {time}
      </div>
    </header>
  )
}

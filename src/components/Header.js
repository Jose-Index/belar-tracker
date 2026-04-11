'use client'
import { useState, useEffect } from 'react'

export default function Header({ onCloseWeek, onCloseYear }) {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-bold tracking-widest text-etoro">BELAR</h1>
        <span className="text-[10px] text-slate-400 tracking-wide">TRACKER v9 · Capa JOSE</span>
      </div>
      <div className="flex items-center gap-3">
        {onCloseYear && (
          <button onClick={onCloseYear}
            className="px-2 py-0.5 text-[8px] font-semibold tracking-wider text-red-400 border border-red-100 rounded hover:bg-red-50 hover:text-red-600 transition-colors">
            CERRAR AÑO
          </button>
        )}
        {onCloseWeek && (
          <button onClick={onCloseWeek}
            className="px-3 py-1.5 text-[10px] font-bold tracking-wider text-etoro border border-green-300 rounded-md hover:bg-green-50 transition-colors">
            CERRAR SEMANA
          </button>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          {time}
        </div>
      </div>
    </header>
  )
}

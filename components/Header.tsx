'use client'
import { useEffect, useState } from 'react'

interface Props {
  syncStatus: 'idle'|'saving'|'saved'|'error'
  syncMsg: string
  onCloseWeek: () => void
}

const syncColors = {
  idle: '#727a87', saving: '#e8a030', saved: '#2ecc8a', error: '#e05555'
}

export default function Header({ syncStatus, syncMsg, onCloseWeek }: Props) {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      try {
        const p = new Intl.DateTimeFormat('es-ES', {
          timeZone: 'Europe/Madrid', day:'2-digit', month:'2-digit', year:'2-digit',
          hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false
        }).formatToParts(new Date())
        const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
        setTime(`${g('day')}/${g('month')}/${g('year')} · ${g('hour')}:${g('minute')}:${g('second')} CET`)
      } catch {}
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '.6rem 1.4rem', background: '#13161a',
      borderBottom: '1px solid #2f3540', gap: 10, flexWrap: 'wrap'
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.22em', color: '#2EA543' }}>BELAR</span>
        <span style={{ fontSize: 10, color: '#727a87', letterSpacing: '.05em' }}>Portfolio Tracker v8</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#adb5c0', whiteSpace: 'nowrap' }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: '#2ecc8a', marginRight: 5, verticalAlign: 'middle',
            animation: 'pulse 2s ease-in-out infinite'
          }} />
          {time}
        </span>
        <span style={{
          fontSize: 9, padding: '2px 7px', borderRadius: 3, whiteSpace: 'nowrap',
          color: syncColors[syncStatus],
          border: `1px solid ${syncColors[syncStatus]}`,
          transition: 'all .3s'
        }}>{syncMsg}</span>
        <button onClick={onCloseWeek} style={{
          background: 'transparent', border: '1px solid rgba(46,165,67,.5)',
          color: '#2EA543', borderRadius: 4, padding: '4px 11px',
          fontSize: 10, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap'
        }}>✓ Cerrar semana</button>
      </div>
    </header>
  )
}

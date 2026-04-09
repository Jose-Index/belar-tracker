'use client'
import { useState, useEffect } from 'react'

export default function TickerBar() {
  const [tickers, setTickers] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/tickers')
        const data = await res.json()
        setTickers(data)
      } catch (e) { /* silent */ }
    }
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [])

  if (!tickers.length) return <div className="h-8 bg-white border-b border-slate-100" />

  const items = [...tickers, ...tickers, ...tickers]

  return (
    <div className="bg-white border-b border-slate-100 overflow-hidden h-8 flex items-center">
      <div className="ticker-track flex items-center gap-10 px-4 whitespace-nowrap">
        {items.map((t, i) => {
          const up = t.changePct != null ? t.changePct >= 0 : null
          return (
            <a key={i} href={`https://finance.yahoo.com/quote/${t.symbol}`}
              target="_blank" rel="noopener"
              className="flex items-center gap-1.5 text-[11px] hover:opacity-70 transition-opacity shrink-0">
              <span className="font-semibold text-slate-500">{t.label}</span>
              {t.price != null ? (
                <>
                  <span className="font-mono font-bold text-slate-800">
                    {t.symbol === 'EURUSD=X' ? t.price.toFixed(4) : t.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                  <span className={`font-mono text-[10px] font-bold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
                    {up ? '▲' : '▼'}{Math.abs(t.changePct || 0).toFixed(2)}%
                  </span>
                </>
              ) : (
                <span className="text-slate-300">—</span>
              )}
              {i < items.length - 1 && <span className="text-slate-200 ml-2">│</span>}
            </a>
          )
        })}
      </div>
    </div>
  )
}

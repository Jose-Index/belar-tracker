'use client'
import { useState } from 'react'
import { BROKER_COLORS, BROKER_NAMES, CLASS_COLORS, formatCurrency, pnlColor } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

// Favicon sources: stockanalysis.com is most reliable for stock logos
const FAVICON_MAP = {
  'AROC': 'https://stockanalysis.com/img/s/AROC-80.png',
  'FIX': 'https://stockanalysis.com/img/s/FIX-80.png',
  'IAU': 'https://stockanalysis.com/img/s/IAU-80.png',
  'NEM': 'https://stockanalysis.com/img/s/NEM-80.png',
  'SHELL.L': 'https://logo.clearbit.com/shell.com',
  'Thomaspj': null, // CopyTrader - initials badge
  'DVN': 'https://stockanalysis.com/img/s/DVN-80.png',
  'DIA': 'https://stockanalysis.com/img/s/DIA-80.png',
  'EOG': 'https://stockanalysis.com/img/s/EOG-80.png',
  'ICE': 'https://stockanalysis.com/img/s/ICE-80.png',
  'CME': 'https://stockanalysis.com/img/s/CME-80.png',
  'HWM': 'https://stockanalysis.com/img/s/HWM-80.png',
  'ROST': 'https://stockanalysis.com/img/s/ROST-80.png',
  'MU': 'https://stockanalysis.com/img/s/MU-80.png',
  'NVDA': 'https://stockanalysis.com/img/s/NVDA-80.png',
  'AVGO': 'https://stockanalysis.com/img/s/AVGO-80.png',
  'PUIG': 'https://logo.clearbit.com/puig.com',
}

function TickerIcon({ ticker }) {
  const url = FAVICON_MAP[ticker]
  if (url === null) {
    // Show initials badge for CopyTraders
    return (
      <div className="w-5 h-5 rounded-md bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
        <span className="text-[8px] font-bold text-white leading-none">{ticker.substring(0, 2).toUpperCase()}</span>
      </div>
    )
  }
  const src = url || `https://logo.clearbit.com/${ticker.toLowerCase().replace('.l','')}.com`
  return (
    <img src={src} alt="" className="w-5 h-5 rounded-md bg-slate-100"
      onError={e => {
        // Fallback to Google favicon
        if (!e.target.dataset.fallback) {
          e.target.dataset.fallback = '1'
          e.target.src = `https://www.google.com/s2/favicons?domain=${ticker.toLowerCase()}.com&sz=64`
        } else {
          e.target.style.display = 'none'
        }
      }} />
  )
}

export default function PositionsTable({ positions, onRefresh }) {
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')

  const handleSaveValue = async (id) => {
    const val = parseFloat(editVal)
    if (!isNaN(val)) {
      await supabase.from('positions').update({ current_value: val }).eq('id', id)
      onRefresh?.()
    }
    setEditing(null)
  }

  if (!positions?.length) return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Posiciones Abiertas</div>
      <p className="text-sm text-slate-400">Sin posiciones abiertas</p>
    </div>
  )

  const sorted = [...positions].sort((a, b) => {
    const order = { etoro: 1, xtb: 2, ibkr: 3 }
    return (order[a.platform] || 99) - (order[b.platform] || 99)
  })

  const totalInvested = sorted.reduce((s, p) => s + Number(p.invested), 0)
  const totalValue = sorted.reduce((s, p) => s + Number(p.current_value || p.invested), 0)
  const totalPnl = totalValue - totalInvested
  const totalPct = totalInvested > 0 ? totalPnl / totalInvested : 0

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="section-title !mb-0">Posiciones Abiertas</div>
        <span className="text-[10px] text-slate-400 font-mono">{sorted.length} posiciones · {formatCurrency(totalValue)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full belar-table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th>Activo</th>
              <th>Broker</th>
              <th>Entrada</th>
              <th className="text-right">Invertido</th>
              <th className="text-right">Valor</th>
              <th className="text-right">G/P $</th>
              <th className="text-right">G/P %</th>
              <th className="text-right" title="Rendimiento diario"><span className="text-[8px]">%/D</span></th>
              <th>Clase</th>
              <th className="text-right">Peso</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const invested = Number(p.invested)
              const value = Number(p.current_value || invested)
              const pnl = value - invested
              const pct = invested > 0 ? pnl / invested : 0
              const entry = new Date(p.entry_date)
              const days = Math.max(1, Math.floor((new Date() - entry) / 86400000))
              const dailyPct = pct / days
              const weight = totalValue > 0 ? value / totalValue : 0
              const brokerColor = BROKER_COLORS[p.platform] || '#666'
              const classColor = CLASS_COLORS[p.class] || '#6b7280'

              return (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <TickerIcon ticker={p.ticker} />
                      <div>
                        <span className="font-bold text-slate-800 text-[13px] block">{p.ticker}</span>
                        <div className="w-16 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 0 ? 'bg-green-400' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(100, Math.abs(pct * 100) * 3)}%` }} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="platform-badge" style={{ background: brokerColor + '12', color: brokerColor, border: `1px solid ${brokerColor}30` }}>
                      {BROKER_NAMES[p.platform] || p.platform}
                    </span>
                  </td>
                  <td className="text-slate-500 font-mono text-[11px]">
                    {entry.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="text-right font-mono text-[12px] text-slate-500">{formatCurrency(invested)}</td>
                  <td className="text-right cursor-pointer" onClick={() => { setEditing(p.id); setEditVal(String(value)) }}>
                    {editing === p.id ? (
                      <input autoFocus type="number" step="0.01"
                        className="w-24 text-right px-1 py-0.5 border border-green-400 rounded text-[13px] font-mono font-bold outline-none bg-green-50"
                        value={editVal} onChange={e => setEditVal(e.target.value)}
                        onBlur={() => handleSaveValue(p.id)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveValue(p.id)}
                        onClick={e => e.stopPropagation()} />
                    ) : (
                      <span className="font-mono text-[13px] font-bold text-slate-800 hover:text-green-600 transition-colors">{formatCurrency(value)}</span>
                    )}
                  </td>
                  <td className={`text-right font-mono text-[12px] font-semibold ${pnlColor(pnl)}`}>
                    {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                  </td>
                  <td className={`text-right font-mono text-[13px] font-bold ${pnlColor(pct)}`}>
                    {pct >= 0 ? '+' : ''}{(pct * 100).toFixed(2)}%
                  </td>
                  <td className={`text-right font-mono text-[9px] ${pnlColor(dailyPct)}`}>
                    {dailyPct >= 0 ? '+' : ''}{(dailyPct * 100).toFixed(2)}%
                  </td>
                  <td>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                      style={{ background: classColor + '12', color: classColor, border: `1px solid ${classColor}30` }}>
                      {p.class}
                    </span>
                  </td>
                  <td className="text-right font-mono text-[11px] text-slate-500">{(weight * 100).toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-200">
              <td colSpan={3} className="text-[11px] text-slate-500 font-semibold">{sorted.length} posiciones</td>
              <td className="text-right font-mono text-[12px] font-semibold text-slate-600">{formatCurrency(totalInvested)}</td>
              <td className="text-right font-mono text-[13px] font-bold text-slate-800">{formatCurrency(totalValue)}</td>
              <td className={`text-right font-mono text-[12px] font-bold ${pnlColor(totalPnl)}`}>
                {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
              </td>
              <td className={`text-right font-mono text-[13px] font-bold ${pnlColor(totalPct)}`}>
                {totalPct >= 0 ? '+' : ''}{(totalPct * 100).toFixed(2)}%
              </td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

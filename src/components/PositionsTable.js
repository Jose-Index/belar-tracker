'use client'
import { useState, useMemo, useCallback } from 'react'
import { BROKER_COLORS, BROKER_NAMES, CLASS_COLORS, formatCurrency, pnlColor } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

// ── SVG Sparkline with area fill ──
function SparklineSVG({ data, width, height, showDots, showLabels }) {
  if (!data || data.length < 2) return null
  const values = data.map(d => d.value)
  const invested = data[0].invested
  const min = Math.min(...values, invested)
  const max = Math.max(...values, invested)
  const range = max - min || 1
  const pad = showLabels ? 6 : 2

  const xFn = (i) => (i / (values.length - 1) * (width - pad * 2) + pad).toFixed(1)
  const yFn = (v) => (height - pad - (v - min) / range * (height - pad * 2)).toFixed(1)

  const points = values.map((v, i) => `${xFn(i)},${yFn(v)}`).join(' ')
  const lastVal = values[values.length - 1]
  const color = lastVal >= invested ? '#22c55e' : '#ef4444'
  const fillColor = lastVal >= invested ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'
  const areaPoints = `${xFn(0)},${(height - pad).toFixed(1)} ${points} ${xFn(values.length - 1)},${(height - pad).toFixed(1)}`
  const invY = yFn(invested)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polygon points={areaPoints} fill={fillColor} />
      <line x1={pad} y1={invY} x2={width - pad} y2={invY} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
      <polyline points={points} fill="none" stroke={color} strokeWidth={showDots ? 1.5 : 1.2} strokeLinejoin="round" strokeLinecap="round" />
      {showDots && values.map((v, i) => (
        <circle key={i} cx={xFn(i)} cy={yFn(v)} r="2.5" fill={v >= invested ? '#22c55e' : '#ef4444'} stroke="#1e293b" strokeWidth="1" />
      ))}
      {showLabels && (
        <>
          <text x={Number(xFn(0)) + 2} y={Number(yFn(values[0])) - 6} fontSize="8" fill="#94a3b8" textAnchor="start" fontFamily="monospace">
            {'$' + values[0].toFixed(0)}
          </text>
          <text x={Number(xFn(values.length - 1)) - 2} y={Number(yFn(lastVal)) - 6} fontSize="8" fill={color} textAnchor="end" fontFamily="monospace" fontWeight="bold">
            {'$' + lastVal.toFixed(0)}
          </text>
          <text x={width - pad} y={Number(invY) - 3} fontSize="7" fill="#64748b" textAnchor="end" fontFamily="monospace" opacity="0.7">
            inv
          </text>
        </>
      )}
    </svg>
  )
}

// ── Mini sparkline for table row ──
function Sparkline({ data, onMouseEnter, onMouseLeave }) {
  if (!data || data.length < 2) return (
    <div className="w-[88px] h-[22px] bg-slate-50 rounded flex items-center justify-center">
      <span className="text-[7px] text-slate-300 font-mono">sin historial</span>
    </div>
  )

  const lastVal = data[data.length - 1].value
  const invested = data[0].invested
  const isUp = lastVal >= invested

  return (
    <div className="relative cursor-pointer" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="flex items-center gap-0.5">
        <SparklineSVG data={data} width={72} height={20} showDots={false} showLabels={false} />
        <span className={`text-[7px] font-mono font-bold leading-none ${isUp ? 'text-green-500' : 'text-red-500'}`}>
          {isUp ? '\u25B2' : '\u25BC'}
        </span>
      </div>
    </div>
  )
}

// ── Expanded tooltip on hover ──
function SparkTooltip({ data, ticker, broker, invested, tooltipPos }) {
  if (!data || data.length < 2 || !tooltipPos) return null

  const lastVal = data[data.length - 1].value
  const totalPct = ((lastVal - invested) / invested * 100).toFixed(2)
  const isUp = lastVal >= invested

  const changes = data.map((d, i) => {
    if (i === 0) return { ...d, weekPct: ((d.value - invested) / invested * 100) }
    const prev = data[i - 1].value
    return { ...d, weekPct: ((d.value - prev) / prev * 100) }
  })

  const recent = changes.slice(-10)

  return (
    <div className="fixed z-[9999] pointer-events-none" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-3.5 shadow-2xl" style={{ minWidth: 290 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-white font-mono">{ticker}</span>
            <span className="text-[9px] text-slate-500 font-mono uppercase">{broker}</span>
          </div>
          <span className={`text-[13px] font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
            {isUp ? '+' : ''}{totalPct}%
          </span>
        </div>

        <div className="bg-slate-800/60 rounded-lg p-2 mb-2.5">
          <SparklineSVG data={data} width={262} height={80} showDots={true} showLabels={true} />
        </div>

        <div className="space-y-0">
          <div className="flex items-center justify-between text-[8px] font-mono text-slate-600 pb-1 mb-1 border-b border-slate-800">
            <span>FECHA</span>
            <span>VALOR</span>
            <span>SEMANAL</span>
          </div>
          {recent.map((d, i) => {
            const isWeekUp = d.weekPct >= 0
            const dateStr = new Date(d.week_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
            return (
              <div key={i} className="flex items-center justify-between text-[9px] font-mono py-[3px] border-b border-slate-800/50 last:border-0">
                <span className="text-slate-500 w-[70px]">{dateStr}</span>
                <span className="text-slate-300 w-[60px] text-right">${d.value.toFixed(0)}</span>
                <span className={`w-[55px] text-right font-semibold ${isWeekUp ? 'text-green-400' : 'text-red-400'}`}>
                  {isWeekUp ? '+' : ''}{d.weekPct.toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between text-[8px] font-mono text-slate-500">
          <span>Inv: ${invested.toFixed(0)}</span>
          <span>G/P: <span className={isUp ? 'text-green-400' : 'text-red-400'}>${(lastVal - invested).toFixed(0)}</span></span>
          <span>{data.length} sem</span>
        </div>
      </div>
    </div>
  )
}

const FAVICON_MAP = {
  'AROC': 'https://stockanalysis.com/img/s/AROC-80.png',
  'FIX': 'https://stockanalysis.com/img/s/FIX-80.png',
  'IAU': 'https://stockanalysis.com/img/s/IAU-80.png',
  'NEM': 'https://stockanalysis.com/img/s/NEM-80.png',
  'SHELL.L': 'https://logo.clearbit.com/shell.com',
  'Thomaspj': null,
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
        if (!e.target.dataset.fallback) {
          e.target.dataset.fallback = '1'
          e.target.src = `https://www.google.com/s2/favicons?domain=${ticker.toLowerCase()}.com&sz=64`
        } else {
          e.target.style.display = 'none'
        }
      }} />
  )
}

export default function PositionsTable({ positions, positionHistory, onRefresh }) {
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [tooltip, setTooltip] = useState(null)

  const historyMap = useMemo(() => {
    const map = {}
    if (positionHistory?.length) {
      positionHistory.forEach(h => {
        if (!map[h.position_id]) map[h.position_id] = []
        map[h.position_id].push({ week_date: h.week_date, value: Number(h.value), invested: Number(h.invested) })
      })
    }
    return map
  }, [positionHistory])

  const handleSaveValue = async (id) => {
    const val = parseFloat(editVal)
    if (!isNaN(val)) {
      await supabase.from('positions').update({ current_value: val }).eq('id', id)
      onRefresh?.()
    }
    setEditing(null)
  }

  const handleSparkEnter = useCallback((e, p) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = rect.right + 16
    const y = rect.top - 60
    setTooltip({
      posId: p.id, ticker: p.ticker,
      broker: BROKER_NAMES[p.platform] || p.platform,
      invested: Number(p.invested),
      x: Math.min(x, window.innerWidth - 320),
      y: Math.max(8, Math.min(y, window.innerHeight - 350))
    })
  }, [])

  const handleSparkLeave = useCallback(() => setTooltip(null), [])

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
                        <Sparkline data={historyMap[p.id]} onMouseEnter={(e) => handleSparkEnter(e, p)} onMouseLeave={handleSparkLeave} />
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

      {tooltip && (
        <SparkTooltip
          data={historyMap[tooltip.posId]}
          ticker={tooltip.ticker}
          broker={tooltip.broker}
          invested={tooltip.invested}
          tooltipPos={{ x: tooltip.x, y: tooltip.y }}
        />
      )}
    </div>
  )
}

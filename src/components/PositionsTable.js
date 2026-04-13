'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { BROKER_COLORS, BROKER_NAMES, CLASS_COLORS, formatCurrency, pnlColor } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

// ââ SVG Sparkline with area fill ââ
function SparklineSVG({ data, width, height, showDots, showLabels, showEvents }) {
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
        <circle key={i} cx={xFn(i)} cy={yFn(v)} r="2.5" fill={v >= invested ? '#22c55e' : '#ef4444'} stroke="#fff" strokeWidth="1" />
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

      {showEvents && data.filter(d => d.event).map((d, idx) => {
        const i = data.indexOf(d)
        const ex = (i / (values.length - 1) * (width - pad * 2) + pad)
        const ey = Number(yFn(d.value))
        const isAmp = d.event === 'xAMPLIAR'
        const marker = isAmp ? '\u25B2' : '\u25BC'
        const mColor = isAmp ? '#3b82f6' : '#f59e0b'
        return <text key={'ev'+idx} x={ex} y={ey - (showDots ? 8 : 5)} fontSize={showDots ? '9' : '6'} fill={mColor} textAnchor="middle" fontWeight="bold">{marker}</text>
      })}
    </svg>
  )
}

function Sparkline({ data, ticker, broker, invested }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (open && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect()
      setPos({
        x: Math.min(rect.left, window.innerWidth - 310),
        y: rect.bottom + 6
      })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!data || data.length < 2) return (
    <div className="w-[88px] h-[22px] bg-slate-50 rounded flex items-center justify-center">
      <span className="text-[7px] text-slate-300 font-mono">sin historial</span>
    </div>
  )

  return (
    <div ref={wrapperRef} className="relative">
      <div className="cursor-pointer" onClick={() => setOpen(!open)}>
        <SparklineSVG data={data} width={72} height={20} showDots={false} showLabels={false} showEvents={true} />
      </div>
      {open && (
        <div className="fixed z-[9999]" style={{ left: pos.x, top: pos.y }}>
          <SparkTooltip data={data} ticker={ticker} broker={broker} invested={invested} />
        </div>
      )}
    </div>
  )
}

function SparkTooltip({ data, ticker, broker, invested }) {
  if (!data || data.length < 2) return null
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
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xl ring-1 ring-slate-100" style={{ minWidth: 290 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-slate-800 font-mono">{ticker}</span>
          <span className="text-[9px] text-slate-400 font-mono uppercase">{broker}</span>
        </div>
        <span className={`text-[13px] font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
          {isUp ? '+' : ''}{totalPct}%
        </span>
      </div>
      <div className="bg-slate-50 rounded-lg p-2 mb-2.5">
        <SparklineSVG data={data} width={262} height={80} showDots={true} showLabels={true} showEvents={true} />
      </div>
      <div className="space-y-0">
        <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 pb-1 mb-1 border-b border-slate-200">
          <span>FECHA</span><span>VALOR</span><span>SEMANAL</span>
        </div>
        {recent.map((d, i) => {
          const isWeekUp = d.weekPct >= 0
          const dateStr = new Date(d.week_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
          return (
            <div key={i} className="flex items-center justify-between text-[9px] font-mono py-[3px] border-b border-slate-100 last:border-0">
              <span className="text-slate-400 w-[70px]">{d.event ? (d.event === 'xAMPLIAR' ? '\u25B2 ' : '\u25BC ') : ''}{dateStr}</span>
              <span className="text-slate-700 w-[60px] text-right">${d.value.toFixed(0)}</span>
              <span className={`w-[55px] text-right font-semibold ${isWeekUp ? 'text-green-400' : 'text-red-400'}`}>
                {isWeekUp ? '+' : ''}{d.weekPct.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between text-[8px] font-mono text-slate-400">
        <span>Inv: ${invested.toFixed(0)}</span>
        <span>G/P: <span className={isUp ? 'text-green-600' : 'text-red-500'}>${(lastVal - invested).toFixed(0)}</span></span>
        <span>{data.length} sem</span>
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
  'LITE': 'https://stockanalysis.com/img/s/LITE-80.png',
  'ASML': 'https://logo.clearbit.com/asml.com',
  'BOOT': 'https://stockanalysis.com/img/s/BOOT-80.png',
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

export default function PositionsTable({ positions, positionHistory, onRefresh, etoroLive }) {
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')

  // Merge eToro live data into positions
  const mergedPositions = useMemo(() => {
    if (!positions) return []
    if (!etoroLive?.positions) return positions
    return positions.map(p => {
      if (p.platform !== 'etoro') return p
      const live = etoroLive.positions.find(lp => lp.ticker === p.ticker)
      if (!live) {
        // Check mirrors (Thomaspj)
        if (p.ticker === 'Thomaspj' && etoroLive.mirrors?.[0]) {
          const m = etoroLive.mirrors[0]
          return { ...p, current_value: m.value, _live: true }
        }
        return p
      }
      return { ...p, current_value: live.value, _live: true }
    })
  }, [positions, etoroLive])

  const historyMap = useMemo(() => {
    const map = {}
    if (positionHistory?.length) {
      positionHistory.forEach(h => {
        if (!map[h.position_id]) map[h.position_id] = []
        map[h.position_id].push({ week_date: h.week_date, value: Number(h.value), invested: Number(h.invested), event: h.event, event_amount: h.event_amount })
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

  if (!mergedPositions?.length) return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Posiciones Abiertas</div>
      <p className="text-sm text-slate-400">Sin posiciones abiertas</p>
    </div>
  )

  const sorted = [...mergedPositions].sort((a, b) => {
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
        <span className="text-[10px] text-slate-400 font-mono">{sorted.length} posiciones Â· {formatCurrency(totalValue)}</span>
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
              <th className="text-right text-[10px] text-slate-400" title="Rendimiento diario">%/D</th>
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
                        <Sparkline data={historyMap[p.id]} ticker={p.ticker} broker={BROKER_NAMES[p.platform] || p.platform} invested={Number(p.invested)} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="platform-badge" style={{ background: brokerColor + '12', color: brokerColor, border: `1px solid ${brokerColor}30` }}>
                      {BROKER_NAMES[p.platform] || p.platform}
                    </span>
                  </td>
                  <td className="text-slate-500 font-mono text-[11px]">
                    {(() => { const opts = entry.getFullYear() !== new Date().getFullYear() ? { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' } : { day: '2-digit', month: 'short', timeZone: 'UTC' }; return entry.toLocaleDateString('es-ES', opts) })()}
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
                  <td className={`text-right font-mono text-[10px] ${pnlColor(dailyPct)}`}>
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

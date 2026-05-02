'use client'
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { BROKER_COLORS, formatCurrency } from '@/lib/constants'

const SERIES = [
  { key: 'etoro', name: 'eToro', color: BROKER_COLORS.etoro, yAxisId: 'left' },
  { key: 'xtb', name: 'XTB', color: BROKER_COLORS.xtb, yAxisId: 'left' },
  { key: 'ibkr', name: 'IBKR', color: BROKER_COLORS.ibkr, yAxisId: 'left' },
  { key: 'btc_usd', name: 'BTC', color: BROKER_COLORS.btc, yAxisId: 'left' },
  { key: 'total', name: 'TOTAL $', color: '#0ea5e9', yAxisId: 'left' },
  { key: 'total_eur', name: 'TOTAL €', color: '#0ea5e9', yAxisId: 'right', dashed: true },
]

const STORAGE_KEY_PREFIX = 'belar_chart_visible_'

// Approximate EUR/USD historical rates by month (for weeks without stored rate)
// Source: average monthly EUR/USD from April 2024 to April 2026
const HIST_EURUSD = {
  '2024-04': 1.07, '2024-05': 1.08, '2024-06': 1.07, '2024-07': 1.08, '2024-08': 1.10,
  '2024-09': 1.11, '2024-10': 1.08, '2024-11': 1.06, '2024-12': 1.04,
  '2025-01': 1.03, '2025-02': 1.04, '2025-03': 1.08, '2025-04': 1.09, '2025-05': 1.13,
  '2025-06': 1.12, '2025-07': 1.11, '2025-08': 1.09, '2025-09': 1.10, '2025-10': 1.08,
  '2025-11': 1.05, '2025-12': 1.04,
  '2026-01': 1.04, '2026-02': 1.05, '2026-03': 1.08, '2026-04': 1.14,
}

function getEurUsdRate(snapshot) {
  // Use stored rate if available
  if (snapshot.data?.eur_usd_rate) return snapshot.data.eur_usd_rate
  // Fallback to historical approximation
  const month = snapshot.week_date?.substring(0, 7) // YYYY-MM
  return HIST_EURUSD[month] || 1.10
}

export default function EvolutionChart({ snapshots, storageKey = 'dashboard' }) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return { etoro: true, xtb: true, ibkr: true, btc_usd: false, total: true, total_eur: false }
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PREFIX + storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.total_eur === undefined) parsed.total_eur = false
        return parsed
      }
      return { etoro: true, xtb: true, ibkr: true, btc_usd: false, total: true, total_eur: false }
    } catch { return { etoro: true, xtb: true, ibkr: true, btc_usd: false, total: true, total_eur: false } }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_PREFIX + storageKey, JSON.stringify(visible)) } catch {}
  }, [visible, storageKey])

  if (!snapshots?.length) return null

  const chartData = snapshots.map(s => {
    const rate = getEurUsdRate(s)
    const totalUsd = s.total_usd || 0
    return {
      date: s.week_date,
      label: new Date(s.week_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      etoro: s.data?.etoro || 0, xtb: s.data?.xtb || 0,
      ibkr: s.data?.ibkr || 0, btc_usd: s.data?.btc_usd || 0,
      total: totalUsd,
      total_eur: Math.round(totalUsd / rate * 100) / 100,
      eur_usd_rate: rate,
    }
  })

  const toggle = (key) => setVisible(v => ({ ...v, [key]: !v[key] }))

  // Determine if right axis is needed
  const showRightAxis = visible.total_eur

  // Sync right axis domain with left axis for visual alignment
  // Find min/max across all visible $ values
  const allValues = chartData.flatMap(d => {
    const vals = []
    SERIES.forEach(s => { if (visible[s.key] && s.yAxisId === 'left') vals.push(d[s.key] || 0) })
    return vals
  })
  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)

  // For € axis: use the latest EUR/USD rate to set equivalent scale
  const latestRate = chartData[chartData.length - 1]?.eur_usd_rate || 1.10
  const eurMin = minVal / latestRate
  const eurMax = maxVal / latestRate

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
        <div className="font-semibold text-slate-600 mb-1">{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} className="flex justify-between gap-4" style={{ color: p.color }}>
            <span>{p.name}</span>
            <span className="font-mono font-semibold">
              {p.dataKey === 'total_eur' ? `€${p.value.toLocaleString('es-ES', { maximumFractionDigits: 0 })}` : formatCurrency(p.value)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-title !mb-0">Evolución del Portfolio</div>
        <div className="flex gap-1.5 flex-wrap">
          {SERIES.map(s => (
            <button key={s.key} onClick={() => toggle(s.key)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all ${visible[s.key] ? 'text-white shadow-sm' : 'text-slate-400 bg-slate-100'}`}
              style={visible[s.key] ? { background: s.color, ...(s.dashed ? { backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 6px)' } : {}) } : {}}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: showRightAxis ? 50 : 15, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} interval="preserveStartEnd" />
          <YAxis yAxisId="left" domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={45} />
          {showRightAxis && (
            <YAxis yAxisId="right" orientation="right" domain={[eurMin, eurMax]}
              tick={{ fontSize: 9, fill: '#0ea5e9' }} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} width={45} />
          )}
          <Tooltip content={<CustomTooltip />} />
          {SERIES.filter(s => visible[s.key]).map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
              yAxisId={s.yAxisId || 'left'}
              stroke={s.color} strokeWidth={s.key === 'total' || s.key === 'total_eur' ? 2.5 : 1.5}
              strokeDasharray={s.dashed ? '8 4' : undefined}
              dot={false} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

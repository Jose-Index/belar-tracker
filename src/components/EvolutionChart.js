'use client'
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { BROKER_COLORS, formatCurrency } from '@/lib/constants'

const SERIES = [
  { key: 'etoro', name: 'eToro', color: BROKER_COLORS.etoro },
  { key: 'xtb', name: 'XTB', color: BROKER_COLORS.xtb },
  { key: 'ibkr', name: 'IBKR', color: BROKER_COLORS.ibkr },
  { key: 'btc_usd', name: 'BTC', color: BROKER_COLORS.btc },
  { key: 'total', name: 'TOTAL', color: '#0ea5e9' },
]

const STORAGE_KEY_PREFIX = 'belar_chart_visible_'

export default function EvolutionChart({ snapshots, storageKey = 'dashboard' }) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return { etoro: true, xtb: true, ibkr: true, btc_usd: false, total: true }
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PREFIX + storageKey)
      return saved ? JSON.parse(saved) : { etoro: true, xtb: true, ibkr: true, btc_usd: false, total: true }
    } catch { return { etoro: true, xtb: true, ibkr: true, btc_usd: false, total: true } }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_PREFIX + storageKey, JSON.stringify(visible)) } catch {}
  }, [visible, storageKey])

  if (!snapshots?.length) return null

  const chartData = snapshots.map(s => ({
    date: s.week_date,
    label: new Date(s.week_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
    etoro: s.data?.etoro || 0, xtb: s.data?.xtb || 0,
    ibkr: s.data?.ibkr || 0, btc_usd: s.data?.btc_usd || 0,
    total: s.total_usd || 0,
  }))

  const toggle = (key) => setVisible(v => ({ ...v, [key]: !v[key] }))

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
        <div className="font-semibold text-slate-600 mb-1">{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} className="flex justify-between gap-4" style={{ color: p.color }}>
            <span>{p.name}</span>
            <span className="font-mono font-semibold">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-title !mb-0">Evolución del Portfolio</div>
        <div className="flex gap-1.5">
          {SERIES.map(s => (
            <button key={s.key} onClick={() => toggle(s.key)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all ${visible[s.key] ? 'text-white shadow-sm' : 'text-slate-400 bg-slate-100'}`}
              style={visible[s.key] ? { background: s.color } : {}}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 15, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} interval="preserveStartEnd" />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: '#94a3b8' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={45} />
          <Tooltip content={<CustomTooltip />} />
          {SERIES.filter(s => visible[s.key]).map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
              stroke={s.color} strokeWidth={s.key === 'total' ? 2.5 : 1.5}
              dot={false} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

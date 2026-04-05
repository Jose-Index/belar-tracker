'use client'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { Snap } from '@/lib/supabase'

interface WbPoint { d: string; e: number; x: number; i: number; bu: number }

interface Props {
  wbAll: WbPoint[]
  snap: Snap
  btcVal: number
}

const LEGEND = [
  { label: 'eToro', color: '#2EA543', key: 'e' },
  { label: 'XTB',   color: '#E4002B', key: 'x' },
  { label: 'IBKR',  color: '#FF6600', key: 'i' },
  { label: 'BTC',   color: '#F7931A', key: 'bu', dash: true },
  { label: 'Total', color: '#4ECDC4', key: 'total', width: 2.5 },
]

export default function TrackerChart({ wbAll, snap, btcVal }: Props) {
  const data = wbAll
    .filter(r => r.e > 0 || r.x > 0 || r.i > 0 || r.bu > 0)
    .map(r => ({
      ...r,
      total: (r.e || 0) + (r.x || 0) + (r.i || 0) + (r.bu || 0)
    }))

  // Actualizar último punto con snap actual
  if (data.length > 0) {
    const last = data[data.length - 1]
    last.e = snap.etoro; last.x = snap.xtb; last.i = snap.ibkr; last.bu = btcVal
    last.total = snap.etoro + snap.xtb + snap.ibkr + btcVal
  }

  const fmt = (v: number) => `$${Math.round(v / 1000)}k`

  return (
    <div style={{ background: '#13161a', border: '1px solid #2f3540', borderRadius: 8, padding: '.7rem 1rem', marginBottom: '1rem' }}>
      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {LEGEND.map(l => (
          <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#727a87' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
      {/* Gráfico */}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
          <XAxis dataKey="d" tick={{ fill: '#727a87', fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#2f3540' }} interval="preserveStartEnd" />
          <YAxis tickFormatter={fmt} tick={{ fill: '#727a87', fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#2f3540' }} width={42} />
          <Tooltip
            contentStyle={{ background: '#1a1e24', border: '1px solid #2f3540', borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: '#727a87' }}
            formatter={(v) => [`$${Math.round(Number(v)).toLocaleString('en-US')}`, '']}
          />
          {LEGEND.map(l => (
            <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color}
              strokeWidth={l.width ?? 1.5} dot={false} strokeDasharray={l.dash ? '4 2' : undefined}
              name={l.label} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

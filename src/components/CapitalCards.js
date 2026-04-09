'use client'
import { useState } from 'react'
import { BROKER_COLORS, BROKER_NAMES, formatCurrency, pnlColor } from '@/lib/constants'

export default function CapitalCards({ snapshots, brokers, wallets, onUpdateValues }) {
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')

  if (!snapshots?.length) return null

  const latest = snapshots[snapshots.length - 1]
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null
  const data = latest.data || {}

  const cards = [
    ...brokers.map(b => ({
      code: b.code,
      label: BROKER_NAMES[b.code] || b.name,
      value: data[b.code] || 0,
      prevValue: prev?.data?.[b.code] || 0,
      color: BROKER_COLORS[b.code] || b.color,
    })),
    ...wallets.map(w => ({
      code: w.code,
      label: w.symbol,
      value: data[`${w.code}_usd`] || 0,
      prevValue: prev?.data?.[`${w.code}_usd`] || 0,
      color: BROKER_COLORS[w.code] || w.color,
      sub: `${(data[`${w.code}_qty`] || 0).toFixed(8)} ${w.symbol}`,
    })),
  ]

  const total = cards.reduce((s, c) => s + c.value, 0)
  const prevTotal = cards.reduce((s, c) => s + c.prevValue, 0)
  const totalChange = prevTotal > 0 ? (total - prevTotal) / prevTotal : 0

  const handleEdit = (code, currentVal) => {
    setEditing(code)
    setEditValue(String(currentVal))
  }

  const handleSave = (code) => {
    const val = parseFloat(editValue)
    if (!isNaN(val) && onUpdateValues) {
      onUpdateValues(code, val)
    }
    setEditing(null)
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(c => {
        const change = c.prevValue > 0 ? (c.value - c.prevValue) / c.prevValue : 0
        return (
          <div key={c.code} className="bg-white rounded-xl border border-slate-200 p-4 card-hover cursor-pointer"
               style={{ borderTopColor: c.color, borderTopWidth: 3 }}
               onClick={() => editing !== c.code && handleEdit(c.code, c.value)}>
            <div className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">{c.label}</div>
            {editing === c.code ? (
              <input
                autoFocus
                type="number"
                step="0.01"
                className="w-full text-xl font-bold bg-slate-50 border border-slate-300 rounded px-2 py-1 outline-none focus:border-blue-400"
                style={{ color: c.color }}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => handleSave(c.code)}
                onKeyDown={e => e.key === 'Enter' && handleSave(c.code)}
              />
            ) : (
              <div className="text-xl font-bold" style={{ color: c.color }}>
                {formatCurrency(c.value)}
              </div>
            )}
            <div className="flex items-center justify-between mt-1">
              <span className={`text-xs font-mono font-semibold ${pnlColor(change)}`}>
                {change >= 0 ? '+' : ''}{(change * 100).toFixed(2)}%
              </span>
              {c.sub && <span className="text-[10px] text-slate-400 font-mono">{c.sub}</span>}
            </div>
          </div>
        )
      })}

      {/* TOTAL card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 card-hover"
           style={{ borderTopColor: '#0ea5e9', borderTopWidth: 3 }}>
        <div className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">TOTAL</div>
        <div className="text-xl font-bold text-sky-600">{formatCurrency(total)}</div>
        <span className={`text-xs font-mono font-semibold ${pnlColor(totalChange)}`}>
          {totalChange >= 0 ? '+' : ''}{(totalChange * 100).toFixed(2)}%
        </span>
      </div>
    </div>
  )
}

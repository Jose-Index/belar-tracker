'use client'
import { useState } from 'react'
import { BROKER_COLORS, BROKER_NAMES, formatCurrency, pnlColor } from '@/lib/constants'

export default function CapitalCards({ snapshots, brokers, wallets, onUpdateValues, btcPrice }) {
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')

  if (!snapshots?.length) return null

  const latest = snapshots[snapshots.length - 1]
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null
  const data = latest.data || {}

  const brokerCards = brokers.map(b => ({
    code: b.code, label: BROKER_NAMES[b.code] || b.name,
    value: data[b.code] || 0, prevValue: prev?.data?.[b.code] || 0,
    color: BROKER_COLORS[b.code] || b.color, editKey: b.code,
  }))

  const btcQty = data.btc_qty || 0
  const btcUsd = btcPrice ? btcQty * btcPrice : (data.btc_usd || 0)
  const prevBtcUsd = prev?.data?.btc_usd || 0

  const cards = [
    ...brokerCards,
    { code: 'btc', label: 'BTC', value: btcUsd, prevValue: prevBtcUsd,
      color: BROKER_COLORS.btc, editKey: 'btc_qty', isBtcQty: true,
      sub: `${btcQty.toFixed(8)} BTC` },
  ]

  const total = cards.reduce((s, c) => s + c.value, 0)
  const prevTotal = cards.reduce((s, c) => s + c.prevValue, 0)
  const totalChange = prevTotal > 0 ? (total - prevTotal) / prevTotal : 0

  const handleEdit = (card) => {
    setEditing(card.editKey)
    setEditValue(card.isBtcQty ? String(btcQty) : String(card.value))
  }

  const handleSave = (card) => {
    const val = parseFloat(editValue)
    if (!isNaN(val) && onUpdateValues) onUpdateValues(card.editKey, val)
    setEditing(null)
  }

  const allCards = [...cards, { code: 'total', label: 'TOTAL', value: total, prevValue: prevTotal, color: '#0ea5e9', editKey: null }]

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
      {allCards.map(c => {
        const change = c.prevValue > 0 ? (c.value - c.prevValue) / c.prevValue : 0
        const isEditing = editing === c.editKey
        const isTotal = c.code === 'total'
        return (
          <div key={c.code}
            className={`bg-white rounded-xl border border-slate-200 p-3 sm:p-4 ${!isTotal ? 'cursor-pointer card-hover' : ''}`}
            style={{ borderTopColor: c.color, borderTopWidth: 3 }}
            onClick={() => !isTotal && !isEditing && handleEdit(c)}>
            <div className="text-[9px] font-bold tracking-widest text-slate-400 mb-1">{c.label}</div>
            {isEditing ? (
              <input autoFocus type="number" step={c.isBtcQty ? '0.00000001' : '0.01'}
                className="w-full text-lg font-bold bg-slate-50 border border-slate-300 rounded px-2 py-1 outline-none focus:border-blue-400 font-mono"
                style={{ color: c.color }} value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => handleSave(c)}
                onKeyDown={e => e.key === 'Enter' && handleSave(c)} />
            ) : (
              <div className="text-lg sm:text-xl font-bold font-mono leading-tight" style={{ color: c.color }}>
                {formatCurrency(c.value)}
              </div>
            )}
            <div className="flex items-center justify-between mt-1 gap-1">
              <span className={`text-[10px] font-mono font-semibold ${pnlColor(change)}`}>
                {change >= 0 ? '+' : ''}{(change * 100).toFixed(2)}%
              </span>
              {c.sub && <span className="text-[8px] text-slate-400 font-mono truncate">{c.sub}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

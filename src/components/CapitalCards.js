'use client'
import { useState } from 'react'
import { BROKER_COLORS, BROKER_NAMES, formatCurrency, pnlColor } from '@/lib/constants'

export default function CapitalCards({ snapshots, brokers, wallets, onUpdateValues, btcPrice, etoroLive }) {
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')

  if (!snapshots?.length) return null

  const latest = snapshots[snapshots.length - 1]
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null
  const data = latest.data || {}

  const brokerCards = brokers.map(b => {
    let value = data[b.code] || 0
    // Override eToro with live API data
    if (b.code === 'etoro' && etoroLive?.equity) {
      value = etoroLive.equity
    }
    return {
      code: b.code, label: BROKER_NAMES[b.code] || b.name,
      value, prevValue: prev?.data?.[b.code] || 0,
      color: BROKER_COLORS[b.code] || b.color, editKey: b.code,
      isLive: b.code === 'etoro' && !!etoroLive?.equity,
    }
  })

  const btcQty = data.btc_qty || 0
  const btcUsd = btcPrice ? btcQty * btcPrice : (data.btc_usd || 0)
  const prevBtcUsd = prev?.data?.btc_usd || 0
  const btcCard = {
    code: 'btc', label: 'BTC', value: btcUsd, prevValue: prevBtcUsd,
    color: BROKER_COLORS.btc, editKey: 'btc_qty',
    sub: `${btcQty.toFixed(8)} BTC`, editIsBtcQty: true,
  }

  const cards = [...brokerCards, btcCard]
  const total = cards.reduce((s, c) => s + c.value, 0)
  const prevTotal = cards.reduce((s, c) => s + c.prevValue, 0)
  const totalChange = prevTotal > 0 ? (total - prevTotal) / prevTotal : 0

  const handleEdit = (card) => { setEditing(card.editKey); setEditValue(card.editIsBtcQty ? String(btcQty) : String(card.value)) }
  const handleSave = (card) => { const val = parseFloat(editValue); if (!isNaN(val) && onUpdateValues) onUpdateValues(card.editKey, val); setEditing(null) }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(c => {
        const change = c.prevValue > 0 ? (c.value - c.prevValue) / c.prevValue : 0
        const isEditing = editing === c.editKey
        return (
          <div key={c.code}
            className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md transition-shadow"
            style={{ borderTopColor: c.color, borderTopWidth: 3 }}
            onClick={() => !isEditing && handleEdit(c)}>
            <div className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
              {c.label}
              {c.isLive && <span className="inline-flex items-center gap-0.5 text-[7px] font-bold text-emerald-500 uppercase tracking-widest"><span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />live</span>}
            </div>
            {isEditing ? (
              <input autoFocus type="number" step={c.editIsBtcQty ? '0.00000001' : '0.01'}
                className="w-full text-lg font-bold bg-slate-50 border border-slate-300 rounded px-2 py-1 outline-none focus:border-blue-400 font-mono"
                style={{ color: c.color }}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => handleSave(c)}
                onKeyDown={e => e.key === 'Enter' && handleSave(c)}
                onClick={e => e.stopPropagation()} />
            ) : (
              <div className="text-2xl font-bold font-mono" style={{ color: c.color }}>
                {formatCurrency(c.value)}
              </div>
            )}
            <div className="flex items-center justify-between mt-1.5">
              <span className={`text-[11px] font-mono font-semibold ${pnlColor(change)}`}>
                {change >= 0 ? '+' : ''}{(change * 100).toFixed(2)}%
              </span>
              {c.sub && <span className="text-[9px] text-slate-400 font-mono">{c.sub}</span>}
            </div>
          </div>
        )
      })}
      {/* TOTAL - spans remaining space or full row on mobile */}
      <div className="bg-white rounded-xl border border-slate-200 p-4"
        style={{ borderTopColor: '#0ea5e9', borderTopWidth: 3 }}>
        <div className="text-[10px] font-semibold tracking-wider text-slate-400 mb-1">TOTAL</div>
        <div className="text-2xl font-bold font-mono text-sky-600">{formatCurrency(total)}</div>
        <span className={`text-[11px] font-mono font-semibold ${pnlColor(totalChange)}`}>
          {totalChange >= 0 ? '+' : ''}{(totalChange * 100).toFixed(2)}%
        </span>
      </div>
    </div>
  )
}

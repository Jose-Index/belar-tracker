'use client'
import { useState, useMemo } from 'react'
import { BROKER_COLORS, BROKER_NAMES, formatCurrency, pnlColor } from '@/lib/constants'

// Micro-sparkline 60×18 con relleno suave
function MiniSpark({ values, color }) {
  if (!values || values.length < 2) {
    return <div className="w-[60px] h-[18px]" />
  }
  const w = 60, h = 18
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 2) - 1
    return [x, y]
  })
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const fillPath = `${linePath} L${w},${h} L0,${h} Z`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-80">
      <path d={fillPath} fill={color} fillOpacity="0.12"/>
      <path d={linePath} stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function CapitalCards({ snapshots, brokers, wallets, onUpdateValues, btcPrice }) {
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')

  if (!snapshots?.length) return null

  const latest = snapshots[snapshots.length - 1]
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null
  const data = latest.data || {}

  // Últimas 12 semanas para micro-sparkline
  const recentSnaps = useMemo(() => snapshots.slice(-12), [snapshots])
  const historyByKey = useMemo(() => {
    const m = { etoro: [], xtb: [], ibkr: [], btc_usd: [], total: [] }
    recentSnaps.forEach(s => {
      m.etoro.push(s.data?.etoro || 0)
      m.xtb.push(s.data?.xtb || 0)
      m.ibkr.push(s.data?.ibkr || 0)
      m.btc_usd.push(s.data?.btc_usd || 0)
      m.total.push(s.total_usd || 0)
    })
    return m
  }, [recentSnaps])

  const brokerCards = brokers.map(b => ({
    code: b.code,
    label: BROKER_NAMES[b.code] || b.name,
    value: data[b.code] || 0,
    prevValue: prev?.data?.[b.code] || 0,
    color: BROKER_COLORS[b.code] || b.color,
    editKey: b.code,
    history: historyByKey[b.code] || [],
  }))

  const btcQty = data.btc_qty || 0
  const btcUsd = btcPrice ? btcQty * btcPrice : (data.btc_usd || 0)
  const prevBtcUsd = prev?.data?.btc_usd || 0
  const btcCard = {
    code: 'btc', label: 'BTC', value: btcUsd, prevValue: prevBtcUsd,
    color: BROKER_COLORS.btc, editKey: 'btc_qty',
    sub: `${btcQty.toFixed(8)} BTC`, editIsBtcQty: true,
    isLive: !!btcPrice,
    history: historyByKey.btc_usd,
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
            className="group relative bg-white rounded-xl border border-stone-200 p-4 transition-all cursor-pointer hover:shadow-md hover:border-stone-300 overflow-hidden"
            onClick={() => !isEditing && handleEdit(c)}>
            {/* barra de color top */}
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: c.color }} />
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold tracking-[0.12em] uppercase px-1.5 py-0.5 rounded"
                    style={{ background: c.color + '15', color: c.color }}>
                {c.label}
              </span>
              <MiniSpark values={c.history} color={c.color} />
            </div>
            {isEditing ? (
              <input autoFocus type="number" step={c.editIsBtcQty ? '0.00000001' : '0.01'}
                className="w-full text-xl font-bold bg-stone-50 border border-stone-300 rounded px-2 py-1 outline-none focus:border-blue-400 font-mono"
                style={{ color: c.color }}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => handleSave(c)}
                onKeyDown={e => e.key === 'Enter' && handleSave(c)}
                onClick={e => e.stopPropagation()} />
            ) : (
              <div className="text-[22px] font-bold font-mono leading-tight" style={{ color: c.color }}>
                {formatCurrency(c.value)}
              </div>
            )}
            <div className="flex items-center justify-between mt-1">
              <span className={`text-[11px] font-mono font-semibold ${pnlColor(change)}`}>
                {change >= 0 ? '▲' : '▼'} {change >= 0 ? '+' : ''}{(change * 100).toFixed(2)}%
              </span>
              {c.sub && <span className="text-[9px] text-slate-400 font-mono">{c.sub}</span>}
            </div>
          </div>
        )
      })}
      {/* TOTAL */}
      <div className="relative bg-gradient-to-br from-sky-50 to-white rounded-xl border border-sky-200/60 p-4 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-sky-500" />
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-bold tracking-[0.12em] uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">
            TOTAL
          </span>
          <MiniSpark values={historyByKey.total} color="#0ea5e9" />
        </div>
        <div className="text-[22px] font-bold font-mono text-sky-600 leading-tight">{formatCurrency(total)}</div>
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[11px] font-mono font-semibold ${pnlColor(totalChange)}`}>
            {totalChange >= 0 ? '▲' : '▼'} {totalChange >= 0 ? '+' : ''}{(totalChange * 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  )
}

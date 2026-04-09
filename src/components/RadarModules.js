'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function RadarBelar({ items, onRefresh }) {
  if (!items?.length) return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Radar BELAR</div>
      <p className="text-sm text-slate-400">Sin oportunidades activas. Se actualiza con cada Análisis Oportunidad.</p>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Radar BELAR</div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <span className="font-mono font-bold text-sm text-etoro min-w-[60px]">{item.ticker}</span>
            {item.score && (
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                {item.score}/10
              </span>
            )}
            <p className="text-xs text-slate-600 flex-1">{item.note}</p>
            <span className="text-[10px] text-slate-400 whitespace-nowrap">{item.added_date}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RadarJose({ items, onRefresh }) {
  const [ticker, setTicker] = useState('')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    if (!ticker.trim() || !note.trim()) return
    setAdding(true)
    await supabase.from('radar_jose').insert({
      ticker: ticker.trim().toUpperCase(),
      note: note.trim()
    })
    setTicker('')
    setNote('')
    setAdding(false)
    onRefresh?.()
  }

  const handleRemove = async (id) => {
    await supabase.from('radar_jose').update({ is_active: false }).eq('id', id)
    onRefresh?.()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Notas JOSE</div>

      {/* Add form */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="TICKER"
          className="w-20 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono font-bold uppercase bg-slate-50 outline-none focus:border-etoro"
          value={ticker}
          onChange={e => setTicker(e.target.value)}
        />
        <input
          type="text"
          placeholder="Nota de seguimiento..."
          className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs bg-slate-50 outline-none focus:border-etoro"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={adding}
          className="px-3 py-1.5 bg-etoro text-white text-xs font-semibold rounded hover:bg-green-600 transition-colors disabled:opacity-50">
          + Añadir
        </button>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items?.map(item => (
          <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg group">
            <span className="font-mono font-bold text-sm text-slate-700 min-w-[60px]">{item.ticker}</span>
            <p className="text-xs text-slate-600 flex-1">{item.note}</p>
            <span className="text-[10px] text-slate-400 whitespace-nowrap">{item.added_date}</span>
            <button
              onClick={() => handleRemove(item.id)}
              className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 text-xs">
              ✕
            </button>
          </div>
        )) || <p className="text-sm text-slate-400">Sin notas.</p>}
      </div>
    </div>
  )
}

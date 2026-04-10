'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

function ScoreBar({ score }) {
  if (!score) return null
  const pct = (score / 10) * 100
  const color = score >= 7 ? '#16a34a' : score >= 5 ? '#d97706' : '#dc2626'
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold font-mono" style={{ color }}>{score}/10</span>
    </div>
  )
}

export function RadarBelar({ items, onRefresh }) {
  if (!items?.length) return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Radar BELAR</div>
      <p className="text-sm text-slate-400 italic">Sin oportunidades activas. Se actualiza con cada Análisis Oportunidad.</p>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-title !mb-0">Radar BELAR</div>
        <span className="text-[9px] text-slate-400">{items.length} activos</span>
      </div>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="p-3 border border-slate-100 rounded-lg hover:border-slate-200 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono font-bold text-[14px] text-etoro">{item.ticker}</span>
              <ScoreBar score={item.score} />
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">{item.note}</p>
            <div className="text-[9px] text-slate-400 mt-1.5">{item.added_date}</div>
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
    await supabase.from('radar_jose').insert({ ticker: ticker.trim().toUpperCase(), note: note.trim() })
    setTicker(''); setNote(''); setAdding(false); onRefresh?.()
  }

  const handleRemove = async (id) => {
    await supabase.from('radar_jose').update({ is_active: false }).eq('id', id)
    onRefresh?.()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Notas JOSE</div>
      <div className="flex gap-2 mb-4">
        <input type="text" placeholder="TICKER"
          className="w-20 px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold uppercase bg-slate-50 outline-none focus:border-green-400"
          value={ticker} onChange={e => setTicker(e.target.value)} />
        <input type="text" placeholder="Nota de seguimiento..."
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 outline-none focus:border-green-400"
          value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        <button onClick={handleAdd} disabled={adding}
          className="px-4 py-2 bg-etoro text-white text-[10px] font-bold rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50">
          + Añadir
        </button>
      </div>
      <div className="space-y-2">
        {items?.map(item => (
          <div key={item.id} className="flex items-start gap-3 py-2.5 px-3 border border-slate-100 rounded-lg group hover:border-slate-200 transition-colors">
            <span className="font-mono font-bold text-[12px] text-slate-800 min-w-[50px]">{item.ticker}</span>
            <p className="text-[11px] text-slate-600 flex-1 leading-relaxed">{item.note}</p>
            <span className="text-[9px] text-slate-400 whitespace-nowrap shrink-0">{item.added_date}</span>
            <button onClick={() => handleRemove(item.id)}
              className="text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 text-xs shrink-0">✕</button>
          </div>
        )) || <p className="text-[11px] text-slate-400 italic">Sin notas.</p>}
      </div>
    </div>
  )
}

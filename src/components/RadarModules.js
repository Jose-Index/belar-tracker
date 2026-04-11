'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

function ScoreBar({ score }) {
  if (!score) return null
  const pct = (score / 10) * 100
  const color = score >= 7 ? '#16a34a' : score >= 5 ? '#d97706' : '#dc2626'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[12px] font-bold font-mono min-w-[32px]" style={{ color }}>{score}/10</span>
    </div>
  )
}

export function RadarBelar({ items, onRefresh }) {
  if (!items?.length) return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="section-title">Radar BELAR</div>
      <div className="text-center py-8">
        <div className="text-slate-300 text-3xl mb-2">🎯</div>
        <p className="text-sm text-slate-400">Sin oportunidades activas</p>
        <p className="text-[10px] text-slate-300 mt-1">Se actualiza con cada Análisis Oportunidad</p>
      </div>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="section-title !mb-0">Radar BELAR</div>
        <span className="text-[10px] text-slate-400 font-mono">{items.length} activos en vigilancia</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map(item => {
          const scoreColor = item.score >= 7 ? 'border-green-200 bg-green-50/40' : item.score >= 5 ? 'border-amber-200 bg-amber-50/40' : 'border-red-200 bg-red-50/40'
          return (
            <div key={item.id} className={`rounded-xl border p-4 ${scoreColor}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono font-bold text-[16px] text-slate-800">{item.ticker}</span>
                <ScoreBar score={item.score} />
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed mb-2">{item.note}</p>
              <div className="text-[9px] text-slate-400">{item.added_date}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function RadarJose({ items, onRefresh }) {
  const [ticker, setTicker] = useState('')
  const [note, setNote] = useState('')

  const handleAdd = async () => {
    if (!ticker.trim() || !note.trim()) return
    await supabase.from('radar_jose').insert({ ticker: ticker.trim().toUpperCase(), note: note.trim() })
    setTicker(''); setNote(''); onRefresh?.()
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
        <button onClick={handleAdd}
          className="px-4 py-2 bg-etoro text-white text-[10px] font-bold rounded-lg hover:bg-green-600 transition-colors">
          + Añadir
        </button>
      </div>
      <div className="space-y-2">
        {items?.length ? items.map(item => (
          <div key={item.id} className="flex items-start gap-3 py-2.5 px-3 border border-slate-100 rounded-lg group hover:border-slate-200">
            <span className="font-mono font-bold text-[12px] text-slate-800 min-w-[50px]">{item.ticker}</span>
            <p className="text-[11px] text-slate-600 flex-1">{item.note}</p>
            <span className="text-[9px] text-slate-400 whitespace-nowrap shrink-0">{item.added_date}</span>
            <button onClick={() => handleRemove(item.id)}
              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-xs shrink-0">✕</button>
          </div>
        )) : <p className="text-[11px] text-slate-400 italic">Sin notas.</p>}
      </div>
    </div>
  )
}

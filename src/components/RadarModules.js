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

const EXCEPTION_LABELS = {
  1: 'Noticia mainstream clasificada como ruido',
  2: 'Recalibración de SL en activo a la baja',
  3: 'Reentrada tras salida por ruido',
}

const EXCEPTION_SHORT = {
  1: 'EXC-1',
  2: 'EXC-2',
  3: 'EXC-3',
}

const EXCEPTION_COLOR = {
  1: { border: 'border-indigo-200', bg: 'bg-indigo-50/40', badge: 'bg-indigo-100 text-indigo-700' },
  2: { border: 'border-amber-200', bg: 'bg-amber-50/40', badge: 'bg-amber-100 text-amber-700' },
  3: { border: 'border-violet-200', bg: 'bg-violet-50/40', badge: 'bg-violet-100 text-violet-700' },
}

const OUTCOME_LABEL = {
  favorable: { text: 'FAVORABLE', className: 'bg-green-100 text-green-700 border-green-200' },
  desfavorable: { text: 'DESFAVORABLE', className: 'bg-red-100 text-red-700 border-red-200' },
  neutro: { text: 'NEUTRO', className: 'bg-slate-100 text-slate-600 border-slate-200' },
}

export function ExceptionsSection({ items, onRefresh }) {
  const [editingId, setEditingId] = useState(null)
  const [outcomeDraft, setOutcomeDraft] = useState({ outcome: '', note: '' })

  const handleSaveOutcome = async (id) => {
    if (!outcomeDraft.outcome) return
    await fetch('/api/belar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_exception_outcome',
        data: { id, outcome: outcomeDraft.outcome, outcome_note: outcomeDraft.note },
      }),
    })
    setEditingId(null)
    setOutcomeDraft({ outcome: '', note: '' })
    onRefresh?.()
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setOutcomeDraft({ outcome: item.outcome || '', note: item.outcome_note || '' })
  }

  // Estadísticas del mes en curso
  const now = new Date()
  const monthItems = (items || []).filter(it => {
    const d = new Date(it.activated_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const totalMonth = monthItems.length
  const favMonth = monthItems.filter(i => i.outcome === 'favorable').length
  const desfMonth = monthItems.filter(i => i.outcome === 'desfavorable').length
  const pendingMonth = monthItems.filter(i => !i.outcome).length
  const closedMonth = totalMonth - pendingMonth
  const hitRate = closedMonth > 0 ? Math.round((favMonth / closedMonth) * 100) : null

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="section-title !mb-0">Excepciones BELAR v1.3</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Registro de excepciones tasadas activadas — auditoría</p>
        </div>
        {totalMonth > 0 && (
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="text-slate-500">Mes: <b className="text-slate-800">{totalMonth}</b></span>
            <span className="text-green-600">✓ {favMonth}</span>
            <span className="text-red-600">✗ {desfMonth}</span>
            {pendingMonth > 0 && <span className="text-slate-400">⏳ {pendingMonth}</span>}
            {hitRate !== null && (
              <span className={`px-2 py-0.5 rounded-full font-bold ${hitRate >= 40 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {hitRate}% hit
              </span>
            )}
          </div>
        )}
      </div>

      {!items?.length ? (
        <div className="text-center py-8">
          <div className="text-slate-300 text-3xl mb-2">⚖️</div>
          <p className="text-sm text-slate-400">Sin excepciones registradas</p>
          <p className="text-[10px] text-slate-300 mt-1">Belar registra aquí cada excepción tasada que activa</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const c = EXCEPTION_COLOR[item.exception_type] || EXCEPTION_COLOR[1]
            const activated = new Date(item.activated_at)
            const dateStr = activated.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
            const timeStr = activated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
            const isEditing = editingId === item.id
            const outcomeInfo = item.outcome ? OUTCOME_LABEL[item.outcome] : null

            return (
              <div key={item.id} className={`rounded-xl border p-4 ${c.border} ${c.bg}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${c.badge}`}>
                      {EXCEPTION_SHORT[item.exception_type]}
                    </span>
                    <span className="font-mono font-bold text-[14px] text-slate-800">{item.ticker}</span>
                    {item.platform && (
                      <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">{item.platform}</span>
                    )}
                    {outcomeInfo && (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${outcomeInfo.className}`}>
                        {outcomeInfo.text}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                    {dateStr} {timeStr}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 font-medium mb-1">{EXCEPTION_LABELS[item.exception_type]}</p>
                <p className="text-[12px] text-slate-700 leading-relaxed mb-2">{item.justification}</p>

                {item.exception_type === 2 && (item.previous_sl || item.proposed_sl) && (
                  <div className="text-[11px] font-mono text-slate-600 bg-white/60 rounded px-2 py-1 mb-2 inline-block">
                    SL previo: <b>{item.previous_sl ?? '—'}</b> → SL propuesto: <b>{item.proposed_sl ?? '—'}</b>
                  </div>
                )}
                {item.exception_type === 3 && (item.exit_date || item.exit_price) && (
                  <div className="text-[11px] font-mono text-slate-600 bg-white/60 rounded px-2 py-1 mb-2 inline-block">
                    Salida previa: <b>{item.exit_date || '—'}</b> @ <b>{item.exit_price ?? '—'}</b>
                  </div>
                )}

                {item.outcome_note && (
                  <p className="text-[10px] text-slate-500 italic mt-2">Nota resultado: {item.outcome_note}</p>
                )}

                {isEditing ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 bg-white rounded-lg p-2 border border-slate-200">
                    <select
                      value={outcomeDraft.outcome}
                      onChange={e => setOutcomeDraft(d => ({ ...d, outcome: e.target.value }))}
                      className="text-[11px] px-2 py-1 border border-slate-200 rounded bg-slate-50 outline-none"
                    >
                      <option value="">— resultado —</option>
                      <option value="favorable">Favorable</option>
                      <option value="desfavorable">Desfavorable</option>
                      <option value="neutro">Neutro</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Nota (opcional)"
                      value={outcomeDraft.note}
                      onChange={e => setOutcomeDraft(d => ({ ...d, note: e.target.value }))}
                      className="flex-1 min-w-[180px] text-[11px] px-2 py-1 border border-slate-200 rounded bg-slate-50 outline-none"
                    />
                    <button
                      onClick={() => handleSaveOutcome(item.id)}
                      className="px-3 py-1 bg-etoro text-white text-[10px] font-bold rounded hover:bg-green-600"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setOutcomeDraft({ outcome: '', note: '' }) }}
                      className="px-2 py-1 text-slate-400 text-[10px] hover:text-slate-600"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(item)}
                    className="mt-2 text-[10px] text-slate-400 hover:text-slate-700 underline"
                  >
                    {item.outcome ? 'Editar resultado' : 'Registrar resultado'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
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

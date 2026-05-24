'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { CLASS_COLORS } from '@/lib/constants'

// ─── Columnas del tablero ──────────────────────
// Posiciones abiertas pueden estar SOLO en las 5 operativas.
// ENTRAR YA y RADAR son exclusivas de cards independientes (sin position_id).
const COLUMNS = [
  { id: 'NÚCLEO',     label: 'NÚCLEO',    color: '#2563eb', allowPositions: true  },
  { id: 'TÁCTICA',    label: 'TÁCTICA',   color: '#7c3aed', allowPositions: true  },
  { id: 'MOMENTUM',   label: 'MOMENTUM',  color: '#ea580c', allowPositions: true  },
  { id: 'DISRUPTIVA', label: 'DISRUPTIVA',color: '#ec4899', allowPositions: true  },
  { id: 'xSALIR',     label: 'xSALIR',    color: '#ef4444', allowPositions: true  },
  { id: 'ENTRAR YA',  label: 'ENTRAR YA', color: '#10b981', allowPositions: false },
  { id: 'RADAR',      label: 'RADAR',     color: '#64748b', allowPositions: false },
]

const POS_CLASSES = new Set(['NÚCLEO', 'NUCLEO', 'TÁCTICA', 'TACTICA', 'MOMENTUM', 'DISRUPTIVA', 'DiSrUpTiVa', 'xSALIR'])
const normalizeClass = (c) => {
  if (!c) return 'RADAR'
  const up = String(c).toUpperCase()
  if (up === 'NUCLEO' || up === 'NÚCLEO') return 'NÚCLEO'
  if (up === 'TACTICA' || up === 'TÁCTICA') return 'TÁCTICA'
  if (up === 'DISRUPTIVA' || up === 'DISRUPTIVA') return 'DISRUPTIVA'
  if (up === 'MOMENTUM') return 'MOMENTUM'
  if (up === 'XSALIR') return 'xSALIR'
  if (up === 'ENTRAR YA') return 'ENTRAR YA'
  if (up === 'RADAR') return 'RADAR'
  return 'RADAR'
}

export default function TableroRector({ positions, tableroRector, onRefresh }) {
  const [dragId, setDragId] = useState(null)        // { type:'pos'|'card', id, sourceCol }
  const [dragOverCol, setDragOverCol] = useState(null)
  const [newTicker, setNewTicker] = useState('')
  const [newCol, setNewCol] = useState('RADAR')
  const [editingNotes, setEditingNotes] = useState(null) // { type, id, value }

  // ── Construir cards: posiciones abiertas (auto) + tablero_rector (manual) ──
  // Si una posición está abierta y existe ALSO una card independiente con el mismo ticker
  // en ENTRAR YA o RADAR, ambas coexisten (José borra manualmente la duplicada).
  const cards = useMemo(() => {
    const positionCards = (positions || []).map(p => ({
      type: 'pos',
      id: `pos-${p.id}`,
      ticker: p.ticker,
      column: normalizeClass(p.class),
      platform: p.platform,
      currency: p.currency,
      invested: p.invested,
      current_value: p.current_value,
      notes: null,         // las posiciones no tienen notas del tablero (van en positions.notes_belar si vuelve)
      updated_at: null,
      position_id: p.id,
      raw: p,
    }))

    const independentCards = (tableroRector || []).map(t => ({
      type: 'card',
      id: `card-${t.id}`,
      ticker: t.ticker,
      column: normalizeClass(t.class),
      notes: t.notes || '',
      updated_at: t.updated_at,
      raw: t,
    }))

    return [...positionCards, ...independentCards]
  }, [positions, tableroRector])

  // Agrupar por columna
  const byColumn = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map(c => [c.id, []]))
    cards.forEach(c => {
      if (map[c.column]) map[c.column].push(c)
      else map['RADAR'].push(c)
    })
    return map
  }, [cards])

  // ── DRAG HANDLERS ──
  const handleDragStart = (e, card) => {
    setDragId({ type: card.type, id: card.id, raw: card.raw, sourceCol: card.column })
    e.dataTransfer.effectAllowed = 'move'
    // necesario para Firefox
    try { e.dataTransfer.setData('text/plain', card.id) } catch(_) {}
  }

  const handleDragEnd = () => {
    setDragId(null)
    setDragOverCol(null)
  }

  const handleDragOver = (e, colId) => {
    if (!dragId) return
    e.preventDefault()
    // Bloquear si es posición y la columna no admite posiciones
    const colDef = COLUMNS.find(c => c.id === colId)
    if (dragId.type === 'pos' && colDef && !colDef.allowPositions) {
      e.dataTransfer.dropEffect = 'none'
      return
    }
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId)
  }

  const handleDrop = async (e, colId) => {
    e.preventDefault()
    if (!dragId || dragId.sourceCol === colId) { setDragOverCol(null); return }
    const colDef = COLUMNS.find(c => c.id === colId)
    if (dragId.type === 'pos' && colDef && !colDef.allowPositions) {
      // Movimiento prohibido
      setDragOverCol(null)
      setDragId(null)
      return
    }

    try {
      if (dragId.type === 'pos') {
        // Reclasificar posición
        await supabase.from('positions').update({ class: colId }).eq('id', dragId.raw.id)
      } else {
        // Mover card independiente
        await supabase.from('tablero_rector')
          .update({ class: colId, updated_at: new Date().toISOString() })
          .eq('id', dragId.raw.id)
      }
      onRefresh?.()
    } catch (err) {
      console.error('Drop error', err)
    } finally {
      setDragOverCol(null)
      setDragId(null)
    }
  }

  // ── AÑADIR CARD ──
  const handleAdd = async () => {
    const t = newTicker.trim().toUpperCase()
    if (!t) return
    await supabase.from('tablero_rector').insert({
      ticker: t,
      class: newCol,
      notes: '',
      sort_order: 0,
    })
    setNewTicker('')
    onRefresh?.()
  }

  // ── ELIMINAR CARD INDEPENDIENTE ──
  const handleDelete = async (card) => {
    if (card.type !== 'card') return
    if (!confirm(`¿Eliminar "${card.ticker}" del tablero?`)) return
    await supabase.from('tablero_rector').delete().eq('id', card.raw.id)
    onRefresh?.()
  }

  // ── EDITAR NOTAS ──
  const startEditNotes = (card) => {
    if (card.type !== 'card') return  // posiciones no editan notas aquí
    setEditingNotes({ type: card.type, id: card.raw.id, value: card.notes || '' })
  }

  const saveNotes = async () => {
    if (!editingNotes) return
    await supabase.from('tablero_rector')
      .update({ notes: editingNotes.value, updated_at: new Date().toISOString() })
      .eq('id', editingNotes.id)
    setEditingNotes(null)
    onRefresh?.()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="section-title !mb-0">Tablero Rector</div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Nuevo ticker"
            value={newTicker}
            onChange={e => setNewTicker(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            className="w-28 px-2 py-1 text-xs font-mono font-bold uppercase border border-slate-200 rounded outline-none focus:border-etoro"
          />
          <select
            value={newCol}
            onChange={e => setNewCol(e.target.value)}
            className="px-2 py-1 text-[10px] font-bold border border-slate-200 rounded outline-none"
          >
            <option value="RADAR">RADAR</option>
            <option value="ENTRAR YA">ENTRAR YA</option>
            <option value="xSALIR">xSALIR</option>
          </select>
          <button onClick={handleAdd} className="px-2.5 py-1 text-[10px] font-bold text-white bg-etoro rounded hover:bg-green-700 transition">
            +
          </button>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 mb-3">
        Arrastra cards entre columnas. Las posiciones abiertas heredan su clase de <code>positions</code> y al moverlas se actualiza ahí.
        ENTRAR YA / RADAR son exclusivas para activos sin posición abierta.
      </p>

      {/* GRID DE COLUMNAS — 4 arriba, 3 abajo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {COLUMNS.slice(0, 4).map(col => (
          <Column
            key={col.id} col={col}
            cards={byColumn[col.id] || []}
            isOver={dragOverCol === col.id}
            dragId={dragId}
            onDragOver={e => handleDragOver(e, col.id)}
            onDrop={e => handleDrop(e, col.id)}
            onCardDragStart={handleDragStart}
            onCardDragEnd={handleDragEnd}
            onCardDelete={handleDelete}
            onCardEditNotes={startEditNotes}
            editingNotes={editingNotes}
            setEditingNotes={setEditingNotes}
            onSaveNotes={saveNotes}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLUMNS.slice(4).map(col => (
          <Column
            key={col.id} col={col}
            cards={byColumn[col.id] || []}
            isOver={dragOverCol === col.id}
            dragId={dragId}
            onDragOver={e => handleDragOver(e, col.id)}
            onDrop={e => handleDrop(e, col.id)}
            onCardDragStart={handleDragStart}
            onCardDragEnd={handleDragEnd}
            onCardDelete={handleDelete}
            onCardEditNotes={startEditNotes}
            editingNotes={editingNotes}
            setEditingNotes={setEditingNotes}
            onSaveNotes={saveNotes}
          />
        ))}
      </div>
    </div>
  )
}

// ─── COLUMNA ─────────────────────
function Column({ col, cards, isOver, dragId, onDragOver, onDrop, onCardDragStart, onCardDragEnd, onCardDelete, onCardEditNotes, editingNotes, setEditingNotes, onSaveNotes }) {
  const blocked = dragId && dragId.type === 'pos' && !col.allowPositions
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex flex-col rounded-lg border min-h-[180px] transition-colors ${
        blocked       ? 'bg-red-50/30 border-red-200 border-dashed opacity-60' :
        isOver        ? 'bg-green-50/40 border-etoro border-dashed' :
                        'bg-slate-50/60 border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/60">
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: col.color }}
        >
          {col.label}
        </span>
        <span className="text-[9px] text-slate-400 font-mono">{cards.length}</span>
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        {cards.length === 0 && (
          <div className="text-[10px] text-slate-300 italic text-center py-4">
            {blocked ? 'No permitido' : 'vacío'}
          </div>
        )}
        {cards.map(c => (
          <Card
            key={c.id}
            card={c}
            colColor={col.color}
            onDragStart={onCardDragStart}
            onDragEnd={onCardDragEnd}
            onDelete={onCardDelete}
            onEditNotes={onCardEditNotes}
            editingNotes={editingNotes}
            setEditingNotes={setEditingNotes}
            onSaveNotes={onSaveNotes}
          />
        ))}
      </div>
    </div>
  )
}

// ─── CARD ─────────────────────
function Card({ card, colColor, onDragStart, onDragEnd, onDelete, onEditNotes, editingNotes, setEditingNotes, onSaveNotes }) {
  const isPos = card.type === 'pos'
  const isEditing = editingNotes && editingNotes.id === card.raw?.id && card.type === 'card'
  const pnlPct = isPos && card.invested ? ((card.current_value - card.invested) / card.invested * 100) : null
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      className="group bg-white rounded border border-slate-200 px-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-slate-400 hover:shadow-sm transition"
      style={isPos ? { borderLeft: `3px solid ${colColor}` } : {}}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono font-bold text-[12px] text-slate-800">{card.ticker}</span>
        <div className="flex items-center gap-1">
          {isPos && pnlPct != null && (
            <span className={`text-[9px] font-mono font-bold ${pnlPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
            </span>
          )}
          {!isPos && (
            <button
              onClick={() => onDelete(card)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 text-[10px] transition leading-none"
              title="Eliminar"
            >✕</button>
          )}
        </div>
      </div>

      {isPos && (
        <div className="text-[8.5px] text-slate-400 font-mono uppercase tracking-wider mt-0.5">
          {card.platform}
        </div>
      )}

      {!isPos && (
        <>
          {isEditing ? (
            <textarea
              autoFocus
              value={editingNotes.value}
              onChange={e => setEditingNotes({ ...editingNotes, value: e.target.value })}
              onBlur={onSaveNotes}
              onKeyDown={e => {
                if (e.key === 'Escape') setEditingNotes(null)
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSaveNotes()
              }}
              className="w-full mt-1 px-1.5 py-1 text-[10px] text-slate-700 bg-slate-50 border border-blue-300 rounded outline-none resize-none"
              rows={3}
              placeholder="Notas (Cmd+Enter para guardar)"
            />
          ) : (
            <div
              onClick={() => onEditNotes(card)}
              className="text-[10px] text-slate-500 mt-0.5 cursor-text hover:bg-slate-50 -mx-1 px-1 py-0.5 rounded transition min-h-[14px]"
            >
              {card.notes || <span className="text-slate-300 italic">+ nota</span>}
            </div>
          )}
          {card.updated_at && card.notes && (
            <div className="text-[8px] text-slate-300 mt-0.5 font-mono">
              {fmtDate(card.updated_at)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

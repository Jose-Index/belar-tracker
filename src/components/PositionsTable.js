'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { BROKER_COLORS, BROKER_NAMES, CLASS_COLORS, RESP_COLORS, RESP_OPTIONS, formatCurrency, formatNative, toUSD, pnlColor } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

// ─── SVG Sparkline with area fill ────────────────
function SparklineSVG({ data, width, height, showDots, showLabels, showEvents }) {
  if (!data || data.length < 2) return null
  const values = data.map(d => d.value)
  const invested = data[0].invested
  const min = Math.min(...values, invested)
  const max = Math.max(...values, invested)
  const range = max - min || 1
  const pad = showLabels ? 6 : 2

  const xFn = (i) => (i / (values.length - 1) * (width - pad * 2) + pad).toFixed(1)
  const yFn = (v) => (height - pad - (v - min) / range * (height - pad * 2)).toFixed(1)

  const points = values.map((v, i) => `${xFn(i)},${yFn(v)}`).join(' ')
  const lastVal = values[values.length - 1]
  const color = lastVal >= invested ? '#22c55e' : '#ef4444'
  const fillColor = lastVal >= invested ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'
  const areaPoints = `${xFn(0)},${(height - pad).toFixed(1)} ${points} ${xFn(values.length - 1)},${(height - pad).toFixed(1)}`
  const invY = yFn(invested)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polygon points={areaPoints} fill={fillColor} />
      <line x1={pad} y1={invY} x2={width - pad} y2={invY} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.5" />
      <polyline points={points} fill="none" stroke={color} strokeWidth={showDots ? 1.5 : 1.2} strokeLinejoin="round" strokeLinecap="round" />
      {showDots && values.map((v, i) => (
        <circle key={i} cx={xFn(i)} cy={yFn(v)} r="2.5" fill={v >= invested ? '#22c55e' : '#ef4444'} stroke="#fff" strokeWidth="1" />
      ))}
      {showLabels && (() => {
        const startPct = ((values[0] - invested) / invested * 100).toFixed(1)
        const endPct = ((lastVal - invested) / invested * 100).toFixed(1)
        return <>
          <text x={Number(xFn(0)) + 2} y={Number(yFn(values[0])) - 6} fontSize="8" fill="#94a3b8" textAnchor="start" fontFamily="monospace">
            {(startPct >= 0 ? '+' : '') + startPct + '%'}
          </text>
          <text x={Number(xFn(values.length - 1)) - 2} y={Number(yFn(lastVal)) - 6} fontSize="8" fill={color} textAnchor="end" fontFamily="monospace" fontWeight="bold">
            {(endPct >= 0 ? '+' : '') + endPct + '%'}
          </text>
          <text x={width - pad} y={Number(invY) - 3} fontSize="7" fill="#64748b" textAnchor="end" fontFamily="monospace" opacity="0.7">
            inv
          </text>
        </>
      })()}
      {showEvents && data.filter(d => d.event).map((d, idx) => {
        const i = data.indexOf(d)
        const ex = (i / (values.length - 1) * (width - pad * 2) + pad)
        const ey = Number(yFn(d.value))
        const isAmp = d.event === 'ampliar' || d.event === 'xAMPLIAR'
        const marker = isAmp ? '\u25B2' : '\u25BC'
        const mColor = isAmp ? '#22c55e' : '#ef4444'
        return <text key={'ev'+idx} x={ex} y={ey - (showDots ? 8 : 5)} fontSize={showDots ? '9' : '6'} fill={mColor} textAnchor="middle" fontWeight="bold">{marker}</text>
      })}
    </svg>
  )
}

function Sparkline({ data, ticker, broker, invested }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (open && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect()
      setPos({
        x: Math.min(rect.left, window.innerWidth - 310),
        y: rect.bottom + 6
      })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!data || data.length < 2) return (
    <div className="w-[72px] h-[20px] bg-slate-50 rounded flex items-center justify-center">
      <span className="text-[7px] text-slate-300 font-mono">sin hist.</span>
    </div>
  )

  return (
    <div ref={wrapperRef} className="relative">
      <div className="cursor-pointer" onClick={() => setOpen(!open)}>
        <SparklineSVG data={data} width={72} height={20} showDots={false} showLabels={false} showEvents={true} />
      </div>
      {open && (
        <div className="fixed z-[9999]" style={{ left: pos.x, top: pos.y }}>
          <SparkTooltip data={data} ticker={ticker} broker={broker} invested={invested} />
        </div>
      )}
    </div>
  )
}

function SparkTooltip({ data, ticker, broker, invested }) {
  if (!data || data.length < 2) return null
  const lastVal = data[data.length - 1].value
  const totalPct = ((lastVal - invested) / invested * 100).toFixed(2)
  const isUp = lastVal >= invested
  const changes = data.map((d, i) => {
    if (i === 0) return { ...d, weekPct: ((d.value - invested) / invested * 100) }
    const prev = data[i - 1].value
    return { ...d, weekPct: ((d.value - prev) / prev * 100) }
  })
  const recent = changes.slice(-10)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xl ring-1 ring-slate-100" style={{ minWidth: 290 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-slate-800 font-mono">{ticker}</span>
          <span className="text-[9px] text-slate-400 font-mono uppercase">{broker}</span>
        </div>
        <span className={`text-[13px] font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
          {isUp ? '+' : ''}{totalPct}%
        </span>
      </div>
      <div className="bg-slate-50 rounded-lg p-2 mb-2.5">
        <SparklineSVG data={data} width={262} height={80} showDots={true} showLabels={true} showEvents={true} />
      </div>
      <div className="space-y-0">
        <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 pb-1 mb-1 border-b border-slate-200">
          <span>FECHA</span><span>VALOR</span><span>SEMANAL</span>
        </div>
        {recent.map((d, i) => {
          const isWeekUp = d.weekPct >= 0
          const dateStr = new Date(d.week_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
          return (
            <div key={i} className="flex items-center justify-between text-[9px] font-mono py-[3px] border-b border-slate-100 last:border-0">
              <span className="text-slate-400 w-[70px]">{d.event ? (d.event === 'xAMPLIAR' ? '\u25B2 ' : '\u25BC ') : ''}{dateStr}</span>
              <span className="text-slate-700 w-[60px] text-right">${d.value.toFixed(0)}</span>
              <span className={`w-[55px] text-right font-semibold ${isWeekUp ? 'text-green-400' : 'text-red-400'}`}>
                {isWeekUp ? '+' : ''}{d.weekPct.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between text-[8px] font-mono text-slate-400">
        <span>Inv: ${invested.toFixed(0)}</span>
        <span>G/P: <span className={isUp ? 'text-green-600' : 'text-red-500'}>${(lastVal - invested).toFixed(0)}</span></span>
        <span>{data.length} sem</span>
      </div>
    </div>
  )
}

// ─── ADD POSITION MODAL ────────────────
function AddPositionModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    ticker: '', platform: 'etoro', resp: 'Jose',
    class: 'NÚCLEO', entry_date: new Date().toISOString().split('T')[0],
    invested: '', current_value: '', currency: 'USD', leverage: 1,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.ticker.trim() || !form.invested) return
    setSaving(true)
    await onSave({
      ...form,
      ticker: form.ticker.trim().toUpperCase(),
      invested: parseFloat(form.invested),
      current_value: parseFloat(form.current_value || form.invested),
      leverage: parseFloat(form.leverage) || 1,
      is_open: true,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800 tracking-wide">Nueva Posición</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div className="space-y-2.5">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Ticker</label>
            <input autoFocus type="text" placeholder="NVDA" value={form.ticker}
              onChange={e => setForm({...form, ticker: e.target.value.toUpperCase()})}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono font-bold uppercase outline-none focus:border-green-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Broker</label>
              <select value={form.platform} onChange={e => setForm({...form, platform: e.target.value})}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none">
                <option value="etoro">eToro</option>
                <option value="xtb">XTB</option>
                <option value="ibkr">IBKR</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Resp</label>
              <select value={form.resp} onChange={e => setForm({...form, resp: e.target.value})}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none">
                {RESP_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Clase</label>
              <select value={form.class} onChange={e => setForm({...form, class: e.target.value})}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none">
                <option value="NÚCLEO">NÚCLEO</option>
                <option value="TÁCTICA">TÁCTICA</option>
                <option value="MOMENTUM">MOMENTUM</option>
                <option value="DISRUPTIVA">DISRUPTIVA</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Divisa</label>
              <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Entrada</label>
            <input type="date" value={form.entry_date}
              onChange={e => setForm({...form, entry_date: e.target.value})}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-green-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Invertido</label>
              <input type="number" step="0.01" placeholder="0.00" value={form.invested}
                onChange={e => setForm({...form, invested: e.target.value})}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-green-400" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Valor actual</label>
              <input type="number" step="0.01" placeholder="= invertido" value={form.current_value}
                onChange={e => setForm({...form, current_value: e.target.value})}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-green-400" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Apalancamiento (x)</label>
            <select value={form.leverage} onChange={e => setForm({...form, leverage: parseFloat(e.target.value)})}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-green-400">
              <option value={1}>x1 (sin apalancamiento)</option>
              <option value={2}>x2</option>
              <option value={3}>x3</option>
              <option value={5}>x5</option>
              <option value={10}>x10</option>
              <option value={20}>x20</option>
              <option value={30}>x30</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-3 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.ticker.trim() || !form.invested}
            className="flex-1 px-3 py-2 bg-etoro text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ────────────────
export default function PositionsTable({ positions, positionHistory, onRefresh, eurUsdRate = 1.08 }) {
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [sortMode, setSortMode] = useState('broker')
  const [showAdd, setShowAdd] = useState(false)

  // Estado local para optimistic updates (evita recargar toda la página al editar)
  const [localPositions, setLocalPositions] = useState(positions || [])
  useEffect(() => { setLocalPositions(positions || []) }, [positions])

  const historyMap = useMemo(() => {
    const map = {}
    if (positionHistory?.length) {
      positionHistory.forEach(h => {
        if (!map[h.position_id]) map[h.position_id] = []
        map[h.position_id].push({ week_date: h.week_date, value: Number(h.value), invested: Number(h.invested), event: h.event, event_amount: h.event_amount })
      })
    }
    return map
  }, [positionHistory])

  // Optimistic update: actualiza localPositions instantáneamente y persiste en segundo plano.
  // Si la persistencia falla, hace rollback cargando desde BD.
  const updateField = async (id, field, value) => {
    setLocalPositions(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
    setEditing(null)
    const { error } = await supabase.from('positions').update({ [field]: value }).eq('id', id)
    if (error) {
      console.error('Update failed, refreshing:', error)
      onRefresh?.()
    }
  }

  const handleSaveField = async (id, field, value) => {
    const coerced = (field === 'invested' || field === 'current_value')
      ? (() => { const v = parseFloat(value); return isNaN(v) ? null : v })()
      : value
    if (coerced === null || coerced === undefined || coerced === '') { setEditing(null); return }
    await updateField(id, field, coerced)
  }

  const handleClosePosition = async (p) => {
    if (!confirm(`¿Cerrar posición ${p.ticker} (${BROKER_NAMES[p.platform]})?\nLa fila desaparece del dashboard pero se conserva su histórico.`)) return
    // Optimistic: desaparece al instante
    setLocalPositions(prev => prev.filter(x => x.id !== p.id))
    const { error } = await supabase.from('positions').update({ is_open: false }).eq('id', p.id)
    if (error) {
      console.error('Close failed, refreshing:', error)
      onRefresh?.()
    }
  }

  const handleAddPosition = async (newPos) => {
    const { data: inserted, error } = await supabase.from('positions').insert(newPos).select().single()
    if (error) {
      console.error('Add failed:', error)
      return
    }
    // Optimistic: aparece inmediatamente
    setLocalPositions(prev => [...prev, inserted])
  }

  if (!localPositions?.length && !showAdd) return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="section-title !mb-0">Posiciones Abiertas</div>
        <button onClick={() => setShowAdd(true)}
          className="px-2.5 py-1 text-[10px] font-bold text-etoro border border-green-200 rounded-md hover:bg-green-50">
          + Añadir
        </button>
      </div>
      <p className="text-sm text-slate-400">Sin posiciones abiertas</p>
      {showAdd && <AddPositionModal onClose={() => setShowAdd(false)} onSave={handleAddPosition} />}
    </div>
  )

  const sorted = [...localPositions].sort((a, b) => {
    if (sortMode === 'entry') {
      const da = a.entry_date ? new Date(a.entry_date).getTime() : -Infinity
      const db = b.entry_date ? new Date(b.entry_date).getTime() : -Infinity
      if (da !== db) return db - da
      return (a.ticker || '').localeCompare(b.ticker || '')
    }
    if (sortMode === 'clase') {
      const classOrder = { 'NÚCLEO': 1, 'NUCLEO': 1, 'TÁCTICA': 2, 'TACTICA': 2, 'MOMENTUM': 3, 'DISRUPTIVA': 4 }
      const ca = classOrder[a.class] || 99
      const cb = classOrder[b.class] || 99
      if (ca !== cb) return ca - cb
      return (a.ticker || '').localeCompare(b.ticker || '')
    }
    const order = { etoro: 1, xtb: 2, ibkr: 3 }
    const brokerDiff = (order[a.platform] || 99) - (order[b.platform] || 99)
    if (brokerDiff !== 0) return brokerDiff
    return (a.ticker || '').localeCompare(b.ticker || '')
  })

  const totalInvested = sorted.reduce((s, p) => s + toUSD(Number(p.invested || 0), p.currency || 'USD', eurUsdRate), 0)
  const totalValue = sorted.reduce((s, p) => s + toUSD(Number(p.current_value || p.invested || 0), p.currency || 'USD', eurUsdRate), 0)
  const totalPnl = totalValue - totalInvested
  const totalPct = totalInvested > 0 ? totalPnl / totalInvested : 0

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="section-title !mb-0">Posiciones Abiertas</div>
          <span className="text-[10px] text-slate-400 font-mono">{sorted.length} posiciones · {formatCurrency(totalValue)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0 text-[9px] border border-slate-200 rounded-md overflow-hidden">
            <button onClick={() => setSortMode('broker')}
              className={`px-2 py-1 font-semibold tracking-wider transition-colors ${sortMode === 'broker' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              BROKER · A-Z
            </button>
            <button onClick={() => setSortMode('entry')}
              className={`px-2 py-1 font-semibold tracking-wider transition-colors ${sortMode === 'entry' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              ENTRADA ↓
            </button>
            <button onClick={() => setSortMode('clase')}
              className={`px-2 py-1 font-semibold tracking-wider transition-colors ${sortMode === 'clase' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              CLASE
            </button>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="px-2.5 py-1 text-[10px] font-bold text-etoro border border-green-200 rounded-md hover:bg-green-50">
            + Añadir
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full belar-table" style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              <th>Activo</th>
              <th>Resp</th>
              <th>Broker</th>
              <th>Entrada</th>
              <th>Invertido</th>
              <th>Valor</th>
              <th>G/P $</th>
              <th>G/P %</th>
              <th title="Rendimiento diario">%/D</th>
              <th>Clase</th>
              <th title="Apalancamiento">Apal.</th>
              <th>Peso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const invested = Number(p.invested || 0)
              const value = Number(p.current_value || p.invested || 0)
              const pnl = value - invested
              const pct = invested > 0 ? pnl / invested : 0
              const cur = p.currency || 'USD'
              const valueUSD = toUSD(value, cur, eurUsdRate)
              const weight = totalValue > 0 ? valueUSD / totalValue : 0

              let dailyPct = null
              if (p.entry_date) {
                const entry = new Date(p.entry_date)
                const days = Math.max(1, Math.floor((new Date() - entry) / 86400000))
                dailyPct = pct / days
              }

              const brokerColor = BROKER_COLORS[p.platform] || '#666'
              const classColor = CLASS_COLORS[p.class] || '#6b7280'
              const respColor = RESP_COLORS[p.resp] || '#cbd5e1'

              const editKey = (f) => `${p.id}:${f}`

              return (
                <tr key={p.id} className={p.class === 'NÚCLEO' || p.class === 'NUCLEO' ? 'bg-blue-50/40' : ''} style={p.class === 'NÚCLEO' || p.class === 'NUCLEO' ? { borderLeft: '3px solid #2563eb' } : {}}>
                  <td>
                    <span className="font-bold text-slate-800 text-[13px] block">{p.ticker}</span>
                    <Sparkline data={historyMap[p.id]} ticker={p.ticker} broker={BROKER_NAMES[p.platform] || p.platform} invested={invested} />
                  </td>

                  <td>
                    <select value={p.resp || ''}
                      onChange={e => updateField(p.id, 'resp', e.target.value || null)}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md outline-none cursor-pointer border appearance-none"
                      style={{
                        background: respColor + '12',
                        color: p.resp ? respColor : '#cbd5e1',
                        borderColor: respColor + '30',
                        minWidth: 64,
                      }}>
                      <option value="">—</option>
                      {RESP_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>

                  <td>
                    <select value={p.platform || ''}
                      onChange={e => updateField(p.id, 'platform', e.target.value)}
                      className="platform-badge outline-none cursor-pointer appearance-none"
                      style={{ background: brokerColor + '12', color: brokerColor, border: `1px solid ${brokerColor}30` }}>
                      <option value="etoro">eToro</option>
                      <option value="xtb">XTB</option>
                      <option value="ibkr">IBKR</option>
                    </select>
                  </td>

                  <td className="text-slate-500 font-mono text-[11px]">
                    {editing === editKey('entry_date') ? (
                      <input autoFocus type="date"
                        className="px-1 py-0.5 border border-green-400 rounded text-[11px] font-mono outline-none bg-green-50"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => handleSaveField(p.id, 'entry_date', editVal || null)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveField(p.id, 'entry_date', editVal || null)} />
                    ) : (
                      <span className="cursor-pointer hover:text-green-600"
                        onClick={() => { setEditing(editKey('entry_date')); setEditVal(p.entry_date ? String(p.entry_date).split('T')[0] : '') }}>
                        {p.entry_date ? (() => {
                          const d = new Date(p.entry_date)
                          const opts = d.getFullYear() !== new Date().getFullYear()
                            ? { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }
                            : { day: '2-digit', month: 'short', timeZone: 'UTC' }
                          return d.toLocaleDateString('es-ES', opts)
                        })() : <span className="text-slate-300">—</span>}
                      </span>
                    )}
                  </td>

                  <td className="text-right">
                    {editing === editKey('invested') ? (
                      <input autoFocus type="number" step="0.01"
                        className="w-24 text-right px-1 py-0.5 border border-green-400 rounded text-[12px] font-mono outline-none bg-green-50"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => handleSaveField(p.id, 'invested', editVal)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveField(p.id, 'invested', editVal)} />
                    ) : (
                      <span className="font-mono text-[12px] text-slate-500 cursor-pointer hover:text-green-600"
                        onClick={() => { setEditing(editKey('invested')); setEditVal(String(invested)) }}>
                        {formatNative(invested, cur)}
                      </span>
                    )}
                  </td>

                  <td className="text-right">
                    {editing === editKey('current_value') ? (
                      <input autoFocus type="number" step="0.01"
                        className="w-24 text-right px-1 py-0.5 border border-green-400 rounded text-[13px] font-mono font-bold outline-none bg-green-50"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => handleSaveField(p.id, 'current_value', editVal)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveField(p.id, 'current_value', editVal)} />
                    ) : (
                      <span className="font-mono text-[13px] font-bold text-slate-800 cursor-pointer hover:text-green-600"
                        onClick={() => { setEditing(editKey('current_value')); setEditVal(String(value)) }}>
                        {formatNative(value, cur)}
                      </span>
                    )}
                  </td>

                  <td className="text-right">
                    <span className={`font-mono text-[13px] font-bold ${pnl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {pnl >= 0 ? '+' : ''}{formatNative(pnl, cur)}
                    </span>
                  </td>

                  <td className="text-right">
                    <span className={`font-mono text-[13px] font-bold ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {pct >= 0 ? '+' : ''}{(pct * 100).toFixed(2)}%
                    </span>
                  </td>

                  <td className="text-right">
                    {dailyPct !== null ? (
                      <span className={`font-mono text-[9px] ${dailyPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {dailyPct >= 0 ? '+' : ''}{(dailyPct * 100).toFixed(2)}%
                      </span>
                    ) : <span className="text-slate-300 text-[9px]">—</span>}
                  </td>

                  <td>
                    <select value={p.class || 'NÚCLEO'}
                      onChange={e => updateField(p.id, 'class', e.target.value)}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md outline-none cursor-pointer appearance-none border"
                      style={{ background: classColor + '12', color: classColor, borderColor: classColor + '30' }}>
                      <option value="NÚCLEO">NÚCLEO</option>
                      <option value="TÁCTICA">TÁCTICA</option>
                      <option value="MOMENTUM">MOMENTUM</option>
                      <option value="DISRUPTIVA">DISRUPTIVA</option>
                    </select>
                  </td>

                  <td className="text-center">
                    <select value={p.leverage ?? 1}
                      onChange={e => updateField(p.id, 'leverage', parseFloat(e.target.value))}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md outline-none cursor-pointer appearance-none border"
                      style={{
                        background: (Number(p.leverage) > 1) ? '#f59e0b18' : '#f1f5f912',
                        color: (Number(p.leverage) > 1) ? '#b45309' : '#94a3b8',
                        borderColor: (Number(p.leverage) > 1) ? '#f59e0b40' : '#cbd5e130',
                        minWidth: 50,
                      }}>
                      <option value={1}>x1</option>
                      <option value={2}>x2</option>
                      <option value={3}>x3</option>
                      <option value={5}>x5</option>
                      <option value={10}>x10</option>
                      <option value={20}>x20</option>
                      <option value={30}>x30</option>
                    </select>
                  </td>

                  <td className="text-right font-mono text-[11px] text-slate-500">{(weight * 100).toFixed(1)}%</td>

                  <td className="text-center">
                    <button onClick={() => handleClosePosition(p)}
                      title="Cerrar posición"
                      className="text-slate-300 hover:text-red-500 text-sm leading-none transition-colors">
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-200">
              <td colSpan={4} className="text-[11px] text-slate-500 font-semibold">{sorted.length} posiciones</td>
              <td className="text-right font-mono text-[12px] font-semibold text-slate-600">{formatCurrency(totalInvested)}</td>
              <td className="text-right font-mono text-[13px] font-bold text-slate-800">{formatCurrency(totalValue)}</td>
              <td className="text-right">
                <span className={`font-mono text-[13px] font-bold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
                </span>
              </td>
              <td className="text-right">
                <span className={`font-mono text-[13px] font-bold ${totalPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {totalPct >= 0 ? '+' : ''}{(totalPct * 100).toFixed(2)}%
                </span>
              </td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {showAdd && <AddPositionModal onClose={() => setShowAdd(false)} onSave={handleAddPosition} />}
    </div>
  )
}

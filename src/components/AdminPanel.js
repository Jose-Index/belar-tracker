'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BROKER_COLORS, BROKER_NAMES, CLASS_COLORS } from '@/lib/constants'

export default function AdminPanel({ positions, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    ticker: '', platform: 'etoro', class: 'TÁCTICA',
    entry_date: new Date().toISOString().split('T')[0],
    invested: '', current_value: '',
  })

  const handleAdd = async () => {
    if (!form.ticker || !form.invested) return
    await supabase.from('positions').insert({
      ticker: form.ticker.toUpperCase().trim(),
      platform: form.platform,
      class: form.class,
      entry_date: form.entry_date,
      invested: parseFloat(form.invested),
      current_value: parseFloat(form.current_value || form.invested),
      is_open: true,
    })
    setForm({ ticker: '', platform: 'etoro', class: 'TÁCTICA', entry_date: new Date().toISOString().split('T')[0], invested: '', current_value: '' })
    setShowAdd(false)
    onRefresh?.()
  }

  const handleClose = async (id, ticker) => {
    if (!confirm(`¿Cerrar posición ${ticker}?`)) return
    await supabase.from('positions').update({ is_open: false, close_date: new Date().toISOString().split('T')[0] }).eq('id', id)
    onRefresh?.()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-title !mb-0">Gestión de Posiciones</div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="text-[10px] font-bold text-etoro border border-green-200 px-2.5 py-1 rounded-md hover:bg-green-50 transition">
          {showAdd ? 'Cancelar' : '+ Nueva Posición'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="text-[9px] text-slate-400 block mb-0.5">Ticker</label>
            <input type="text" placeholder="AAPL" className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs font-mono uppercase outline-none focus:border-green-400"
              value={form.ticker} onChange={e => setForm({...form, ticker: e.target.value})} />
          </div>
          <div>
            <label className="text-[9px] text-slate-400 block mb-0.5">Plataforma</label>
            <select className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs outline-none"
              value={form.platform} onChange={e => setForm({...form, platform: e.target.value})}>
              <option value="etoro">eToro</option>
              <option value="xtb">XTB</option>
              <option value="ibkr">IBKR</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] text-slate-400 block mb-0.5">Clase</label>
            <select className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs outline-none"
              value={form.class} onChange={e => setForm({...form, class: e.target.value})}>
              <option value="NÚCLEO">NÚCLEO</option>
              <option value="TÁCTICA">TÁCTICA</option>
              <option value="MOMENTUM">MOMENTUM</option>
              <option value="DISRUPTIVA">DISRUPTIVA</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] text-slate-400 block mb-0.5">Fecha entrada</label>
            <input type="date" className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs outline-none"
              value={form.entry_date} onChange={e => setForm({...form, entry_date: e.target.value})} />
          </div>
          <div>
            <label className="text-[9px] text-slate-400 block mb-0.5">Invertido ($)</label>
            <input type="number" step="0.01" placeholder="1000" className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs font-mono outline-none focus:border-green-400"
              value={form.invested} onChange={e => setForm({...form, invested: e.target.value})} />
          </div>
          <div>
            <label className="text-[9px] text-slate-400 block mb-0.5">Valor actual ($)</label>
            <input type="number" step="0.01" placeholder="= invertido" className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs font-mono outline-none focus:border-green-400"
              value={form.current_value} onChange={e => setForm({...form, current_value: e.target.value})} />
          </div>
          <div className="col-span-2 flex items-end">
            <button onClick={handleAdd} className="px-4 py-1.5 bg-etoro text-white text-[10px] font-bold rounded-md hover:bg-green-600 transition">
              Guardar posición
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {positions?.map(p => {
          const brokerColor = BROKER_COLORS[p.platform] || '#666'
          const classColor = CLASS_COLORS[p.class] || '#6b7280'
          return (
            <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 group">
              <div className="flex items-center gap-3">
                <span className="font-bold text-[12px] text-slate-800 w-20">{p.ticker}</span>
                <span className="platform-badge text-[9px]" style={{ background: brokerColor + '12', color: brokerColor }}>{BROKER_NAMES[p.platform]}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: classColor + '12', color: classColor }}>{p.class}</span>
              </div>
              <button onClick={() => handleClose(p.id, p.ticker)}
                className="text-[9px] text-slate-300 hover:text-red-500 font-semibold opacity-0 group-hover:opacity-100 transition-all">
                Cerrar ✕
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

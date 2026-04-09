'use client'
import { useState, useEffect } from 'react'
import { EVENT_TYPES, formatCurrency, formatPct, pnlColor } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

// ─── CALENDAR ────────────────────────────
export function CalendarView({ events, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ date: '', event_type: 'CUSTOM', ticker: '', title: '', importance: 'MEDIUM' })

  const handleAdd = async () => {
    if (!form.date || !form.title) return
    await supabase.from('calendar_events').insert(form)
    setForm({ date: '', event_type: 'CUSTOM', ticker: '', title: '', importance: 'MEDIUM' })
    setShowAdd(false)
    onRefresh?.()
  }

  const upcoming = events?.filter(e => new Date(e.date) >= new Date(new Date().toDateString())).slice(0, 15) || []

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="section-title !mb-0">Calendario de Vigilancia</div>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs text-etoro font-semibold hover:underline">
          {showAdd ? 'Cancelar' : '+ Evento'}
        </button>
      </div>

      {showAdd && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 rounded-lg">
          <input type="date" className="px-2 py-1 border rounded text-xs" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
          <select className="px-2 py-1 border rounded text-xs" value={form.event_type} onChange={e => setForm({...form, event_type: e.target.value})}>
            {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="text" placeholder="Ticker" className="w-16 px-2 py-1 border rounded text-xs font-mono uppercase" value={form.ticker} onChange={e => setForm({...form, ticker: e.target.value.toUpperCase()})} />
          <input type="text" placeholder="Descripción" className="flex-1 min-w-[150px] px-2 py-1 border rounded text-xs" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
          <button onClick={handleAdd} className="px-3 py-1 bg-etoro text-white text-xs rounded font-semibold">Guardar</button>
        </div>
      )}

      <div className="space-y-1.5">
        {upcoming.length === 0 && <p className="text-sm text-slate-400">Sin eventos próximos</p>}
        {upcoming.map(e => {
          const type = EVENT_TYPES[e.event_type] || EVENT_TYPES.CUSTOM
          return (
            <div key={e.id} className="flex items-center gap-3 text-xs py-2 border-b border-slate-100 last:border-0">
              <span className="font-mono text-slate-400 w-16">
                {new Date(e.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: type.color + '20', color: type.color }}>
                {type.label}
              </span>
              {e.ticker && <span className="font-mono font-bold text-slate-700">{e.ticker}</span>}
              <span className="text-slate-600 flex-1">{e.title}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── WEEKLY HISTORY ────────────────────────────
export function WeeklyHistory({ snapshots }) {
  if (!snapshots?.length) return null

  const rows = [...snapshots].reverse().slice(0, 52) // Last year

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 pb-3">
        <div className="section-title !mb-0">Histórico Semanal</div>
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full belar-table">
          <thead className="sticky top-0 bg-white">
            <tr><th>Semana</th><th className="text-right">eToro</th><th className="text-right">XTB</th><th className="text-right">IBKR</th><th className="text-right">BTC</th><th className="text-right">Total</th><th className="text-right">Var %</th></tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const next = rows[i + 1]
              const change = next ? (s.total_usd - next.total_usd) / next.total_usd : 0
              return (
                <tr key={s.id}>
                  <td className="font-mono text-xs text-slate-500">{new Date(s.week_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                  <td className="text-right font-mono text-xs">{formatCurrency(s.data?.etoro)}</td>
                  <td className="text-right font-mono text-xs">{formatCurrency(s.data?.xtb)}</td>
                  <td className="text-right font-mono text-xs">{formatCurrency(s.data?.ibkr)}</td>
                  <td className="text-right font-mono text-xs">{formatCurrency(s.data?.btc_usd)}</td>
                  <td className="text-right font-mono text-xs font-semibold">{formatCurrency(s.total_usd)}</td>
                  <td className={`text-right font-mono text-xs font-semibold ${pnlColor(change)}`}>
                    {next ? `${change >= 0 ? '+' : ''}${(change * 100).toFixed(2)}%` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── CONTRIBUTIONS ────────────────────────────
export function ContributionsTable({ contributions }) {
  if (!contributions?.length) return null

  const total = contributions.reduce((s, c) => s + Number(c.amount_usd || 0), 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 pb-3">
        <div className="section-title !mb-0">Aportaciones de Capital</div>
        <div className="text-xs text-slate-400 mt-1">Total invertido: <span className="font-semibold text-slate-600">{formatCurrency(total)}</span></div>
      </div>
      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
        <table className="w-full belar-table">
          <thead className="sticky top-0 bg-white">
            <tr><th>Fecha</th><th>Plataforma</th><th className="text-right">EUR</th><th className="text-right">USD</th></tr>
          </thead>
          <tbody>
            {[...contributions].reverse().map(c => (
              <tr key={c.id}>
                <td className="font-mono text-xs text-slate-500">{new Date(c.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                <td><span className="platform-badge" style={{ background: `var(--${c.platform})15`, color: `var(--${c.platform})` }}>{c.platform.toUpperCase()}</span></td>
                <td className="text-right font-mono text-xs">{c.amount_eur ? `€${Number(c.amount_eur).toFixed(2)}` : '—'}</td>
                <td className="text-right font-mono text-xs font-semibold">{formatCurrency(c.amount_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── YEARLY RESULTS ────────────────────────────
export function YearlyResults({ results }) {
  if (!results?.length) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 pb-3">
        <div className="section-title !mb-0">Resultados por Año</div>
      </div>
      <table className="w-full belar-table">
        <thead>
          <tr><th>Año</th><th className="text-right">Invertido</th><th className="text-right">Valor Final</th><th className="text-right">G/P $</th><th className="text-right">G/P %</th></tr>
        </thead>
        <tbody>
          {results.map(r => (
            <tr key={r.year}>
              <td className="font-semibold">{r.year}</td>
              <td className="text-right font-mono">{formatCurrency(r.invested_total)}</td>
              <td className="text-right font-mono font-semibold">{formatCurrency(r.final_value)}</td>
              <td className={`text-right font-mono font-semibold ${pnlColor(r.pnl_usd)}`}>{r.pnl_usd >= 0 ? '+' : ''}{formatCurrency(r.pnl_usd)}</td>
              <td className={`text-right font-mono font-semibold ${pnlColor(r.pnl_pct)}`}>{r.pnl_pct >= 0 ? '+' : ''}{(Number(r.pnl_pct) * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── RESULTS SUMMARY (AYTD + GLOBAL) ────────────────────────────
export function ResultsSummary({ snapshots, contributions }) {
  if (!snapshots?.length || !contributions?.length) return null

  const latest = snapshots[snapshots.length - 1]
  const totalValue = latest.total_usd || 0
  const totalInvested = contributions.reduce((s, c) => s + Number(c.amount_usd || 0), 0)
  const globalPnl = totalValue - totalInvested
  const globalPct = totalInvested > 0 ? globalPnl / totalInvested : 0

  // AYTD: find first snapshot of current year
  const year = new Date().getFullYear()
  const yearSnapshots = snapshots.filter(s => new Date(s.week_date).getFullYear() === year)
  const firstOfYear = yearSnapshots.length > 0 ? yearSnapshots[0] : null
  const aytdStart = firstOfYear ? firstOfYear.total_usd : totalValue
  const ytdContribs = contributions.filter(c => new Date(c.date).getFullYear() === year).reduce((s, c) => s + Number(c.amount_usd || 0), 0)
  const aytdPnl = totalValue - aytdStart - ytdContribs
  const aytdPct = aytdStart > 0 ? aytdPnl / aytdStart : 0

  const boxes = [
    { label: `AYTD ${year}`, value: totalValue, invested: aytdStart + ytdContribs, pnl: aytdPnl, pct: aytdPct, color: '#7c3aed' },
    { label: 'GLOBAL', value: totalValue, invested: totalInvested, pnl: globalPnl, pct: globalPct, color: '#0ea5e9' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {boxes.map(b => (
        <div key={b.label} className="bg-white rounded-xl border border-slate-200 p-5" style={{ borderTopColor: b.color, borderTopWidth: 3 }}>
          <div className="text-[10px] font-bold tracking-widest text-slate-400 mb-2">{b.label}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-slate-400">Valor actual</div>
              <div className="font-mono font-bold text-lg" style={{ color: b.color }}>{formatCurrency(b.value)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Invertido</div>
              <div className="font-mono font-semibold text-slate-600">{formatCurrency(b.invested)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">G/P $</div>
              <div className={`font-mono font-bold ${pnlColor(b.pnl)}`}>{b.pnl >= 0 ? '+' : ''}{formatCurrency(b.pnl)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">G/P %</div>
              <div className={`font-mono font-bold ${pnlColor(b.pct)}`}>{b.pct >= 0 ? '+' : ''}{(b.pct * 100).toFixed(2)}%</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── CALCULATOR ────────────────────────────
export function Calculator() {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [mode, setMode] = useState('pct') // pct: A→B=%, val: A+%=B

  const result = mode === 'pct'
    ? (a && b ? (((Number(b) - Number(a)) / Number(a)) * 100).toFixed(4) + '%' : '—')
    : (a && b ? (Number(a) * (1 + Number(b) / 100)).toFixed(2) : '—')

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Calculadora %</div>
      <div className="flex gap-2 mb-3">
        <button onClick={() => setMode('pct')} className={`text-[10px] font-semibold px-3 py-1 rounded ${mode === 'pct' ? 'bg-etoro text-white' : 'bg-slate-100 text-slate-500'}`}>
          A → B = %
        </button>
        <button onClick={() => setMode('val')} className={`text-[10px] font-semibold px-3 py-1 rounded ${mode === 'val' ? 'bg-etoro text-white' : 'bg-slate-100 text-slate-500'}`}>
          A + % = B
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input type="number" step="any" placeholder={mode === 'pct' ? 'Valor A' : 'Cantidad'} className="flex-1 px-3 py-2 border rounded text-sm font-mono bg-slate-50" value={a} onChange={e => setA(e.target.value)} />
        <span className="text-slate-400 text-xs">{mode === 'pct' ? '→' : '+'}</span>
        <input type="number" step="any" placeholder={mode === 'pct' ? 'Valor B' : '%'} className="flex-1 px-3 py-2 border rounded text-sm font-mono bg-slate-50" value={b} onChange={e => setB(e.target.value)} />
        <span className="text-slate-400 text-xs">=</span>
        <div className="flex-1 px-3 py-2 bg-slate-100 rounded text-sm font-mono font-bold text-slate-800">{result}</div>
      </div>
    </div>
  )
}

// ─── FOOTER ────────────────────────────
export function Footer({ quotes }) {
  const [quote, setQuote] = useState(null)

  useEffect(() => {
    if (quotes?.length) {
      const random = quotes[Math.floor(Math.random() * quotes.length)]
      setQuote(random)
    }
  }, [quotes])

  if (!quote) return null

  return (
    <footer className="text-center py-6 border-t border-slate-200 mt-8">
      <p className="text-xs text-slate-400 italic max-w-lg mx-auto">
        "{quote.text}"
        {quote.author && <span className="not-italic font-semibold"> — {quote.author}</span>}
      </p>
      <p className="text-[10px] text-slate-300 mt-2">BELAR Tracker v9 · Capa JOSE · Ecosistema IA Personal</p>
    </footer>
  )
}

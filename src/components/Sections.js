'use client'
import { useState, useEffect, useMemo } from 'react'
import { EVENT_TYPES, formatCurrency, pnlColor, BROKER_COLORS, BROKER_NAMES, toUSD, getNextSaturday, toDateStrLocal, RESP_COLORS } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

// ─── BROKER BALANCES + REGISTRAR ────────────────────────────
// Card individual por broker. DEFINIDO FUERA de BrokerBalancesRegister para
// evitar que React lo desmonte en cada tecla (bug de focus en inputs).
function BrokerBalanceCard({ code, label, color, posValue, total, balance, onChange }) {
  return (
    <div className="flex-1 min-w-[180px] bg-slate-50 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
          {label}
        </span>
        <span className="text-[9px] text-slate-400 font-mono">
          pos: {formatCurrency(posValue, 0)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-slate-400 font-mono">$</span>
        <input type="number" step="0.01" placeholder="saldo cash"
          value={balance}
          onChange={e => onChange(e.target.value)}
          className="flex-1 px-2 py-1 border border-slate-300 rounded text-[13px] font-mono font-bold outline-none focus:border-green-400 bg-white"
          style={{ color }} />
      </div>
      <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
        <span className="text-[9px] text-slate-400 uppercase tracking-wider">Total</span>
        <span className="text-[13px] font-mono font-bold" style={{ color }}>
          {formatCurrency(total, 0)}
        </span>
      </div>
    </div>
  )
}

// Inputs manuales de saldo (cash) por broker + botón REGISTRAR.
// Al pulsar REGISTRAR:
//   1. Calcula totales por broker = Σ valor posiciones (USD) + saldo manual
//   2. Upsert weekly_snapshots para el sábado próximo (hoy si es sábado)
//   3. Inserta position_history para cada posición (fecha = sábado próximo)
//   4. Persiste saldos manuales en broker_balances
export function BrokerBalancesRegister({ brokerBalances, positions, snapshots, btcPrice, btcQty, eurUsdRate, onRefresh }) {
  const [balances, setBalances] = useState({ etoro: '', xtb: '', ibkr: '' })
  const [registering, setRegistering] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  // Hidratar desde Supabase al montar
  useEffect(() => {
    if (!brokerBalances?.length) return
    const map = {}
    brokerBalances.forEach(b => { map[b.broker] = String(b.balance ?? '') })
    setBalances(prev => ({
      etoro: map.etoro ?? prev.etoro,
      xtb: map.xtb ?? prev.xtb,
      ibkr: map.ibkr ?? prev.ibkr,
    }))
  }, [brokerBalances])

  // Totales calculados en vivo
  const brokerTotals = useMemo(() => {
    const t = { etoro: 0, xtb: 0, ibkr: 0 }
    ;(positions || []).forEach(p => {
      const v = toUSD(Number(p.current_value || p.invested || 0), p.currency || 'USD', eurUsdRate)
      if (t[p.platform] !== undefined) t[p.platform] += v
    })
    const bal = {
      etoro: parseFloat(balances.etoro) || 0,
      xtb: parseFloat(balances.xtb) || 0,
      ibkr: parseFloat(balances.ibkr) || 0,
    }
    return {
      etoro: t.etoro + bal.etoro,
      xtb: t.xtb + bal.xtb,
      ibkr: t.ibkr + bal.ibkr,
      posEtoro: t.etoro, posXtb: t.xtb, posIbkr: t.ibkr,
    }
  }, [positions, balances, eurUsdRate])

  const nextSat = useMemo(() => getNextSaturday(new Date()), [])
  const nextSatStr = toDateStrLocal(nextSat)

  // ¿Existe ya fila para el sábado próximo? (para mostrar "Registro ya existe, se sobrescribirá")
  const existsRow = snapshots?.some(s => s.week_date === nextSatStr)

  const handleRegistrar = async () => {
    if (registering) return
    setRegistering(true)
    try {
      // 1. Persistir saldos manuales
      const balRows = [
        { broker: 'etoro', balance: parseFloat(balances.etoro) || 0, updated_at: new Date().toISOString() },
        { broker: 'xtb',   balance: parseFloat(balances.xtb) || 0,   updated_at: new Date().toISOString() },
        { broker: 'ibkr',  balance: parseFloat(balances.ibkr) || 0,  updated_at: new Date().toISOString() },
      ]
      await supabase.from('broker_balances').upsert(balRows, { onConflict: 'broker' })
        .then(({ error: bbErr }) => { if (bbErr) console.warn('broker_balances upsert warn:', bbErr) })

      // 2. Calcular btc_usd en tiempo real
      const btcUsd = btcPrice && btcQty ? btcPrice * btcQty : 0

      // 3. Construir data del snapshot
      const data = {
        etoro: brokerTotals.etoro,
        xtb: brokerTotals.xtb,
        ibkr: brokerTotals.ibkr,
        btc_qty: btcQty || 0,
        btc_usd: btcUsd,
      }
      const total_usd = data.etoro + data.xtb + data.ibkr + data.btc_usd

      // 4. Upsert weekly_snapshot del sábado próximo
      const existing = snapshots?.find(s => s.week_date === nextSatStr)
      if (existing) {
        const { error: wsUpdateErr } = await supabase.from('weekly_snapshots').update({ data, total_usd }).eq('id', existing.id)
        if (wsUpdateErr) throw new Error('weekly_snapshots UPDATE: ' + wsUpdateErr.message)
      } else {
        const { error: wsInsertErr } = await supabase.from('weekly_snapshots').insert({
          week_date: nextSatStr,
          year: nextSat.getFullYear(),
          data,
          total_usd,
        })
        if (wsInsertErr) throw new Error('weekly_snapshots INSERT: ' + wsInsertErr.message)
      }

      // 5. Insertar position_history para cada posición (fecha = sábado próximo)
      //    Detectar ampliaciones/reducciones comparando invested vs último registro
      if (positions?.length) {
        const posIds = positions.map(p => p.id)
        const { error: phDelErr } = await supabase.from('position_history')
          .delete()
          .eq('week_date', nextSatStr)
          .in('position_id', posIds)
        if (phDelErr) console.warn('position_history delete warn:', phDelErr)

        // Get last week's position_history to compare invested amounts
        const { data: prevHistory } = await supabase.from('position_history')
          .select('position_id,invested')
          .in('position_id', posIds)
          .order('week_date', { ascending: false })
          .limit(posIds.length * 2)

        const lastInvestedMap = {}
        ;(prevHistory || []).forEach(ph => {
          if (!lastInvestedMap[ph.position_id]) lastInvestedMap[ph.position_id] = ph.invested
        })

        const snaps = positions.map(p => {
          const currentInvested = Number(p.invested || 0)
          const prevInvested = lastInvestedMap[p.id]
          let event = null
          let event_amount = null
          if (prevInvested != null && Math.abs(currentInvested - prevInvested) > 1) {
            if (currentInvested > prevInvested) {
              event = 'ampliar'
              event_amount = currentInvested - prevInvested
            } else {
              event = 'reducir'
              event_amount = prevInvested - currentInvested
            }
          }
          return {
            position_id: p.id,
            week_date: nextSatStr,
            value: Number(p.current_value || p.invested || 0),
            invested: currentInvested,
            event,
            event_amount,
          }
        })
        const { error: phError } = await supabase.from('position_history').insert(snaps)
        if (phError) console.warn('position_history insert failed (no bloqueante):', phError)
      }

      setLastResult({
        ok: true,
        saturday: nextSatStr,
        total: total_usd,
        byBroker: data,
        ts: new Date().toLocaleTimeString('es-ES'),
      })
      onRefresh?.()
    } catch (e) {
      console.error('REGISTRAR error', e)
      setLastResult({ ok: false, error: String(e?.message || e) })
    } finally {
      setRegistering(false)
    }
  }

  const BrokerInput = null // reemplazado por BrokerBalanceCard a nivel de módulo

  const fmtSat = nextSat.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title !mb-0">Registrar Snapshot Semanal</div>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
            Sábado destino: <span className="font-semibold text-slate-600">{fmtSat}</span>
            {existsRow && <span className="ml-2 text-amber-500">· sobrescribirá registro existente</span>}
          </p>
        </div>
        <button onClick={handleRegistrar} disabled={registering}
          className="px-4 py-1.5 text-[11px] font-bold tracking-wider text-white bg-etoro border border-etoro rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors">
          {registering ? 'REGISTRANDO…' : 'REGISTRAR'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-3">
        <BrokerBalanceCard
          code="etoro" label="eToro" color={BROKER_COLORS.etoro}
          posValue={brokerTotals.posEtoro} total={brokerTotals.etoro}
          balance={balances.etoro}
          onChange={v => setBalances(prev => ({ ...prev, etoro: v }))}
        />
        <BrokerBalanceCard
          code="xtb" label="XTB" color={BROKER_COLORS.xtb}
          posValue={brokerTotals.posXtb} total={brokerTotals.xtb}
          balance={balances.xtb}
          onChange={v => setBalances(prev => ({ ...prev, xtb: v }))}
        />
        <BrokerBalanceCard
          code="ibkr" label="IBKR" color={BROKER_COLORS.ibkr}
          posValue={brokerTotals.posIbkr} total={brokerTotals.ibkr}
          balance={balances.ibkr}
          onChange={v => setBalances(prev => ({ ...prev, ibkr: v }))}
        />
      </div>

      {lastResult && (
        <div className={`text-[10px] font-mono p-2 rounded ${lastResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {lastResult.ok
            ? `✓ Registrado ${lastResult.saturday} · Total ${formatCurrency(lastResult.total)} · ${lastResult.ts}`
            : `✗ Error: ${lastResult.error}`}
        </div>
      )}

      <p className="text-[9px] text-slate-400 mt-2">
        Cash manual + valor de posiciones por broker. Los saldos quedan persistidos. El snapshot se guarda con fecha del próximo sábado — si hoy es sábado, hoy mismo. Pulsaciones múltiples en la misma semana sobrescriben esa fila. Cuando el sábado vence, queda congelada y el próximo REGISTRAR apunta al siguiente sábado.
      </p>
    </div>
  )
}

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
        <button onClick={() => setShowAdd(!showAdd)} className="text-[10px] font-bold text-etoro border border-green-200 px-2.5 py-1 rounded-md hover:bg-green-50 transition">
          {showAdd ? 'Cancelar' : '+ Evento'}
        </button>
      </div>
      {showAdd && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
          <input type="date" className="px-2 py-1.5 border border-slate-200 rounded-md text-xs outline-none focus:border-green-400" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
          <select className="px-2 py-1.5 border border-slate-200 rounded-md text-xs outline-none" value={form.event_type} onChange={e => setForm({...form, event_type: e.target.value})}>
            {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="text" placeholder="Ticker" className="w-16 px-2 py-1.5 border border-slate-200 rounded-md text-xs font-mono uppercase outline-none focus:border-green-400" value={form.ticker} onChange={e => setForm({...form, ticker: e.target.value.toUpperCase()})} />
          <input type="text" placeholder="Descripción" className="flex-1 min-w-[180px] px-2 py-1.5 border border-slate-200 rounded-md text-xs outline-none focus:border-green-400" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
          <button onClick={handleAdd} className="px-3 py-1.5 bg-etoro text-white text-[10px] font-bold rounded-md">Guardar</button>
        </div>
      )}
      <div className="space-y-1">
        {upcoming.length === 0 && <p className="text-sm text-slate-400 py-2">Sin eventos próximos</p>}
        {upcoming.map(e => {
          const type = EVENT_TYPES[e.event_type] || EVENT_TYPES.CUSTOM
          return (
            <div key={e.id} className="flex items-center gap-3 text-xs py-2.5 border-b border-slate-50 last:border-0">
              <span className="font-mono text-slate-400 w-14 shrink-0">
                {new Date(e.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0" style={{ background: type.color + '15', color: type.color }}>
                {type.label}
              </span>
              {e.ticker && <span className="font-mono font-bold text-slate-700 shrink-0">{e.ticker}</span>}
              <span className="text-slate-600 truncate">{e.title}</span>
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
  const rows = [...snapshots].reverse().slice(0, 52)

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 pt-5 pb-2">
        <div className="section-title !mb-0">Histórico Semanal</div>
        <p className="text-[10px] text-slate-400 mt-1">{rows.length} semanas</p>
      </div>
      <div className="overflow-auto max-h-[450px]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Semana</th>
              <th className="text-right px-3 py-2 font-semibold text-[10px] uppercase tracking-wider" style={{color: BROKER_COLORS.etoro}}>eToro</th>
              <th className="text-right px-3 py-2 font-semibold text-[10px] uppercase tracking-wider" style={{color: BROKER_COLORS.xtb}}>XTB</th>
              <th className="text-right px-3 py-2 font-semibold text-[10px] uppercase tracking-wider" style={{color: BROKER_COLORS.ibkr}}>IBKR</th>
              <th className="text-right px-3 py-2 font-semibold text-[10px] uppercase tracking-wider" style={{color: BROKER_COLORS.btc}}>BTC</th>
              <th className="text-right px-4 py-2 font-semibold text-slate-700 text-[10px] uppercase tracking-wider">Total</th>
              <th className="text-right px-4 py-2 font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Var%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const next = rows[i + 1]
              const change = next ? (s.total_usd - next.total_usd) / next.total_usd : 0
              return (
                <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-2 font-mono text-slate-500">{new Date(s.week_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                  <td className="text-right px-3 py-2 font-mono text-slate-600">{formatCurrency(s.data?.etoro, 0)}</td>
                  <td className="text-right px-3 py-2 font-mono text-slate-600">{formatCurrency(s.data?.xtb, 0)}</td>
                  <td className="text-right px-3 py-2 font-mono text-slate-600">{formatCurrency(s.data?.ibkr, 0)}</td>
                  <td className="text-right px-3 py-2 font-mono text-slate-600">{formatCurrency(s.data?.btc_usd, 0)}</td>
                  <td className="text-right px-4 py-2 font-mono font-bold text-slate-800">{formatCurrency(s.total_usd, 0)}</td>
                  <td className={`text-right px-4 py-2 font-mono font-semibold ${pnlColor(change)}`}>
                    {next ? `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%` : '—'}
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
export function ContributionsTable({ contributions, onRefresh }) {
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], platform: 'etoro', amount_eur: '', amount_usd: '' })

  const total = contributions?.reduce((s, c) => s + Number(c.amount_usd || 0), 0) || 0

  const handleAdd = async () => {
    if (!form.date || !form.amount_eur) return
    await supabase.from('contributions').insert({
      date: form.date, platform: form.platform,
      amount_eur: parseFloat(form.amount_eur),
      amount_usd: parseFloat(form.amount_usd) || parseFloat(form.amount_eur) * 1.08,
    })
    setForm({ date: new Date().toISOString().split('T')[0], platform: 'etoro', amount_eur: '', amount_usd: '' })
    onRefresh?.()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 pt-5 pb-2">
        <div className="section-title !mb-0">Aportaciones de Capital</div>
        <p className="text-[10px] text-slate-400 mt-1">Total invertido: <span className="font-semibold text-slate-600">{formatCurrency(total)}</span></p>
      </div>

      {/* Always visible form */}
      <div className="mx-5 mb-3 p-3 bg-slate-50 rounded-lg border border-slate-100 flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[9px] text-slate-400 block mb-0.5">Fecha</label>
          <input type="date" className="h-[30px] px-2 py-1 border border-slate-200 rounded-md text-xs outline-none focus:border-green-400" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
        </div>
        <div>
          <label className="text-[9px] text-slate-400 block mb-0.5">Plataforma</label>
          <select className="h-[30px] px-2 py-1 border border-slate-200 rounded-md text-xs outline-none bg-white" value={form.platform} onChange={e => setForm({...form, platform: e.target.value})}>
            <option value="etoro">eToro</option>
            <option value="xtb">XTB</option>
            <option value="ibkr">IBKR</option>
            <option value="btc">BTC</option>
          </select>
        </div>
        <div>
          <label className="text-[9px] text-slate-400 block mb-0.5">EUR</label>
          <input type="number" step="0.01" placeholder="€" className="h-[30px] w-20 px-2 py-1 border border-slate-200 rounded-md text-xs font-mono outline-none focus:border-green-400" value={form.amount_eur} onChange={e => setForm({...form, amount_eur: e.target.value})} />
        </div>
        <div>
          <label className="text-[9px] text-slate-400 block mb-0.5">USD</label>
          <input type="number" step="0.01" placeholder="$" className="h-[30px] w-20 px-2 py-1 border border-slate-200 rounded-md text-xs font-mono outline-none focus:border-green-400" value={form.amount_usd} onChange={e => setForm({...form, amount_usd: e.target.value})} />
        </div>
        <button onClick={handleAdd} className="h-[30px] px-3 bg-etoro text-white text-[10px] font-bold rounded-md hover:bg-green-600 transition-colors">Guardar</button>
      </div>

      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Fecha</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Plataforma</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-500 text-[10px] uppercase tracking-wider">EUR</th>
              <th className="text-right px-4 py-2 font-semibold text-slate-500 text-[10px] uppercase tracking-wider">USD</th>
            </tr>
          </thead>
          <tbody>
            {[...(contributions||[])].reverse().map(c => {
              const color = BROKER_COLORS[c.platform] || '#666'
              return (
                <tr key={c.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-2 font-mono text-slate-500">{new Date(c.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                  <td className="px-3 py-2">
                    <span className="platform-badge" style={{ background: color + '12', color, border: `1px solid ${color}30` }}>
                      {BROKER_NAMES[c.platform] || c.platform}
                    </span>
                  </td>
                  <td className="text-right px-3 py-2 font-mono text-slate-500">{c.amount_eur ? `€${Number(c.amount_eur).toFixed(0)}` : '—'}</td>
                  <td className="text-right px-4 py-2 font-mono font-semibold text-slate-700">{formatCurrency(c.amount_usd, 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── YEARLY RESULTS ────────────────────────────
export function YearlyResults({ results, contributions, snapshots }) {
  if (!results?.length) return null

  const totalInvested = contributions?.reduce((s, c) => s + Number(c.amount_usd || 0), 0) || 0
  const currentYear = new Date().getFullYear()

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 pt-5 pb-3">
        <div className="section-title !mb-0">Resultados por Año</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-5 pb-5">
        {results.map(r => {
          let pnl = Number(r.pnl_usd)
          let pnlPct = Number(r.pnl_pct)
          const isCurrentYear = r.year === currentYear
          // For current year: recalculate dynamically from snapshots
          if (isCurrentYear && snapshots?.length) {
            const yearSnaps = snapshots.filter(s => new Date(s.week_date).getFullYear() === currentYear)
            const startVal = yearSnaps.length > 0 ? yearSnaps[0].total_usd : 0
            const currentVal = snapshots[snapshots.length - 1]?.total_usd || 0
            const ytdC = contributions?.filter(c => new Date(c.date).getFullYear() === currentYear).reduce((s, c) => s + Number(c.amount_usd || 0), 0) || 0
            pnl = currentVal - startVal - ytdC
            pnlPct = startVal > 0 ? pnl / startVal : 0
          }
          const pnlUp = pnlPct >= 0
          return (
            <div key={r.year} className={`rounded-xl border p-4 ${pnlUp ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'} ${isCurrentYear ? 'ring-2 ring-offset-1 ring-slate-300' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-800">{r.year}</span>
                  {isCurrentYear && <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">En curso</span>}
                </div>
                <span className={`text-lg font-bold font-mono ${pnlUp ? 'text-green-600' : 'text-red-500'}`}>
                  {pnlPct > 0 ? '+' : ''}{(pnlPct * 100).toFixed(2)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-slate-400">Aportado en {r.year}</div>
                  <div className="font-mono font-semibold text-slate-600">+{formatCurrency(r.invested_total, 0)}</div>
                </div>
                <div>
                  <div className="text-slate-400">{isCurrentYear ? 'Valor actual' : 'Valor final'}</div>
                  <div className="font-mono font-semibold text-slate-800">{formatCurrency(isCurrentYear && snapshots?.length ? snapshots[snapshots.length-1].total_usd : r.final_value, 0)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-slate-400">G/P</div>
                  <div className={`font-mono font-bold text-base ${pnlUp ? 'text-green-600' : 'text-red-500'}`}>
                    {pnlUp ? '+' : ''}{formatCurrency(pnl, 0)}
                  </div>
                </div>
              </div>
              {isCurrentYear && (
                <div className="text-[9px] text-slate-400 mt-2 pt-2 border-t border-slate-200">
                  Capital total invertido histórico: {formatCurrency(totalInvested, 0)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── RESULTS SUMMARY (YTD + GLOBAL) ────────────────────────────
export function ResultsSummary({ snapshots, contributions }) {
  if (!snapshots?.length || !contributions?.length) return null

  const latest = snapshots[snapshots.length - 1]
  const totalValue = latest.total_usd || 0
  const totalInvested = contributions.reduce((s, c) => s + Number(c.amount_usd || 0), 0)
  const globalPnl = totalValue - totalInvested
  const globalPct = totalInvested > 0 ? globalPnl / totalInvested : 0

  const year = new Date().getFullYear()
  const yearSnapshots = snapshots.filter(s => new Date(s.week_date).getFullYear() === year)
  const firstOfYear = yearSnapshots.length > 0 ? yearSnapshots[0] : null
  const startOfYear = firstOfYear ? firstOfYear.total_usd : totalValue
  const ytdContribs = contributions.filter(c => new Date(c.date).getFullYear() === year).reduce((s, c) => s + Number(c.amount_usd || 0), 0)
  const ytdPnl = totalValue - startOfYear - ytdContribs

  // Modified Dietz: time-weighted return accounting for when each cash flow entered
  // weight_i = (totalDays - daysElapsedWhenFlow_i) / totalDays
  const yearStart = new Date(year, 0, 1)
  const now = new Date()
  const totalDays = Math.max(1, Math.floor((now - yearStart) / 86400000))
  const ytdCashflows = contributions.filter(c => new Date(c.date).getFullYear() === year)
  const weightedContribs = ytdCashflows.reduce((s, c) => {
    const flowDate = new Date(c.date)
    const daysElapsed = Math.max(0, Math.min(totalDays, Math.floor((flowDate - yearStart) / 86400000)))
    const weight = (totalDays - daysElapsed) / totalDays
    return s + Number(c.amount_usd || 0) * weight
  }, 0)
  const ytdDenom = startOfYear + weightedContribs
  const ytdPct = ytdDenom > 0 ? ytdPnl / ytdDenom : 0

  const boxes = [
    { label: `YTD ${year}`, pnl: ytdPnl, pct: ytdPct, color: '#7c3aed',
      sub: `Inicio año: ${formatCurrency(startOfYear)} · Aportado: ${formatCurrency(ytdContribs)}` },
    { label: 'GLOBAL', pnl: globalPnl, pct: globalPct, color: '#0ea5e9',
      sub: `Invertido total: ${formatCurrency(totalInvested)}` },
  ]

  return (
    <div className="grid grid-cols-2 gap-4">
      {boxes.map(b => {
        const up = b.pnl >= 0
        return (
          <div key={b.label} className="bg-white rounded-xl border border-slate-200 p-5" style={{ borderTopColor: b.color, borderTopWidth: 3 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold tracking-widest text-slate-400">{b.label}</span>
              <span className={`font-mono font-bold text-2xl ${up ? 'text-green-600' : 'text-red-500'}`}>
                {up ? '+' : ''}{(b.pct * 100).toFixed(2)}%
              </span>
            </div>
            <div className={`font-mono font-bold text-lg ${up ? 'text-green-600' : 'text-red-500'}`}>
              {up ? '+' : ''}{formatCurrency(b.pnl)}
            </div>
            <div className="text-[9px] text-slate-400 mt-2">{b.sub}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── CALCULATOR ────────────────────────────
export function Calculator() {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [mode, setMode] = useState('pct')

  const result = mode === 'pct'
    ? (a && b ? (((Number(b) - Number(a)) / Number(a)) * 100).toFixed(4) + '%' : '—')
    : (a && b ? '$' + (Number(a) * (1 + Number(b) / 100)).toFixed(2) : '—')

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Calculadora %</div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => { setMode('pct'); setA(''); setB('') }} className={`text-[10px] font-semibold px-3 py-1.5 rounded-md transition ${mode === 'pct' ? 'bg-etoro text-white' : 'bg-slate-100 text-slate-500'}`}>
          A → B = %
        </button>
        <button onClick={() => { setMode('val'); setA(''); setB('') }} className={`text-[10px] font-semibold px-3 py-1.5 rounded-md transition ${mode === 'val' ? 'bg-etoro text-white' : 'bg-slate-100 text-slate-500'}`}>
          Cantidad + % = Resultado
        </button>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-[10px] text-slate-400 w-12 shrink-0 text-right">{mode === 'pct' ? 'Valor A' : 'Cantidad'}</label>
          <input type="number" step="any" placeholder="0.00"
            className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono bg-white outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100"
            value={a} onChange={e => setA(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-[10px] text-slate-400 w-12 shrink-0 text-right">{mode === 'pct' ? 'Valor B' : '%'}</label>
          <input type="number" step="any" placeholder="0.00"
            className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono bg-white outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100"
            value={b} onChange={e => setB(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-[10px] text-slate-400 w-12 shrink-0 text-right">=</label>
          <div className="flex-1 px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm font-mono font-bold text-green-800 min-h-[40px] flex items-center">{result}</div>
        </div>
      </div>
    </div>
  )
}

// ─── BACKUP EXPORT ────────────────────────────
export function BackupExport({ snapshots, positions, contributions, yearlyResults }) {
  const [exporting, setExporting] = useState(false)

  const exportExcel = async () => {
    setExporting(true)
    try {
      const XLSX = await import('xlsx')

      const wb = XLSX.utils.book_new()

      // Sheet 1: Weekly Snapshots
      const snapData = snapshots.map(s => ({
        Fecha: s.week_date,
        eToro: s.data?.etoro || 0,
        XTB: s.data?.xtb || 0,
        IBKR: s.data?.ibkr || 0,
        BTC: s.data?.btc_usd || 0,
        Total: s.total_usd || 0,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(snapData), 'Capital')

      // Sheet 2: Positions
      const posData = positions.map(p => ({
        Ticker: p.ticker,
        Resp: p.resp || '',
        Plataforma: p.platform,
        Clase: p.class,
        Entrada: p.entry_date,
        Invertido: Number(p.invested),
        Valor: Number(p.current_value || p.invested),
        'G/P $': Number(p.current_value || p.invested) - Number(p.invested),
        'G/P %': ((Number(p.current_value || p.invested) - Number(p.invested)) / Number(p.invested) * 100).toFixed(2) + '%',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(posData), 'Posiciones')

      // Sheet 3: Contributions
      const contData = contributions.map(c => ({
        Fecha: c.date,
        Plataforma: c.platform,
        EUR: c.amount_eur,
        USD: c.amount_usd,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contData), 'Aportaciones')

      // Sheet 4: Yearly Results
      const yearData = yearlyResults.map(r => ({
        Año: r.year,
        Invertido: r.invested_total,
        'Valor Final': r.final_value,
        'G/P $': r.pnl_usd,
        'G/P %': (Number(r.pnl_pct) * 100).toFixed(2) + '%',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(yearData), 'Resultados')

      const date = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `BELAR_Backup_${date}.xlsx`)
    } catch (e) {
      console.error('Export error', e)
      alert('Error al exportar. Intenta de nuevo.')
    }
    setExporting(false)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Backup / Exportar</div>
      <p className="text-[11px] text-slate-500 mb-4">Descarga un snapshot completo de tu portfolio en Excel con todas las hojas de datos.</p>
      <div className="flex gap-3">
        <button onClick={exportExcel} disabled={exporting}
          className="px-4 py-2.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/></svg>
          {exporting ? 'Exportando...' : 'Exportar Excel'}
        </button>
      </div>
      <p className="text-[9px] text-slate-400 mt-3">Incluye: Capital semanal · Posiciones · Aportaciones · Resultados anuales</p>
    </div>
  )
}

// ─── FOOTER ────────────────────────────
export function Footer({ quotes }) {
  const [quote, setQuote] = useState(null)

  useEffect(() => {
    if (quotes?.length) {
      setQuote(quotes[Math.floor(Math.random() * quotes.length)])
    }
  }, [quotes])

  if (!quote) return null

  return (
    <footer className="text-center py-12 mt-10">
      <p className="text-[15px] text-slate-400 italic max-w-2xl mx-auto leading-relaxed">
        &ldquo;{quote.text}&rdquo;
        {quote.author && <span className="not-italic font-semibold block mt-2 text-slate-500 text-[13px]"> — {quote.author}</span>}
      </p>
      <p className="text-[10px] text-slate-300 mt-5 tracking-wider">BELAR Tracker v10 · Capa JOSE · Ecosistema IA Personal</p>
    </footer>
  )
}

// ─── SETTINGS ────────────────────────────
export function Settings({ quotes, onRefresh }) {
  const [newQuote, setNewQuote] = useState({ text: '', author: '' })

  const handleAddQuote = async () => {
    if (!newQuote.text.trim()) return
    await supabase.from('quotes').insert({ text: newQuote.text.trim(), author: newQuote.author.trim() || null, is_active: true })
    setNewQuote({ text: '', author: '' })
    onRefresh?.()
  }

  const handleDeleteQuote = async (id) => {
    await supabase.from('quotes').update({ is_active: false }).eq('id', id)
    onRefresh?.()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Configuración</div>

      <div className="mb-6">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Frases del footer ({quotes?.length || 0})</h3>
        <div className="flex gap-2 mb-3">
          <input type="text" placeholder="Texto de la frase..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded-md text-xs outline-none focus:border-green-400"
            value={newQuote.text} onChange={e => setNewQuote({...newQuote, text: e.target.value})} />
          <input type="text" placeholder="Autor" className="w-32 px-3 py-1.5 border border-slate-200 rounded-md text-xs outline-none focus:border-green-400"
            value={newQuote.author} onChange={e => setNewQuote({...newQuote, author: e.target.value})} />
          <button onClick={handleAddQuote} className="px-3 py-1.5 bg-etoro text-white text-[10px] font-bold rounded-md">+ Añadir</button>
        </div>
        <div className="max-h-[200px] overflow-y-auto space-y-1">
          {quotes?.map(q => (
            <div key={q.id} className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-slate-50 group text-[10px]">
              <span className="flex-1 text-slate-600 italic">&ldquo;{q.text}&rdquo; {q.author && <span className="not-italic font-semibold">— {q.author}</span>}</span>
              <button onClick={() => handleDeleteQuote(q.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">✕</button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Info técnica</h3>
        <div className="text-[10px] text-slate-400 space-y-1">
          <p>Supabase: ruqgzfoperkfmahpbpcv · GitHub: Jose-Index/belar-tracker</p>
          <p>API Belar: /api/belar (POST) · API Tickers: /api/tickers (GET)</p>
          <p>Versión: v10.0 · Stack: Next.js 14 + Supabase + Recharts + Tailwind</p>
        </div>
      </div>
    </div>
  )
}

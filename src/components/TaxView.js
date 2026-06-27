'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/constants'

// ─── IMPUESTOS · Provisión fiscal por ejercicio (normativa España 2026) ───
// Base = ganancias REALIZADAS del año (ventas). Provisión que crece según se materializan plusvalías.
//  · eToro  → José  → IRPF base del ahorro
//  · XTB    → Ana   → IRPF base del ahorro
//  · IBKR   → Index → Impuesto de Sociedades
// Los datos viven en settings (key='tax_provisions'). Cada año = un apunte; los anteriores quedan visibles.

const PORTF = [
  { key: 'etoro', owner: 'José Sanjuán Doménech',    broker: 'eToro', tax: 'irpf', regime: 'IRPF · base del ahorro', color: 'var(--etoro)' },
  { key: 'xtb',   owner: 'Ana María Funtes Blasco',  broker: 'XTB',   tax: 'irpf', regime: 'IRPF · base del ahorro', color: 'var(--xtb)' },
  { key: 'ibkr',  owner: 'Index Producciones S.L.',  broker: 'IBKR',  tax: 'is',   regime: 'Impuesto de Sociedades · Microempresa', color: 'var(--ibkr)' },
]

const IS_HINT = '19% hasta 50k · 21% resto'

// IRPF base del ahorro (tramos progresivos estatales)
function irpfAhorro(base) {
  if (base <= 0) return 0
  const tramos = [[6000, 0.19], [44000, 0.21], [150000, 0.23], [100000, 0.27], [Infinity, 0.30]]
  let rem = base, tax = 0
  for (const [w, r] of tramos) { const x = Math.min(rem, w); tax += x * r; rem -= x; if (rem <= 0) break }
  return tax
}

// Impuesto de Sociedades · Microempresa (<1M€): 19% hasta 50k, 21% resto
function isTax(base) {
  if (base <= 0) return 0
  const a = Math.min(base, 50000), b = Math.max(0, base - 50000)
  return a * 0.19 + b * 0.21
}

function computeTax(p, gains, div, includeDiv) {
  const base = (gains || 0) + (includeDiv ? (div || 0) : 0)
  const tax = p.tax === 'irpf' ? irpfAhorro(base) : isTax(base)
  return { base, tax, eff: base > 0 ? tax / base : 0 }
}

const empty = () => ({ etoro: { gains: 0, div: 0 }, xtb: { gains: 0, div: 0 }, ibkr: { gains: 0, div: 0 } })

export default function TaxView({ taxData, onRefresh }) {
  const currentYear = new Date().getFullYear()
  const [model, setModel] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const base = taxData && typeof taxData === 'object' ? taxData : {}
    const years = { ...(base.years || {}) }
    for (const y of [2024, 2025, currentYear]) if (!years[y]) years[y] = empty()
    setModel({
      include_dividends: !!base.include_dividends,
      years,
    })
  }, [taxData, currentYear])

  if (!model) return null

  const persist = async (next) => {
    setSaving(true)
    setModel(next)
    try {
      await supabase.from('settings').upsert(
        { key: 'tax_provisions', value: JSON.stringify(next), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      onRefresh?.()
    } catch (e) { console.error('tax save error', e) }
    finally { setSaving(false) }
  }

  const setField = (year, pkey, field, raw) => {
    const v = parseFloat(String(raw).replace(',', '.'))
    const next = { ...model, years: { ...model.years } }
    next.years[year] = { ...next.years[year], [pkey]: { ...next.years[year][pkey], [field]: isNaN(v) ? 0 : v } }
    setModel(next) // edición local fluida
  }
  const commit = () => persist(model)

  const toggleDiv = () => persist({ ...model, include_dividends: !model.include_dividends })

  const yearsSorted = Object.keys(model.years).map(Number).sort((a, b) => b - a)
  const inc = model.include_dividends

  const yearTotals = (y) => PORTF.reduce((s, p) => {
    const cell = model.years[y]?.[p.key] || {}
    return s + computeTax(p, cell.gains, cell.div, inc).tax
  }, 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title !mb-0">Impuestos</div>
          <div className="text-[11px] text-slate-400 mt-1">Provisión fiscal por ejercicio · sobre ganancias realizadas · normativa España 2026</div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
            <input type="checkbox" checked={inc} onChange={toggleDiv} className="accent-current" />
            Incluir dividendos
          </label>
        </div>
      </div>

      <div className="px-5 pb-5 space-y-5">
        {yearsSorted.map(y => {
          const isCur = y === currentYear
          const yt = model.years[y]
          return (
            <div key={y} className={`rounded-xl border ${isCur ? 'border-slate-300 ring-2 ring-offset-1 ring-slate-200' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-slate-800">{y}</span>
                  {isCur && <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">En curso</span>}
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider">Provisión total</div>
                  <div className="text-lg font-bold font-mono text-slate-800">{formatCurrency(yearTotals(y), 2)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
                {PORTF.map(p => {
                  const cell = yt?.[p.key] || { gains: 0, div: 0 }
                  const { base, tax, eff } = computeTax(p, cell.gains, cell.div, inc)
                  const tipo = p.tax === 'is' ? IS_HINT : 'progresivo 19-30%'
                  return (
                    <div key={p.key} className="rounded-lg border border-slate-200 p-3 bg-slate-50/40">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                        <span className="text-[13px] font-bold text-slate-700">{p.broker}</span>
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500 mb-1">{p.owner}</div>
                      <div className="text-[10px] text-slate-400 mb-2">{p.regime} <span className="text-slate-300">({tipo})</span></div>

                      <label className="block text-[10px] text-slate-400 mb-0.5">Ganancias realizadas ($)</label>
                      <input
                        key={`${y}-${p.key}-g`}
                        type="number" step="0.01" defaultValue={cell.gains || ''}
                        onChange={e => setField(y, p.key, 'gains', e.target.value)} onBlur={commit}
                        className="w-full text-[13px] font-mono border border-slate-200 rounded-md px-2 py-1 mb-2"
                        placeholder="0" />

                      {inc && (
                        <>
                          <label className="block text-[10px] text-slate-400 mb-0.5">Dividendos ($)</label>
                          <input
                            key={`${y}-${p.key}-d`}
                            type="number" step="0.01" defaultValue={cell.div || ''}
                            onChange={e => setField(y, p.key, 'div', e.target.value)} onBlur={commit}
                            className="w-full text-[13px] font-mono border border-slate-200 rounded-md px-2 py-1 mb-2"
                            placeholder="0" />
                        </>
                      )}

                      <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-200">
                        <div>
                          <div className="text-[9px] text-slate-400 uppercase tracking-wider">Provisión</div>
                          <div className="text-base font-bold font-mono text-red-600">{formatCurrency(tax, 2)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-400 uppercase tracking-wider">Tipo efectivo</div>
                          <div className="text-[12px] font-mono font-semibold text-slate-500">{(eff * 100).toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        <div className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
          Previsión orientativa, no asesoramiento fiscal. IRPF del ahorro: 19% (0-6k) · 21% (6-50k) · 23% (50-200k) · 27% (200-300k) · 30% (&gt;300k), por persona (José y Ana).
          Index tributa por Impuesto de Sociedades, régimen microempresa: 19% hasta 50k · 21% resto. La base son <b>ganancias realizadas</b> del ejercicio; los años cerrados quedan fijados y el año en curso se edita conforme materialices ventas. {saving && <span className="text-slate-500">· guardando…</span>}
        </div>
      </div>
    </div>
  )
}

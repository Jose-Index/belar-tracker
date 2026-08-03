import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './posiciones.css'

// ─── Constantes de la spec ───────────────────────────────────────────────
const ESTADOS = {
  COHETE: { label: 'COHETE', urg: 3 },
  OK:     { label: 'OK',     urg: 4 },
  OJO:    { label: 'OJO',    urg: 2 },
  DUDA:   { label: '¿?',     urg: 1 },
  XSALIR: { label: 'xSALIR', urg: 0 },
}
const CLASES = {
  NUCLEO_ANCLA: 'NÚCLEO·A', NUCLEO_ESTRUCTURAL: 'NÚCLEO·E', NUCLEO_GESTION: 'NÚCLEO·G',
  MOMENTUM: 'MOMENTUM', TACTICA: 'TÁCTICA', DISRUPTIVA: 'DISRUPT.',
}
const ORDENES = [
  { id: 'broker',  label: 'Broker A-Z' },
  { id: 'entrada', label: 'Entrada' },
  { id: 'clase',   label: 'Clase' },
  { id: 'estado',  label: 'Estado' },
  { id: 'sem',     label: '%/semana' },
  { id: 'dia',     label: '%/día' },
  { id: 'peso',    label: 'Peso' },
  { id: 'gp',      label: 'G/P %' },
]

const fmt$ = v => v == null ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''

export default function Posiciones() {
  const [rows, setRows] = useState(null)
  const [orden, setOrden] = useState(() => localStorage.getItem('btp-orden') || 'broker')
  const [sel, setSel] = useState(null)
  const [fuente, setFuente] = useState('bd')

  useEffect(() => { localStorage.setItem('btp-orden', orden) }, [orden])

  useEffect(() => {
    async function load() {
      const { data: pos, error } = await supabase.from('positions').select('*')
      if (!error && pos?.length) {
        const { data: snaps } = await supabase.from('position_snapshots')
          .select('week_end,ticker,broker,value')
          .order('week_end', { ascending: false }).limit(120)
        setRows(compute(pos, snaps || [])); setFuente('bd')
        return
      }
      if (import.meta.env.DEV) {
        // (fixture dev eliminado del repo: los datos llegan por Supabase con sesión)
        const fx = { positions: [], snapshots: [] }
        setRows(compute(fx.positions, fx.snapshots)); setFuente('fixture dev')
      } else {
        setRows([]); setFuente(error ? 'error: ' + error.message : 'sin datos (¿sesión iniciada?)')
      }
    }
    load()
  }, [])

  function compute(pos, snaps) {
    const weeks = [...new Set(snaps.map(s => s.week_end))].sort().reverse()
    const [w0, w1] = weeks // última y penúltima semana cerradas
    const snap = (t, b, w) => snaps.find(s => s.ticker === t && s.broker === b && s.week_end === w)?.value
    const total = pos.reduce((a, p) => a + (p.current_value ?? p.invested), 0)
    return pos.map(p => {
      const val = p.current_value ?? p.invested
      const v0 = snap(p.ticker, p.broker, w0), v1 = snap(p.ticker, p.broker, w1)
      return {
        ...p,
        valor: val,
        gp: val - p.invested,
        gpPct: p.invested ? (val - p.invested) / p.invested * 100 : null,
        dia: null,              // %/día: llegará con el módulo de precios (quotes)
        sem: (v0 != null && v1 != null && v1 !== 0) ? (v0 - v1) / v1 * 100 : null, // (b) estática
        peso: total ? val / total * 100 : null,
      }
    })
  }

  const sorted = useMemo(() => {
    if (!rows) return null
    const by = {
      broker:  (a, b) => a.broker.localeCompare(b.broker) || a.ticker.localeCompare(b.ticker),
      entrada: (a, b) => (b.entry_date || '').localeCompare(a.entry_date || ''),
      clase:   (a, b) => (a.clase || '').localeCompare(b.clase || ''),
      estado:  (a, b) => (ESTADOS[a.estado]?.urg ?? 9) - (ESTADOS[b.estado]?.urg ?? 9),
      sem:     (a, b) => (b.sem ?? -999) - (a.sem ?? -999),
      dia:     (a, b) => (b.dia ?? -999) - (a.dia ?? -999),
      peso:    (a, b) => (b.peso ?? 0) - (a.peso ?? 0),
      gp:      (a, b) => (b.gpPct ?? -999) - (a.gpPct ?? -999),
    }
    return [...rows].sort(by[orden] || by.broker)
  }, [rows, orden])

  if (!sorted) return <p className="placeholder">Cargando posiciones…</p>

  return (
    <div className="pos-layout">
      <div>
        <div className="pos-head">
          <h1>Posiciones <span className="pos-n num">{sorted.length}</span></h1>
          <div className="pos-controls">
            <label>Orden:{' '}
              <select value={orden} onChange={e => setOrden(e.target.value)}>
                {ORDENES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <button className="btn-cierre" disabled title="Fase 3">MODO CIERRE SEMANA</button>
          </div>
        </div>

        <div className="card pos-tabla-wrap">
          <table className="pos-tabla num">
            <thead>
              <tr>
                <th className="tl">ACTIVO</th><th className="tl">BROKER</th><th>ENTRADA</th>
                <th>INVERTIDO</th><th>VALOR</th><th>G/P $</th><th>G/P %</th>
                <th>%/día</th><th>%/sem</th>
                <th>ESTADO</th><th className="tl">CLASE</th><th>APAL</th><th>PESO</th><th>FTE</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr key={p.ticker + p.broker + p.id} onClick={() => setSel(p)}
                    className={sel === p ? 'sel' : ''}>
                  <td className="tl ticker">{p.ticker}</td>
                  <td className="tl broker">{p.broker}</td>
                  <td>{p.entry_date ? p.entry_date.slice(2).split('-').reverse().join('/') : '—'}</td>
                  <td>{fmt$(p.invested)}</td>
                  <td>{fmt$(p.valor)}</td>
                  <td className={pctClass(p.gp)}>{fmt$(p.gp)}</td>
                  <td className={pctClass(p.gpPct)}>{fmtPct(p.gpPct)}</td>
                  <td className={pctClass(p.dia)}>{fmtPct(p.dia)}</td>
                  <td className={pctClass(p.sem)}>{fmtPct(p.sem)}</td>
                  <td><span className={'chip chip-' + p.estado}>{ESTADOS[p.estado]?.label || p.estado}</span></td>
                  <td className="tl clase">{CLASES[p.clase] || p.clase}</td>
                  <td>{p.apalancamiento > 1 ? 'x' + p.apalancamiento : ''}</td>
                  <td>{p.peso == null ? '—' : p.peso.toFixed(1) + '%'}</td>
                  <td className="fuente">{p.fuente === 'YO' ? '' : (p.fuente || '').slice(0, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pos-fuente">Datos: {fuente} · %/día llegará con el módulo de precios · %/semana = cierre vs cierre anterior (estática)</p>
      </div>

      {sel && (
        <aside className="pos-panel card">
          <div className="pos-panel-head">
            <h2>{sel.ticker} <span className="broker">{sel.broker}</span></h2>
            <button onClick={() => setSel(null)}>✕</button>
          </div>
          <dl className="num">
            <div><dt>Entrada</dt><dd>{sel.entry_date || '—'}</dd></div>
            <div><dt>Invertido</dt><dd>${fmt$(sel.invested)}</dd></div>
            <div><dt>Valor</dt><dd>${fmt$(sel.valor)}</dd></div>
            <div><dt>G/P</dt><dd className={pctClass(sel.gpPct)}>{fmtPct(sel.gpPct)}</dd></div>
            <div><dt>SL</dt><dd>{sel.sl_price ?? 'sin SL'}</dd></div>
            <div><dt>Clase</dt><dd>{CLASES[sel.clase]}</dd></div>
            <div><dt>Fuente</dt><dd>{sel.fuente}</dd></div>
          </dl>
          <p className="placeholder" style={{ padding: 20 }}>
            Aquí: gráfica con entrada, SL, cierres semanales y cambios de ESTADO; notas fechadas;
            eventos de calendario; trazabilidad de ingesta; ANÁLISIS IA individual.
          </p>
        </aside>
      )}
    </div>
  )
}

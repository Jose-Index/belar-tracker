import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchPosiciones, updatePosicion, altaPosicion, cerrarPosicion,
  guardarLiquidez, cerrarSemana, fetchNotas, addNota,
} from '../lib/posiciones-db'
import './posiciones.css'

// ─── Constantes de la spec ───────────────────────────────────────────────
export const ESTADOS = {
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
const FUENTES = ['YO', 'BELAR', 'PRENSA', 'REDES']
const BROKERS = ['etoro', 'xtb', 'ibkr']
const ORDENES = [
  { id: 'broker', label: 'Broker A-Z' }, { id: 'entrada', label: 'Entrada' },
  { id: 'clase', label: 'Clase' }, { id: 'estado', label: 'Estado' },
  { id: 'sem', label: '%/semana' }, { id: 'dia', label: '%/día' },
  { id: 'peso', label: 'Peso' }, { id: 'gp', label: 'G/P %' },
]

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''

export default function Posiciones() {
  const [raw, setRaw] = useState(null)          // {positions, snapshots, liquidez, lastClose}
  const [orden, setOrden] = useState(() => localStorage.getItem('btp-orden') || 'broker')
  const [selId, setSelId] = useState(null)
  const [cierre, setCierre] = useState(false)   // MODO CIERRE SEMANA
  const [draft, setDraft] = useState({})        // {id: {invested?, current_value?}} en modo cierre
  const [liqDraft, setLiqDraft] = useState(null)
  const [liqTocada, setLiqTocada] = useState(false)
  const [alta, setAlta] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const tablaRef = useRef(null)

  useEffect(() => { localStorage.setItem('btp-orden', orden) }, [orden])

  async function recargar() {
    const data = await fetchPosiciones()
    if (!data.positions.length && import.meta.env.DEV) {
      try {
        const fx = { positions: [], snapshots: [] }
        data.positions = fx.positions.map((p, i) => ({ ...p, id: p.id ?? i }))
        data.snapshots = fx.snapshots
      } catch { /* sin fixture */ }
    }
    setRaw(data)
  }
  useEffect(() => { recargar() }, [])

  // ── Cálculo de derivados ──
  const rows = useMemo(() => {
    if (!raw) return null
    const { positions, snapshots } = raw
    const weeks = [...new Set(snapshots.map(s => s.week_end))].sort().reverse()
    const [w0, w1] = weeks
    const snap = (t, b, w) => snapshots.find(s => s.ticker === t && s.broker === b && s.week_end === w)?.value
    const total = positions.reduce((a, p) => a + Number(p.current_value ?? p.invested), 0)
    return positions.map(p => {
      const val = Number(p.current_value ?? p.invested)
      const inv = Number(p.invested)
      const v0 = snap(p.ticker, p.broker, w0), v1 = snap(p.ticker, p.broker, w1)
      return {
        ...p, valor: val,
        gp: val - inv,
        gpPct: inv ? (val - inv) / inv * 100 : null,
        dia: null,
        sem: (v0 != null && v1 != null && Number(v1) !== 0) ? (v0 - v1) / v1 * 100 : null,
        peso: total ? val / total * 100 : null,
      }
    })
  }, [raw])

  const sorted = useMemo(() => {
    if (!rows) return null
    const by = {
      broker: (a, b) => a.broker.localeCompare(b.broker) || a.ticker.localeCompare(b.ticker),
      entrada: (a, b) => (b.entry_date || '').localeCompare(a.entry_date || ''),
      clase: (a, b) => (a.clase || '').localeCompare(b.clase || ''),
      estado: (a, b) => (ESTADOS[a.estado]?.urg ?? 9) - (ESTADOS[b.estado]?.urg ?? 9),
      sem: (a, b) => (b.sem ?? -999) - (a.sem ?? -999),
      dia: (a, b) => (b.dia ?? -999) - (a.dia ?? -999),
      peso: (a, b) => (b.peso ?? 0) - (a.peso ?? 0),
      gp: (a, b) => (b.gpPct ?? -999) - (a.gpPct ?? -999),
    }
    return [...rows].sort(by[orden] || by.broker)
  }, [rows, orden])

  const sel = sorted?.find(p => p.id === selId) || null

  // ── Modo cierre: entrada/salida/commit ──
  function entrarCierre() {
    setCierre(true); setDraft({}); setLiqDraft({ ...raw.liquidez }); setLiqTocada(false); setMsg(null)
  }
  function salirSinCerrar() {
    setCierre(false); setDraft({}); setLiqDraft(null)
  }

  // Edición fluida: Enter/Tab salta a la misma columna de la fila siguiente
  function keyNav(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const inputs = [...tablaRef.current.querySelectorAll(`input[data-col="${e.target.dataset.col}"]`)]
    const i = inputs.indexOf(e.target)
    if (i > -1 && i < inputs.length - 1) { inputs[i + 1].focus(); inputs[i + 1].select() }
  }

  async function commitCierre() {
    const cambiosInv = Object.entries(draft).filter(([, d]) => d.invested != null)
    if (!liqTocada && !window.confirm('¿Seguro? No se ha editado la liquidez.')) return
    if (cambiosInv.length && !window.confirm(
      `Vas a modificar INVERTIDO en ${cambiosInv.length} posición(es). ¿Confirmas?`)) return

    setBusy(true)
    // 1. aplicar borradores
    for (const [id, d] of Object.entries(draft)) {
      const patch = {}
      if (d.invested != null) patch.invested = d.invested
      if (d.current_value != null) patch.current_value = d.current_value
      if (Object.keys(patch).length) await updatePosicion(Number(id), patch)
    }
    await guardarLiquidez(liqDraft)
    // 2. recargar y commit
    const fresh = await fetchPosiciones()
    const res = await cerrarSemana(fresh.positions, liqDraft)
    setBusy(false)
    if (res.error) { setMsg('Error al cerrar semana: ' + res.error.message); return }
    setCierre(false); setDraft({}); setLiqDraft(null)
    setMsg(`Semana cerrada · ${res.week_end}`)
    recargar()
  }

  async function borrarEnCierre(p) {
    const motivo = window.prompt(`Cerrar ${p.ticker} (${p.broker}). Motivo: xSL / manual / escalonada`, 'xSL')
    if (!motivo) return
    setBusy(true)
    await cerrarPosicion(p, ['xSL', 'manual', 'escalonada'].includes(motivo) ? motivo : 'xSL')
    setBusy(false); setSelId(null); recargar()
  }

  async function cerrarManual(p) {
    if (!window.confirm(`¿Cerrar ${p.ticker} (${p.broker})? Se registrará en el histórico (motivo: manual).`)) return
    setBusy(true)
    await cerrarPosicion(p, 'manual')
    setBusy(false); setSelId(null); recargar()
  }

  if (!sorted) return <p className="placeholder">Cargando posiciones…</p>

  const totalPos = rows.reduce((a, p) => a + p.valor, 0)
  const liq = cierre ? liqDraft : raw.liquidez
  const totalLiq = Object.values(liq || {}).reduce((a, v) => a + (Number(v) || 0), 0)

  return (
    <div className="pos-layout">
      <div>
        <div className="pos-head">
          <h1>Posiciones <span className="pos-n num">{sorted.length}</span></h1>
          <div className="pos-controls">
            {raw.lastClose && <span className="sello num">Último cierre: {raw.lastClose.date?.split('-').reverse().join('/')}</span>}
            <label>Orden:{' '}
              <select value={orden} onChange={e => setOrden(e.target.value)} disabled={cierre}>
                {ORDENES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <button className="btn-sec" onClick={() => setAlta(true)}>+ Posición</button>
            {!cierre
              ? <button className="btn-cierre" onClick={entrarCierre}>MODO CIERRE SEMANA</button>
              : <button className="btn-cierre on" onClick={commitCierre} disabled={busy}>
                  {busy ? 'CERRANDO…' : 'CERRAR SEMANA'}
                </button>}
            {cierre && <button className="btn-escape" onClick={salirSinCerrar}>salir sin cerrar</button>}
          </div>
        </div>

        {msg && <p className="pos-msg num">{msg}</p>}

        {cierre && (
          <div className="card liq-bar num">
            <b>Liquidez</b>
            {BROKERS.map(b => (
              <label key={b}>{b}
                <input data-col="liq" value={liqDraft[b] ?? ''} onKeyDown={keyNav}
                  onChange={e => { setLiqDraft({ ...liqDraft, [b]: e.target.value === '' ? '' : Number(e.target.value) }); setLiqTocada(true) }} />
              </label>
            ))}
            <span className="liq-total">Total cuenta: ${fmt$(totalPos + totalLiq)}</span>
          </div>
        )}

        <div className="card pos-tabla-wrap" ref={tablaRef}>
          <table className={'pos-tabla num' + (cierre ? ' modo-cierre' : '')}>
            <thead>
              <tr>
                <th className="tl">ACTIVO</th><th className="tl">BROKER</th><th>ENTRADA</th>
                <th>INVERTIDO</th><th>VALOR</th><th>G/P $</th><th>G/P %</th>
                <th>%/día</th><th>%/sem</th>
                <th>ESTADO</th><th className="tl">CLASE</th><th>APAL</th><th>PESO</th><th>FTE</th>
                {cierre && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr key={p.id} onClick={() => !cierre && setSelId(p.id)}
                    className={selId === p.id && !cierre ? 'sel' : ''}>
                  <td className="tl ticker">
                    {p.ticker}
                    {p.ingest_badge === 'NEW' && <span className="badge new">NEW</span>}
                    {p.ingest_badge === 'UPD' && <span className="badge upd">·</span>}
                  </td>
                  <td className="tl broker">{p.broker}</td>
                  <td>{p.entry_date ? p.entry_date.slice(2).split('-').reverse().join('/') : '—'}</td>
                  <td>{cierre
                    ? <input data-col="inv" defaultValue={p.invested} onKeyDown={keyNav}
                        onChange={e => setDraft(d => ({ ...d, [p.id]: { ...d[p.id], invested: Number(e.target.value) } }))} />
                    : fmt$(p.invested)}</td>
                  <td>{cierre
                    ? <input data-col="val" defaultValue={p.valor} onKeyDown={keyNav}
                        onChange={e => setDraft(d => ({ ...d, [p.id]: { ...d[p.id], current_value: Number(e.target.value) } }))} />
                    : fmt$(p.valor)}</td>
                  <td className={pctClass(p.gp)}>{fmt$(p.gp)}</td>
                  <td className={pctClass(p.gpPct)}>{fmtPct(p.gpPct)}</td>
                  <td className={pctClass(p.dia)}>{fmtPct(p.dia)}</td>
                  <td className={pctClass(p.sem)}>{fmtPct(p.sem)}</td>
                  <td><span className={'chip chip-' + p.estado}>{ESTADOS[p.estado]?.label || p.estado}</span></td>
                  <td className="tl clase">{CLASES[p.clase] || p.clase}</td>
                  <td>{p.apalancamiento > 1 ? 'x' + Number(p.apalancamiento) : ''}</td>
                  <td>{p.peso == null ? '—' : p.peso.toFixed(1) + '%'}</td>
                  <td className="fuente">{p.fuente === 'YO' ? '' : (p.fuente || '').slice(0, 1)}</td>
                  {cierre && <td><button className="btn-borrar" title="Cerrar posición"
                    onClick={e => { e.stopPropagation(); borrarEnCierre(p) }}>✕</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pos-fuente">
          {cierre
            ? 'Modo cierre: edita VALOR/INVERTIDO (Enter salta a la siguiente fila), ✕ cierra posición, y CERRAR SEMANA sella todo.'
            : '%/día llegará con el módulo de precios · %/semana = cierre vs cierre anterior'}
        </p>
      </div>

      {sel && !cierre && (
        <PanelDetalle p={sel} onClose={() => setSelId(null)} onChange={recargar} onCerrar={() => cerrarManual(sel)} />
      )}
      {alta && <AltaDialog onClose={() => setAlta(false)} onDone={() => { setAlta(false); recargar() }} />}
    </div>
  )
}

// ─── Panel de detalle: atributos editables + notas fechadas ─────────────
function PanelDetalle({ p, onClose, onChange, onCerrar }) {
  const [notas, setNotas] = useState([])
  const [nueva, setNueva] = useState('')

  useEffect(() => { fetchNotas(p.id).then(({ data }) => setNotas(data || [])) }, [p.id])

  async function setAttr(campo, valor) {
    await updatePosicion(p.id, { [campo]: valor })
    onChange()
  }
  async function guardarNota(e) {
    e.preventDefault()
    if (!nueva.trim()) return
    await addNota(p.id, nueva.trim())
    setNueva('')
    fetchNotas(p.id).then(({ data }) => setNotas(data || []))
  }

  return (
    <aside className="pos-panel card">
      <div className="pos-panel-head">
        <h2>{p.ticker} <span className="broker">{p.broker}</span></h2>
        <button onClick={onClose}>✕</button>
      </div>
      <dl className="num">
        <div><dt>Entrada</dt><dd>{p.entry_date || '—'} · ${fmt$(p.invested)}</dd></div>
        <div><dt>Valor</dt><dd>${fmt$(p.valor)} <span className={pctClass(p.gpPct)}>({fmtPct(p.gpPct)})</span></dd></div>
        <div><dt>SL</dt><dd>{p.sl_price ?? 'sin SL'}</dd></div>
        {p.ingest_source && <div><dt>Origen</dt><dd>{p.ingest_source}</dd></div>}
      </dl>
      <div className="attr-selects">
        <label>Estado
          <select value={p.estado} onChange={e => setAttr('estado', e.target.value)}>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label>Clase
          <select value={p.clase} onChange={e => setAttr('clase', e.target.value)}>
            {Object.entries(CLASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Fuente
          <select value={p.fuente} onChange={e => setAttr('fuente', e.target.value)}>
            {FUENTES.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>
      </div>

      <h3>Notas</h3>
      <form onSubmit={guardarNota} className="nota-form">
        <input placeholder="Nueva nota…" value={nueva} onChange={e => setNueva(e.target.value)} />
        <button>+</button>
      </form>
      <ul className="notas">
        {notas.map(n => (
          <li key={n.id}>
            <span className="num nota-fecha">{n.created_at.slice(2, 10).split('-').reverse().join('/')}</span>
            {n.texto}
          </li>
        ))}
        {!notas.length && <li className="sin-notas">Sin notas.</li>}
      </ul>

      <button className="btn-cerrar-pos" onClick={onCerrar}>Cerrar posición…</button>
      <p className="placeholder" style={{ padding: 14, marginTop: 12 }}>
        Próximamente: gráfica con SL y cierres semanales · eventos · ANÁLISIS IA
      </p>
    </aside>
  )
}

// ─── Alta de posición (permitida siempre, modo OFF incluido) ────────────
function AltaDialog({ onClose, onDone }) {
  const [f, setF] = useState({
    ticker: '', broker: 'etoro', entry_date: new Date().toISOString().slice(0, 10),
    invested: '', current_value: '', clase: 'TACTICA', estado: 'OK', fuente: 'YO',
    apalancamiento: 1, sl_price: '',
  })
  const [err, setErr] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  async function guardar(e) {
    e.preventDefault()
    const inv = Number(f.invested)
    if (!f.ticker.trim() || !inv) { setErr('Ticker e invertido son obligatorios.'); return }
    const { error } = await altaPosicion({
      ticker: f.ticker.trim().toUpperCase(), broker: f.broker, entry_date: f.entry_date,
      invested: inv, current_value: Number(f.current_value) || inv,
      clase: f.clase, estado: f.estado, fuente: f.fuente,
      apalancamiento: Number(f.apalancamiento) || 1,
      sl_price: f.sl_price === '' ? null : Number(f.sl_price),
    })
    if (error) setErr(error.message); else onDone()
  }

  return (
    <div className="modal-fondo" onClick={onClose}>
      <form className="card modal alta num" onClick={e => e.stopPropagation()} onSubmit={guardar}>
        <h2>Nueva posición</h2>
        <div className="alta-grid">
          <label>Ticker<input autoFocus value={f.ticker} onChange={e => set('ticker', e.target.value)} /></label>
          <label>Broker<select value={f.broker} onChange={e => set('broker', e.target.value)}>
            {BROKERS.map(b => <option key={b}>{b}</option>)}</select></label>
          <label>Fecha<input type="date" value={f.entry_date} onChange={e => set('entry_date', e.target.value)} /></label>
          <label>Invertido $<input value={f.invested} onChange={e => set('invested', e.target.value)} /></label>
          <label>Valor $<input placeholder="= invertido" value={f.current_value} onChange={e => set('current_value', e.target.value)} /></label>
          <label>SL<input placeholder="opcional" value={f.sl_price} onChange={e => set('sl_price', e.target.value)} /></label>
          <label>Clase<select value={f.clase} onChange={e => set('clase', e.target.value)}>
            {Object.entries(CLASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Fuente<select value={f.fuente} onChange={e => set('fuente', e.target.value)}>
            {FUENTES.map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Apal.<input value={f.apalancamiento} onChange={e => set('apalancamiento', e.target.value)} /></label>
        </div>
        {err && <p className="auth-err">{err}</p>}
        <div className="modal-botones">
          <button type="button" className="btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn-primario">Añadir</button>
        </div>
      </form>
    </div>
  )
}

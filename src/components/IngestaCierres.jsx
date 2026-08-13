// Registro de cierres por captura (13/08/2026, mejora 5 de la spec).
// Capturas de las pantallas de POSICIONES CERRADAS / historial del broker →
// extractor (modo cerradas) → revisión → sellado en position_history con los
// datos REALES de salida. Si el cierre casa con una posición aún abierta en BTP,
// además la cierra (borra) usando esos datos reales. NUNCA auto-commit.
import { useState } from 'react'
import { extraerCierres } from '../lib/ia'
import { registrarCierre } from '../lib/posiciones-db'
import { resolverSimbolo, variantes } from '../lib/quotes'
import './ingesta.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const MOTIVOS = ['xSL', 'manual', 'escalonada']
const BROKERS_UI = [{ id: 'etoro', label: 'eToro' }, { id: 'xtb', label: 'XTB' }, { id: 'ibkr', label: 'IBKR' }]
const HOY = () => new Date().toISOString().slice(0, 10)

export default function IngestaCierres({ positions = [], simbolos = [], onDone }) {
  const [estado, setEstado] = useState('idle')  // idle | procesando | revision | error
  const [err, setErr] = useState(null)
  const [filas, setFilas] = useState([])
  const [crudo, setCrudo] = useState(null)
  const [brokerSel, setBrokerSel] = useState('')
  const [busy, setBusy] = useState(false)

  function construir(extracciones, override) {
    const out = []
    for (const ex of extracciones) {
      const broker = override || ex.broker
      for (const c of ex.cierres || []) {
        const textos = [c.ticker, c.nombre].filter(Boolean)
        const canon = resolverSimbolo(textos, simbolos)
        const t = (canon || c.ticker || c.nombre || '?').toUpperCase()
        const vars = new Set(textos.flatMap(variantes))
        const pos = positions.find(p => p.broker === broker && p.ticker.toUpperCase() === t)
          || positions.find(p => p.broker === broker && vars.has(p.ticker.toUpperCase()))
        const invertido = c.invertido ?? (c.valor_cierre != null && c.gp != null ? c.valor_cierre - c.gp : null)
        const valorCierre = c.valor_cierre ?? (c.invertido != null && c.gp != null ? c.invertido + c.gp : null)
        out.push({
          sel: true, ticker: pos ? pos.ticker : t, broker,
          invertido, valorCierre,
          fecha_cierre: c.fecha_cierre || '',
          entry_date: c.fecha_apertura || pos?.entry_date || null,
          apalancamiento: c.apalancamiento || pos?.apalancamiento || 1,
          motivo: 'manual', pos: pos || null,
          dudosa: c.gp != null && invertido != null && valorCierre != null &&
            Math.abs(invertido + c.gp - valorCierre) > 0.05,
        })
      }
    }
    return out
  }

  async function procesar(files) {
    if (!files?.length) return
    setEstado('procesando'); setErr(null)
    try {
      const ex = await extraerCierres(files)
      setCrudo(ex); setBrokerSel('')
      setFilas(construir(ex, ''))
      setEstado('revision')
    } catch (e) { setErr(String(e.message || e)); setEstado('error') }
  }

  async function aplicar() {
    const sel = filas.filter(f => f.sel)
    if (!sel.length) return
    const sinDatos = sel.filter(f => f.invertido == null || f.valorCierre == null || !f.fecha_cierre)
    if (sinDatos.length) {
      setErr(`Faltan datos (importes o fecha) en: ${sinDatos.map(f => f.ticker).join(', ')}. Complétalos o desmárcalos.`)
      return
    }
    if (!window.confirm(
      `Se van a REGISTRAR ${sel.length} cierre(s) en el histórico` +
      (sel.some(f => f.pos) ? ` y se cerrarán ${sel.filter(f => f.pos).length} posición(es) abiertas en BTP` : '') +
      ':\n\n' + sel.map(f => `· ${f.ticker} (${f.broker}) — ${f.fecha_cierre} — motivo ${f.motivo}${f.pos ? ' — cierra abierta' : ''}`).join('\n') +
      '\n\n¿Confirmas?')) return
    setBusy(true); setErr(null)
    let n = 0
    for (const f of sel) {
      const r = await registrarCierre({
        ticker: f.ticker, broker: f.broker,
        entry_date: f.entry_date, closed_date: f.fecha_cierre,
        invested: f.invertido, closed_value: f.valorCierre,
        motivo: f.motivo, apalancamiento: f.apalancamiento,
        clase: f.pos?.clase, fuente: f.pos?.fuente,
        posId: f.pos?.id,
      })
      if (r.error) { setErr(`${f.ticker}: ${r.error.message}`); break }
      n++
    }
    setBusy(false)
    if (n) { setEstado('idle'); setFilas([]); onDone?.(n) }
  }

  const setCampo = (i, campo, val) => setFilas(fs => fs.map((x, j) => j === i ? { ...x, [campo]: val } : x))

  if (estado === 'idle' || estado === 'error') {
    return (
      <div className="ingesta card">
        <label className="dropzone"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); procesar(e.dataTransfer.files) }}>
          <input type="file" accept="image/*" multiple hidden
                 onChange={e => procesar(e.target.files)} />
          <b>Arrastra aquí las capturas de posiciones CERRADAS del broker</b>
          <span>(historial / cerradas de eToro, XTB o IBKR) · se registran con su fecha e importe reales de salida</span>
          {err && <span className="auth-err">{err}</span>}
        </label>
      </div>
    )
  }

  if (estado === 'procesando') {
    return <div className="ingesta card procesando">Leyendo capturas de cierres con IA…</div>
  }

  return (
    <div className="ingesta card num">
      <div className="diff-head">
        <b>Revisión de cierres ({filas.length})</b>
        <label className="diff-pick" title="Si la IA se ha equivocado de broker, corrígelo aquí.">
          capturas de
          <select className="diff-sel" value={brokerSel}
            onChange={e => { setBrokerSel(e.target.value); setFilas(construir(crudo, e.target.value)) }}>
            <option value="">detectado: {[...new Set((crudo || []).map(x => x.broker))].join(' + ') || '—'}</option>
            {BROKERS_UI.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <button className="btn-escape" onClick={() => { setEstado('idle'); setErr(null) }}>descartar</button>
      </div>

      {filas.map((f, i) => (
        <div key={i} className="diff-row">
          <label className="diff-pick">
            <input type="checkbox" checked={f.sel} onChange={() => setCampo(i, 'sel', !f.sel)} />
            <span className="t">{f.ticker} <i>{f.broker}</i></span>
          </label>
          <span>invertido {fmt$(f.invertido)} → salida <b>{fmt$(f.valorCierre)}</b>
            {f.invertido != null && f.valorCierre != null &&
              <span className={f.valorCierre >= f.invertido ? ' up' : ' down'}>
                {' '}({((f.valorCierre - f.invertido) / f.invertido * 100).toFixed(2)}%)</span>}
          </span>
          <label className={'diff-pick' + (f.sel && !f.fecha_cierre ? ' falta' : '')} title="Fecha real de cierre">
            cerrada
            <input type="date" className="diff-sel" max={HOY()} value={f.fecha_cierre}
              onChange={e => setCampo(i, 'fecha_cierre', e.target.value)} />
          </label>
          <select className="diff-sel" value={f.motivo} title="Motivo del cierre (viaja al histórico)"
            onChange={e => setCampo(i, 'motivo', e.target.value)}>
            {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {f.pos
            ? <span className="warn" title="Este cierre casa con una posición aún abierta en BTP: al aplicar, se cierra con estos datos reales">cierra abierta</span>
            : <span title="No hay posición abierta con este ticker en BTP: solo se registra en el histórico">solo histórico</span>}
          {f.dudosa && <span className="down" title="invertido + G/P no cuadra con la salida: revisa los importes en la captura">⚠ revisar</span>}
        </div>
      ))}

      {err && <p className="auth-err">{err}</p>}
      <p className="diff-nota">Al aplicar se escribe DIRECTO en el histórico (y se cierran las abiertas que casen),
        con confirmación previa. El cierre de semana no se toca.</p>
      <div className="modal-botones">
        <button className="btn-primario" disabled={busy} onClick={aplicar}>
          {busy ? 'Registrando…' : 'Registrar cierres'}
        </button>
      </div>
    </div>
  )
}

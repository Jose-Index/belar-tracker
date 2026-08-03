import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchPosiciones, updatePosicion, altaPosicion, cerrarPosicion,
  guardarLiquidez, guardarBtcWallet, cerrarSemana, fetchNotas, addNota, borrarNotaDB, fetchSeriePosicion,
} from '../lib/posiciones-db'
import { exportBackup } from '../lib/backup'
import { AreaChart, Area, YAxis, XAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { getSimbolos, yahooDe, fetchQuotes, pctDia, frescura } from '../lib/quotes'
import { asegurarCalendario, eventosProximos, estadoCalendario, analizarPosicion, guardarVeredicto } from '../lib/ia'
import IngestaIA from '../components/IngestaIA.jsx'
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
  NUCLEO: 'NÚCLEO', MOMENTUM: 'MOMENTUM', TACTICA: 'TÁCTICA', DISRUPTIVA: 'DISRUPT.',
}
const CLASE_AYUDA = {
  NUCLEO: 'NÚCLEO — la base de la cartera: tesis de largo plazo y posiciones defensivas. Revisión semestral, SL amplio (−10/−20%) o sin SL: solo sale por invalidación estructural, nunca por ruido.',
  MOMENTUM: 'MOMENTUM — crecimiento sostenido (beta >1.3, volatilidad >3%, breakout con volumen). Trailing SL activo (−7/−10%, mínimo 2×ATR).',
  TACTICA: 'TÁCTICA — oportunidad de corto/medio plazo. SL técnico activo (−5/−8%, mínimo 2×ATR) sobre soporte claro.',
  DISRUPTIVA: 'DISRUPTIVA — smallcap especulativa. Sizing pequeño, SL muy amplio o sin SL: la invalidación es la tesis, no el precio.',
}
const FUENTES = ['YO', 'BELAR', 'PRENSA', 'REDES']
const BROKERS = ['etoro', 'xtb', 'ibkr']
const ORDEN_BROKER = { etoro: 0, xtb: 1, ibkr: 2 }   // orden de la casa, no alfabético
const ORDENES = [
  { id: 'broker', label: 'Broker' }, { id: 'entrada', label: 'Entrada' },
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
  const [desc, setDesc] = useState(() => localStorage.getItem('btp-orden-desc') === '1')
  const [selId, setSelId] = useState(null)
  const [cierre, setCierre] = useState(false)   // MODO CIERRE SEMANA
  const [draft, setDraft] = useState({})        // {id: {invested?, current_value?}} en modo cierre
  const [liqDraft, setLiqDraft] = useState(null)
  const [liqTocada, setLiqTocada] = useState(false)
  const [btcDraft, setBtcDraft] = useState(null)
  const [alta, setAlta] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [quotes, setQuotes] = useState({})     // yahoo_symbol -> quote
  const [simbolos, setSimbolos] = useState([])
  const [eventos, setEventos] = useState([])
  const [calAt, setCalAt] = useState(null)
  const [analizando, setAnalizando] = useState(null)  // texto de progreso
  const tablaRef = useRef(null)

  useEffect(() => { localStorage.setItem('btp-orden', orden) }, [orden])
  useEffect(() => { localStorage.setItem('btp-orden-desc', desc ? '1' : '0') }, [desc])

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
    // %/día: precios de los activos vía Yahoo (bajo demanda, con frescura)
    const sims = await getSimbolos()
    setSimbolos(sims)
    const ys = data.positions.map(p => yahooDe(p.ticker, sims)).filter(Boolean)
    setQuotes(await fetchQuotes(ys))
    setEventos(await eventosProximos())
    estadoCalendario().then(setCalAt)
  }
  useEffect(() => { recargar() }, [])

  // Calendario automático: si BTP está abierto y han pasado >24h, se refresca solo (silencioso)
  useEffect(() => {
    if (!raw?.positions?.length) return
    let vivo = true
    async function tick() {
      const r = await asegurarCalendario(raw.positions.map(p => p.ticker))
      if (!vivo) return
      if (!r.fresco && !r.error) { setEventos(await eventosProximos()); setCalAt(r.at) }
    }
    tick()
    const id = setInterval(tick, 3600 * 1000)
    return () => { vivo = false; clearInterval(id) }
  }, [raw?.positions?.length])

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
      const q = quotes[yahooDe(p.ticker, simbolos)]
      const evs = eventos.filter(e => e.ticker === p.ticker)
      const evEarn = evs.find(e => e.event_type === 'earnings')
      const diasEarn = evEarn ? Math.ceil((new Date(evEarn.event_date) - Date.now()) / 86400000) : null
      return {
        evs, evUrgente: diasEarn != null && diasEarn <= 3,
        // Punto sólido solo si TODOS los eventos están confirmados; hueco si hay estimados
        evConfirmado: evs.length > 0 && evs.every(e => e.confirmacion !== 'estimado'),
        ...p, valor: val,
        gp: val - inv,
        gpPct: inv ? (val - inv) / inv * 100 : null,
        dia: pctDia(q),
        diaFresco: q ? frescura(q) : null,
        sem: (v0 != null && v1 != null && Number(v1) !== 0) ? (v0 - v1) / v1 * 100 : null,
        peso: total ? val / total * 100 : null,
      }
    })
  }, [raw, quotes, simbolos, eventos])

  const sorted = useMemo(() => {
    if (!rows) return null
    // Orden natural de cada criterio (asc = el que tiene sentido leer primero).
    // Broker: eToro → XTB → IBKR, no alfabético (decisión José).
    const by = {
      broker: (a, b) => (ORDEN_BROKER[a.broker] ?? 9) - (ORDEN_BROKER[b.broker] ?? 9) || a.ticker.localeCompare(b.ticker),
      entrada: (a, b) => (b.entry_date || '').localeCompare(a.entry_date || ''),
      clase: (a, b) => (a.clase || '').localeCompare(b.clase || ''),
      estado: (a, b) => (ESTADOS[a.estado]?.urg ?? 9) - (ESTADOS[b.estado]?.urg ?? 9),
      sem: (a, b) => (b.sem ?? -999) - (a.sem ?? -999),
      dia: (a, b) => (b.dia ?? -999) - (a.dia ?? -999),
      peso: (a, b) => (b.peso ?? 0) - (a.peso ?? 0),
      gp: (a, b) => (b.gpPct ?? -999) - (a.gpPct ?? -999),
    }
    const cmp = by[orden] || by.broker
    return [...rows].sort(desc ? (a, b) => -cmp(a, b) : cmp)
  }, [rows, orden, desc])

  const sel = sorted?.find(p => p.id === selId) || null

  // ── Modo cierre: entrada/salida/commit ──
  function entrarCierre() {
    setCierre(true); setDraft({}); setLiqDraft({ ...raw.liquidez }); setLiqTocada(false)
    setBtcDraft(raw.btcQty); setMsg(null)
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
    await guardarBtcWallet(Number(btcDraft) || 0)
    // 2. recargar y commit
    const fresh = await fetchPosiciones()
    const res = await cerrarSemana(fresh.positions, liqDraft, Number(btcDraft) || 0)
    setBusy(false)
    if (res.error) { setMsg('Error al cerrar semana: ' + res.error.message); return }
    setCierre(false); setDraft({}); setLiqDraft(null)
    // Backup automático versionado, SOLO tras commit exitoso (regla aprobada con "OJO")
    let bk = ''
    try { const n = await exportBackup('btp-backup-cierre'); bk = ` · backup descargado (${n} filas)` } catch { bk = ' · ⚠ backup automático falló' }
    setMsg(`Semana cerrada · ${res.week_end}${bk}`)
    recargar()
  }

  async function borrarEnCierre(p) {
    const motivo = window.prompt(`Cerrar ${p.ticker} (${p.broker}). Motivo: xSL / manual / escalonada`, 'xSL')
    if (!motivo) return
    setBusy(true)
    await cerrarPosicion(p, ['xSL', 'manual', 'escalonada'].includes(motivo) ? motivo : 'xSL')
    setBusy(false); setSelId(null); recargar()
  }

  // Aplicar lo aceptado en la revisión de capturas: valores a borrador (los sella
  // CERRAR SEMANA), cierres y altas al momento, badges de trazabilidad.
  async function aplicarDiff(d) {
    setBusy(true)
    const stamp = new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    const nuevoDraft = { ...draft }
    for (const u of d.updates) {
      if (!u.sel) continue
      nuevoDraft[u.pos.id] = {
        ...nuevoDraft[u.pos.id],
        ...(u.valor != null ? { current_value: u.valor } : {}),
        ...(u.invertido != null && Math.abs(u.invertido - u.pos.invested) > 0.01 ? { invested: u.invertido } : {}),
      }
      await updatePosicion(u.pos.id, { ingest_badge: 'UPD', ingest_source: `captura ${u.pos.broker} ${stamp}` })
    }
    setDraft(nuevoDraft)
    for (const f of d.faltantes) if (f.sel) await cerrarPosicion(f.pos, 'xSL')
    for (const n of d.nuevas) {
      if (!n.sel) continue
      const inv = n.invertido ?? n.valor
      if (!inv) continue
      await altaPosicion({
        ticker: (n.ticker || n.nombre || '?').toUpperCase(), broker: n.broker,
        entry_date: new Date().toISOString().slice(0, 10),
        invested: inv, current_value: n.valor ?? inv,
        apalancamiento: n.apalancamiento || 1,
        ingest_badge: 'NEW', ingest_source: `captura ${n.broker} ${stamp}`,
      })
    }
    if (Object.keys(d.liq).length) { setLiqDraft(l => ({ ...l, ...d.liq })); setLiqTocada(true) }
    setBusy(false)
    setMsg('Capturas aplicadas al borrador — revisa y pulsa CERRAR SEMANA para sellar.')
    recargar()
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
          <h1>Posiciones <span className="pos-n num">{sorted.length}</span>
            <a href="/sandbox" style={{ fontSize: 11.5, fontWeight: 500, marginLeft: 10, color: 'var(--texto-neutro)', textDecoration: 'none' }}>sandbox ↗</a></h1>
          <div className="pos-controls">
            {calAt && <span className="sello num" title="Actualización automática cada 24h con BTP abierto">
              Calendario · hace {Math.max(0, Math.round((Date.now() - new Date(calAt)) / 3600000))}h</span>}
            {raw.lastClose && <span className="sello num">Último cierre: {raw.lastClose.date?.split('-').reverse().join('/')}</span>}
            <label>Orden:{' '}
              <select value={orden} onChange={e => setOrden(e.target.value)} disabled={cierre}>
                {ORDENES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <button className="btn-dir" disabled={cierre} onClick={() => setDesc(!desc)}
                      title={desc ? 'Descendente — clic para ascendente' : 'Ascendente — clic para descendente'}>
                {desc ? '↓' : '↑'}
              </button>
            </label>
            <button className="btn-sec" onClick={() => setAlta(true)}>+ Posición</button>
            {!cierre && (
              <button className="btn-sec" disabled={!!analizando} onClick={async () => {
                if (!window.confirm(`Análisis IA completo de ${sorted.length} posiciones (búsqueda web real, ~2-4 min, coste del orden de 1-3€). ¿Adelante?`)) return
                for (let i = 0; i < sorted.length; i++) {
                  const p = sorted[i]
                  setAnalizando(`Analizando ${p.ticker} (${i + 1}/${sorted.length})…`)
                  try { await guardarVeredicto(p, await analizarPosicion(p)) } catch (e) { console.warn(p.ticker, e) }
                }
                setAnalizando(null); setMsg('Análisis IA completado.'); recargar()
              }}>{analizando || 'ANÁLISIS IA'}</button>
            )}
            {!cierre
              ? <button className="btn-cierre" onClick={entrarCierre}>MODO CIERRE SEMANA</button>
              : <button className="btn-cierre on" onClick={commitCierre} disabled={busy}>
                  {busy ? 'CERRANDO…' : 'CERRAR SEMANA'}
                </button>}
            {cierre && <button className="btn-escape" onClick={salirSinCerrar}>salir sin cerrar</button>}
          </div>
        </div>

        {msg && <p className="pos-msg num">{msg}</p>}

        {cierre && <IngestaIA positions={raw.positions} simbolos={simbolos} onAplicar={aplicarDiff} />}

        {cierre && (
          <div className="card liq-bar num">
            <b>Liquidez</b>
            {BROKERS.map(b => (
              <label key={b}>{b}
                <input data-col="liq" value={liqDraft[b] ?? ''} onKeyDown={keyNav}
                  onChange={e => { setLiqDraft({ ...liqDraft, [b]: e.target.value === '' ? '' : Number(e.target.value) }); setLiqTocada(true) }} />
              </label>
            ))}
            <label title="Monedero BTC personal (cantidad en BTC): se valora a precio de mercado en el cierre">₿ wallet
              <input data-col="liq" value={btcDraft ?? ''} onKeyDown={keyNav}
                onChange={e => setBtcDraft(e.target.value === '' ? '' : Number(e.target.value))} />
            </label>
            <span className="liq-total">Total cuenta: ${fmt$(totalPos + totalLiq)} + ₿</span>
          </div>
        )}

        <div className="card pos-tabla-wrap" ref={tablaRef}>
          <table className={'pos-tabla num' + (cierre ? ' modo-cierre' : '')}>
            <thead>
              <tr>
                <th className="tl" title="Ticker. ● = evento próximo en calendario (rojo si quedan menos de 3 días). NEW/· = alta/actualización por captura IA.">ACTIVO</th>
                <th className="tl">BROKER</th>
                <th title="Fecha de entrada en la posición">ENTRADA</th>
                <th title="Capital invertido (USD)">INVERTIDO</th>
                <th className="col-clave col-ini" title="Valor actual (USD). Fuente única: tus capturas del cierre de semana.">VALOR</th>
                <th className="col-clave" title="Ganancia/pérdida abierta en dólares">G/P $</th>
                <th className="col-clave col-fin" title="Ganancia/pérdida abierta en % sobre invertido">G/P %</th>
                <th title="Variación de HOY del activo (precio vivo Yahoo vs cierre anterior)">%/día</th>
                <th title="Variación desde el último cierre de semana">%/sem</th>
                <th title="Tu valoración de la posición. ⚑ = el análisis IA discrepa (pasa el ratón por la bandera para ver su veredicto).">ESTADO</th>
                <th className="tl" title="Clasificación: NÚCLEO (Ancla/Estructural/Gestión), MOMENTUM, TÁCTICA, DISRUPTIVA">CLASE</th>
                <th title="Apalancamiento (x1 = sin apalancar; máximo de la casa x2)">APAL</th>
                <th title="Peso de la posición sobre el total de posiciones">PESO</th>
                <th title="FUENTE de la idea: en blanco = YO · B = BELAR · P = PRENSA · R = REDES">FTE</th>
                {cierre && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr key={p.id} onClick={() => !cierre && setSelId(p.id)}
                    className={(selId === p.id && !cierre ? 'sel ' : '') + 'fondo-' + p.estado}>
                  <td className="tl ticker">
                    {p.ticker}
                    {p.ingest_badge === 'NEW' && <span className="badge new">NEW</span>}
                    {p.ingest_badge === 'UPD' && <span className="badge upd">·</span>}
                    {p.evs.length > 0 && (
                      <span className={'ev-dot' + (p.evUrgente ? ' urgente' : '') + (p.evConfirmado ? '' : ' estimado')}
                            title={p.evs.map(e => `${e.event_date.slice(2).split('-').reverse().join('/')} · ${e.titulo}`
                              + (e.confirmacion === 'confirmado' ? ' [CONFIRMADO]' : e.confirmacion === 'estimado' ? ' [ESTIMADO — puede desviarse]' : '')
                              + (e.fuente ? ' · ' + e.fuente : '')).join('\n')}>
                        {p.evConfirmado ? '●' : '○'}
                      </span>
                    )}
                  </td>
                  <td className="tl broker">{p.broker}</td>
                  <td>{p.entry_date ? p.entry_date.slice(2).split('-').reverse().join('/') : '—'}</td>
                  <td>{cierre
                    ? <input data-col="inv" defaultValue={p.invested} onKeyDown={keyNav}
                        onChange={e => setDraft(d => ({ ...d, [p.id]: { ...d[p.id], invested: Number(e.target.value) } }))} />
                    : fmt$(p.invested)}</td>
                  <td className="col-clave col-ini">{cierre
                    ? <input data-col="val" defaultValue={p.valor} onKeyDown={keyNav}
                        onChange={e => setDraft(d => ({ ...d, [p.id]: { ...d[p.id], current_value: Number(e.target.value) } }))} />
                    : fmt$(p.valor)}</td>
                  <td className={'col-clave ' + pctClass(p.gp)}>{fmt$(p.gp)}</td>
                  <td className={'col-clave col-fin ' + pctClass(p.gpPct)}>{fmtPct(p.gpPct)}</td>
                  <td className={pctClass(p.dia)} title={p.diaFresco || ''}>{fmtPct(p.dia)}</td>
                  <td className={pctClass(p.sem)}>{fmtPct(p.sem)}</td>
                  <td>
                    <span className={'chip chip-' + p.estado}>{ESTADOS[p.estado]?.label || p.estado}</span>
                    {p.veredicto_ia && p.veredicto_ia !== p.estado &&
                      <span className="discrepancia" title={`Veredicto IA: ${ESTADOS[p.veredicto_ia]?.label || p.veredicto_ia}`}>⚑</span>}
                  </td>
                  <td className="tl clase" title={CLASE_AYUDA[p.clase] || ''}>{CLASES[p.clase] || p.clase}</td>
                  <td>{p.apalancamiento > 1 ? 'x' + Number(p.apalancamiento) : ''}</td>
                  <td>{p.peso == null ? '—' : p.peso.toFixed(1) + '%'}</td>
                  <td className="fuente" title={'Fuente: ' + (p.fuente || 'YO')}>{p.fuente === 'YO' ? '' : (p.fuente || '').slice(0, 1)}</td>
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
            : '%/día = Yahoo Finance con etiqueta de frescura al pasar el ratón · %/semana = cierre vs cierre anterior'}
        </p>
        {!cierre && (
          <div className="pos-leyenda num">
            <span><i className="ev-dot">●</i> evento confirmado · <i className="ev-dot estimado">○</i> fecha estimada, puede desviarse (rojo si faltan &lt;3 días)</span>
            <span><i className="badge new">NEW</i> alta por captura IA</span>
            <span><i className="discrepancia">⚑</i> el análisis IA discrepa de tu ESTADO</span>
            <span><b>FTE</b> fuente de la idea: en blanco YO · B Belar · P prensa · R redes</span>
            <span>fondo <i className="lg-ojo">ámbar OJO</i> · <i className="lg-duda">azul ¿?</i> · <i className="lg-xsalir">rojo xSALIR</i></span>
            <span><b>CLASE</b> el detalle de cada una, al pasar el ratón</span>
          </div>
        )}
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
  const [ia, setIa] = useState(null)        // resultado recién generado
  const [iaBusy, setIaBusy] = useState(false)
  const [serie, setSerie] = useState([])

  useEffect(() => {
    fetchNotas(p.id).then(({ data }) => setNotas(data || [])); setIa(null)
    fetchSeriePosicion(p.ticker, p.broker).then(({ data }) =>
      setSerie((data || []).map(s => ({ fecha: s.week_end, v: Number(s.value) }))))
  }, [p.id])

  async function analizar() {
    setIaBusy(true)
    try {
      const v = await analizarPosicion(p)
      await guardarVeredicto(p, v)
      setIa(v); onChange()
    } catch (e) { setIa({ error: String(e.message || e) }) }
    setIaBusy(false)
  }

  async function setAttr(campo, valor) {
    await updatePosicion(p.id, { [campo]: valor })
    onChange()
  }
  async function borrarNota(n) {
    if (!confirm(`¿Borrar la nota «${n.texto.slice(0, 60)}${n.texto.length > 60 ? '…' : ''}»?`)) return
    await borrarNotaDB(n.id)
    fetchNotas(p.id).then(({ data }) => setNotas(data || []))
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
      {serie.length > 1 && (
        <div className="pos-grafica num">
          <ResponsiveContainer width="100%" height={90}>
            <AreaChart data={serie} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2E6BF6" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#2E6BF6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="fecha" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip labelFormatter={f => f?.slice(2).split('-').reverse().join('/')} isAnimationActive={false}
                       animationDuration={0} wrapperClassName="tip-recharts"
                       formatter={v => ['$' + fmt$(v), 'valor']} />
              {p.sl_price && p.entry_price && p.invested &&
                <ReferenceLine y={Number(p.invested) * (1 + (Number(p.sl_price) / Number(p.entry_price) - 1) * Number(p.apalancamiento || 1))}
                               stroke="#E5484D" strokeDasharray="4 3" />}
              <Area type="monotone" dataKey="v" stroke="#2E6BF6" strokeWidth={1.7} fill="url(#gPos)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="hist-n" style={{ textAlign: 'right' }}>{serie.length} cierres semanales{p.sl_price ? ' · línea roja = valor en SL' : ''}</div>
        </div>
      )}
      <div className="attr-selects">
        <label>Estado
          <select value={p.estado} onChange={e => setAttr('estado', e.target.value)}>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label title={CLASE_AYUDA[p.clase] || ''}>Clase
          <select value={p.clase} onChange={e => setAttr('clase', e.target.value)}>
            {Object.entries(CLASES).map(([k, v]) => <option key={k} value={k} title={CLASE_AYUDA[k]}>{v}</option>)}
          </select>
        </label>
        <label>Fuente
          <select value={p.fuente} onChange={e => setAttr('fuente', e.target.value)}>
            {FUENTES.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>
      </div>

      <div className="ia-bloque">
        <div className="ia-head">
          <h3>Análisis IA</h3>
          <button className="btn-sec" disabled={iaBusy} onClick={analizar}>
            {iaBusy ? 'Analizando…' : p.veredicto_ia ? 'Re-analizar' : 'Analizar'}
          </button>
        </div>
        {ia?.error && <p className="auth-err">{ia.error}</p>}
        {(ia && !ia.error) ? (
          <div className="ia-res">
            <span className={'chip chip-' + ia.veredicto}>{ESTADOS[ia.veredicto]?.label || ia.veredicto}</span>
            <p>{ia.justificacion}</p>
            <p className="ia-meta"><b>Dimensión:</b> {ia.dimension}</p>
            <p className="ia-meta"><b>Invalidación:</b> {ia.invalidacion}</p>
            {ia.alerta && <p className="auth-err">⚑ {ia.alerta} (enviado a Alertas)</p>}
          </div>
        ) : p.veredicto_ia && (
          <p className="ia-meta">
            Último veredicto: <span className={'chip chip-' + p.veredicto_ia}>{ESTADOS[p.veredicto_ia]?.label || p.veredicto_ia}</span>
            {p.veredicto_ia_at && <span className="num"> · {p.veredicto_ia_at.slice(2, 10).split('-').reverse().join('/')}</span>}
          </p>
        )}
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
            <span className="nota-txt">{n.texto}</span>
            <a className="borrar-x nota-x" title="Borrar nota" onClick={() => borrarNota(n)}>✕</a>
          </li>
        ))}
        {!notas.length && <li className="sin-notas">Sin notas.</li>}
      </ul>

      <button className="btn-cerrar-pos" onClick={onCerrar}>Cerrar posición…</button>
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

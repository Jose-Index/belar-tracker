// Gráfica Evolución del Portfolio — componente autónomo (se usa en Inicio y en Histórico).
// Toggles: Desglose (por broker + BTC wallet), Rentabilidad (TWR base 100), $/€.
import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { serieTWR, serieTWRDesglose } from '../lib/twr'

export const BROKER_COLS = { etoro: '#2E6BF6', xtb: '#3BC9F5', ibkr: '#8A93A6', btc: '#17202E' }
export const BROKER_LBL = { etoro: 'eToro', xtb: 'XTB', ibkr: 'IBKR', btc: '₿ wallet' }

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v))
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'

// Geometría del área de trazado: eje Y 46px a la izquierda, margen derecho 8px
const PLOT_L = 46, PLOT_R = 8

export default function Evolucion() {
  const [weeks, setWeeks] = useState(null)
  const [hitos, setHitos] = useState([])
  const [contribs, setContribs] = useState([])
  const [divisa, setDivisa] = useState('$')
  const [neto, setNeto] = useState(false)
  const [desglose, setDesglose] = useState(false)
  const [gestor, setGestor] = useState(false)
  const [hover, setHover] = useState(null)   // hito con el ratón encima

  async function cargar() {
    const [w, h, c] = await Promise.all([
      supabase.from('weekly_snapshots').select('*').order('week_end'),
      supabase.from('hitos').select('*').order('fecha_ini'),
      supabase.from('contributions').select('fecha,broker,importe_eur,importe_usd'),
    ])
    setWeeks(w.data || []); setHitos(h.data || []); setContribs(c.data || [])
  }
  useEffect(() => { cargar() }, [])

  // Serie $ y € honesta (EURUSD de cada momento, arrastrando el último conocido)
  const serie = useMemo(() => {
    if (!weeks) return []
    let fx = null
    return weeks.map(w => {
      if (w.eurusd) fx = Number(w.eurusd)
      const usd = Number(w.total_value)
      return { fecha: w.week_end, usd, eur: fx ? usd / fx : null }
    })
  }, [weeks])

  const km = neto ? 'idx' : divisa === '$' ? 'usd' : 'eur'

  const serieNeta = useMemo(() => {
    if (!weeks || !neto) return []
    return serieTWR(weeks, contribs)
  }, [weeks, contribs, neto])

  const serieActiva = neto ? serieNeta.map(p => ({ fecha: p.fecha, idx: p.idx })) : serie

  const serieDesglose = useMemo(() => {
    if (!weeks || !desglose) return []
    if (neto) return serieTWRDesglose(weeks, contribs)
    return weeks.map(w => {
      const d = w.desglose || w.legacy?.data || {}
      return {
        fecha: w.week_end,
        etoro: d.etoro ?? null, xtb: d.xtb ?? null, ibkr: d.ibkr ?? null,
        btc: d.btc_usd ?? null,
      }
    })
  }, [weeks, desglose, neto, contribs])

  async function guardarHito(h) {
    await supabase.from('hitos').insert(h)
    cargar()
  }

  // Hitos: marca discreta en una capa propia sobre la gráfica (recharts 3 no admite
  // label como función). La etiqueta solo aparece al pasar el ratón por encima.
  const fechasEje = (desglose ? serieDesglose : serieActiva).map(p => p.fecha)
  const marcas = hitos.map(h => {
    const n = fechasEje.length - 1
    if (n < 1) return null
    let i = fechasEje.findIndex(f => f >= h.fecha_ini)
    if (i < 0) i = n
    let j = -1
    if (h.fecha_fin) {
      j = fechasEje.findIndex(f => f >= h.fecha_fin)
      if (j < 0) j = n
    }
    return {
      id: h.id, frac: i / n, fracFin: j >= 0 ? j / n : null,
      etq: `${h.etiqueta} · ${fFecha(h.fecha_ini)}${h.fecha_fin ? '–' + fFecha(h.fecha_fin) : ''}`,
    }
  }).filter(Boolean)
  const izq = frac => `calc(${PLOT_L}px + (100% - ${PLOT_L + PLOT_R}px) * ${frac})`
  const ancho = d => `calc((100% - ${PLOT_L + PLOT_R}px) * ${d})`

  if (!weeks) return <p className="placeholder">Cargando…</p>

  return (
    <div className="card evo">
      <div className="evo-head">
        <h2>Evolución del Portfolio</h2>
        <div className="evo-controles">
          <button className="btn-sec" onClick={() => setGestor(true)} title="Añadir o borrar hitos">Hitos</button>
          <div className="divisa-toggle num">
            <button className={desglose ? 'on' : ''} onClick={() => setDesglose(!desglose)}
                    title="Líneas por broker (eToro, XTB, IBKR) y monedero BTC personal. Combinable con Rentabilidad: TWR base 100 por broker, cada uno con sus aportaciones">Desglose</button>
            <button className={neto ? 'on' : ''} onClick={() => setNeto(!neto)}
                    title="Rentabilidad TWR base 100: la curva de la gestión, descontando las aportaciones de capital (como el valor liquidativo de un fondo)">Rentabilidad</button>
          </div>
          <div className="divisa-toggle num" style={(neto || desglose) ? { opacity: .4, pointerEvents: 'none' } : null}>
            {['$', '€'].map(d => (
              <button key={d} className={divisa === d ? 'on' : ''} onClick={() => setDivisa(d)}>{d}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="evo-chart">
        <ResponsiveContainer width="100%" height={340}>
          {desglose ? (
            <LineChart data={serieDesglose} margin={{ top: 12, right: PLOT_R, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E3E8F0" vertical={false} />
              <XAxis dataKey="fecha" tickFormatter={fFecha} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} minTickGap={60} />
              <YAxis tickFormatter={neto ? (v => v.toFixed(0)) : fmtK} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} width={PLOT_L} domain={['auto', 'auto']} />
              <Tooltip content={<TipDesglose neto={neto} />} />
              {neto && <ReferenceLine y={100} stroke="#8A93A6" strokeDasharray="4 3" />}
              {Object.keys(BROKER_COLS).map(k => (
                <Line key={k} type="monotone" dataKey={k} stroke={BROKER_COLS[k]}
                      strokeWidth={k === 'btc' ? 1.4 : 1.8} dot={false} connectNulls />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={serieActiva} margin={{ top: 12, right: PLOT_R, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gAzul" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2E6BF6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#2E6BF6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E3E8F0" vertical={false} />
              <XAxis dataKey="fecha" tickFormatter={fFecha} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} minTickGap={60} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} width={PLOT_L} domain={['auto', 'auto']} />
              <Tooltip content={<TipEvo divisa={divisa} neto={neto} />} />
              <Area type="monotone" dataKey={km} stroke="#2E6BF6" strokeWidth={2} fill="url(#gAzul)" connectNulls />
            </AreaChart>
          )}
        </ResponsiveContainer>

        {marcas.map(m => (
          <span key={m.id} className="hito-grupo">
            {m.fracFin != null && m.fracFin > m.frac &&
              <i className="hito-banda" style={{ left: izq(m.frac), width: ancho(m.fracFin - m.frac) }} />}
            <i className="hito-linea" style={{ left: izq(m.frac) }} />
            <i className="hito-marca" style={{ left: izq(m.frac) }} data-etq={m.etq}
               onMouseEnter={() => setHover(m.id)} onMouseLeave={() => setHover(null)} />
            {hover === m.id && (
              <i className="hito-etq" style={{ left: izq(m.frac) }}>{m.etq}</i>
            )}
          </span>
        ))}
      </div>

      {desglose && (
        <div className="hitos-leyenda">
          {Object.keys(BROKER_COLS).map(k => (
            <span key={k} className="hito-chip">
              <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2,
                             background: BROKER_COLS[k], marginRight: 6, verticalAlign: 'middle' }} />
              {BROKER_LBL[k]}
            </span>
          ))}
        </div>
      )}

      {gestor && <GestorHitos hitos={hitos} onClose={() => setGestor(false)} onSave={guardarHito} onRecargar={cargar} />}
    </div>
  )
}

function TipDesglose({ active, payload, label, neto }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tip-evo num">
      <div>{fFecha(label)}</div>
      {payload.filter(p => p.value != null).map(p => (
        <div key={p.dataKey}>
          <span style={{ color: BROKER_COLS[p.dataKey] }}>●</span> {BROKER_LBL[p.dataKey]}{' '}
          <b>{neto ? `${p.value.toFixed(1)} (${fmtPct(p.value - 100)})` : '$' + fmt$(p.value)}</b>
        </div>
      ))}
    </div>
  )
}

function TipEvo({ active, payload, label, divisa, neto }) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  return (
    <div className="tip-evo num">
      <div>{fFecha(label)}</div>
      <b>{neto
        ? `${v.toFixed(1)} (${fmtPct(v - 100)} desde origen)`
        : (divisa === '$' ? '$' : '€') + fmt$(v)}</b>
    </div>
  )
}

// Gestor de hitos: alta + listado con borrado (lo único útil que hacían los chips)
function GestorHitos({ hitos, onClose, onSave, onRecargar }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ etiqueta: '', fecha_ini: hoy, fecha_fin: '', tipo: 'mercado' })
  return (
    <div className="modal-fondo" onClick={onClose}>
      <form className="card modal num" onClick={e => e.stopPropagation()}
            onSubmit={e => {
              e.preventDefault()
              if (!f.etiqueta.trim()) return
              onSave({ ...f, fecha_fin: f.fecha_fin || null, autor: 'jose' })
              setF({ etiqueta: '', fecha_ini: hoy, fecha_fin: '', tipo: 'mercado' })
            }}>
        <h2>Hitos</h2>
        <div className="alta-grid">
          <label style={{ gridColumn: '1 / -1' }}>Etiqueta
            <input autoFocus value={f.etiqueta} onChange={e => setF({ ...f, etiqueta: e.target.value })}
                   placeholder="p.ej. Caída general de los mercados" /></label>
          <label>Inicio<input type="date" value={f.fecha_ini} onChange={e => setF({ ...f, fecha_ini: e.target.value })} /></label>
          <label>Fin (opcional)<input type="date" value={f.fecha_fin} onChange={e => setF({ ...f, fecha_fin: e.target.value })} /></label>
          <label>Tipo<select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>
            {['mercado', 'macro', 'cripto', 'personal'].map(t => <option key={t}>{t}</option>)}</select></label>
        </div>
        <div className="modal-botones">
          <button type="button" className="btn-sec" onClick={onClose}>Cerrar</button>
          <button className="btn-primario">Añadir hito</button>
        </div>

        {hitos.length > 0 && (
          <div className="hitos-tabla">
            <table className="tabla-hist">
              <thead><tr><th className="tl">HITO</th><th>FECHAS</th><th>TIPO</th><th /></tr></thead>
              <tbody>
                {hitos.map(h => (
                  <tr key={h.id}>
                    <td className="tl">{h.etiqueta}</td>
                    <td>{fFecha(h.fecha_ini)}{h.fecha_fin ? '–' + fFecha(h.fecha_fin) : ''}</td>
                    <td style={{ color: 'var(--texto-neutro)', fontSize: 11 }}>{h.tipo}</td>
                    <td><a className="borrar-x" onClick={async () => {
                      if (!confirm(`¿Borrar el hito «${h.etiqueta}»?`)) return
                      await supabase.from('hitos').delete().eq('id', h.id); onRecargar()
                    }}>✕</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="comp-nota">En la gráfica solo se ve un rombo discreto por hito; la etiqueta aparece al pasar el ratón por encima.</p>
      </form>
    </div>
  )
}

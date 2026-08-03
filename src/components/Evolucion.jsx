// Gráfica Evolución del Portfolio — componente autónomo (se usa en Inicio y en Histórico).
// Toggles: Desglose (por broker + BTC wallet), Rentabilidad (TWR base 100), $/€.
import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea, CartesianGrid,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { serieTWR, serieTWRDesglose } from '../lib/twr'

export const BROKER_COLS = { etoro: '#2E6BF6', xtb: '#3BC9F5', ibkr: '#8A93A6', btc: '#17202E' }
export const BROKER_LBL = { etoro: 'eToro', xtb: 'XTB', ibkr: 'IBKR', btc: '₿ wallet' }

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v))
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'

export default function Evolucion() {
  const [weeks, setWeeks] = useState(null)
  const [hitos, setHitos] = useState([])
  const [contribs, setContribs] = useState([])
  const [divisa, setDivisa] = useState('$')
  const [neto, setNeto] = useState(false)
  const [desglose, setDesglose] = useState(false)
  const [altaHito, setAltaHito] = useState(false)

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
    setAltaHito(false); cargar()
  }

  // Hitos: SOLO una marca discreta en la gráfica. La etiqueta aparece al pasar
  // el ratón por encima (decisión José: no deben leerse a simple vista).
  const marcasHito = () => hitos.flatMap(h => {
    const etq = `${h.etiqueta} · ${fFecha(h.fecha_ini)}${h.fecha_fin ? '–' + fFecha(h.fecha_fin) : ''}`
    const rombo = ({ viewBox }) => (
      <g className="hito-marca" transform={`translate(${viewBox.x}, 6)`}>
        <title>{etq}</title>
        <rect x={-14} y={-6} width={28} height={22} fill="transparent" />
        <path d="M0,-4 L4,0 L0,4 L-4,0 Z" />
      </g>
    )
    const linea = (
      <ReferenceLine key={'l' + h.id} x={h.fecha_ini} stroke="#C9D2E0" strokeDasharray="3 4"
                     label={rombo} isFront />
    )
    return h.fecha_fin
      ? [<ReferenceArea key={'a' + h.id} x1={h.fecha_ini} x2={h.fecha_fin} fill="#F0A020" fillOpacity={0.055} />, linea]
      : [linea]
  })

  if (!weeks) return <p className="placeholder">Cargando…</p>

  return (
    <div className="card evo">
      <div className="evo-head">
        <h2>Evolución del Portfolio</h2>
        <div className="evo-controles">
          <button className="btn-sec" onClick={() => setAltaHito(true)} title="Añadir o borrar hitos">Hitos</button>
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
      <ResponsiveContainer width="100%" height={340}>
        {desglose ? (
          <LineChart data={serieDesglose} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#E3E8F0" vertical={false} />
            <XAxis dataKey="fecha" tickFormatter={fFecha} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} minTickGap={60} />
            <YAxis tickFormatter={neto ? (v => v.toFixed(0)) : fmtK} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} width={46} domain={['auto', 'auto']} />
            <Tooltip content={<TipDesglose neto={neto} />} />
            {neto && <ReferenceLine y={100} stroke="#8A93A6" strokeDasharray="4 3" />}
            {marcasHito()}
            {Object.keys(BROKER_COLS).map(k => (
              <Line key={k} type="monotone" dataKey={k} stroke={BROKER_COLS[k]}
                    strokeWidth={k === 'btc' ? 1.4 : 1.8} dot={false} connectNulls />
            ))}
          </LineChart>
        ) : (
        <AreaChart data={serieActiva} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gAzul" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2E6BF6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#2E6BF6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#E3E8F0" vertical={false} />
          <XAxis dataKey="fecha" tickFormatter={fFecha} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} minTickGap={60} />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} width={46} domain={['auto', 'auto']} />
          <Tooltip content={<TipEvo divisa={divisa} neto={neto} />} />
          {marcasHito()}
          <Area type="monotone" dataKey={km} stroke="#2E6BF6" strokeWidth={2} fill="url(#gAzul)" connectNulls />
        </AreaChart>
        )}
      </ResponsiveContainer>
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
      {altaHito && <GestorHitos hitos={hitos} onClose={() => setAltaHito(false)} onSave={guardarHito} onRecargar={cargar} />}
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

function GestorHitos({ hitos, onClose, onSave, onRecargar }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ etiqueta: '', fecha_ini: hoy, fecha_fin: '', tipo: 'mercado' })
  return (
    <div className="modal-fondo" onClick={onClose}>
      <form className="card modal num" onClick={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); if (f.etiqueta.trim()) onSave({ ...f, fecha_fin: f.fecha_fin || null, autor: 'jose' }) }}>
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

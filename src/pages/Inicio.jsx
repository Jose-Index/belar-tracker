import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea, CartesianGrid,
} from 'recharts'
import { supabase } from '../lib/supabase'
import Mercados from '../components/Mercados.jsx'
import './inicio.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v))
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'

export default function Inicio() {
  const [weeks, setWeeks] = useState(null)
  const [hitos, setHitos] = useState([])
  const [positions, setPositions] = useState([])
  const [contribs, setContribs] = useState([])
  const [liquidez, setLiquidez] = useState({})
  const [divisa, setDivisa] = useState('$')
  const [altaHito, setAltaHito] = useState(false)

  async function cargar() {
    const [w, h, p, c, st] = await Promise.all([
      supabase.from('weekly_snapshots').select('week_end,total_value,eurusd').order('week_end'),
      supabase.from('hitos').select('*').order('fecha_ini'),
      supabase.from('positions').select('invested,current_value'),
      supabase.from('contributions').select('fecha,importe_eur'),
      supabase.from('app_state').select('key,value').eq('key', 'liquidez'),
    ])
    setWeeks(w.data || []); setHitos(h.data || []); setPositions(p.data || [])
    setContribs(c.data || []); setLiquidez(st.data?.[0]?.value || {})
  }
  useEffect(() => { cargar() }, [])

  // Serie de la gráfica, con conversión € honesta (EURUSD del momento, arrastrando el último conocido)
  const serie = useMemo(() => {
    if (!weeks) return []
    let fx = null
    return weeks.map(w => {
      if (w.eurusd) fx = Number(w.eurusd)
      const usd = Number(w.total_value)
      return { fecha: w.week_end, usd, eur: fx ? usd / fx : null }
    })
  }, [weeks])

  const km = divisa === '$' ? 'usd' : 'eur'

  // Boxes
  const totalPos = positions.reduce((a, p) => a + Number(p.current_value ?? p.invested), 0)
  const totalInv = positions.reduce((a, p) => a + Number(p.invested), 0)
  const totalLiq = Object.values(liquidez).reduce((a, v) => a + (Number(v) || 0), 0)
  const gp = totalPos - totalInv
  const gpPct = totalInv ? gp / totalInv * 100 : null
  const ult = serie.at(-1), pen = serie.at(-2)
  const semPct = ult && pen ? (ult.usd - pen.usd) / pen.usd * 100 : null
  const año = new Date().getFullYear()
  const aportadoAño = contribs.filter(c => c.fecha?.startsWith(String(año))).reduce((a, c) => a + Number(c.importe_eur), 0)
  const aportadoTotal = contribs.reduce((a, c) => a + Number(c.importe_eur), 0)
  const iniAño = serie.find(s => s.fecha >= `${año}-01-01`)
  const añoPct = ult && iniAño && iniAño !== ult ? (ult.usd - iniAño.usd) / iniAño.usd * 100 : null

  async function guardarHito(h) {
    await supabase.from('hitos').insert(h)
    setAltaHito(false); cargar()
  }

  if (!weeks) return <p className="placeholder">Cargando…</p>

  return (
    <div>
      <Mercados />

      <div className="boxes num">
        <div className="card box">
          <span className="box-t">Valor total cuenta</span>
          <span className="box-v">${fmt$(totalPos + totalLiq)}</span>
          <span className="box-s">posiciones ${fmtK(totalPos)} + liquidez ${fmtK(totalLiq)}</span>
        </div>
        <div className="card box">
          <span className="box-t">G/P abierto</span>
          <span className={'box-v ' + pctClass(gpPct)}>{fmtPct(gpPct)}</span>
          <span className={'box-s ' + pctClass(gp)}>{gp > 0 ? '+' : ''}${fmt$(gp)} sobre invertido</span>
        </div>
        <div className="card box">
          <span className="box-t">Semana en curso</span>
          <span className={'box-v ' + pctClass(semPct)}>{fmtPct(semPct)}</span>
          <span className="box-s">vs cierre {fFecha(pen?.fecha)}</span>
        </div>
        <div className="card box">
          <span className="box-t">{año}</span>
          <span className={'box-v ' + pctClass(añoPct)}>{fmtPct(añoPct)}</span>
          <span className="box-s">aportado {año}: {fmt$(aportadoAño)}€ · total: {fmt$(aportadoTotal)}€</span>
        </div>
        <div className="card box box-platt">
          <span className="box-t">Platt</span>
          <span className="box-v warn">—</span>
          <span className="box-s">pendiente de SLs calibrados en BTP</span>
        </div>
      </div>

      <div className="card evo">
        <div className="evo-head">
          <h2>Evolución del Portfolio</h2>
          <div className="evo-controles">
            <button className="btn-sec" onClick={() => setAltaHito(true)}>+ Hito</button>
            <div className="divisa-toggle num">
              {['$', '€'].map(d => (
                <button key={d} className={divisa === d ? 'on' : ''} onClick={() => setDivisa(d)}>{d}</button>
              ))}
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={serie} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gAzul" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2E6BF6" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#2E6BF6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E3E8F0" vertical={false} />
            <XAxis dataKey="fecha" tickFormatter={fFecha} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} minTickGap={60} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} width={46} domain={['auto', 'auto']} />
            <Tooltip content={<TipEvo divisa={divisa} hitos={hitos} />} />
            {hitos.map(h => h.fecha_fin
              ? <ReferenceArea key={h.id} x1={h.fecha_ini} x2={h.fecha_fin} fill="#F0A020" fillOpacity={0.10} />
              : <ReferenceLine key={h.id} x={h.fecha_ini} stroke="#8A93A6" strokeDasharray="4 3" />)}
            <Area type="monotone" dataKey={km} stroke="#2E6BF6" strokeWidth={2} fill="url(#gAzul)" connectNulls />
          </AreaChart>
        </ResponsiveContainer>
        {hitos.length > 0 && (
          <div className="hitos-leyenda">
            {hitos.map(h => (
              <span key={h.id} className="hito-chip" title={`${fFecha(h.fecha_ini)}${h.fecha_fin ? '–' + fFecha(h.fecha_fin) : ''}`}>
                {h.etiqueta}
                <a onClick={async () => { await supabase.from('hitos').delete().eq('id', h.id); cargar() }}>✕</a>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card historico">
        <h2>Histórico semanal</h2>
        <table className="tabla-hist num">
          <thead><tr><th>SEMANA</th><th>TOTAL $</th><th>%/SEM</th><th>EURUSD</th><th>TOTAL €</th></tr></thead>
          <tbody>
            {[...serie].reverse().slice(0, 30).map((s, i, arr) => {
              const prev = arr[i + 1]
              const pct = prev ? (s.usd - prev.usd) / prev.usd * 100 : null
              const w = weeks.find(x => x.week_end === s.fecha)
              return (
                <tr key={s.fecha}>
                  <td>{fFecha(s.fecha)}</td>
                  <td>{fmt$(s.usd)}</td>
                  <td className={pctClass(pct)}>{fmtPct(pct)}</td>
                  <td>{w?.eurusd ? Number(w.eurusd).toFixed(4) : '—'}</td>
                  <td>{w?.eurusd ? fmt$(s.usd / Number(w.eurusd)) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {altaHito && <AltaHito onClose={() => setAltaHito(false)} onSave={guardarHito} />}
    </div>
  )
}

function TipEvo({ active, payload, label, divisa }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tip-evo num">
      <div>{fFecha(label)}</div>
      <b>{divisa === '$' ? '$' : '€'}{fmt$(payload[0].value)}</b>
    </div>
  )
}

function AltaHito({ onClose, onSave }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ etiqueta: '', fecha_ini: hoy, fecha_fin: '', tipo: 'mercado' })
  return (
    <div className="modal-fondo" onClick={onClose}>
      <form className="card modal num" onClick={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); if (f.etiqueta.trim()) onSave({ ...f, fecha_fin: f.fecha_fin || null, autor: 'jose' }) }}>
        <h2>Nuevo hito</h2>
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
          <button type="button" className="btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn-primario">Guardar</button>
        </div>
      </form>
    </div>
  )
}

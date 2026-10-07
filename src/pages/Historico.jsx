// Histórico semanal completo, conviviendo con su Evolución (decisión José 03/08).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Evolucion from '../components/Evolucion.jsx'
import IngestaCierres from '../components/IngestaCierres.jsx'
import { getSimbolos } from '../lib/quotes'
import { useCache } from '../lib/cache'
import { aportacionesEntre, pctConFlujos } from '../lib/twr'
import './inicio.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'

async function loaderSemanas() {
  const { data } = await supabase.from('weekly_snapshots').select('*').order('week_end')
  return data || []
}
async function loaderAportaciones() {
  const { data } = await supabase.from('contributions').select('fecha,broker,importe_eur,importe_usd')
  return data || []
}

export default function Historico() {
  // Mismas semanas que la portada y Evolución: una sola carga compartida (lib/cache.js)
  const { data: weeks } = useCache('historico:semanas', loaderSemanas, { ttl: 5 * 60e3, persist: true })
  const { data: contribs } = useCache('historico:aportaciones', loaderAportaciones, { ttl: 5 * 60e3, persist: true })
  const [cierres, setCierres] = useState(false)   // registro de cierres por captura (13/08/2026)
  const [positions, setPositions] = useState([])
  const [simbolos, setSimbolos] = useState([])
  const [msgCierres, setMsgCierres] = useState(null)

  useEffect(() => {
    if (!cierres) return
    supabase.from('positions').select('*').then(({ data }) => setPositions(data || []))
    getSimbolos().then(setSimbolos)
  }, [cierres])

  const filas = useMemo(() => {
    if (!weeks) return []
    // %/sem = (V_t − F_t) / V_{t−1} − 1, con F_t = aportaciones de la semana (no son rendimiento)
    return weeks.map((w, i) => {
      const prev = weeks[i - 1]
      const usd = Number(w.total_value)
      const F = prev ? aportacionesEntre(contribs || [], prev.week_end, w.week_end, weeks).total : 0
      return {
        fecha: w.week_end, usd, aportado: F,
        pct: prev && contribs ? pctConFlujos(Number(prev.total_value), usd, F) : null,   // sin aportaciones cargadas: "—"
        eurusd: w.eurusd ? Number(w.eurusd) : null,
      }
    }).reverse()
  }, [weeks, contribs])

  if (!weeks) return <p className="placeholder">Cargando…</p>

  return (
    <div>
      <Evolucion />

      <div className="card historico">
        <h2>Cierres de posiciones{' '}
          <button className="btn-sec" onClick={() => { setCierres(!cierres); setMsgCierres(null) }}>
            {cierres ? 'cerrar' : 'REGISTRAR CIERRES POR CAPTURA'}
          </button></h2>
        {msgCierres && <p className="hist-n num">{msgCierres}</p>}
        {cierres && <IngestaCierres positions={positions} simbolos={simbolos}
          onDone={n => { setCierres(false); setMsgCierres(`${n} cierre(s) registrados en el histórico con fecha e importe reales.`) }} />}
      </div>

      <div className="card historico">
        <h2>Histórico semanal <span className="hist-n num">{filas.length} semanas</span></h2>
        <table className="tabla-hist num">
          <thead><tr><th>SEMANA</th><th>TOTAL $</th><th title="Rentabilidad semanal sin el efecto de las aportaciones: (valor − aportado en la semana) ÷ valor anterior − 1">%/SEM</th><th>EURUSD</th><th>TOTAL €</th></tr></thead>
          <tbody>
            {filas.map(s => (
              <tr key={s.fecha}>
                <td>{fFecha(s.fecha)}</td>
                <td>{fmt$(s.usd)}</td>
                <td className={pctClass(s.pct)} title={s.aportado ? `Descontadas aportaciones de la semana: $${fmt$(s.aportado)}` : ''}>{fmtPct(s.pct)}</td>
                <td>{s.eurusd ? s.eurusd.toFixed(4) : '—'}</td>
                <td>{s.eurusd ? fmt$(s.usd / s.eurusd) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

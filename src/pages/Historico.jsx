// Histórico semanal completo, conviviendo con su Evolución (decisión José 03/08).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Evolucion from '../components/Evolucion.jsx'
import IngestaCierres from '../components/IngestaCierres.jsx'
import { getSimbolos } from '../lib/quotes'
import './inicio.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'

export default function Historico() {
  const [weeks, setWeeks] = useState(null)
  const [cierres, setCierres] = useState(false)   // registro de cierres por captura (13/08/2026)
  const [positions, setPositions] = useState([])
  const [simbolos, setSimbolos] = useState([])
  const [msgCierres, setMsgCierres] = useState(null)

  useEffect(() => {
    supabase.from('weekly_snapshots').select('*').order('week_end')
      .then(({ data }) => setWeeks(data || []))
  }, [])

  useEffect(() => {
    if (!cierres) return
    supabase.from('positions').select('*').then(({ data }) => setPositions(data || []))
    getSimbolos().then(setSimbolos)
  }, [cierres])

  const filas = useMemo(() => {
    if (!weeks) return []
    return weeks.map((w, i) => {
      const prev = weeks[i - 1]
      const usd = Number(w.total_value)
      return {
        fecha: w.week_end, usd,
        pct: prev ? (usd - Number(prev.total_value)) / Number(prev.total_value) * 100 : null,
        eurusd: w.eurusd ? Number(w.eurusd) : null,
      }
    }).reverse()
  }, [weeks])

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
          <thead><tr><th>SEMANA</th><th>TOTAL $</th><th>%/SEM</th><th>EURUSD</th><th>TOTAL €</th></tr></thead>
          <tbody>
            {filas.map(s => (
              <tr key={s.fecha}>
                <td>{fFecha(s.fecha)}</td>
                <td>{fmt$(s.usd)}</td>
                <td className={pctClass(s.pct)}>{fmtPct(s.pct)}</td>
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

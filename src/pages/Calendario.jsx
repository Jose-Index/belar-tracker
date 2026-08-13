// Calendario global: eventos manuales (José/Belar en sesión), próximos 60 días. IA retirada 13/08/2026.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { tickersVigilados, purgarCalendario } from '../lib/ia'
import './inicio.css'

const TIPO = { earnings: '📊', exdiv: '💰', fed: '🏛', bce: '🏛', cripto: '₿', revision: '🔍', otro: '·' }
const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function Calendario() {
  const [rows, setRows] = useState(null)
  const hoy = new Date().toISOString().slice(0, 10)
  const [nuevo, setNuevo] = useState({ event_date: hoy, ticker: '', event_type: 'otro', titulo: '', confirmacion: 'confirmado' })

  async function cargar() {
    const lim = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
    // Universo: posiciones abiertas + repositorio (ENTRAR YA / RADAR). Cerradas fuera.
    const vigilados = await tickersVigilados()
    await purgarCalendario(vigilados)
    const { data } = await supabase.from('calendar_events').select('*')
      .gte('event_date', hoy).lte('event_date', lim).order('event_date')
    setRows((data || []).filter(e => !e.ticker || vigilados.includes(e.ticker)))
  }
  useEffect(() => { cargar() }, [])

  async function alta(e) {
    e.preventDefault()
    if (!nuevo.titulo.trim()) return
    await supabase.from('calendar_events').insert({
      event_date: nuevo.event_date, ticker: nuevo.ticker.trim().toUpperCase() || null,
      event_type: nuevo.event_type, titulo: nuevo.titulo.trim(), source: 'manual',
      confirmacion: nuevo.confirmacion, fuente: 'josé',
    })
    setNuevo({ event_date: hoy, ticker: '', event_type: 'otro', titulo: '', confirmacion: nuevo.confirmacion }); cargar()
  }
  async function borrar(r) {
    if (!confirm(`¿Borrar "${r.titulo}"?`)) return
    await supabase.from('calendar_events').delete().eq('id', r.id); cargar()
  }

  if (!rows) return <p className="placeholder">Cargando…</p>

  const porDia = new Map()
  for (const r of rows) {
    if (!porDia.has(r.event_date)) porDia.set(r.event_date, [])
    porDia.get(r.event_date).push(r)
  }

  return (
    <div>
      <h1>Calendario <span className="hist-n num">
        próximos 60 días · {rows.filter(r => r.confirmacion === 'confirmado').length} confirmados ·{' '}
        {rows.filter(r => r.confirmacion === 'estimado').length} estimados</span></h1>

      <div className="card" style={{ maxWidth: 860 }}>
        <form className="repo-alta num" onSubmit={alta}>
          <input type="date" value={nuevo.event_date} onChange={e => setNuevo({ ...nuevo, event_date: e.target.value })} />
          <input placeholder="TICKER" value={nuevo.ticker} style={{ width: 90, textTransform: 'uppercase' }}
                 onChange={e => setNuevo({ ...nuevo, ticker: e.target.value })} />
          <select value={nuevo.event_type} onChange={e => setNuevo({ ...nuevo, event_type: e.target.value })}>
            {Object.keys(TIPO).map(t => <option key={t}>{t}</option>)}
          </select>
          <input placeholder="título del evento" value={nuevo.titulo} style={{ flex: 1 }}
                 onChange={e => setNuevo({ ...nuevo, titulo: e.target.value })} />
          <select value={nuevo.confirmacion} onChange={e => setNuevo({ ...nuevo, confirmacion: e.target.value })}
                  title="¿La fecha está convocada oficialmente o es una estimación?">
            <option value="confirmado">confirmado</option>
            <option value="estimado">estimado</option>
          </select>
          <button className="btn-sec">+ Evento</button>
        </form>

        <div className="cal-lista">
          {[...porDia.entries()].map(([dia, evs]) => {
            const d = new Date(dia + 'T00:00:00')
            const urgente = (d - new Date()) / 86400000 < 3
            return (
              <div key={dia} className="cal-dia">
                <div className={'cal-fecha num' + (urgente ? ' urg' : '')}>
                  {DIAS[d.getDay()]} {fFecha(dia)}
                </div>
                <div className="cal-eventos">
                  {evs.map(r => (
                    <div key={r.id} className="cal-evento">
                      <span className="cal-tipo">{TIPO[r.event_type] || '·'}</span>
                      {r.ticker && <b className="num">{r.ticker}</b>}
                      <span>{r.titulo}</span>
                      <span className={'cal-conf ' + r.confirmacion}
                            title={r.confirmacion === 'confirmado'
                              ? `Fecha convocada por la propia compañía u organismo${r.fuente ? ' · ' + r.fuente : ''}`
                              : r.confirmacion === 'estimado'
                                ? `Fecha ESTIMADA, sin convocatoria oficial: puede desviarse${r.fuente ? ' · ' + r.fuente : ''}. Se re-verifica cada 24 h.`
                                : 'Sin noción de confirmación'}>
                        {r.confirmacion === 'confirmado' ? '✓ confirmado' : r.confirmacion === 'estimado' ? '~ estimado' : '·'}
                      </span>
                      <span className={'cal-src num ' + r.source}>{r.source === 'ia' ? 'IA' : r.source}</span>
                      <a className="borrar-x" onClick={() => borrar(r)}>✕</a>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {!rows.length && <p className="placeholder">Sin eventos próximos. La IA los repone cada 24 h desde Posiciones.</p>}
        </div>
        <p className="comp-nota">
          <b>✓ confirmado</b> = fecha convocada por la propia compañía (Investor Relations, nota de prensa, 8-K) o calendario oficial FED/BCE.
          <b> ~ estimado</b> = fecha de agregador o proyección por patrón histórico: puede desviarse, no operes contra ella.
          La regeneración de cada 24 h persigue los estimados hasta confirmarlos o corregirlos. Los eventos manuales no se tocan.
        </p>
      </div>
    </div>
  )
}

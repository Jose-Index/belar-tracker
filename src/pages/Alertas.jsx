// Alertas: vigilancia de Belar + alertas manuales. Resolver = desactivar (queda en histórico).
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCache } from '../lib/cache'
import { useMovil } from '../lib/movil'
import './inicio.css'

const SEV = { alta: 'var(--baja)', media: 'var(--ambar, #F0A020)', baja: 'var(--texto-neutro)' }
const fFecha = d => d ? d.slice(2, 10).split('-').reverse().join('/') : '—'

async function loaderAlertas() {
  const { data } = await supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(200)
  return data || []
}

export default function Alertas() {
  const { data: rows, recargar } = useCache('alertas', loaderAlertas, { ttl: 60e3, persist: true })
  const cargar = () => recargar(true)
  const [verResueltas, setVerResueltas] = useState(false)
  const [nueva, setNueva] = useState({ severidad: 'media', ticker: '', titulo: '', detalle: '' })
  const movil = useMovil()
  const [formAbierto, setFormAbierto] = useState(false)   // móvil: el alta se pliega tras "+ Alerta"

  async function alta(e) {
    e.preventDefault()
    if (!nueva.titulo.trim()) return
    await supabase.from('alerts').insert({
      autor: 'jose', severidad: nueva.severidad,
      ticker: nueva.ticker.trim().toUpperCase() || null,
      titulo: nueva.titulo.trim(), detalle: nueva.detalle.trim() || null,
    })
    setNueva({ severidad: 'media', ticker: '', titulo: '', detalle: '' }); cargar()
  }
  const resolver = async r => { await supabase.from('alerts').update({ activa: false }).eq('id', r.id); cargar() }
  const reabrir = async r => { await supabase.from('alerts').update({ activa: true }).eq('id', r.id); cargar() }

  if (!rows) return <p className="placeholder">Cargando…</p>
  const activas = rows.filter(r => r.activa), resueltas = rows.filter(r => !r.activa)
  const visibles = verResueltas ? resueltas : activas

  return (
    <div>
      <h1>Alertas</h1>

      <div className="card" style={{ maxWidth: 860 }}>
        <div className="repo-head">
          <div className="divisa-toggle">
            <button className={!verResueltas ? 'on' : ''} onClick={() => setVerResueltas(false)}>Activas <span className="hist-n">{activas.length}</span></button>
            <button className={verResueltas ? 'on' : ''} onClick={() => setVerResueltas(true)}>Resueltas <span className="hist-n">{resueltas.length}</span></button>
          </div>
          {movil && !verResueltas && <button type="button" className="btn-sec" onClick={() => setFormAbierto(v => !v)}>{formAbierto ? 'cerrar' : '+ Alerta'}</button>}
        </div>

        {!verResueltas && (!movil || formAbierto) && (
          <form className="repo-alta num" onSubmit={alta}>
            <select value={nueva.severidad} onChange={e => setNueva({ ...nueva, severidad: e.target.value })}>
              {['alta', 'media', 'baja'].map(s => <option key={s}>{s}</option>)}
            </select>
            <input placeholder="TICKER" value={nueva.ticker} style={{ width: 90, textTransform: 'uppercase' }}
                   onChange={e => setNueva({ ...nueva, ticker: e.target.value })} />
            <input placeholder="título" value={nueva.titulo} style={{ flex: 1 }}
                   onChange={e => setNueva({ ...nueva, titulo: e.target.value })} />
            <button className="btn-sec">+ Alerta</button>
          </form>
        )}

        <div className="alertas-lista">
          {visibles.map(r => (
            <div key={r.id} className="alerta-fila">
              <span className="alerta-sev" style={{ background: SEV[r.severidad] }} title={r.severidad} />
              <div className="alerta-cuerpo">
                <div className="alerta-titulo">
                  {r.ticker && <b className="num">{r.ticker}</b>} {r.titulo}
                </div>
                {r.detalle && <div className="alerta-detalle">{r.detalle}</div>}
                <div className="alerta-meta num">{r.autor} · {fFecha(r.created_at)}</div>
              </div>
              {r.activa
                ? <button className="btn-sec" onClick={() => resolver(r)}>Resolver</button>
                : <button className="btn-sec" onClick={() => reabrir(r)}>Reabrir</button>}
            </div>
          ))}
          {!visibles.length && <p className="placeholder">Sin alertas {verResueltas ? 'resueltas' : 'activas'}.</p>}
        </div>
      </div>
    </div>
  )
}

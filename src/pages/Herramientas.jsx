import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './inicio.css'

const fmt$ = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Herramientas() {
  return (
    <div>
      <h1>Herramientas</h1>
      <div className="herr-grid">
        <Calculadora />
        <Frases />
        <Backup />
        <Acceso />
      </div>
      <Fuentes />
    </div>
  )
}

// ─── Calculadora de posición: riesgo real con SL y apalancamiento ───
function Calculadora() {
  const [c, setC] = useState({ importe: '', entrada: '', sl: '', apal: 1 })
  const imp = Number(c.importe), ent = Number(c.entrada), sl = Number(c.sl), ap = Number(c.apal) || 1
  const distPct = ent && sl ? (sl - ent) / ent * 100 : null
  const riesgo = imp && distPct != null ? imp * Math.abs(distPct) / 100 * ap : null
  const inp = (k, ph, step = '0.01') => (
    <label>{ph}<input type="number" step={step} inputMode="decimal" value={c[k]}
      onChange={e => setC({ ...c, [k]: e.target.value })} /></label>
  )
  return (
    <div className="card">
      <h3>Calculadora de posición</h3>
      <div className="calc-grid num">
        {inp('importe', 'Importe $')}
        {inp('entrada', 'Precio entrada')}
        {inp('sl', 'Precio SL')}
        {inp('apal', 'Apalancamiento', '1')}
      </div>
      {riesgo != null && (
        <div className="calc-res num">
          <div>Distancia SL: <b className={distPct < 0 ? 'down' : 'up'}>{distPct.toFixed(2)}%</b></div>
          <div>Riesgo si salta: <b className="down">${fmt$(riesgo)}</b> ({(riesgo / imp * 100).toFixed(1)}% del importe)</div>
          {ap > 2 && <div className="down">⚠ Apalancamiento &gt; x2: fuera de las reglas de la casa.</div>}
        </div>
      )}
    </div>
  )
}

// ─── Editor de frases del footer ───
function Frases() {
  const [rows, setRows] = useState([])
  const [nueva, setNueva] = useState({ texto: '', autor: '' })
  const [abierto, setAbierto] = useState(false)
  const cargar = async () => {
    const { data } = await supabase.from('frases').select('*').order('id')
    setRows(data || [])
  }
  useEffect(() => { cargar() }, [])
  async function alta(e) {
    e.preventDefault()
    if (!nueva.texto.trim()) return
    await supabase.from('frases').insert({ texto: nueva.texto.trim(), autor: nueva.autor.trim() || null, origen: 'jose' })
    setNueva({ texto: '', autor: '' }); cargar()
  }
  return (
    <div className="card">
      <h3>Frases del footer <span className="hist-n num">{rows.filter(r => r.activa).length} activas</span></h3>
      <form onSubmit={alta} style={{ display: 'grid', gap: 8 }}>
        <input placeholder="Nueva frase…" value={nueva.texto} onChange={e => setNueva({ ...nueva, texto: e.target.value })} className="herr-inp" />
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="autor" value={nueva.autor} onChange={e => setNueva({ ...nueva, autor: e.target.value })} className="herr-inp" style={{ flex: 1 }} />
          <button className="btn-sec">+ Añadir</button>
        </div>
      </form>
      <a className="edit-toggle" style={{ display: 'inline-block', marginTop: 10 }} onClick={() => setAbierto(!abierto)}>
        {abierto ? 'ocultar lista' : 'ver lista completa'}
      </a>
      {abierto && (
        <div className="frases-lista">
          {rows.map(r => (
            <div key={r.id} className={'frase-fila' + (r.activa ? '' : ' off')}>
              <span className="frase-txt">«{r.texto}» {r.autor && <i>— {r.autor}</i>}</span>
              <span>
                <a onClick={async () => { await supabase.from('frases').update({ activa: !r.activa }).eq('id', r.id); cargar() }}>
                  {r.activa ? 'pausar' : 'activar'}
                </a>
                {' '}<a className="borrar-x" onClick={async () => { if (confirm('¿Borrar frase?')) { await supabase.from('frases').delete().eq('id', r.id); cargar() } }}>✕</a>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Backup manual: descarga JSON completo con fecha ───
const TABLAS = ['positions', 'position_history', 'position_snapshots', 'weekly_snapshots', 'contributions',
  'calendar_events', 'alerts', 'repositorio', 'plan_rector', 'hitos', 'frases', 'position_notes',
  'symbols', 'yearly_results', 'app_state', 'verdict_history', 'positions_sandbox']
function Backup() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function bajar() {
    setBusy(true); setMsg('')
    const out = { exportado: new Date().toISOString(), tablas: {} }
    for (const t of TABLAS) {
      const { data, error } = await supabase.from(t).select('*')
      out.tablas[t] = error ? { error: error.message } : data
    }
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `btp-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(a.href)
    const n = Object.values(out.tablas).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0)
    setMsg(`Backup descargado: ${n} filas de ${TABLAS.length} tablas.`)
    setBusy(false)
  }
  return (
    <div className="card">
      <h3>Backup</h3>
      <p style={{ fontSize: 13, color: 'var(--texto-sec)', marginTop: 0 }}>
        Export completo de la base de datos a un JSON con fecha. Guárdalo donde quieras: cada descarga es una versión, nunca se sobrescribe nada.
      </p>
      <button className="btn-primario" onClick={bajar} disabled={busy}>{busy ? 'Exportando…' : '⬇ Descargar backup'}</button>
      {msg && <p style={{ fontSize: 12.5, color: 'var(--alza)', marginBottom: 0 }}>{msg}</p>}
      <p className="comp-nota">El backup automático tras cada cierre de semana llegará con la Fase 6 final.</p>
    </div>
  )
}

// ─── Acceso ───
function Acceso() {
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  async function definir(e) {
    e.preventDefault()
    if (pass.length < 8) { setMsg({ err: true, t: 'Mínimo 8 caracteres.' }); return }
    if (pass !== pass2) { setMsg({ err: true, t: 'No coinciden.' }); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pass })
    setBusy(false)
    if (error) setMsg({ err: true, t: error.message })
    else { setMsg({ err: false, t: 'Contraseña guardada.' }); setPass(''); setPass2('') }
  }
  return (
    <div className="card">
      <h3>Acceso</h3>
      <form onSubmit={definir} style={{ display: 'grid', gap: 8 }}>
        <input type="password" placeholder="Nueva contraseña" autoComplete="new-password" className="herr-inp"
               value={pass} onChange={e => setPass(e.target.value)} />
        <input type="password" placeholder="Repítela" autoComplete="new-password" className="herr-inp"
               value={pass2} onChange={e => setPass2(e.target.value)} />
        {msg && <p style={{ margin: 0, fontSize: 13, color: msg.err ? 'var(--baja)' : 'var(--alza)' }}>{msg.t}</p>}
        <button className="btn-sec" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      </form>
      <button className="btn-sec" style={{ marginTop: 10 }} onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
    </div>
  )
}

// ─── Fuentes: tabla symbols (símbolo canónico + aliases de capturas) ───
function Fuentes() {
  const [rows, setRows] = useState([])
  const [abierto, setAbierto] = useState(false)
  const cargar = async () => {
    const { data } = await supabase.from('symbols').select('*').order('ticker')
    setRows(data || [])
  }
  useEffect(() => { cargar() }, [])
  async function editar(r, campo, valor) {
    await supabase.from('symbols').update({ [campo]: valor.trim() || null }).eq('id', r.id); cargar()
  }
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3 style={{ cursor: 'pointer' }} onClick={() => setAbierto(!abierto)}>
        {abierto ? '▾' : '▸'} Fuentes · símbolos <span className="hist-n num">{rows.length}</span>
      </h3>
      {abierto && (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--texto-sec)', marginTop: 0 }}>
            Símbolo canónico por activo (Yahoo) y aliases para el matching de capturas. Precios: Yahoo Finance vía la API propia, sin caché.
          </p>
          <table className="tabla-hist num">
            <thead><tr><th>TICKER</th><th>YAHOO</th><th>NOMBRE</th><th>ALIASES (coma)</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700 }}>{r.ticker}</td>
                  <td><input className="sb-inp" defaultValue={r.yahoo_symbol || ''} onBlur={e => e.target.value !== (r.yahoo_symbol || '') && editar(r, 'yahoo_symbol', e.target.value)} /></td>
                  <td><input className="sb-inp" style={{ width: 150 }} defaultValue={r.display_name || ''} onBlur={e => e.target.value !== (r.display_name || '') && editar(r, 'display_name', e.target.value)} /></td>
                  <td><input className="sb-inp" style={{ width: 220 }} defaultValue={(r.aliases || []).join(', ')} onBlur={async e => {
                    const arr = e.target.value.split(',').map(x => x.trim()).filter(Boolean)
                    await supabase.from('symbols').update({ aliases: arr.length ? arr : null }).eq('id', r.id); cargar()
                  }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

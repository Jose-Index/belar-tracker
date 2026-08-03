import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exportBackup } from '../lib/backup'
import './inicio.css'

const fmt$ = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Herramientas() {
  return (
    <div>
      <h1>Herramientas</h1>
      <div className="herr-grid">
        <Calculadora />
        <Backup />
        <Acceso />
      </div>
      <Frases />
      <Simbolos />
    </div>
  )
}

// ─── Calculadora de porcentajes: dos modos ───
function Calculadora() {
  const [modo, setModo] = useState('pct')      // 'pct': A y B → % · 'valor': A y % → B
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [p, setP] = useState('')

  const nA = parseFloat(String(a).replace(',', '.'))
  const nB = parseFloat(String(b).replace(',', '.'))
  const nP = parseFloat(String(p).replace(',', '.'))

  let res = null
  if (modo === 'pct' && isFinite(nA) && isFinite(nB) && nA !== 0) {
    const pct = (nB - nA) / nA * 100
    res = {
      titular: (pct > 0 ? '+' : '') + pct.toFixed(2) + '%',
      clase: pct > 0 ? 'up' : pct < 0 ? 'down' : '',
      pie: `Diferencia ${(nB - nA) > 0 ? '+' : ''}${fmt$(nB - nA)} · multiplicador ×${(nB / nA).toFixed(3)}`,
    }
  } else if (modo === 'valor' && isFinite(nA) && isFinite(nP)) {
    const fin = nA * (1 + nP / 100)
    res = {
      titular: fmt$(fin),
      clase: nP > 0 ? 'up' : nP < 0 ? 'down' : '',
      pie: `Variación ${(fin - nA) > 0 ? '+' : ''}${fmt$(fin - nA)} sobre ${fmt$(nA)}`,
    }
  }

  const campo = (etq, val, set, ph) => (
    <label>{etq}
      <input type="text" inputMode="decimal" value={val} placeholder={ph}
             onChange={e => set(e.target.value)} />
    </label>
  )

  return (
    <div className="card calc-card">
      <h3>Calculadora de %</h3>
      <div className="divisa-toggle" style={{ marginBottom: 12 }}>
        <button className={modo === 'pct' ? 'on' : ''} onClick={() => setModo('pct')}
                title="Con dos cantidades, el porcentaje de variación entre ellas">A y B → %</button>
        <button className={modo === 'valor' ? 'on' : ''} onClick={() => setModo('valor')}
                title="Con una cantidad y un porcentaje, la cantidad resultante">A y % → B</button>
      </div>
      <div className="calc-campos num">
        {campo('A · inicial', a, setA, '1000')}
        {modo === 'pct'
          ? campo('B · final', b, setB, '1150')
          : campo('% variación', p, setP, '15  ·  −8')}
      </div>
      <div className={'calc-salida num ' + (res ? '' : 'vacia')}>
        {res ? (
          <>
            <b className={res.clase}>{res.titular}</b>
            <span>{res.pie}</span>
          </>
        ) : <span>Rellena los dos campos.</span>}
      </div>
    </div>
  )
}

// ─── Editor de frases del footer: tabla completa y editable ───
function Frases() {
  const [rows, setRows] = useState([])
  const [nueva, setNueva] = useState({ texto: '', autor: '' })
  const [filtro, setFiltro] = useState('TODAS')

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
  const editar = async (r, campo, valor) => {
    await supabase.from('frases').update({ [campo]: valor.trim() || null }).eq('id', r.id); cargar()
  }
  const alternar = async r => { await supabase.from('frases').update({ activa: !r.activa }).eq('id', r.id); cargar() }
  const borrar = async r => {
    if (!confirm(`¿Borrar la frase «${r.texto.slice(0, 60)}…»?`)) return
    await supabase.from('frases').delete().eq('id', r.id); cargar()
  }

  const visibles = filtro === 'TODAS' ? rows
    : filtro === 'ACTIVAS' ? rows.filter(r => r.activa)
    : filtro === 'PAUSADAS' ? rows.filter(r => !r.activa)
    : rows.filter(r => r.origen === 'jose')

  return (
    <div className="card historico" style={{ marginTop: 14 }}>
      <div className="repo-head">
        <h2 style={{ margin: 0 }}>Frases del footer <span className="hist-n num">{rows.filter(r => r.activa).length} activas de {rows.length}</span></h2>
        <div className="divisa-toggle">
          {['TODAS', 'ACTIVAS', 'PAUSADAS', 'MÍAS'].map(f => (
            <button key={f} className={filtro === f ? 'on' : ''} onClick={() => setFiltro(f)}>{f}</button>
          ))}
        </div>
      </div>

      <form className="repo-alta" onSubmit={alta}>
        <input placeholder="Nueva frase…" value={nueva.texto} style={{ flex: 1, minWidth: 240 }}
               onChange={e => setNueva({ ...nueva, texto: e.target.value })} />
        <input placeholder="autor" value={nueva.autor} style={{ width: 150 }}
               onChange={e => setNueva({ ...nueva, autor: e.target.value })} />
        <button className="btn-sec">+ Añadir</button>
      </form>

      <table className="tabla-hist tabla-frases" style={{ marginTop: 10 }}>
        <thead><tr><th style={{ width: 40 }}>#</th><th className="tl">FRASE</th><th className="tl">AUTOR</th><th>ORIGEN</th><th>ESTADO</th><th /></tr></thead>
        <tbody>
          {visibles.map((r, i) => (
            <tr key={r.id} className={r.activa ? '' : 'off'}>
              <td className="num" style={{ color: 'var(--texto-neutro)' }}>{i + 1}</td>
              <td className="tl"><input className="sb-inp" style={{ width: '100%' }} defaultValue={r.texto}
                     onBlur={e => e.target.value !== r.texto && editar(r, 'texto', e.target.value)} /></td>
              <td className="tl"><input className="sb-inp" style={{ width: 140 }} defaultValue={r.autor || ''}
                     placeholder="—" onBlur={e => e.target.value !== (r.autor || '') && editar(r, 'autor', e.target.value)} /></td>
              <td className="num" style={{ fontSize: 10.5, color: 'var(--texto-neutro)' }}>{r.origen}</td>
              <td><a className="frase-toggle" onClick={() => alternar(r)}>{r.activa ? 'activa' : 'pausada'}</a></td>
              <td><a className="borrar-x" onClick={() => borrar(r)}>✕</a></td>
            </tr>
          ))}
          {!visibles.length && <tr><td colSpan={6} className="placeholder">Sin frases en este filtro.</td></tr>}
        </tbody>
      </table>
      <p className="comp-nota">El footer muestra una frase al azar en cada carga o refresco. Las pausadas no entran en el sorteo.</p>
    </div>
  )
}

// ─── Backup manual: descarga JSON completo con fecha ───
function Backup() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function bajar() {
    setBusy(true); setMsg('')
    try { const n = await exportBackup(); setMsg(`Backup descargado: ${n} filas.`) }
    catch (e) { setMsg('Error: ' + e.message) }
    setBusy(false)
  }
  return (
    <div className="card">
      <h3>Backup</h3>
      <p style={{ fontSize: 13, color: 'var(--texto-sec)', marginTop: 0 }}>
        Export completo de la base de datos a un JSON con fecha. Cada descarga es una versión, nunca se sobrescribe nada. Además, cada CERRAR SEMANA exitoso descarga el suyo automáticamente.
      </p>
      <button className="btn-primario" onClick={bajar} disabled={busy}>{busy ? 'Exportando…' : '⬇ Descargar backup'}</button>
      {msg && <p style={{ fontSize: 12.5, color: 'var(--alza)', marginBottom: 0 }}>{msg}</p>}
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

// ─── Símbolos y alias: matching de capturas y precios Yahoo ───
function Simbolos() {
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
    <div className="card historico" style={{ marginTop: 14 }}>
      <h2 style={{ cursor: 'pointer', margin: 0 }} onClick={() => setAbierto(!abierto)}>
        {abierto ? '▾' : '▸'} Símbolos y alias <span className="hist-n num">{rows.length}</span>
      </h2>
      {abierto && (
        <>
          <p className="comp-nota" style={{ marginTop: 4 }}>
            Símbolo canónico Yahoo por activo y alias con los que aparece en las capturas de los brokers (los usa la ingesta IA para casar posiciones).
          </p>
          <table className="tabla-hist num">
            <thead><tr><th>TICKER</th><th>YAHOO</th><th className="tl">NOMBRE</th><th className="tl">ALIAS (coma)</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700 }}>{r.ticker}</td>
                  <td><input className="sb-inp" defaultValue={r.yahoo_symbol || ''} onBlur={e => e.target.value !== (r.yahoo_symbol || '') && editar(r, 'yahoo_symbol', e.target.value)} /></td>
                  <td className="tl"><input className="sb-inp" style={{ width: 160 }} defaultValue={r.display_name || ''} onBlur={e => e.target.value !== (r.display_name || '') && editar(r, 'display_name', e.target.value)} /></td>
                  <td className="tl"><input className="sb-inp" style={{ width: 240 }} defaultValue={(r.aliases || []).join(', ')} onBlur={async e => {
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

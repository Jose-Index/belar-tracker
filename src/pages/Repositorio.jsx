// Repositorio: tabla sencilla ticker + nota + estado (ENTRAR YA / RADAR / CERRADAS).
// Borrado manual, reclasificación libre. + Plan Rector plegable (texto simple).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './inicio.css'

const ESTADOS = ['ENTRAR_YA', 'RADAR', 'CERRADA']
const LBL = { ENTRAR_YA: 'ENTRAR YA', RADAR: 'RADAR', CERRADA: 'CERRADAS' }
const COL = { ENTRAR_YA: 'var(--alza)', RADAR: 'var(--ambar, #F0A020)', CERRADA: 'var(--texto-neutro)' }
const fFecha = d => d ? d.slice(2, 10).split('-').reverse().join('/') : '—'

export default function Repositorio() {
  const [rows, setRows] = useState(null)
  const [filtro, setFiltro] = useState('TODOS')
  const [nuevo, setNuevo] = useState({ ticker: '', estado: 'RADAR', nota: '' })

  async function cargar() {
    const { data } = await supabase.from('repositorio').select('*').order('created_at', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { cargar() }, [])

  async function alta(e) {
    e.preventDefault()
    const t = nuevo.ticker.trim().toUpperCase()
    if (!t) return
    await supabase.from('repositorio').insert({ ticker: t, estado: nuevo.estado, nota: nuevo.nota.trim() || null })
    setNuevo({ ticker: '', estado: nuevo.estado, nota: '' }); cargar()
  }
  async function cambiar(r, patch) {
    await supabase.from('repositorio').update(patch).eq('id', r.id); cargar()
  }
  async function borrar(r) {
    await supabase.from('repositorio').delete().eq('id', r.id); cargar()
  }

  if (!rows) return <p className="placeholder">Cargando…</p>
  const visibles = filtro === 'TODOS' ? rows : rows.filter(r => r.estado === filtro)

  return (
    <div>
      <h1>Repositorio</h1>

      <PlanRector />

      <div className="card" style={{ maxWidth: 780 }}>
        <div className="repo-head">
          <div className="divisa-toggle">
            {['TODOS', ...ESTADOS].map(x => (
              <button key={x} className={filtro === x ? 'on' : ''} onClick={() => setFiltro(x)}>
                {x === 'TODOS' ? 'Todos' : LBL[x]} <span className="hist-n">{x === 'TODOS' ? rows.length : rows.filter(r => r.estado === x).length}</span>
              </button>
            ))}
          </div>
        </div>

        <form className="repo-alta num" onSubmit={alta}>
          <input placeholder="TICKER" value={nuevo.ticker} style={{ width: 110, textTransform: 'uppercase' }}
                 onChange={e => setNuevo({ ...nuevo, ticker: e.target.value })} />
          <select value={nuevo.estado} onChange={e => setNuevo({ ...nuevo, estado: e.target.value })}>
            {ESTADOS.filter(x => x !== 'CERRADA').map(x => <option key={x} value={x}>{LBL[x]}</option>)}
          </select>
          <input placeholder="nota (opcional)" value={nuevo.nota} style={{ flex: 1 }}
                 onChange={e => setNuevo({ ...nuevo, nota: e.target.value })} />
          <button className="btn-sec">+ Añadir</button>
        </form>

        <table className="tabla-hist num" style={{ marginTop: 10 }}>
          <thead><tr><th>TICKER</th><th>ESTADO</th><th>NOTA</th><th>FECHA</th><th /></tr></thead>
          <tbody>
            {visibles.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 700 }}>{r.ticker}</td>
                <td>
                  <select className="repo-estado" style={{ color: COL[r.estado] }} value={r.estado}
                          onChange={e => cambiar(r, { estado: e.target.value })}>
                    {ESTADOS.map(x => <option key={x} value={x}>{LBL[x]}</option>)}
                  </select>
                </td>
                <td className="repo-nota">
                  <input value={r.nota || ''} placeholder="—"
                         onChange={e => setRows(rows.map(x => x.id === r.id ? { ...x, nota: e.target.value } : x))}
                         onBlur={e => cambiar(r, { nota: e.target.value.trim() || null })} />
                </td>
                <td>{fFecha(r.created_at)}</td>
                <td><a className="borrar-x" onClick={() => borrar(r)}>✕</a></td>
              </tr>
            ))}
            {!visibles.length && <tr><td colSpan={5} className="placeholder">Nada en {filtro === 'TODOS' ? 'el repositorio' : LBL[filtro]}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Plan Rector: singleton de texto, plegado por defecto. **negrita** y *cursiva*.
function PlanRector() {
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [guardado, setGuardado] = useState('')

  useEffect(() => {
    supabase.from('plan_rector').select('contenido').eq('id', 1).maybeSingle()
      .then(({ data }) => { setTexto(data?.contenido || ''); setGuardado(data?.contenido || '') })
  }, [])

  async function guardar() {
    await supabase.from('plan_rector').upsert({ id: 1, contenido: texto, updated_at: new Date().toISOString() })
    setGuardado(texto); setEditando(false)
  }
  function teclas(e) {
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k !== 'b' && k !== 'i') return
    e.preventDefault()
    const el = e.target, m = k === 'b' ? '**' : '*'
    const s = el.selectionStart, f = el.selectionEnd
    const nuevo = texto.slice(0, s) + m + texto.slice(s, f) + m + texto.slice(f)
    setTexto(nuevo)
    requestAnimationFrame(() => { el.selectionStart = s + m.length; el.selectionEnd = f + m.length })
  }
  const html = guardado
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/\n/g, '<br/>')

  return (
    <div className="card" style={{ maxWidth: 780, marginBottom: 14 }}>
      <div className="repo-head" style={{ cursor: 'pointer' }} onClick={() => setAbierto(!abierto)}>
        <h3 style={{ margin: 0 }}>{abierto ? '▾' : '▸'} Plan Rector</h3>
        {abierto && !editando && <button className="btn-sec" onClick={e => { e.stopPropagation(); setEditando(true) }}>Editar</button>}
      </div>
      {abierto && (editando ? (
        <div style={{ marginTop: 10 }}>
          <textarea className="plan-textarea" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={teclas}
                    rows={10} placeholder="El plan. **negrita** con Ctrl/Cmd+B, *cursiva* con Ctrl/Cmd+I." />
          <div className="modal-botones" style={{ marginTop: 8 }}>
            <button className="btn-sec" onClick={() => { setTexto(guardado); setEditando(false) }}>Cancelar</button>
            <button className="btn-primario" onClick={guardar}>Guardar</button>
          </div>
        </div>
      ) : (
        <div className="plan-vista" dangerouslySetInnerHTML={{ __html: html || '<span class="placeholder">Sin contenido aún.</span>' }} />
      ))}
    </div>
  )
}

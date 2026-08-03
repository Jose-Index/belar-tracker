// Sandbox: copia de posiciones para pruebas. Nunca toca las reales.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './inicio.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''

export default function Sandbox() {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)

  async function cargar() {
    const { data } = await supabase.from('positions_sandbox').select('*').order('ticker')
    setRows(data || [])
  }
  useEffect(() => { cargar() }, [])

  async function copiarReales() {
    if (rows.length && !confirm('¿Sustituir el sandbox por una copia fresca de las posiciones reales?')) return
    setBusy(true)
    const { data: reales } = await supabase.from('positions').select('*')
    await supabase.from('positions_sandbox').delete().gte('id', 0)
    if (reales?.length) {
      const copia = reales.map(({ id, ...r }) => r)
      await supabase.from('positions_sandbox').insert(copia)
    }
    setBusy(false); cargar()
  }
  async function vaciar() {
    if (!confirm('¿Vaciar el sandbox?')) return
    await supabase.from('positions_sandbox').delete().gte('id', 0); cargar()
  }
  async function editar(r, campo, valor) {
    await supabase.from('positions_sandbox').update({ [campo]: valor === '' ? null : Number(valor) }).eq('id', r.id)
    cargar()
  }
  async function borrar(r) {
    await supabase.from('positions_sandbox').delete().eq('id', r.id); cargar()
  }

  if (!rows) return <p className="placeholder">Cargando…</p>

  const totInv = rows.reduce((a, r) => a + Number(r.invested || 0), 0)
  const totVal = rows.reduce((a, r) => a + Number(r.current_value ?? r.invested ?? 0), 0)
  const gpPct = totInv ? (totVal - totInv) / totInv * 100 : null

  return (
    <div>
      <h1>Sandbox <span className="hist-n">pruebas — nunca toca las posiciones reales</span></h1>

      <div className="card">
        <div className="repo-head num">
          <div>
            <button className="btn-primario" onClick={copiarReales} disabled={busy}>
              {busy ? 'Copiando…' : '⟳ Copiar posiciones reales'}
            </button>{' '}
            <button className="btn-sec" onClick={vaciar} disabled={!rows.length}>Vaciar</button>
          </div>
          {rows.length > 0 && (
            <span className="hist-n">
              {rows.length} posiciones · invertido ${fmt$(totInv)} · valor ${fmt$(totVal)} ·{' '}
              <b className={pctClass(gpPct)}>{fmtPct(gpPct)}</b>
            </span>
          )}
        </div>

        {rows.length > 0 && (
          <table className="tabla-hist num" style={{ marginTop: 10 }}>
            <thead><tr><th>ACTIVO</th><th>BROKER</th><th>INVERTIDO</th><th>VALOR</th><th>G/P %</th><th>CLASE</th><th /></tr></thead>
            <tbody>
              {rows.map(r => {
                const pct = r.invested && r.current_value != null
                  ? (r.current_value - r.invested) / r.invested * 100 : null
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700 }}>{r.ticker}</td>
                    <td>{r.broker}</td>
                    <td><input className="sb-inp" type="number" step="0.01" defaultValue={r.invested ?? ''}
                               onBlur={e => e.target.value !== String(r.invested ?? '') && editar(r, 'invested', e.target.value)} /></td>
                    <td><input className="sb-inp" type="number" step="0.01" defaultValue={r.current_value ?? ''}
                               onBlur={e => e.target.value !== String(r.current_value ?? '') && editar(r, 'current_value', e.target.value)} /></td>
                    <td className={pctClass(pct)}>{fmtPct(pct)}</td>
                    <td>{r.clase || '—'}</td>
                    <td><a className="borrar-x" onClick={() => borrar(r)}>✕</a></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {!rows.length && <p className="placeholder" style={{ marginTop: 12 }}>Sandbox vacío. Copia las posiciones reales para empezar a jugar.</p>}
      </div>
    </div>
  )
}

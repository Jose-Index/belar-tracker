// Patrimonio € — aportaciones de capital (doble importe €/$, decisión José) + totales.
// Pendiente en Fase 6: valores en €, año a año completo, calculadora de impuestos.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BROKER_COLS, BROKER_LBL } from '../components/Evolucion.jsx'
import './inicio.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'
const BROKERS = ['etoro', 'xtb', 'ibkr', 'btc']

export default function Patrimonio() {
  const [rows, setRows] = useState(null)
  const hoy = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ fecha: hoy, broker: 'etoro', importe_eur: '', importe_usd: '' })
  const [msg, setMsg] = useState('')
  const [ed, setEd] = useState(null)      // { id, fecha, broker, importe_eur, importe_usd }
  const [edMsg, setEdMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    const { data } = await supabase.from('contributions').select('*').order('fecha', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { cargar() }, [])

  async function alta(e) {
    e.preventDefault()
    const eur = Number(f.importe_eur), usd = Number(f.importe_usd)
    if (!f.fecha || !eur) { setMsg('Fecha e importe € son obligatorios'); return }
    const { error } = await supabase.from('contributions').insert({
      fecha: f.fecha, broker: f.broker, importe_eur: eur, importe_usd: usd || null,
    })
    if (error) { setMsg(error.message); return }
    setF({ fecha: hoy, broker: f.broker, importe_eur: '', importe_usd: '' })
    setMsg(''); cargar()
  }

  function editar(r) {
    setEdMsg('')
    setEd({
      id: r.id, fecha: r.fecha || hoy, broker: r.broker || 'etoro',
      importe_eur: r.importe_eur ?? '', importe_usd: r.importe_usd ?? '',
    })
  }

  function cancelar() { setEd(null); setEdMsg('') }

  async function guardar() {
    const eur = Number(ed.importe_eur), usd = Number(ed.importe_usd)
    if (!ed.fecha || !eur) { setEdMsg('Fecha e importe € son obligatorios'); return }
    setGuardando(true)
    const { error } = await supabase.from('contributions').update({
      fecha: ed.fecha, broker: ed.broker, importe_eur: eur, importe_usd: usd || null,
    }).eq('id', ed.id)
    setGuardando(false)
    if (error) { setEdMsg(error.message); return }
    setEd(null); setEdMsg(''); cargar()
  }

  async function borrar(r) {
    if (!confirm(`¿Borrar aportación de ${fmt$(r.importe_eur)}€ (${BROKER_LBL[r.broker] || r.broker}, ${fFecha(r.fecha)})?`)) return
    await supabase.from('contributions').delete().eq('id', r.id)
    if (ed?.id === r.id) setEd(null)
    cargar()
  }

  const porAño = useMemo(() => {
    const m = new Map()
    for (const r of rows || []) {
      const y = r.fecha?.slice(0, 4)
      const acc = m.get(y) || { eur: 0, usd: 0, n: 0 }
      acc.eur += Number(r.importe_eur); acc.usd += Number(r.importe_usd || 0); acc.n++
      m.set(y, acc)
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  const totalEur = (rows || []).reduce((a, r) => a + Number(r.importe_eur), 0)
  const totalUsd = (rows || []).reduce((a, r) => a + Number(r.importe_usd || 0), 0)

  if (!rows) return <p className="placeholder">Cargando…</p>

  return (
    <div>
      <h1>Patrimonio €</h1>

      <div className="boxes cuentas num">
        <div className="card box">
          <span className="box-t">Aportado total</span>
          <span className="box-v">{fmt$(totalEur)}€</span>
          <span className="box-s">${fmt$(totalUsd)} obtenidos en el cambio · {rows.length} aportaciones</span>
        </div>
        {porAño.slice(0, 3).map(([y, a]) => (
          <div key={y} className="card box">
            <span className="box-t">{y}</span>
            <span className="box-v">{fmt$(a.eur)}€</span>
            <span className="box-s">${fmt$(a.usd)} · {a.n} aportaciones</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Nueva aportación</h2>
        <form className="aporte-form num" onSubmit={alta}>
          <label>Fecha<input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label>
          <label>Cuenta<select value={f.broker} onChange={e => setF({ ...f, broker: e.target.value })}>
            {BROKERS.map(b => <option key={b} value={b}>{BROKER_LBL[b] || b}</option>)}</select></label>
          <label>Importe € (transferido)<input type="number" step="0.01" inputMode="decimal" value={f.importe_eur}
            onChange={e => setF({ ...f, importe_eur: e.target.value })} placeholder="470.00" /></label>
          <label>Importe $ (obtenido)<input type="number" step="0.01" inputMode="decimal" value={f.importe_usd}
            onChange={e => setF({ ...f, importe_usd: e.target.value })} placeholder="cambio real" /></label>
          <button className="btn-primario">Añadir</button>
        </form>
        {msg && <p className="aporte-msg">{msg}</p>}
        <p className="comp-nota">Doble importe: el € es lo transferido, el $ lo obtenido tras el cambio inmediato. El $ real es el que usa la Rentabilidad (TWR).</p>
      </div>

      <div className="card historico">
        <h2>Aportaciones <span className="hist-n num">{rows.length}</span></h2>
        <table className="tabla-hist num">
          <thead><tr><th>FECHA</th><th>CUENTA</th><th>€</th><th>$</th><th>EURUSD impl.</th><th /></tr></thead>
          <tbody>
            {rows.map(r => ed?.id === r.id ? (
              <tr key={r.id} className="fila-edit">
                <td><input className="ed-inp" type="date" value={ed.fecha}
                  onChange={e => setEd({ ...ed, fecha: e.target.value })} /></td>
                <td><select className="ed-inp" value={ed.broker} onChange={e => setEd({ ...ed, broker: e.target.value })}>
                  {BROKERS.map(b => <option key={b} value={b}>{BROKER_LBL[b] || b}</option>)}</select></td>
                <td><input className="ed-inp ed-num" type="number" step="0.01" inputMode="decimal" value={ed.importe_eur}
                  onChange={e => setEd({ ...ed, importe_eur: e.target.value })} /></td>
                <td><input className="ed-inp ed-num" type="number" step="0.01" inputMode="decimal" value={ed.importe_usd}
                  onChange={e => setEd({ ...ed, importe_usd: e.target.value })} placeholder="—" /></td>
                <td>{Number(ed.importe_usd) && Number(ed.importe_eur)
                  ? (Number(ed.importe_usd) / Number(ed.importe_eur)).toFixed(4) : '—'}</td>
                <td className="ed-acc">
                  <a className="ed-ok" onClick={guardando ? undefined : guardar}>{guardando ? '…' : '✓'}</a>
                  <a className="ed-no" onClick={cancelar}>✕</a>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td>{fFecha(r.fecha)}</td>
                <td><span style={{ color: BROKER_COLS[r.broker] || 'inherit', fontWeight: 600 }}>{BROKER_LBL[r.broker] || r.broker}</span></td>
                <td>{fmt$(r.importe_eur)}</td>
                <td>{r.importe_usd ? fmt$(r.importe_usd) : '—'}</td>
                <td>{r.importe_usd ? (Number(r.importe_usd) / Number(r.importe_eur)).toFixed(4) : '—'}</td>
                <td className="ed-acc">
                  <a className="editar-l" onClick={() => editar(r)}>✎</a>
                  <a className="borrar-x" onClick={() => borrar(r)}>✕</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {edMsg && <p className="aporte-msg">{edMsg}</p>}
      </div>
    </div>
  )
}

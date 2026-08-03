import { useState } from 'react'
import { extraerCapturas } from '../lib/ia'
import './ingesta.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Zona de arrastre + pantalla de revisión (diff). NUNCA auto-commit:
// José revisa y acepta; lo aceptado vuelve a Posiciones como borrador/acciones.
export default function IngestaIA({ positions, simbolos = [], onAplicar }) {
  const [estado, setEstado] = useState('idle')  // idle | procesando | diff | error
  const [err, setErr] = useState(null)
  const [diff, setDiff] = useState(null)

  async function procesar(files) {
    if (!files?.length) return
    setEstado('procesando'); setErr(null)
    try {
      const ex = await extraerCapturas(files)
      setDiff(construirDiff(ex, positions))
      setEstado('diff')
    } catch (e) {
      setErr(String(e.message || e)); setEstado('error')
    }
  }

  // El nombre de pantalla se resuelve al símbolo canónico vía tabla symbols (aliases)
  function canonico(t) {
    const T = t.toUpperCase()
    const s = simbolos.find(x => x.ticker.toUpperCase() === T ||
      (x.aliases || []).some(a => String(a).toUpperCase() === T))
    return s ? s.ticker.toUpperCase() : T
  }

  function construirDiff(extracciones, positions) {
    const updates = [], nuevas = [], liq = {}
    const vistos = new Set()
    const brokersEnCaptura = new Set(extracciones.map(x => x.broker))
    for (const ex of extracciones) {
      if (ex.liquidez != null) liq[ex.broker] = ex.liquidez
      for (const r of ex.posiciones || []) {
        const t = canonico(r.ticker || r.nombre || '')
        const pos = positions.find(p => p.broker === ex.broker && (
          p.ticker.toUpperCase() === t ||
          (r.nombre && r.nombre.toUpperCase().includes(p.ticker.toUpperCase())) ||
          p.ticker.toUpperCase().includes(t)
        ))
        if (pos) {
          vistos.add(pos.id)
          updates.push({ pos, invertido: r.invertido, valor: r.valor, sel: true })
        } else {
          nuevas.push({ ...r, broker: ex.broker, sel: true })
        }
      }
    }
    const faltantes = positions
      .filter(p => brokersEnCaptura.has(p.broker) && !vistos.has(p.id))
      .map(p => ({ pos: p, sel: false }))   // cerrar es serio: desmarcado por defecto
    return { updates, nuevas, faltantes, liq }
  }

  if (estado === 'idle' || estado === 'error') {
    return (
      <div className="ingesta card">
        <label className="dropzone"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); procesar(e.dataTransfer.files) }}>
          <input type="file" accept="image/*" multiple hidden
                 onChange={e => procesar(e.target.files)} />
          <b>Arrastra aquí las capturas de tus brokers</b>
          <span>(o toca para elegirlas) · eToro / XTB / IBKR · la IA extrae y tú revisas</span>
          {err && <span className="auth-err">{err}</span>}
        </label>
      </div>
    )
  }

  if (estado === 'procesando') {
    return <div className="ingesta card procesando">Leyendo capturas con IA…</div>
  }

  // ── Pantalla de revisión ──
  const d = diff
  const toggle = (arr, i) => setDiff({ ...d, [arr]: d[arr].map((x, j) => j === i ? { ...x, sel: !x.sel } : x) })

  return (
    <div className="ingesta card num">
      <div className="diff-head">
        <b>Revisión de capturas</b>
        <button className="btn-escape" onClick={() => setEstado('idle')}>descartar</button>
      </div>

      {d.updates.length > 0 && <>
        <h4>Actualizaciones ({d.updates.length})</h4>
        {d.updates.map((u, i) => (
          <label key={i} className="diff-row">
            <input type="checkbox" checked={u.sel} onChange={() => toggle('updates', i)} />
            <span className="t">{u.pos.ticker} <i>{u.pos.broker}</i></span>
            <span>valor {fmt$(u.pos.current_value)} → <b>{fmt$(u.valor)}</b></span>
            {u.invertido != null && Math.abs(u.invertido - u.pos.invested) > 0.01 &&
              <span className="warn">invertido {fmt$(u.pos.invested)} → <b>{fmt$(u.invertido)}</b></span>}
          </label>
        ))}
      </>}

      {d.nuevas.length > 0 && <>
        <h4>Altas propuestas ({d.nuevas.length})</h4>
        {d.nuevas.map((n, i) => (
          <label key={i} className="diff-row">
            <input type="checkbox" checked={n.sel} onChange={() => toggle('nuevas', i)} />
            <span className="t">{(n.ticker || n.nombre || '?').toUpperCase()} <i>{n.broker}</i></span>
            <span>invertido {fmt$(n.invertido)} · valor {fmt$(n.valor)}</span>
          </label>
        ))}
      </>}

      {d.faltantes.length > 0 && <>
        <h4>No aparecen en la captura — ¿cerradas? ({d.faltantes.length})</h4>
        {d.faltantes.map((f, i) => (
          <label key={i} className="diff-row">
            <input type="checkbox" checked={f.sel} onChange={() => toggle('faltantes', i)} />
            <span className="t">{f.pos.ticker} <i>{f.pos.broker}</i></span>
            <span className="down">cerrar (motivo xSL)</span>
          </label>
        ))}
      </>}

      {Object.keys(d.liq).length > 0 &&
        <p className="diff-liq">Liquidez detectada: {Object.entries(d.liq).map(([b, v]) => `${b} $${fmt$(v)}`).join(' · ')}</p>}

      <div className="modal-botones">
        <button className="btn-primario" onClick={() => { onAplicar(d); setEstado('idle') }}>
          Aplicar lo marcado
        </button>
      </div>
    </div>
  )
}

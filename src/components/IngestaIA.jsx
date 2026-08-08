import { useState } from 'react'
import { extraerCapturas } from '../lib/ia'
import { resolverSimbolo, aprenderAlias, variantes } from '../lib/quotes'
import './ingesta.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Elegibles en la propia pantalla de revisión (spec §8 + motivos de cierre del histórico)
const CLASES_ALTA = { NUCLEO: 'NÚCLEO', MOMENTUM: 'MOMENTUM', TACTICA: 'TÁCTICA', DISRUPTIVA: 'DISRUPT.' }
const FUENTES_ALTA = ['YO', 'BELAR', 'PRENSA', 'REDES']
const MOTIVOS_CIERRE = ['xSL', 'manual', 'escalonada']
const BROKERS_UI = [{ id: 'etoro', label: 'eToro' }, { id: 'xtb', label: 'XTB' }, { id: 'ibkr', label: 'IBKR' }]
const HOY = () => new Date().toISOString().slice(0, 10)

// Zona de arrastre + pantalla de revisión (diff). NUNCA auto-commit:
// José revisa y acepta; lo aceptado vuelve a Posiciones como borrador/acciones.
export default function IngestaIA({ positions, simbolos = [], onAplicar }) {
  const [estado, setEstado] = useState('idle')  // idle | procesando | diff | error
  const [err, setErr] = useState(null)
  const [diff, setDiff] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [crudo, setCrudo] = useState(null)      // extracciones tal cual las devolvió la IA
  const [brokerSel, setBrokerSel] = useState('')  // '' = el que dedujo la IA

  async function procesar(files) {
    if (!files?.length) return
    setEstado('procesando'); setErr(null); setAviso(null)
    try {
      const ex = await extraerCapturas(files)
      setCrudo(ex); setBrokerSel('')
      setDiff(construirDiff(ex, positions, ''))
      setEstado('diff')
    } catch (e) {
      setErr(String(e.message || e)); setEstado('error')
    }
  }

  // `override`: broker forzado por José. La deducción de la IA falla (xStation con tema
  // claro se confunde con IBKR) y un broker mal puesto no casa ninguna posición: propone
  // altas de todo y cierres de todo lo del otro broker. Por eso es corregible aquí mismo,
  // sin volver a pasar las capturas por la IA.
  function construirDiff(extracciones, positions, override) {
    const updates = [], nuevas = [], liq = {}
    const vistos = new Set()
    const brokerDe = x => override || x.broker
    const brokersEnCaptura = new Set(extracciones.map(brokerDe))
    for (const ex0 of extracciones) {
      const ex = { ...ex0, broker: brokerDe(ex0) }
      if (ex.liquidez != null) liq[ex.broker] = ex.liquidez
      for (const r of ex.posiciones || []) {
        const textos = [r.ticker, r.nombre].filter(Boolean)
        // El nombre de pantalla se resuelve al símbolo canónico por ticker,
        // aliases y display_name (XTB escribe "Micron" o "MU.US" donde BTP tiene "MU").
        const canon = resolverSimbolo(textos, simbolos)
        const t = canon || (r.ticker || r.nombre || '').toUpperCase()
        // Sin fila en symbols no hay alias que valga: se compara el ticker de la
        // posición con las variantes del texto (quita el sufijo de mercado: MU.US → MU).
        const vars = new Set(textos.flatMap(variantes))
        const pos = positions.find(p => p.broker === ex.broker && p.ticker.toUpperCase() === t)
          || positions.find(p => p.broker === ex.broker && !canon && vars.has(p.ticker.toUpperCase()))
          || positions.find(p => p.broker === ex.broker && !canon && (
            (r.nombre && r.nombre.toUpperCase().includes(p.ticker.toUpperCase())) ||
            p.ticker.toUpperCase().includes(t)
          ))
        // ─── Verificación de importes ───────────────────────────────────────
        // El G/P de los brokers NO es fiable para decidir qué es invertido y qué es
        // valor: IBKR lo devuelve con el signo cambiado, y con el signo al revés una
        // lectura correcta es idéntica a una permutada (incidente 08/08: se permutaron
        // tres posiciones que estaban bien). Así que el G/P ya no decide nada: solo
        // avisa. Quien manda es el invertido que ya está en BD.
        let { invertido, valor, gp } = r
        let curado = false, permutado = false, dudosa = false
        const esCopy = simbolos.find(x => x.ticker.toUpperCase() === t)?.asset_type === 'copy'
        // Reconciliación tolerante al signo del G/P: solo sirve para marcar dudas.
        const reconcilia = gp == null || invertido == null || valor == null ||
          Math.abs(invertido + gp - valor) <= 0.05 || Math.abs(invertido - gp - valor) <= 0.05

        if (pos) {
          vistos.add(pos.id)
          const invBD = Number(pos.invested)
          const leidoInv = invertido != null && Math.abs(invertido - invBD) < 0.01
          const leidoVal = valor != null && Math.abs(valor - invBD) < 0.01
          if (!esCopy && !leidoInv && leidoVal) {
            // El "valor" leído coincide al céntimo con el invertido que ya tenemos y el
            // "invertido" leído es otro: vienen permutados. El invertido no cambia solo.
            const tmp = invertido; invertido = valor; valor = tmp; permutado = true
          } else if (!esCopy && !leidoInv && !reconcilia) {
            // Ni cuadra con el invertido de BD ni con el G/P: se marca, no se toca.
            dudosa = true
          }
          updates.push({ pos, invertido, valor, sel: true, curado, permutado, dudosa, textos, canon: !!canon })
        } else {
          // clase y fuente elegibles en la propia revisión (defecto prudente: TÁCTICA / YO).
          // entry_date: de la captura si la trae; si no, hay que ponerla a mano.
          nuevas.push({
            ...r, ticker: canon || r.ticker || r.nombre, broker: ex.broker,
            invertido, valor, permutado,
            sel: true, clase: 'TACTICA', fuente: 'YO',
            entry_date: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_apertura || '') ? r.fecha_apertura : '',
            deCaptura: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_apertura || ''),
            mapear: '', textos,
          })
        }
      }
    }
    const faltantes = positions
      .filter(p => brokersEnCaptura.has(p.broker) && !vistos.has(p.id))
      // cerrar es serio: desmarcado por defecto. Motivo elegible aquí mismo (defecto xSL).
      .map(p => ({ pos: p, sel: false, motivo: 'xSL' }))
    return { updates, nuevas, faltantes, liq }
  }

  // Antes de mandar al borrador: resolver los mapeos manuales (una "alta" que en
  // realidad era una posición existente con otro nombre) y exigir fecha de apertura.
  async function aplicar() {
    const d = diff
    const altas = d.nuevas.filter(n => n.sel && !n.mapear)
    const sinFecha = altas.filter(n => !n.entry_date)
    if (sinFecha.length) {
      setAviso(`Falta la fecha de apertura de: ${sinFecha.map(n => (n.ticker || n.nombre || '?').toUpperCase()).join(', ')}. La captura no la trae, ponla a mano.`)
      return
    }
    const updates = [...d.updates]
    const cerrados = new Set()
    let aprendidos = 0
    for (const n of d.nuevas) {
      if (!n.sel || !n.mapear) continue
      const pos = positions.find(p => String(p.id) === String(n.mapear))
      if (!pos) continue
      updates.push({
        pos, invertido: n.invertido, valor: n.valor, sel: true,
        curado: false, dudosa: false, textos: n.textos, canon: true,
      })
      cerrados.add(pos.id)
      // Aprender el nombre del broker para que la próxima captura lo reconozca sola
      aprendidos += await aprenderAlias(pos.ticker, n.textos) || 0
    }
    // También se aprenden los nombres de lo que se resolvió solo (p.ej. "Micron" → MU).
    // Nunca de las coincidencias laxas: un alias mal aprendido se arrastra para siempre.
    for (const u of updates) {
      if (u.sel && u.canon && !cerrados.has(u.pos.id)) aprendidos += await aprenderAlias(u.pos.ticker, u.textos) || 0
    }
    const faltantes = d.faltantes.filter(f => !cerrados.has(f.pos.id))
    onAplicar({ ...d, updates, nuevas: d.nuevas.filter(n => !n.mapear), faltantes, aprendidos })
    setEstado('idle'); setAviso(null)
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
  // Intercambio manual: la última palabra sobre qué es invertido y qué es valor la tienes tú
  const permutar = (arr, i) => setDiff({ ...d, [arr]: d[arr].map((x, j) =>
    j === i ? { ...x, invertido: x.valor, valor: x.invertido, permutado: !x.permutado, dudosa: false } : x) })
  const setCampo = (arr, i, campo, val) =>
    setDiff({ ...d, [arr]: d[arr].map((x, j) => j === i ? { ...x, [campo]: val } : x) })
  // Candidatas a mapeo: posiciones del mismo broker que no aparecen ya como actualizadas
  const yaVistas = new Set(d.updates.map(u => u.pos.id))
  const candidatas = broker => positions.filter(p => p.broker === broker && !yaVistas.has(p.id))

  return (
    <div className="ingesta card num">
      <div className="diff-head">
        <b>Revisión de capturas</b>
        <label className="diff-pick" title="Si la IA se ha equivocado de broker, corrígelo aquí: se recalcula todo al instante, sin volver a leer las capturas.">
          capturas de
          <select className="diff-sel" value={brokerSel}
            onChange={e => { setBrokerSel(e.target.value); setDiff(construirDiff(crudo, positions, e.target.value)); setAviso(null) }}>
            <option value="">detectado: {[...new Set((crudo || []).map(x => x.broker))].join(' + ') || '—'}</option>
            {BROKERS_UI.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <button className="btn-escape" onClick={() => { setEstado('idle'); setAviso(null) }}>descartar</button>
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
            {u.curado && <span className="warn" title="Lectura corregida por verificación aritmética (invertido + G/P = valor)">✓aritm.</span>}
            {u.permutado && <span className="warn" title="La captura traía invertido y valor intercambiados y se han puesto en su sitio">⇄ corregido</span>}
            <a className="btn-permutar" title="Intercambiar invertido y valor en esta fila"
               onClick={e => { e.preventDefault(); permutar('updates', i) }}>⇄</a>
            {u.dudosa && <span className="down" title="Los importes no cuadran con G/P y no se pudo corregir: revisa a mano">⚠ revisar</span>}
          </label>
        ))}
      </>}

      {d.nuevas.length > 0 && <>
        <h4>Altas propuestas ({d.nuevas.length})</h4>
        {d.nuevas.map((n, i) => (
          <div key={i} className="diff-row diff-alta">
            <label className="diff-pick">
              <input type="checkbox" checked={n.sel} onChange={() => toggle('nuevas', i)} />
              <span className="t">{(n.ticker || n.nombre || '?').toUpperCase()} <i>{n.broker}</i></span>
            </label>
            <span>invertido {fmt$(n.invertido)} · valor {fmt$(n.valor)}</span>
            {n.permutado && <span className="warn" title="La captura traía invertido y valor intercambiados y se han puesto en su sitio">⇄</span>}
            <a className="btn-permutar" title="Intercambiar invertido y valor en esta fila"
               onClick={e => { e.preventDefault(); permutar('nuevas', i) }}>⇄</a>
            {/* Solo en caso de duda: si de ese broker no falta ninguna posición por
                aparecer, el alta no puede ser otra cosa y el selector sobra. */}
            {candidatas(n.broker).length > 0 && (
              <label className="diff-pick" title="Si en realidad ya la tienes en BTP con otro nombre, dilo aquí: se actualiza en vez de duplicarse y BTP aprende cómo la llama este broker.">
                ¿ya la tienes?
                <select className="diff-sel" value={n.mapear}
                  onChange={e => setCampo('nuevas', i, 'mapear', e.target.value)}>
                  <option value="">no, es nueva</option>
                  {candidatas(n.broker).map(p => <option key={p.id} value={p.id}>sí → {p.ticker}</option>)}
                </select>
              </label>
            )}
            {!n.mapear && <>
              <label className={'diff-pick' + (n.sel && !n.entry_date ? ' falta' : '')}
                title="Fecha de apertura de la posición. Si la captura no la trae, hay que ponerla a mano.">
                abierta
                <input type="date" className="diff-sel" max={HOY()} value={n.entry_date}
                  onChange={e => setCampo('nuevas', i, 'entry_date', e.target.value)} />
              </label>
              {n.deCaptura && <span className="ok-cap" title="Fecha leída de la captura">✓cap.</span>}
              <select className="diff-sel" value={n.clase} title="Clasificación de la nueva posición"
                onChange={e => setCampo('nuevas', i, 'clase', e.target.value)}>
                {Object.entries(CLASES_ALTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="diff-sel" value={n.fuente} title="Origen de la idea"
                onChange={e => setCampo('nuevas', i, 'fuente', e.target.value)}>
                {FUENTES_ALTA.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </>}
          </div>
        ))}
      </>}

      {d.faltantes.length > 0 && <>
        <h4>No aparecen en la captura — ¿cerradas? ({d.faltantes.length})</h4>
        {d.faltantes.map((f, i) => (
          <div key={i} className="diff-row">
            <label className="diff-pick">
              <input type="checkbox" checked={f.sel} onChange={() => toggle('faltantes', i)} />
              <span className="t">{f.pos.ticker} <i>{f.pos.broker}</i></span>
            </label>
            <span className="down">cerrar · motivo</span>
            <select className="diff-sel" value={f.motivo} title="Motivo del cierre (viaja al histórico)"
              onChange={e => setCampo('faltantes', i, 'motivo', e.target.value)}>
              {MOTIVOS_CIERRE.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        ))}
      </>}

      {Object.keys(d.liq).length > 0 &&
        <p className="diff-liq">Liquidez detectada: {Object.entries(d.liq).map(([b, v]) => `${b} $${fmt$(v)}`).join(' · ')}</p>}

      {aviso && <p className="auth-err">{aviso}</p>}

      <p className="diff-nota">Nada se escribe en la base de datos hasta que pulses CERRAR SEMANA:
        actualizaciones, altas y cierres quedan en el borrador y se pueden deshacer.
        Lo único que se guarda al aplicar son los nombres aprendidos de cada broker.</p>

      <div className="modal-botones">
        <button className="btn-primario" onClick={aplicar}>
          Aplicar al borrador
        </button>
      </div>
    </div>
  )
}

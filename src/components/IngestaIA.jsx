import { useState } from 'react'
import { extraerAuto } from '../lib/ia'
import { MOTIVOS_CIERRE, motivoPropuesto, fetchCierresDesde, fechaLocalISO } from '../lib/posiciones-db'
import { resolverSimbolo, aprenderAlias, variantes } from '../lib/quotes'
import './ingesta.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Elegibles en la propia pantalla de revisión (spec §8 + motivos de cierre del histórico)
const CLASES_ALTA = { NUCLEO: 'NÚCLEO', MOMENTUM: 'MOMENTUM', TACTICA: 'TÁCTICA', DISRUPTIVA: 'DISRUPT.' }

// % sobre el precio (no sobre el importe): en un CFD x2 el importe se mueve el doble.
const pctLev = (inv, val, lev) => Number(inv) > 0 && val != null && Number.isFinite(Number(val))
  ? (Number(val) / Number(inv) - 1) * 100 / (Number(lev) || 1) : null

// Abiertas de varias capturas: una extracción por broker, sin filas repetidas
// (capturas solapadas al hacer scroll) y con la liquidez que aparezca.
function juntarAbiertas(exs) {
  const por = new Map()
  for (const e of exs) {
    if (!e.broker) continue
    const acc = por.get(e.broker) || { broker: e.broker, liquidez: null, posiciones: [], _k: new Set() }
    if (e.liquidez != null) acc.liquidez = e.liquidez
    for (const r of e.posiciones || []) {
      const k = `${String(r.ticker || r.nombre || '').toUpperCase()}|${r.invertido ?? ''}|${r.valor ?? ''}`
      if (acc._k.has(k)) continue
      acc._k.add(k); acc.posiciones.push(r)
    }
    por.set(e.broker, acc)
  }
  return [...por.values()].map(({ _k, ...x }) => x)
}

const BROKERS_UI = [{ id: 'etoro', label: 'eToro' }, { id: 'xtb', label: 'XTB' }, { id: 'ibkr', label: 'IBKR' }]
const HOY = () => new Date().toISOString().slice(0, 10)

// Ingesta única (24/10/2026): José va echando capturas de cualquier broker y de
// cualquier pantalla (posiciones abiertas o historial de cerradas), en varias tandas;
// cada una se lee por separado y la IA dice qué es. Al revisar se cruza todo: valores,
// altas, cierres REALES del historial (fecha e importe del broker, motivo por SL/TP)
// y lo que falta sin dato de cierre. NUNCA auto-commit: José revisa y acepta.
let SEQ = 0
const PARALELO = 3
const diasAntes = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

export default function IngestaIA({ positions, simbolos = [], onAplicar, desde = null }) {
  const [estado, setEstado] = useState('cola')  // cola | leyendo | diff
  const [cola, setCola] = useState([])          // [{id, file, url, est: pend|leyendo|ok|error, err, res, broker, tipo}]
  const [diff, setDiff] = useState(null)
  const [hist, setHist] = useState([])
  const [aviso, setAviso] = useState(null)

  const conocidas = () => positions.map(p => ({ broker: p.broker, ticker: p.ticker, invertido: Number(p.invested) }))
  // Ventana de cierres "de esta semana": desde 7 días antes del último cierre sellado (o 21 días).
  const desdeCierres = desde ? diasAntes(desde, 7) : diasAntes(fechaLocalISO(), 21)

  function anadir(files) {
    const nuevos = [...(files || [])].filter(f => f.type?.startsWith('image/'))
      .map(f => ({ id: ++SEQ, file: f, url: URL.createObjectURL(f), est: 'pend', err: null, res: null, broker: '', tipo: '' }))
    if (nuevos.length) { setCola(c => [...c, ...nuevos]); setAviso(null) }
  }
  const quitar = id => setCola(c => { const x = c.find(y => y.id === id); if (x) URL.revokeObjectURL(x.url); return c.filter(y => y.id !== id) })
  const setItem = (id, patch) => setCola(c => c.map(x => x.id === id ? { ...x, ...patch } : x))
  // Lo que se usa al cruzar: lo corregido por José manda sobre lo detectado.
  const brokerDe = x => x.broker || x.res?.extracciones?.[0]?.broker || ''
  const tipoDe = x => x.tipo || x.res?.tipo || ''

  async function leerYRevisar() {
    setEstado('leyendo'); setAviso(null)
    const conoc = conocidas()
    let actual = cola
    const pend = actual.filter(x => x.est === 'pend' || x.est === 'error')
    let i = 0
    async function trabajador() {
      while (i < pend.length) {
        const it = pend[i++]
        setItem(it.id, { est: 'leyendo', err: null })
        try {
          const res = await extraerAuto(it.file, conoc)
          actual = actual.map(x => x.id === it.id ? { ...x, est: 'ok', res } : x)
          setItem(it.id, { est: 'ok', res })
        } catch (e) {
          actual = actual.map(x => x.id === it.id ? { ...x, est: 'error', err: String(e.message || e) } : x)
          setItem(it.id, { est: 'error', err: String(e.message || e) })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALELO, pend.length) }, trabajador))
    const fallos = actual.filter(x => x.est === 'error')
    if (fallos.length) { setEstado('cola'); setAviso(`${fallos.length} captura(s) no se pudieron leer: reintenta o quítalas.`); return }
    await revisar(actual)
  }

  async function revisar(items = cola) {
    let h = hist
    try { h = await fetchCierresDesde(diasAntes(desdeCierres, 120)); setHist(h) } catch { /* sin histórico: no se deduplica */ }
    setDiff(construirDiff(items, positions, h))
    setEstado('diff')
  }

  // `override`: broker forzado por José. La deducción de la IA falla (xStation con tema
  // claro se confunde con IBKR) y un broker mal puesto no casa ninguna posición: propone
  // altas de todo y cierres de todo lo del otro broker. Por eso es corregible aquí mismo,
  // sin volver a pasar las capturas por la IA.
  function construirDiff(items, positions, hist) {
    const updates = [], nuevas = [], liq = {}
    const vistos = new Set()
    // Cada captura con su broker (el corregido por José, si lo hay). Las abiertas de un mismo
    // broker se juntan y se quitan las filas repetidas (capturas solapadas al hacer scroll).
    const deTipo = t => items.filter(x => x.est === 'ok' && tipoDe(x) === t)
      .flatMap(x => (x.res.extracciones || []).map(e => ({ ...e, broker: x.broker || e.broker })))
    const extracciones = juntarAbiertas(deTipo('abiertas'))
    const brokersEnCaptura = new Set(extracciones.map(x => x.broker))
    for (const ex of extracciones) {
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
        // Mismo ticker varias veces en el mismo broker (BTC en XTB: Táctica y Combo MA200, 01/10/2026):
        // cada lote va a la posición aún no vista con el invertido más cercano.
        const mismos = positions.filter(p => p.broker === ex.broker && p.ticker.toUpperCase() === t && !vistos.has(p.id))
        const cerca = p => r.invertido == null ? 0 : Math.abs(Number(p.invested) - r.invertido)
        // Varios lotes del mismo valor y la captura los trae AGRUPADOS en una sola fila
        // (XTB enseña "Micron" con el total si no se despliega, 04/10/2026): el invertido
        // leído es la suma de los lotes. Cada lote conserva su invertido y el valor se
        // reparte por acciones (invertido / precio de entrada; sin precio, por invertido).
        if (mismos.length > 1) {
          const suma = mismos.reduce((a, p) => a + Number(p.invested), 0)
          const esSuma = x => x != null && Math.abs(x - suma) <= Math.max(1, suma * 0.005)
          const algunLote = x => x != null && mismos.some(p => Math.abs(Number(p.invested) - x) < 0.01)
          let { invertido: invR, valor: valR } = r
          if (!esSuma(invR) && esSuma(valR) && !algunLote(invR)) { const tmp = invR; invR = valR; valR = tmp }
          if (esSuma(invR) && !algunLote(invR)) {
            const acc = p => Number(p.entry_price) > 0 ? Number(p.invested) / Number(p.entry_price) : Number(p.invested)
            const tot = mismos.reduce((a, p) => a + acc(p), 0)
            let resto = valR
            mismos.forEach((p, i) => {
              vistos.add(p.id)
              let v = null
              if (valR != null) {
                v = i === mismos.length - 1 ? Math.round(resto * 100) / 100 : Math.round(valR * acc(p) / tot * 100) / 100
                resto -= v
              }
              updates.push({ pos: p, invertido: Number(p.invested), valor: v, sel: true, curado: false, permutado: false, dudosa: false, textos, canon: !!canon, repartido: mismos.length })
            })
            continue
          }
        }
        const pos = (mismos.length > 1 ? [...mismos].sort((x, y) => cerca(x) - cerca(y))[0] : mismos[0])
          || positions.find(p => p.broker === ex.broker && p.ticker.toUpperCase() === t)
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
          // Nombre no reconocido (p. ej. "XRP" leído donde ponía RR.L, 01/10/2026): si en el mismo
          // broker hay una posición aún no vista con el MISMO invertido al céntimo, casi seguro es
          // ella; se propone el mapeo ya elegido y el nombre leído NO se aprende como alias.
          const porImporte = invertido != null && positions.find(p => p.broker === ex.broker && !vistos.has(p.id)
            && !nuevas.some(n => n.mapear === String(p.id)) && Math.abs(Number(p.invested) - invertido) < 0.01)
          nuevas.push({
            ...r, ticker: canon || r.ticker || r.nombre, broker: ex.broker,
            invertido, valor, permutado,
            sel: true, clase: 'TACTICA', fuente: 'YO',
            mapearAuto: porImporte ? String(porImporte.id) : '',
            entry_date: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_apertura || '') ? r.fecha_apertura : '',
            deCaptura: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha_apertura || ''),
            mapear: porImporte ? String(porImporte.id) : '', textos,
          })
        }
      }
    }
    const cierres = cruzarCierres(deTipo('cerradas'), positions, hist, vistos)
    const faltantes = positions
      .filter(p => brokersEnCaptura.has(p.broker) && !vistos.has(p.id))
      // Sin dato de cierre: desmarcado por defecto (se cerraría con el valor de la última captura).
      .map(p => ({ pos: p, sel: false, motivo: motivoPropuesto(p, pctLev(p.invested, p.current_value, p.apalancamiento)) || 'xSL' }))
    return { updates, nuevas, faltantes, cierres, liq }
  }

  // Cierres leídos del historial del broker → posición abierta que cierran, motivo por SL/TP,
  // y fuera lo que ya está en el histórico de BTP o es antiguo (el historial enseña meses).
  function cruzarCierres(extracciones, positions, hist, vistos) {
    const filas = [], claves = new Set(), usados = new Set()
    for (const ex of extracciones) {
      for (const c of ex.cierres || []) {
        const broker = ex.broker
        const textos = [c.ticker, c.nombre].filter(Boolean)
        const canon = resolverSimbolo(textos, simbolos)
        const t = (canon || c.ticker || c.nombre || '?').toUpperCase()
        const vars = new Set(textos.flatMap(variantes))
        const invertido = c.invertido ?? (c.valor_cierre != null && c.gp != null ? c.valor_cierre - c.gp : null)
        const valorCierre = c.valor_cierre ?? (c.invertido != null && c.gp != null ? c.invertido + c.gp : null)
        const fecha = /^\d{4}-\d{2}-\d{2}$/.test(c.fecha_cierre || '') ? c.fecha_cierre : ''
        const clave = `${broker}|${t}|${fecha}|${invertido == null ? '' : Math.round(invertido)}`
        if (claves.has(clave)) continue  // la misma fila en dos capturas solapadas
        claves.add(clave)
        const mismoTicker = tk => { const u = String(tk || '').toUpperCase(); return u === t || vars.has(u) }
        const casa = tol => h => h.broker === broker && mismoTicker(h.ticker) && (!fecha || h.closed_date === fecha) &&
          (invertido == null || Math.abs(Number(h.invested) - invertido) <= Math.max(1, Math.abs(invertido) * tol))
        const ya = hist.some(casa(0.005))
        // Posición abierta que cierra: mismo broker y ticker; si hay varias (lotes), la de invertido más cercano.
        const cerca = p => invertido == null ? 0 : Math.abs(Number(p.invested) - invertido)
        let pos = ya ? null : positions.filter(p => p.broker === broker && !usados.has(p.id) && mismoTicker(p.ticker))
          .sort((x, y) => cerca(x) - cerca(y))[0] || null
        let porImporte = false
        if (!pos && !ya && invertido != null) {
          // Nombre no reconocido: una abierta del mismo broker que no salga en la captura, con el mismo invertido (±0,5 %).
          pos = positions.find(p => p.broker === broker && !usados.has(p.id) && !vistos.has(p.id) &&
            Math.abs(Number(p.invested) - invertido) <= Math.max(0.5, Math.abs(invertido) * 0.005)) || null
          porImporte = !!pos
        }
        if (pos) usados.add(pos.id)
        const lev = Number(c.apalancamiento) || Number(pos?.apalancamiento) || 1
        const pct = pctLev(invertido, valorCierre, lev)
        const reciente = !fecha || fecha >= desdeCierres
        const dudosa = c.gp != null && invertido != null && valorCierre != null && Math.abs(invertido + c.gp - valorCierre) > 0.05
        filas.push({
          sel: !ya && (reciente || !!pos), ya, reciente, dudosa, porImporte,
          ticker: pos ? pos.ticker : t, broker, textos,
          invertido, valorCierre, fecha_cierre: fecha,
          entry_date: /^\d{4}-\d{2}-\d{2}$/.test(c.fecha_apertura || '') ? c.fecha_apertura : (pos?.entry_date || null),
          apalancamiento: lev,
          pct: invertido > 0 && valorCierre != null ? (valorCierre / invertido - 1) * 100 : null,
          motivo: motivoPropuesto(pos, pct) || 'manual',
          mapear: pos ? String(pos.id) : '',
        })
      }
    }
    // Primero lo que hay que decidir; lo ya registrado o antiguo, al final.
    return filas.sort((a, b) => (a.ya || !a.reciente) - (b.ya || !b.reciente) || String(b.fecha_cierre).localeCompare(String(a.fecha_cierre)))
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
      // Aprender el nombre del broker para que la próxima captura lo reconozca sola.
      // Nunca de un mapeo propuesto solo por importe: el nombre leído puede ser un error de lectura.
      if (n.mapear !== n.mapearAuto) aprendidos += await aprenderAlias(pos.ticker, n.textos) || 0
    }
    // También se aprenden los nombres de lo que se resolvió solo (p.ej. "Micron" → MU).
    // Nunca de las coincidencias laxas: un alias mal aprendido se arrastra para siempre.
    for (const u of updates) {
      if (u.sel && u.canon && !cerrados.has(u.pos.id)) aprendidos += await aprenderAlias(u.pos.ticker, u.textos) || 0
    }
    // Cierres del historial aceptados: con su posición abierta (si la hay) y los datos reales.
    const cierres = d.cierres.filter(c => c.sel && !c.ya).map(c => {
      const pos = c.mapear ? positions.find(p => String(p.id) === String(c.mapear)) || null : null
      return {
        pos, motivo: c.motivo,
        real: {
          ticker: pos ? pos.ticker : c.ticker, broker: c.broker,
          entry_date: c.entry_date || pos?.entry_date || null,
          closed_date: c.fecha_cierre || fechaLocalISO(),
          invested: c.invertido ?? pos?.invested, closed_value: c.valorCierre,
          apalancamiento: c.apalancamiento || 1,
        },
      }
    })
    const sinDatos = cierres.filter(c => c.real.invested == null || c.real.closed_value == null)
    if (sinDatos.length) {
      setAviso(`Cierre sin importes legibles: ${sinDatos.map(c => c.real.ticker).join(', ')}. Desmárcalo o vuelve a pasar la captura.`)
      return
    }
    const cubiertas = new Set(cierres.filter(c => c.pos).map(c => c.pos.id))
    const faltantes = d.faltantes.filter(f => !cerrados.has(f.pos.id) && !cubiertas.has(f.pos.id))
    onAplicar({ ...d, updates, nuevas: d.nuevas.filter(n => !n.mapear), faltantes, cierres, aprendidos })
    cola.forEach(x => URL.revokeObjectURL(x.url))
    setCola([]); setDiff(null); setEstado('cola'); setAviso(null)
  }

  if (estado === 'cola' || estado === 'leyendo') {
    const leyendo = estado === 'leyendo'
    const nPend = cola.filter(x => x.est !== 'ok').length
    return (
      <div className="ingesta card">
        <label className="dropzone"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (!leyendo) anadir(e.dataTransfer.files) }}>
          <input type="file" accept="image/*" multiple hidden disabled={leyendo}
                 onChange={e => { anadir(e.target.files); e.target.value = '' }} />
          <b>{cola.length ? 'Añade más capturas' : 'Arrastra aquí las capturas de tus brokers'}</b>
          <span>(o toca para elegirlas) · eToro / XTB / IBKR · posiciones abiertas e historial de cerradas, en las tandas que quieras</span>
        </label>
        {cola.length > 0 && <div className="cola-capturas">
          {cola.map(x => (
            <div key={x.id} className={'cap-item est-' + x.est}>
              <img src={x.url} alt="" />
              <div className="cap-info">
                <span className="cap-est">{{ pend: 'pendiente', leyendo: 'leyendo…', ok: '✓ leída', error: '✗ error' }[x.est]}</span>
                {x.est === 'ok' && <>
                  <select className="diff-sel" value={tipoDe(x)} title="Qué pantalla es (corrígelo si la IA se equivoca)"
                    onChange={e => setItem(x.id, { tipo: e.target.value })}>
                    <option value="abiertas">abiertas</option>
                    <option value="cerradas">historial</option>
                  </select>
                  <select className="diff-sel" value={brokerDe(x)} title="Broker (corrígelo si la IA se equivoca)"
                    onChange={e => setItem(x.id, { broker: e.target.value })}>
                    {BROKERS_UI.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                  <span className="cap-n">{(x.res.extracciones || []).reduce((a, e) => a + (e.posiciones || e.cierres || []).length, 0)} filas</span>
                </>}
                {x.err && <span className="auth-err" title={x.err}>{x.err.slice(0, 60)}</span>}
              </div>
              {!leyendo && <button className="btn-escape" title="Quitar" onClick={() => quitar(x.id)}>✕</button>}
            </div>
          ))}
        </div>}
        {aviso && <p className="auth-err">{aviso}</p>}
        {cola.length > 0 && <div className="modal-botones">
          {nPend > 0
            ? <button className="btn-primario" disabled={leyendo} onClick={leerYRevisar}>
                {leyendo ? 'Leyendo capturas…' : `Leer ${nPend === cola.length ? 'todas' : 'las pendientes'} (${nPend}) y revisar`}</button>
            : <button className="btn-primario" onClick={() => revisar()}>Revisar</button>}
          {!leyendo && <button className="btn-escape" onClick={() => { cola.forEach(x => URL.revokeObjectURL(x.url)); setCola([]); setAviso(null) }}>vaciar</button>}
        </div>}
      </div>
    )
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
  // Una faltante deja de serlo si un alta se mapea a ella o un cierre del historial la cierra.
  const cubierta = f => d.nuevas.some(n => n.sel && n.mapear === String(f.pos.id)) ||
    d.cierres.some(c => c.sel && !c.ya && c.mapear === String(f.pos.id))

  return (
    <div className="ingesta card num">
      <div className="diff-head">
        <b>Revisión de capturas</b>
        <button className="btn-sec" title="Volver a las capturas para añadir más o corregir broker/tipo; lo leído no se vuelve a leer"
          onClick={() => { setEstado('cola'); setAviso(null) }}>← capturas ({cola.length})</button>
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
            <a className="btn-permutar" title="Intercambiar invertido y valor en esta fila"
               onClick={e => { e.preventDefault(); permutar('updates', i) }}>⇄</a>
            {u.repartido && <span className="warn" title="La captura traía todos los lotes de este valor juntos: el valor se ha repartido entre ellos por número de acciones">lote · reparto de {u.repartido}</span>}
            {u.dudosa && <span className="down" title="Los importes de esta fila no cuadran con lo que hay en BTP y no se puede decidir solo: compruébalos en la captura">⚠ revisar</span>}
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
                {n.mapear && n.mapear === n.mapearAuto && <span className="warn" title="Nombre no reconocido, pero el invertido coincide al céntimo con esta posición: casi seguro es una lectura errónea del ticker."> mismo invertido</span>}
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
            </>}
          </div>
        ))}
      </>}

      {d.cierres.length > 0 && (() => {
        const vivos = d.cierres.map((c, i) => [c, i]).filter(([c]) => !c.ya && c.reciente)
        const resto = d.cierres.map((c, i) => [c, i]).filter(([c]) => c.ya || !c.reciente)
        const fila = ([c, i]) => (
          <div key={i} className={'diff-row' + (c.ya ? ' apagada' : '')}>
            <label className="diff-pick">
              <input type="checkbox" checked={c.sel} disabled={c.ya} onChange={() => toggle('cierres', i)} />
              <span className="t">{c.ticker} <i>{c.broker}</i></span>
            </label>
            <span>{c.fecha_cierre ? c.fecha_cierre.slice(2).split('-').reverse().join('/') : <b className="down">sin fecha</b>}</span>
            <span>{fmt$(c.invertido)} → <b>{fmt$(c.valorCierre)}</b>
              {c.pct != null && <b className={c.pct >= 0 ? 'up' : 'down'}> {c.pct >= 0 ? '+' : ''}{c.pct.toFixed(1)} %</b>}</span>
            {c.ya ? <span className="warn">ya en el histórico</span> : <>
              <select className="diff-sel" value={c.motivo} title="Motivo del cierre: propuesto comparando la salida con el SL/TP de la posición"
                onChange={e => setCampo('cierres', i, 'motivo', e.target.value)}>
                {MOTIVOS_CIERRE.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <label className="diff-pick" title="Posición abierta de BTP que cierra. 'Solo histórico' = no estaba en BTP (abierta y cerrada entre cierres).">
                cierra
                <select className="diff-sel" value={c.mapear} onChange={e => setCampo('cierres', i, 'mapear', e.target.value)}>
                  <option value="">solo histórico</option>
                  {positions.filter(p => p.broker === c.broker).map(p => <option key={p.id} value={p.id}>{p.ticker} · {fmt$(p.invested)}</option>)}
                </select>
              </label>
              {c.porImporte && c.mapear && <span className="warn" title="El nombre no se reconoce, pero el invertido coincide con esta posición">mismo invertido</span>}
              {c.mapear && (() => { const p = positions.find(x => String(x.id) === c.mapear); return p && c.invertido != null && c.invertido < Number(p.invested) * 0.995
                ? <span className="warn" title="Se cierra menos de lo invertido: la posición se reduce, no se borra">parcial</span> : null })()}
              {!c.reciente && <span className="warn">antiguo</span>}
              {c.dudosa && <span className="down" title="Invertido + G/P no cuadra con el valor de cierre: compruébalo en la captura">⚠ revisar</span>}
            </>}
          </div>
        )
        return <>
          <h4>Cierres del historial ({vivos.length})</h4>
          {vivos.map(fila)}
          {!vivos.length && <p className="diff-nota">Ningún cierre nuevo en el historial.</p>}
          {resto.length > 0 && <details className="diff-mas">
            <summary>{resto.length} ya registrados o anteriores a {desdeCierres.slice(2).split('-').reverse().join('/')}</summary>
            {resto.map(fila)}
          </details>}
        </>
      })()}

      {d.faltantes.some(f => !cubierta(f)) && <>
        <h4>No aparecen en la captura ni en el historial — sin dato de cierre ({d.faltantes.filter(f => !cubierta(f)).length})</h4>
        {d.faltantes.map((f, i) => cubierta(f) ? null : (
          <div key={i} className="diff-row">
            <label className="diff-pick">
              <input type="checkbox" checked={f.sel} onChange={() => toggle('faltantes', i)} />
              <span className="t">{f.pos.ticker} <i>{f.pos.broker}</i></span>
            </label>
            <span className="down" title="Se cerraría con el valor de la última captura: mejor pasar el historial del broker">cerrar con el último valor · motivo</span>
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

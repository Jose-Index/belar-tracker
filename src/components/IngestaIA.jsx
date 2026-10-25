import { useState, useEffect } from 'react'
import { extraerAuto } from '../lib/ia'
import { MOTIVOS_CIERRE, motivoPropuesto, fetchCierresDesde, fechaLocalISO, corregirFechaCierre } from '../lib/posiciones-db'
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
    const acc = por.get(e.broker) || { broker: e.broker, liquidez: null, total_cuenta: null, posiciones: [], _k: new Set() }
    if (e.liquidez != null) acc.liquidez = e.liquidez
    if (e.total_cuenta != null) acc.total_cuenta = e.total_cuenta
    for (const r of e.posiciones || []) {
      // Misma fila en dos capturas: mismo ticker e invertido (el valor puede variar unos céntimos entre capturas).
      const k = `${String(r.ticker || r.nombre || '').toUpperCase()}|${r.invertido ?? r.valor ?? ''}`
      if (acc._k.has(k)) continue
      acc._k.add(k); acc.posiciones.push(r)
    }
    por.set(e.broker, acc)
  }
  // Fila agrupada + lotes desplegados del mismo valor (XTB, 24/10/2026: una captura con "BTC" total y otra con
  // sus dos lotes): la agrupada sobra si su invertido es la suma de los demás; los lotes mandan.
  for (const acc of por.values()) {
    const grupos = new Map()
    for (const r of acc.posiciones) {
      const t = String(r.ticker || r.nombre || '').toUpperCase()
      grupos.set(t, [...(grupos.get(t) || []), r])
    }
    const fuera = new Set()
    for (const filas of grupos.values()) {
      if (filas.length < 3) continue
      for (const r of filas) {
        const resto = filas.filter(x => x !== r && !fuera.has(x))
        const suma = resto.reduce((a, x) => a + (Number(x.invertido) || 0), 0)
        const sumaV = resto.reduce((a, x) => a + (Number(x.valor) || 0), 0)
        const igual = (x, y) => x != null && y > 0 && Math.abs(Number(x) - y) <= Math.max(1, y * 0.005)
        // La agrupada se reconoce por su invertido = suma de invertidos o, si la IA la leyó mal (25/10/2026:
        // "BTC" con el valor total puesto como invertido), por cualquiera de sus importes = suma de valores.
        if (resto.length >= 2 && (igual(r.invertido, suma) || igual(r.valor, sumaV) || igual(r.invertido, sumaV))) fuera.add(r)
      }
    }
    acc.posiciones = acc.posiciones.filter(r => !fuera.has(r))
  }
  return [...por.values()].map(({ _k, ...x }) => x)
}

// Fecha leída con el año mal (24/10/2026: "2024" donde ponía 2026): si cae fuera de [desde, hoy], se prueba
// el mismo día y mes en este año y en el anterior.
function arreglarAnio(f, desde, hoy) {
  if (!f || (f >= desde && f <= hoy)) return f
  const y = Number(hoy.slice(0, 4))
  for (const a of [y, y - 1]) { const g = a + f.slice(4); if (g >= desde && g <= hoy) return g }
  return f
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

export default function IngestaIA({ positions, simbolos = [], onAplicar, desde = null, liquidez = {} }) {
  const [estado, setEstado] = useState('cola')  // cola | leyendo | diff
  const [cola, setCola] = useState([])          // [{id, file, url, est: pend|leyendo|ok|error, err, res, broker, tipo}]
  const [diff, setDiff] = useState(null)
  const [hist, setHist] = useState([])
  const [aviso, setAviso] = useState(null)
  const [arrastre, setArrastre] = useState(false)
  // Una captura soltada fuera de la tarjeta haría que el navegador abriera la imagen y se perdiera la cola.
  useEffect(() => {
    const parar = e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault() }
    window.addEventListener('dragover', parar); window.addEventListener('drop', parar)
    return () => { window.removeEventListener('dragover', parar); window.removeEventListener('drop', parar) }
  }, [])

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
    // Divisas de las filas (IBKR da BAMNB en EUR, 25/10/2026: se sumaba como si fueran dólares).
    const monedas = new Set(items.filter(x => x.est === 'ok').flatMap(x => (x.res.extracciones || [])
      .flatMap(e => e.posiciones || []).map(r => String(r.moneda || 'USD'))).filter(m => m && m.toUpperCase() !== 'USD'))
    const fx = { USD: 1 }
    if (monedas.size) {
      const base = [...new Set([...monedas].map(m => m === 'GBp' || m === 'GBX' ? 'GBP' : m.toUpperCase()))]
      try {
        const r = await fetch('/api/quotes?symbols=' + base.map(m => encodeURIComponent(m + 'USD=X')).join(',')).then(x => x.json())
        for (const q of r.quotes || []) if (q.price > 0) fx[q.symbol.replace('USD=X', '')] = q.price
        if (fx.GBP) { fx.GBp = fx.GBP / 100; fx.GBX = fx.GBP / 100 }
      } catch { /* sin cambio: esas filas se marcan para revisar */ }
    }
    setDiff(construirDiff(items, positions, h, fx))
    setEstado('diff')
  }

  // `override`: broker forzado por José. La deducción de la IA falla (xStation con tema
  // claro se confunde con IBKR) y un broker mal puesto no casa ninguna posición: propone
  // altas de todo y cierres de todo lo del otro broker. Por eso es corregible aquí mismo,
  // sin volver a pasar las capturas por la IA.
  function construirDiff(items, positions, hist, fx = { USD: 1 }) {
    const updates = [], nuevas = [], liq = {}, totales = {}, sinLiq = []
    const vistos = new Set()
    // Cada captura con su broker (el corregido por José, si lo hay). Las abiertas de un mismo
    // broker se juntan y se quitan las filas repetidas (capturas solapadas al hacer scroll).
    const deTipo = t => items.filter(x => x.est === 'ok' && tipoDe(x) === t)
      .flatMap(x => (x.res.extracciones || []).map(e => ({ ...e, broker: x.broker || e.broker })))
    const extracciones = juntarAbiertas(deTipo('abiertas'))
    const brokersEnCaptura = new Set(extracciones.map(x => x.broker))
    for (const ex of extracciones) {
      if (ex.liquidez != null) liq[ex.broker] = ex.liquidez
      else sinLiq.push(ex.broker)
      if (ex.total_cuenta != null && Number.isFinite(Number(ex.total_cuenta))) totales[ex.broker] = Number(ex.total_cuenta)
      for (const r0 of ex.posiciones || []) {
        // Fila en otra divisa: a USD antes de nada (BTP guarda todo en dólares).
        const mon = String(r0.moneda || 'USD')
        const k = mon.toUpperCase() === 'USD' ? 1 : fx[mon] ?? fx[mon.toUpperCase()] ?? null
        const aUsd = v => v == null || k == null ? v : Math.round(Number(v) * k * 100) / 100
        const r = k === 1 ? r0 : { ...r0, invertido: aUsd(r0.invertido), valor: aUsd(r0.valor), gp: aUsd(r0.gp),
          divisa: { moneda: mon, fx: k, invertido: r0.invertido, valor: r0.valor } }
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
          || positions.find(p => p.broker === ex.broker && p.ticker.toUpperCase() === t && !vistos.has(p.id))
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
        // Tres lecturas para un mismo importe (25/10/2026: MATX "655,53" donde ponía 555,53; BTC de eToro con
        // el "P/L Diario" como G/P): valor leído, invertido + G/P e invertido × (1 + G/P %). Manda la pareja que cuadra.
        const esCopy = simbolos.find(x => x.ticker.toUpperCase() === t)?.asset_type === 'copy'
        // Solo se corrige el valor si se aparta >1 % del invertido de las otras dos lecturas, que coinciden entre sí
        // (un dígito mal leído). Copy traders fuera: su "Valor Neto" incluye efectivo y comisiones (no es inv + G/P).
        const pctF = Number(r.gp_pct)
        if (!esCopy && invertido > 0 && r.gp_pct != null && Number.isFinite(pctF)) {
          const vP = invertido * (1 + pctF / 100), tol = Math.max(0.5, invertido * 0.003)
          const vG = gp != null ? invertido + gp : null
          if (valor == null) { valor = Math.round((vG ?? vP) * 100) / 100; curado = true }
          else if (Math.abs(valor - vP) > invertido * 0.01 && vG != null && Math.abs(vG - vP) <= tol) { valor = Math.round(vG * 100) / 100; curado = true }
        }
        // Reconciliación tolerante al signo del G/P: solo sirve para marcar dudas.
        const reconcilia = gp == null || invertido == null || valor == null ||
          Math.abs(invertido + gp - valor) <= 0.05 || Math.abs(invertido - gp - valor) <= 0.05

        if (pos && vistos.has(pos.id)) continue  // nunca dos actualizaciones para la misma posición
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
          if (r.divisa && r.divisa.fx == null) dudosa = true
          updates.push({ pos, invertido, valor, sel: true, curado, permutado, dudosa, textos, canon: !!canon, divisa: r.divisa || null })
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
            invertido, valor, permutado, divisa: r.divisa || null,
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
    return { updates, nuevas, faltantes, cierres, liq, totales, sinLiq: [...new Set(sinLiq)].filter(b => liq[b] == null) }
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
        let valorCierre = c.valor_cierre ?? (c.invertido != null && c.gp != null ? c.invertido + c.gp : null)
        // El % de la fila (columna del broker) desempata una cifra mal leída (24/10/2026: SSL +194,40 leído 154,40):
        // si invertido × (1 + %) no cuadra con el valor leído, manda el %.
        const pctB = Number(c.gp_pct)
        let corregidoPct = false
        if (invertido > 0 && Number.isFinite(pctB) && c.gp_pct != null) {
          const vPct = Math.round(invertido * (1 + pctB / 100) * 100) / 100
          if (valorCierre == null || Math.abs(vPct - valorCierre) > Math.max(0.3, invertido * 0.0008)) { valorCierre = vPct; corregidoPct = true }
        }
        const esFecha = x => /^\d{4}-\d{2}-\d{2}$/.test(x || '')
        let fecha = esFecha(c.fecha_cierre) ? c.fecha_cierre : ''
        let fApert = esFecha(c.fecha_apertura) ? c.fecha_apertura : ''
        // Fechas cruzadas (la IA tomó la de apertura por la de cierre, 24/10/2026): el cierre es la posterior.
        if (fecha && fApert && fecha < fApert) { const tmp = fecha; fecha = fApert; fApert = tmp }
        const hoy = fechaLocalISO()
        fecha = arreglarAnio(fecha, diasAntes(hoy, 400), hoy)
        if (fApert) fApert = arreglarAnio(fApert, diasAntes(hoy, 3650), fecha || hoy)
        const clave = `${broker}|${t}|${fecha}|${invertido == null ? '' : Math.round(invertido)}`
        if (claves.has(clave)) continue  // la misma fila en dos capturas solapadas
        claves.add(clave)
        const mismoTicker = tk => { const u = String(tk || '').toUpperCase(); return u === t || vars.has(u) }
        const casa = tol => h => h.broker === broker && mismoTicker(h.ticker) && (!fecha || h.closed_date === fecha) &&
          (invertido == null || Math.abs(Number(h.invested) - invertido) <= Math.max(1, Math.abs(invertido) * tol))
        let ya = hist.some(casa(0.005)) || (invertido != null && hist.some(h => h.broker !== broker && mismoTicker(h.ticker) &&
          !!fecha && h.closed_date === fecha && Math.abs(Number(h.invested) - invertido) <= Math.max(1, Math.abs(invertido) * 0.005)))
        // Ya sellado pero con OTRA fecha (mismo broker, ticker, invertido y valor de cierre): no es un cierre nuevo,
        // es el mismo con la fecha mal guardada. Se marca como ya registrado y se propone corregir la fecha.
        let corrige = null
        if (!ya && fecha && invertido != null && valorCierre != null) {
          const h = hist.find(h => h.broker === broker && mismoTicker(h.ticker) && h.closed_date !== fecha &&
            Math.abs(Number(h.invested) - invertido) <= Math.max(1, Math.abs(invertido) * 0.005) &&
            Math.abs(Number(h.closed_value) - valorCierre) <= Math.max(1, Math.abs(valorCierre) * 0.01))
          if (h) { ya = true; corrige = { id: h.id, de: h.closed_date, a: fecha, sel: true } }
        }
        // Posición abierta que cierra: mismo broker y ticker; si hay varias (lotes), la de invertido más cercano.
        const cerca = p => invertido == null ? 0 : Math.abs(Number(p.invested) - invertido)
        let pos = ya ? null : positions.filter(p => p.broker === broker && !usados.has(p.id) && mismoTicker(p.ticker))
          .sort((x, y) => cerca(x) - cerca(y))[0] || null
        // Broker mal leído (historial recortado de eToro leído como XTB, 24/10/2026): si en el broker leído no
        // está, pero en otro hay una abierta con el mismo ticker y el mismo invertido (±0,5 %), es esa.
        let brokerCorregido = false
        if (!pos && !ya && invertido != null) {
          pos = positions.find(p => p.broker !== broker && !usados.has(p.id) && mismoTicker(p.ticker) &&
            Math.abs(Number(p.invested) - invertido) <= Math.max(0.5, Math.abs(invertido) * 0.005)) || null
          brokerCorregido = !!pos
        }
        let porImporte = false
        if (!pos && !ya && invertido != null) {
          // Nombre no reconocido: una abierta del mismo broker que no salga en la captura, con el mismo invertido (±0,5 %).
          pos = positions.find(p => p.broker === broker && !usados.has(p.id) && !vistos.has(p.id) &&
            Math.abs(Number(p.invested) - invertido) <= Math.max(0.5, Math.abs(invertido) * 0.005)) || null
          porImporte = !!pos
        }
        if (pos) usados.add(pos.id)
        const brokerF = pos ? pos.broker : broker
        const lev = Number(c.apalancamiento) || Number(pos?.apalancamiento) || 1
        // % de precio: de los precios de la fila si vienen (sin divisa ni apalancamiento); si no, del importe ÷ apalancamiento.
        const pa = Number(c.precio_apertura), pc = Number(c.precio_cierre)
        const pct = pa > 0 && pc > 0 ? (pc / pa - 1) * 100 : pctLev(invertido, valorCierre, lev)
        // El distintivo SL/TP del broker manda sobre la deducción por precio.
        const mb = String(c.motivo_broker || '').toUpperCase()
        const motivoB = mb === 'TP' ? 'xTP' : mb === 'SL' ? 'xSL' : null
        const reciente = !fecha || fecha >= desdeCierres
        // Dudosa: importes que no cuadran, o una fecha de cierre anterior a la apertura de la posición que cierra.
        const dudosa = (c.gp != null && invertido != null && valorCierre != null && Math.abs(invertido + c.gp - valorCierre) > 0.05) ||
          (!!pos && !!fecha && !!pos.entry_date && fecha < pos.entry_date)
        // Fecha de cierre imposible (24/10/2026: RR.L sellada con la de apertura, 24/08): sin fecha, anterior a la
        // apertura, igual a la apertura leída, o una posición que seguía abierta en el último cierre y "cerró" antes.
        // Bloquea el aplicar hasta que José la corrija o la confirme en el selector de fecha.
        const fechaDudosa = !fecha || (!!fApert && fecha === fApert) ||
          (!!pos && !!pos.entry_date && fecha <= pos.entry_date && pos.entry_date < diasAntes(hoy, 2)) ||
          (!!pos && !!desde && fecha < diasAntes(desde, 1))
        filas.push({
          sel: !ya && (reciente || !!pos), ya, reciente, dudosa: dudosa && !corregidoPct, porImporte, brokerCorregido, motivoB, corregidoPct,
          fechaDudosa, fechaEditada: false, corrige,
          ticker: pos ? pos.ticker : t, broker: brokerF, textos,
          invertido, valorCierre, fecha_cierre: fecha,
          entry_date: fApert || pos?.entry_date || null,
          apalancamiento: lev,
          pct: invertido > 0 && valorCierre != null ? (valorCierre / invertido - 1) * 100 : null,
          motivo: motivoB || motivoPropuesto(pos, pct) || 'manual',
          mapear: pos ? String(pos.id) : '',
        })
      }
    }
    // Primero lo que hay que decidir; lo ya registrado o antiguo, al final.
    const abajo = f => (f.ya && !f.corrige) || (!f.ya && !f.reciente && !f.mapear)
    return filas.sort((a, b) => abajo(a) - abajo(b) || String(b.fecha_cierre).localeCompare(String(a.fecha_cierre)))
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
    // Fechas mal selladas en el histórico: se corrigen ya (no dependen del borrador ni del cierre de semana).
    for (const c of d.cierres) if (c.corrige?.sel && c.corrige.a) {
      try { await corregirFechaCierre(c.corrige.id, c.corrige.a) } catch (e) { setAviso(`No se pudo corregir la fecha de ${c.ticker}: ${e.message || e}`); return }
    }
    const fechasMal = d.cierres.filter(c => c.sel && !c.ya && c.fechaDudosa && !c.fechaEditada)
    if (fechasMal.length) {
      setAviso(`Fecha de cierre dudosa en: ${fechasMal.map(c => c.ticker).join(', ')}. Corrígela (o confírmala) en el selector de fecha de la fila.`)
      return
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

  // Toda la tarjeta acepta capturas (25/10/2026): con la cola llena, lo natural es soltar la siguiente sobre
  // la lista, no sobre el recuadro de arriba. En la revisión, soltar añade a la cola y vuelve a ella.
  const zona = {
    onDragOver: e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); if (!arrastre) setArrastre(true) } },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastre(false) },
    onDrop: e => {
      e.preventDefault(); setArrastre(false)
      if (estado === 'leyendo') return
      anadir(e.dataTransfer.files)
      if (estado === 'diff') { setEstado('cola'); setAviso(null) }
    },
  }

  if (estado === 'cola' || estado === 'leyendo') {
    const leyendo = estado === 'leyendo'
    const nPend = cola.filter(x => x.est !== 'ok').length
    return (
      <div className={'ingesta card' + (arrastre ? ' arrastrando' : '')} {...zona}>
        <label className="dropzone">
          <input type="file" accept="image/*" multiple hidden disabled={leyendo}
                 onChange={e => { anadir(e.target.files); e.target.value = '' }} />
          <b>{cola.length ? 'Añade más capturas' : 'Arrastra aquí las capturas de tus brokers'}</b>
          <span>(o toca para elegirlas; puedes soltarlas en cualquier parte de este recuadro) · eToro / XTB / IBKR · posiciones abiertas e historial de cerradas, en las tandas que quieras</span>
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
    <div className={'ingesta card num' + (arrastre ? ' arrastrando' : '')} {...zona}>
      <div className="diff-head">
        <b>Revisión de capturas</b>
        <button className="btn-sec" title="Volver a las capturas para añadir más o corregir broker/tipo; lo leído no se vuelve a leer"
          onClick={() => { setEstado('cola'); setAviso(null) }}>← capturas ({cola.length})</button>
      </div>

      {(() => {
        // Cuadre por bróker (25/10/2026): lo que BTP tendrá al aceptar frente al total que la propia captura enseña.
        const brokers = [...new Set([...Object.keys(d.totales || {}), ...(d.sinLiq || [])])]
        if (!brokers.length) return null
        const proy = b => {
          const upd = d.updates.filter(u => u.sel && u.pos.broker === b).reduce((a, u) => a + Number(u.valor ?? u.pos.current_value ?? 0), 0)
          const alt = d.nuevas.filter(n => n.sel && n.broker === b).reduce((a, n) => a + Number(n.valor ?? n.invertido ?? 0), 0)
          const quedan = d.faltantes.filter(f => f.pos.broker === b && !f.sel && !cubierta(f)).reduce((a, f) => a + Number(f.pos.current_value ?? f.pos.invested), 0)
          const l = d.liq[b] ?? liquidez?.[b] ?? 0
          return upd + alt + quedan + Number(l)
        }
        return <div className="diff-cuadre">
          <h4>Cuadre con el total de la captura</h4>
          {brokers.map(b => {
            const t = d.totales?.[b], p = proy(b), dif = t != null ? p - t : null
            const ok = dif != null && Math.abs(dif) <= Math.max(5, t * 0.005)
            return <div key={b} className="diff-row">
              <span className="t">{b}</span>
              <span>BTP {fmt$(p)}</span>
              {t != null ? <span>captura <b>{fmt$(t)}</b></span> : <span className="warn">la captura no enseña el total</span>}
              {dif != null && (ok ? <span className="ok-cap">✓ cuadra</span>
                : <span className="down" title="Revisa liquidez, cierres sin marcar y valores antes de aplicar">✗ {dif > 0 ? '+' : ''}{fmt$(dif)} $</span>)}
              {d.liq[b] == null && <span className="down" title="No se ha leído el saldo disponible: BTP mantendría el anterior. Pasa la captura con el saldo o escríbelo en modo cierre.">liquidez no leída (se queda {fmt$(liquidez?.[b])})</span>}
            </div>
          })}
        </div>
      })()}

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
            {u.divisa && <span className="warn" title={`La captura da esta fila en ${u.divisa.moneda}: ${fmt$(u.divisa.valor)} ${u.divisa.moneda}`}>{u.divisa.fx ? `${u.divisa.moneda}→$ ×${u.divisa.fx.toFixed(4)}` : `${u.divisa.moneda} sin cambio`}</span>}
            {u.curado && <span className="warn" title="El valor leído no cuadraba con invertido + G/P y G/P %: se ha tomado la pareja que cuadra">corregido por %</span>}
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
        // Lo que cierra una posición abierta de BTP siempre va arriba, sea cual sea la fecha leída.
        const arriba = c => !!c.corrige || (!c.ya && (c.reciente || !!c.mapear))
        const vivos = d.cierres.map((c, i) => [c, i]).filter(([c]) => arriba(c))
        const resto = d.cierres.map((c, i) => [c, i]).filter(([c]) => !arriba(c))
        const fila = ([c, i]) => (
          <div key={i} className={'diff-row' + (c.ya ? ' apagada' : '')}>
            <label className="diff-pick">
              <input type="checkbox" checked={c.sel} disabled={c.ya} onChange={() => toggle('cierres', i)} />
              <span className="t">{c.ticker} <i>{c.broker}</i></span>
            </label>
            {c.ya ? <span>{c.fecha_cierre ? c.fecha_cierre.slice(2).split('-').reverse().join('/') : '—'}</span>
              : <label className={'diff-pick' + (c.sel && c.fechaDudosa && !c.fechaEditada ? ' falta' : '')}
                  title={c.fechaDudosa ? 'Fecha de cierre dudosa (sin fecha, igual a la de apertura o anterior al último cierre): corrígela o confírmala' : 'Fecha de cierre leída de la captura'}>
                  <input type="date" className="diff-sel" max={HOY()} value={c.fecha_cierre || ''}
                    onChange={e => setDiff({ ...d, cierres: d.cierres.map((x, j) => j === i ? { ...x, fecha_cierre: e.target.value, fechaEditada: true } : x) })} />
                  {c.fechaDudosa && !c.fechaEditada && <a className="down" title="Si la fecha es correcta, confírmala aquí"
                    onClick={e => { e.preventDefault(); setDiff({ ...d, cierres: d.cierres.map((x, j) => j === i ? { ...x, fechaEditada: true } : x) }) }}> ⚠ fecha · confirmar</a>}
                </label>}
            <span>{fmt$(c.invertido)} → <b>{fmt$(c.valorCierre)}</b>
              {c.pct != null && <b className={c.pct >= 0 ? 'up' : 'down'}> {c.pct >= 0 ? '+' : ''}{c.pct.toFixed(1)} %</b>}</span>
            {c.ya ? (c.corrige
              ? <label className="diff-pick warn" title="Este cierre ya está en el histórico, pero con otra fecha: márcalo para corregirla">
                  <input type="checkbox" checked={c.corrige.sel} onChange={() => setDiff({ ...d, cierres: d.cierres.map((x, j) => j === i ? { ...x, corrige: { ...x.corrige, sel: !x.corrige.sel } } : x) })} />
                  ya en el histórico con fecha {c.corrige.de.split('-').reverse().join('/')} → corregir a {c.corrige.a.split('-').reverse().join('/')}
                </label>
              : <span className="warn">ya en el histórico</span>) : <>
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
              {c.brokerCorregido && <span className="warn" title="La captura se leyó como de otro broker; se ha casado con la posición de este por ticker e invertido">broker corregido</span>}
              {c.corregidoPct && <span className="warn" title="El importe leído no cuadraba con el % de la fila: se ha recalculado con el %">importe por %</span>}
              {c.motivoB && <span className="ok-cap" title="Motivo marcado por el propio broker en la captura">✓{c.motivoB === 'xTP' ? 'TP' : 'SL'} broker</span>}
              {c.mapear && (() => { const p = positions.find(x => String(x.id) === c.mapear); return p && c.invertido != null && c.invertido < Number(p.invested) * 0.995
                ? <span className="warn" title="Se cierra menos de lo invertido: la posición se reduce, no se borra">parcial</span> : null })()}
              {!c.reciente && <span className="warn" title="Fecha de cierre anterior al último cierre de semana: compruébala">fecha antigua</span>}
              {c.dudosa && <span className="down" title="Invertido + G/P no cuadra con el valor de cierre: compruébalo en la captura">⚠ revisar</span>}
            </>}
          </div>
        )
        return <>
          <h4>Cierres del historial ({vivos.length})</h4>
          {vivos.map(fila)}
          {!vivos.length && <p className="diff-nota">Ningún cierre nuevo en el historial{resto.length ? ' (revisa los plegados: si alguno es de esta semana, márcalo y elige qué posición cierra)' : ''}.</p>}
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

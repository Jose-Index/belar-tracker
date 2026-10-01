import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchPosiciones, updatePosicion, altaPosicion, cerrarPosicion,
  guardarLiquidez, guardarBtcWallet, guardarAportesWallet, guardarOrdenBloques, fetchSnapsBloques, cerrarSemana, fetchNotas, addNota, borrarNotaDB, fetchSeriePosicion,
} from '../lib/posiciones-db'
import { exportBackup } from '../lib/backup'
import { AreaChart, Area, YAxis, XAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { getSimbolos, yahooDe, fetchQuotes, pctDia, pctSem, diasAbiertos, frescura, intervaloPrecios } from '../lib/quotes'
import { useCache, useSondeo, cargar, fijar } from '../lib/cache'
import { eventosProximos } from '../lib/ia'
import { BLOQUES, BLOQUE_IDS, BLOQUE_DE_ID, BTC_ESTRATEGIAS, estrategiaBTC, esPuente, bloqueDe, bloquePorDefecto, pesosBloques, TESIS_SL, TESIS_TP, tesisSL, tesisTP } from '../lib/bloques'
import IngestaIA from '../components/IngestaIA.jsx'
import { useMovil, useSinScroll, useArrastreCierre } from '../lib/movil'
import './posiciones.css'

// ─── Constantes de la spec ───────────────────────────────────────────────
export const ESTADOS = {
  COHETE: { label: 'COHETE', urg: 3 },
  OK:     { label: 'OK',     urg: 4 },
  OJO:    { label: 'OJO',    urg: 2 },
  DUDA:   { label: '¿?',     urg: 1 },
  XSALIR: { label: 'xSALIR', urg: 0 },
}
const CLASES = {
  NUCLEO: 'NÚCLEO', MOMENTUM: 'MOMENTUM', TACTICA: 'TÁCTICA', DISRUPTIVA: 'DISRUPT.',
}
const CLASE_AYUDA = {
  NUCLEO: 'NÚCLEO — la base de la cartera: tesis de largo plazo y posiciones defensivas. Revisión semestral, SL amplio (−10/−20%) o sin SL: solo sale por invalidación estructural, nunca por ruido.',
  MOMENTUM: 'MOMENTUM — crecimiento sostenido (beta >1.3, volatilidad >3%, breakout con volumen). Trailing SL activo (−7/−10%, mínimo 2×ATR).',
  TACTICA: 'TÁCTICA — oportunidad de corto/medio plazo. SL técnico activo (−5/−8%, mínimo 2×ATR) sobre soporte claro.',
  DISRUPTIVA: 'DISRUPTIVA — smallcap especulativa. Sizing pequeño, SL muy amplio o sin SL: la invalidación es la tesis, no el precio.',
}
const BROKERS = ['etoro', 'xtb', 'ibkr']
const ORDEN_BROKER = { etoro: 0, xtb: 1, ibkr: 2 }   // orden de la casa, no alfabético
const ORDENES = [
  { id: 'entrada', label: 'Entrada' }, { id: 'gp', label: 'G/P %' },
  { id: 'peso', label: 'Peso' },
  { id: 'sem', label: 'vari/sem' }, { id: 'dia', label: '%/día' },
  { id: 'broker', label: 'Broker' },
]

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPx = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 3 : 2 })
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const fmtPP = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1)
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''

// `embed`: dentro de la portada (Inicio). `onCambio`: avisa a la portada de que
// las posiciones han cambiado (para recalcular boxes y bloques).
// Posiciones + símbolos + eventos de calendario en una carga, cacheada y compartida (lib/cache.js)
async function loaderPosiciones() {
  const [data, simbolos, eventos, snapsBloque] = await Promise.all([fetchPosiciones(), getSimbolos(), eventosProximos(), fetchSnapsBloques().catch(() => [])])
  return { ...data, simbolos, eventos, snapsBloque }
}

export default function Posiciones({ embed = false, onCambio, seleccionInicial = null, wallet: walletProp = null }) {
  const { data: raw } = useCache('posiciones', loaderPosiciones, { ttl: 60e3, persist: true })   // {positions, snapshots, liquidez, lastClose, simbolos, eventos}
  const [orden, setOrden] = useState(() => localStorage.getItem('btp-orden') || 'entrada')
  const [desc, setDesc] = useState(() => localStorage.getItem('btp-orden-desc') === '1')
  const [selId, setSelId] = useState(null)
  const [walletAbierta, setWalletAbierta] = useState(false)   // panel de aportaciones de la wallet
  const [ordenBq, setOrdenBq] = useState(null)                // orden de bloques mientras se arrastra / tras soltar
  const [arrastrando, setArrastrando] = useState(null)        // id del bloque que se está moviendo
  const [cierre, setCierre] = useState(false)   // MODO CIERRE SEMANA
  const [draft, setDraft] = useState({})        // {id: {invested?, current_value?, ingest_*}} en modo cierre
  const [pendCierres, setPendCierres] = useState([])  // [{pos, motivo}] pendientes de sellar
  const [pendAltas, setPendAltas] = useState([])      // [{ticker, broker, ...}] pendientes de sellar
  const [liqDraft, setLiqDraft] = useState(null)
  const [liqTocada, setLiqTocada] = useState(false)
  const [btcDraft, setBtcDraft] = useState(null)
  const [alta, setAlta] = useState(null)        // null | {} | {…prefill}
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const simbolos = raw?.simbolos || []
  const eventos = raw?.eventos || []
  // vari/sem y wallet: precios vivos vía Yahoo, sondeados (60 s con mercado abierto) y compartidos
  const ys = useMemo(() => (raw?.positions || []).map(p => yahooDe(p.ticker, simbolos)).filter(Boolean).concat(['BTC-USD']), [raw])
  const claveQuotes = 'quotes:pos:' + ys.join(',')
  const { data: quotesCache } = useSondeo(claveQuotes, () => fetchQuotes(ys),
    { intervalo: intervaloPrecios, persist: true, activo: !!raw, deps: [claveQuotes] })
  const quotes = quotesCache || {}     // yahoo_symbol -> quote
  const [ingesta, setIngesta] = useState(false)  // ACTUALIZAR POR CAPTURA fuera del cierre
  const tablaRef = useRef(null)
  const movil = useMovil()
  useSinScroll(movil && (!!selId || walletAbierta) && !cierre)   // en móvil el detalle es una hoja: el fondo no se mueve

  useEffect(() => { localStorage.setItem('btp-orden', orden) }, [orden])
  useEffect(() => { localStorage.setItem('btp-orden-desc', desc ? '1' : '0') }, [desc])
  useEffect(() => { if (seleccionInicial) setAlta(seleccionInicial) }, [seleccionInicial])

  // Tras cualquier escritura: recarga forzada de la caché (la portada se entera por onCambio)
  async function recargar() {
    const data = await cargar('posiciones', loaderPosiciones, { forzar: true, persist: true })
    onCambio && onCambio(data)
    return data
  }

  // Wallet BTC personal: cantidad de app_state (raw.btcQty) valorada al precio vivo de BTC-USD
  // (o al que traiga la portada). Entra en la base de los pesos y en el bloque BTC (30/09/2026).
  const wallet = useMemo(() => {
    const qty = Number(raw?.btcQty) || 0
    const precio = quotes['BTC-USD']?.price || walletProp?.precio || null
    const usd = qty && precio ? qty * precio : (Number(walletProp?.usd) || 0)
    // Coste: suma en USD de las aportaciones (01/10/2026). Sin aportaciones, sin G/P.
    const invertido = Number(raw?.btcWallet?.invertido) > 0 ? Number(raw.btcWallet.invertido) : null
    const gp = invertido && usd ? usd - invertido : null
    return { qty, precio, usd, invertido, gp, gpPct: gp == null ? null : gp / invertido * 100, aportes: raw?.btcWallet?.aportes || [] }
  }, [raw, quotes, walletProp])

  // ── Cálculo de derivados ──
  const rows = useMemo(() => {
    if (!raw) return null
    const { positions, liquidez } = raw
    // Peso sobre posiciones + liquidez de brókers + wallet BTC (misma base que el panel de bloques)
    const base = pesosBloques(positions, liquidez, null, wallet).base
    return positions.map(p => {
      const val = Number(p.current_value ?? p.invested)
      const inv = Number(p.invested)
      const q = quotes[yahooDe(p.ticker, simbolos)]
      const evs = eventos.filter(e => e.ticker === p.ticker)
      const evEarn = evs.find(e => e.event_type === 'earnings')
      const diasEarn = evEarn ? Math.ceil((new Date(evEarn.event_date) - Date.now()) / 86400000) : null
      const gpPct = inv ? (val - inv) / inv * 100 : null
      const apal = Number(p.apalancamiento || 1)
      const ret = gpPct == null ? null : gpPct / apal          // retorno del PRECIO (sin apalancar)
      const entry = p.entry_price ? Number(p.entry_price) : null
      return {
        evs, evUrgente: diasEarn != null && diasEarn <= 3,
        // Punto sólido solo si TODOS los eventos están confirmados; hueco si hay estimados
        evConfirmado: evs.length > 0 && evs.every(e => e.confirmacion !== 'estimado'),
        ...p, valor: val,
        gp: val - inv,
        gpPct,
        dia: pctDia(gpPct, p.entry_date),
        diasAbiertos: diasAbiertos(p.entry_date),
        sem: pctSem(q),
        semFresco: q ? frescura(q) : null,
        precioVivo: q?.price ?? null,
        // Precio de referencia para la distancia al SL: el vivo si es coherente con la entrada y el G/P de la
        // captura; si no (p. ej. VBTC.DE cotizado como BTC-USD), el estimado por entrada × (1 + retorno).
        ...(() => {
          const est = entry && ret != null ? entry * (1 + ret / 100) : null
          const live = q?.price ?? null
          const px = live && (est == null || (live / est > 0.6 && live / est < 1.6)) ? live : est
          const sl = p.sl_price != null ? Number(p.sl_price) : null
          return { precioRef: px, aSLpct: px && sl ? (px / sl - 1) * 100 : null }
        })(),
        peso: base ? val / base * 100 : null,
        bloqueEf: bloqueDe(p),
        ret, apal,
        // Tesis: SL/TP del ticket o, si faltan, los calculados sobre el precio de entrada
        slTesis: p.sl_price != null ? Number(p.sl_price) : tesisSL(entry),
        slCalc: p.sl_price == null && !!entry,
        tpTesis: p.tp_price != null ? Number(p.tp_price) : tesisTP(entry),
        tpCalc: p.tp_price == null && !!entry,
        aTP: ret == null ? null : TESIS_TP - ret,
        aSL: ret == null ? null : ret - TESIS_SL,
      }
    })
  }, [raw, quotes, simbolos, eventos, wallet])

  // Gráfica de cada bloque: rentabilidad TWR acumulada (01/10/2026). Cada semana, el rendimiento del bloque
  // es el de las posiciones que estaban en él la semana anterior y siguen esta, descontando el dinero nuevo
  // (aumento de invertido): r = Σ(valor − Δinvertido) ÷ Σ valor anterior − 1. Las semanas se encadenan:
  // altas, salidas y aportaciones no mueven la curva; solo la mueve lo que ganan o pierden las posiciones.
  // Las posiciones ya cerradas se asignan por su bloque por defecto.
  const seriesBloque = useMemo(() => {
    if (!raw?.snapsBloque?.length) return {}
    const bloqueDeClave = new Map((raw.positions || []).map(p => [p.ticker + '|' + p.broker, bloqueDe(p)]))
    const porBloque = {}   // bq -> week -> clave -> { val, inv }
    for (const s of raw.snapsBloque) {
      const val = Number(s.value), inv = Number(s.invested)
      if (!Number.isFinite(val) || !(val > 0)) continue
      const clave = s.ticker + '|' + s.broker
      const bq = bloqueDeClave.get(clave) || bloquePorDefecto({ ticker: s.ticker })
      const sem = ((porBloque[bq] ||= {})[s.week_end] ||= {})
      const prev = sem[clave] || { val: 0, inv: 0 }
      sem[clave] = { val: prev.val + val, inv: prev.inv + (Number.isFinite(inv) ? inv : 0) }
    }
    const out = {}
    for (const [bq, sems] of Object.entries(porBloque)) {
      const fechas = Object.keys(sems).sort()
      let acum = 1
      const serie = [{ fecha: fechas[0], pct: 0 }]
      for (let i = 1; i < fechas.length; i++) {
        const a = sems[fechas[i - 1]], b = sems[fechas[i]]
        let num = 0, den = 0
        for (const [clave, x] of Object.entries(b)) {
          const y = a[clave]; if (!y) continue                       // alta de esta semana: aún sin rendimiento
          const nuevo = x.inv && y.inv ? Math.max(0, x.inv - y.inv) : 0   // dinero añadido a la posición
          num += x.val - nuevo; den += y.val
        }
        if (den > 0) acum *= num / den
        serie.push({ fecha: fechas[i], pct: (acum - 1) * 100 })
      }
      out[bq] = serie
    }
    return out
  }, [raw])

  const sorted = useMemo(() => {
    if (!rows) return null
    // Orden natural de cada criterio (asc = el que tiene sentido leer primero).
    const by = {
      broker: (a, b) => (ORDEN_BROKER[a.broker] ?? 9) - (ORDEN_BROKER[b.broker] ?? 9) || a.ticker.localeCompare(b.ticker),
      entrada: (a, b) => (b.entry_date || '').localeCompare(a.entry_date || ''),
      clase: (a, b) => (a.clase || '').localeCompare(b.clase || ''),
      estado: (a, b) => (ESTADOS[a.estado]?.urg ?? 9) - (ESTADOS[b.estado]?.urg ?? 9),
      sem: (a, b) => (b.sem ?? -999) - (a.sem ?? -999),
      dia: (a, b) => (b.dia ?? -999) - (a.dia ?? -999),
      peso: (a, b) => (b.peso ?? 0) - (a.peso ?? 0),
      gp: (a, b) => (b.gpPct ?? -999) - (a.gpPct ?? -999),
    }
    const cmp = by[orden] || by.entrada
    return [...rows].sort(desc ? (a, b) => -cmp(a, b) : cmp)
  }, [rows, orden, desc])

  // Agrupación por bloque (Cartera v3): una tabla por bloque, en el orden de la cartera
  const grupos = useMemo(() => {
    if (!sorted || !raw) return null
    const w = pesosBloques(raw.positions, raw.liquidez, null, wallet)
    const orden = ordenBq || raw.bloquesOrden || BLOQUE_IDS
    const pos = id => { const i = orden.indexOf(id); return i < 0 ? 99 + BLOQUE_IDS.indexOf(id) : i }
    return [...BLOQUES].sort((a, b) => pos(a.id) - pos(b.id)).map(b => ({
      b, peso: w.filas.find(f => f.id === b.id), rows: sorted.filter(r => r.bloqueEf === b.id),
      wallet: b.id === 'BTC' && wallet.qty > 0 ? { ...wallet, peso: w.base ? wallet.usd / w.base * 100 : null } : null,
      serie: seriesBloque[b.id] || [],
    })).filter(g => g.rows.length || g.wallet)
  }, [sorted, raw, wallet, ordenBq, seriesBloque])

  // Arrastrar y soltar bloques (ratón y dedo): se agarra el asa ⠿ de la cabecera; al soltar se guarda el orden.
  function empezarArrastre(id, e) {
    e.preventDefault(); e.stopPropagation()
    const cont = tablaRef.current; if (!cont) return
    let orden = grupos.map(g => g.b.id)
    setArrastrando(id); setOrdenBq(orden)
    const mover = ev => {
      const y = ev.clientY
      if (y < 70) window.scrollBy(0, -18); else if (y > window.innerHeight - 70) window.scrollBy(0, 18)   // auto-scroll en los bordes
      const cards = [...cont.querySelectorAll('[data-bq]')]
      const otros = cards.filter(c => c.dataset.bq !== id)
      let idx = otros.findIndex(c => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2 })
      if (idx < 0) idx = otros.length
      const nuevo = otros.map(c => c.dataset.bq); nuevo.splice(idx, 0, id)
      if (nuevo.join() !== orden.join()) { orden = nuevo; setOrdenBq(nuevo) }
    }
    const soltar = async () => {
      window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); window.removeEventListener('pointercancel', soltar)
      setArrastrando(null)
      const completo = [...orden, ...BLOQUE_IDS.filter(x => !orden.includes(x))]
      const { error } = await guardarOrdenBloques(completo)
      if (error) setMsg('No se pudo guardar el orden de bloques: ' + error.message)
      else fijar('posiciones', { ...raw, bloquesOrden: completo })
    }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar); window.addEventListener('pointercancel', soltar)
  }

  const sel = sorted?.find(p => p.id === selId) || null

  // ── Modo cierre: entrada/salida/commit ──
  function entrarCierre() {
    setCierre(true); setDraft({}); setLiqDraft({ ...raw.liquidez }); setLiqTocada(false)
    setBtcDraft(raw.btcQty); setMsg(null)
  }
  function salirSinCerrar() {
    setCierre(false); setDraft({}); setLiqDraft(null); setPendCierres([]); setPendAltas([])
  }

  // Edición fluida: Enter salta a la misma columna de la fila siguiente (todas las tablas)
  function keyNav(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const inputs = [...tablaRef.current.querySelectorAll(`input[data-col="${e.target.dataset.col}"]`)]
    const i = inputs.indexOf(e.target)
    if (i > -1 && i < inputs.length - 1) { inputs[i + 1].focus(); inputs[i + 1].select() }
  }

  async function commitCierre() {
    const vale = v => v != null && v !== '' && !Number.isNaN(Number(v))
    const cambiosInv = Object.entries(draft).filter(([, d]) => vale(d.invested))
    if (!liqTocada && !window.confirm('¿Seguro? No se ha editado la liquidez.')) return
    if (cambiosInv.length && !window.confirm(
      `Vas a modificar INVERTIDO en ${cambiosInv.length} posición(es). ¿Confirmas?`)) return
    // Los cierres son el único paso irreversible: confirmación explícita con nombres.
    if (pendCierres.length && !window.confirm(
      `Se van a CERRAR ${pendCierres.length} posición(es) y registrar en el histórico:\n\n` +
      pendCierres.map(c => `· ${c.pos.ticker} (${c.pos.broker}) — motivo ${c.motivo}`).join('\n') +
      '\n\n¿Confirmas?')) return

    setBusy(true)
    // 1. aplicar borradores
    for (const [id, d] of Object.entries(draft)) {
      const patch = {}
      if (vale(d.invested)) patch.invested = Number(d.invested)
      if (vale(d.current_value)) patch.current_value = Number(d.current_value)
      if (d.ingest_badge) patch.ingest_badge = d.ingest_badge
      if (d.ingest_source) patch.ingest_source = d.ingest_source
      if (Object.keys(patch).length) await updatePosicion(Number(id), patch)
    }
    // 1b. altas y cierres pendientes de la ingesta de capturas (antes del snapshot,
    // para que la foto semanal refleje la cartera real de la semana que se cierra)
    for (const n of pendAltas) {
      await altaPosicion({
        ticker: n.ticker, broker: n.broker,
        entry_date: n.entry_date || new Date().toISOString().slice(0, 10),
        invested: n.invested, current_value: n.current_value,
        apalancamiento: n.apalancamiento || 1,
        clase: n.clase, fuente: n.fuente || 'YO', bloque: n.bloque || bloquePorDefecto(n),
        ingest_badge: 'NEW', ingest_source: `captura ${n.broker} ${n.stamp}`,
      })
    }
    for (const c of pendCierres) await cerrarPosicion(c.pos, c.motivo)
    await guardarLiquidez(liqDraft)
    await guardarBtcWallet(Number(btcDraft) || 0)
    // 2. recargar y commit
    const fresh = await fetchPosiciones()
    const res = await cerrarSemana(fresh.positions, liqDraft, Number(btcDraft) || 0)
    setBusy(false)
    if (res.error) { setMsg('Error al cerrar semana: ' + res.error.message); return }
    setCierre(false); setDraft({}); setLiqDraft(null); setPendCierres([]); setPendAltas([])
    // Backup automático versionado, SOLO tras commit exitoso (regla aprobada con "OJO")
    let bk = ''
    try { const n = await exportBackup('btp-backup-cierre'); bk = ` · backup descargado (${n} filas)` } catch { bk = ' · ⚠ backup automático falló' }
    setMsg(`Semana cerrada · ${res.week_end}${bk}`)
    recargar()
  }

  async function borrarEnCierre(p) {
    const motivo = window.prompt(`Cerrar ${p.ticker} (${p.broker}). Motivo: xSL / xTP / manual / escalonada`, 'xSL')
    if (!motivo) return
    setBusy(true)
    await cerrarPosicion(p, ['xSL', 'xTP', 'manual', 'escalonada'].includes(motivo) ? motivo : 'xSL')
    setBusy(false); setSelId(null); recargar()
  }

  // ACTUALIZAR POR CAPTURA (fuera del cierre, 13/08/2026): aplica lo aceptado en la
  // revisión DIRECTAMENTE a positions. No sella snapshot, no toca "último cierre",
  // no pide liquidez: el registro semanal canónico sigue siendo CERRAR SEMANA.
  async function aplicarDirecto(d) {
    const stamp = new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    const cierres = d.faltantes.filter(f => f.sel)
    if (cierres.length && !window.confirm(
      `Se van a CERRAR ${cierres.length} posición(es) y registrar en el histórico:\n\n` +
      cierres.map(c => `· ${c.pos.ticker} (${c.pos.broker}) — motivo ${c.motivo || 'manual'}`).join('\n') +
      '\n\n¿Confirmas?')) return
    setBusy(true)
    let nUpd = 0, nAltas = 0
    for (const u of d.updates) {
      if (!u.sel) continue
      const patch = {}
      if (u.valor != null) patch.current_value = u.valor
      if (u.invertido != null && Math.abs(u.invertido - u.pos.invested) > 0.01) patch.invested = u.invertido
      if (!Object.keys(patch).length) continue
      patch.ingest_badge = 'UPD'; patch.ingest_source = `captura ${u.pos.broker} ${stamp}`
      await updatePosicion(u.pos.id, patch); nUpd++
    }
    for (const c of cierres) await cerrarPosicion(c.pos, c.motivo || 'manual')
    // Liquidez leída en la captura (01/10/2026: antes se descartaba entre cierres de semana y el total no cuadraba).
    const liqLeida = Object.fromEntries(Object.entries(d.liq || {}).filter(([, v]) => v != null && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]))
    if (Object.keys(liqLeida).length) await guardarLiquidez({ ...(raw.liquidez || {}), ...liqLeida })
    for (const n of d.nuevas) {
      if (!n.sel) continue
      const inv = n.invertido ?? n.valor
      if (!inv) continue
      const ticker = (n.ticker || n.nombre || '?').toUpperCase()
      await altaPosicion({
        ticker, broker: n.broker,
        entry_date: n.entry_date || new Date().toISOString().slice(0, 10),
        invested: inv, current_value: n.valor ?? inv,
        apalancamiento: n.apalancamiento || 1,
        clase: n.clase || 'TACTICA', fuente: n.fuente || 'YO', bloque: bloquePorDefecto({ ticker }),
        ingest_badge: 'NEW', ingest_source: `captura ${n.broker} ${stamp}`,
      }); nAltas++
    }
    setBusy(false); setIngesta(false)
    const liqTxt = Object.entries(liqLeida).map(([k, v]) => `${k} $${fmt$(v)}`).join(', ')
    setMsg(`Actualización por captura · ${nUpd} actualizadas · ${nAltas} altas · ${cierres.length} cierres · liquidez ${liqTxt || 'no leída (pon el saldo en modo cierre)'} · la semana NO queda sellada`)
    recargar()
  }

  // Aplicar lo aceptado en la revisión de capturas: TODO va al borrador (valores,
  // altas y cierres). Nada toca la base de datos hasta CERRAR SEMANA. Las capturas
  // se pueden acumular en varias pasadas (un broker por pasada) sin riesgo.
  async function aplicarDiff(d) {
    const stamp = new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    const nuevoDraft = { ...draft }
    for (const u of d.updates) {
      if (!u.sel) continue
      nuevoDraft[u.pos.id] = {
        ...nuevoDraft[u.pos.id],
        ...(u.valor != null ? { current_value: u.valor } : {}),
        ...(u.invertido != null && Math.abs(u.invertido - u.pos.invested) > 0.01 ? { invested: u.invertido } : {}),
        ingest_badge: 'UPD', ingest_source: `captura ${u.pos.broker} ${stamp}`,
      }
    }
    setDraft(nuevoDraft)

    // Cierres pendientes: posición + motivo elegido. Se ejecutan en el commit.
    setPendCierres(prev => {
      const map = new Map(prev.map(x => [x.pos.id, x]))
      for (const f of d.faltantes) if (f.sel) map.set(f.pos.id, { pos: f.pos, motivo: f.motivo || 'xSL' })
      return [...map.values()]
    })

    // Altas pendientes: se dan de alta en el commit, con clase y fuente elegidas.
    setPendAltas(prev => {
      const clave = n => `${n.broker}|${(n.ticker || n.nombre || '?').toUpperCase()}`
      const map = new Map(prev.map(x => [clave(x), x]))
      for (const n of d.nuevas) {
        if (!n.sel) continue
        const inv = n.invertido ?? n.valor
        if (!inv) continue
        map.set(clave(n), {
          ticker: (n.ticker || n.nombre || '?').toUpperCase(), broker: n.broker,
          entry_date: n.entry_date || null,
          invested: inv, current_value: n.valor ?? inv,
          apalancamiento: n.apalancamiento || 1,
          clase: n.clase || 'TACTICA', fuente: n.fuente || 'YO',
          stamp,
        })
      }
      return [...map.values()]
    })

    if (Object.keys(d.liq).length) { setLiqDraft(l => ({ ...l, ...d.liq })); setLiqTocada(true) }
    setMsg('Capturas aplicadas al borrador — nada escrito aún. Revisa y pulsa CERRAR SEMANA para sellar.'
      + (d.aprendidos ? ` · ${d.aprendidos} nombre(s) de broker aprendidos` : ''))
  }

  // Cierra el alta y, si venía prellenada por URL (Buscador), limpia la query
  function cerrarAlta() {
    setAlta(null)
    if (seleccionInicial && window.location.search.includes('alta=')) window.history.replaceState(null, '', window.location.pathname)
  }

  async function cerrarManual(p) {
    if (!window.confirm(`¿Cerrar ${p.ticker} (${p.broker})? Se registrará en el histórico (motivo: manual).`)) return
    setBusy(true)
    await cerrarPosicion(p, 'manual')
    setBusy(false); setSelId(null); recargar()
  }

  if (!sorted) return <p className="placeholder">Cargando posiciones…</p>

  const totalPos = rows.reduce((a, p) => a + p.valor, 0)
  const liq = cierre ? liqDraft : raw.liquidez
  const totalLiq = Object.values(liq || {}).reduce((a, v) => a + (Number(v) || 0), 0)
  const Titulo = embed ? 'h2' : 'h1'

  return (
    <div className={'pos-layout' + (embed ? ' embed' : '')}>
      <div>
        <div className="pos-head">
          <Titulo>Posiciones <span className="pos-n num">{sorted.length}</span>
            {!embed && <a href="/sandbox" style={{ fontSize: 11.5, fontWeight: 500, marginLeft: 10, color: 'var(--texto-neutro)', textDecoration: 'none' }}>sandbox ↗</a>}</Titulo>
          <div className="pos-controls">
            {raw.lastClose && <span className="sello num">Último cierre: {raw.lastClose.date?.split('-').reverse().join('/')}</span>}
            <label>Orden:{' '}
              <select value={orden} onChange={e => setOrden(e.target.value)} disabled={cierre}>
                {ORDENES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <button className="btn-dir" disabled={cierre} onClick={() => setDesc(!desc)}
                      title={desc ? 'Descendente — clic para ascendente' : 'Ascendente — clic para descendente'}>
                {desc ? '↓' : '↑'}
              </button>
            </label>
            <button className="btn-sec" onClick={() => setAlta({})}>+ Posición</button>
            {!cierre && <button className="btn-sec" onClick={() => setIngesta(!ingesta)}>
              {ingesta ? 'cerrar captura' : 'ACTUALIZAR POR CAPTURA'}</button>}
            {!cierre
              ? <button className="btn-cierre" onClick={entrarCierre}>MODO CIERRE SEMANA</button>
              : <button className="btn-cierre on" onClick={commitCierre} disabled={busy}>
                  {busy ? 'CERRANDO…' : 'CERRAR SEMANA'}
                </button>}
            {cierre && <button className="btn-escape" onClick={salirSinCerrar}>salir sin cerrar</button>}
          </div>
        </div>

        {msg && <p className="pos-msg num">{msg}</p>}

        {cierre && <IngestaIA positions={raw.positions} simbolos={simbolos} onAplicar={aplicarDiff} />}

        {!cierre && ingesta && (
          <>
            <p className="pos-msg num">Actualización entre semana: se aplica al aceptar la revisión, sin sellar snapshot ni tocar el último cierre.</p>
            <IngestaIA positions={raw.positions} simbolos={simbolos} onAplicar={aplicarDirecto} />
          </>
        )}

        {cierre && (pendAltas.length > 0 || pendCierres.length > 0) && (
          <div className="card pendientes num">
            <b>Pendiente de sellar</b>
            <span className="pend-nota">se ejecuta al pulsar CERRAR SEMANA · quita lo que no quieras con ✕</span>
            {pendAltas.map((n, i) => (
              <div key={`a${i}`} className="pend-row">
                <span className="badge-new">NEW</span>
                <span className="t">{n.ticker} <i>{n.broker}</i></span>
                <span>invertido ${fmt$(n.invested)} · abierta {n.entry_date ? n.entry_date.slice(2).split('-').reverse().join('/') : '—'}</span>
                <label>bloque
                  <select value={n.bloque || bloquePorDefecto(n)}
                    onChange={e => setPendAltas(p => p.map((x, j) => j === i ? { ...x, bloque: e.target.value } : x))}>
                    {BLOQUES.map(b => <option key={b.id} value={b.id}>{b.corto}</option>)}
                  </select>
                </label>
                <button className="btn-escape" title="Quitar del borrador"
                  onClick={() => setPendAltas(p => p.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {pendCierres.map((c, i) => (
              <div key={`c${i}`} className="pend-row">
                <span className="badge-close">CIERRE</span>
                <span className="t">{c.pos.ticker} <i>{c.pos.broker}</i></span>
                <label>motivo
                  <select value={c.motivo}
                    onChange={e => setPendCierres(p => p.map((x, j) => j === i ? { ...x, motivo: e.target.value } : x))}>
                    {['xSL', 'xTP', 'manual', 'escalonada'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <button className="btn-escape" title="Quitar del borrador"
                  onClick={() => setPendCierres(p => p.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}

        {cierre && (
          <div className="card liq-bar num">
            <b>Liquidez</b>
            {BROKERS.map(b => (
              <label key={b}>{b}
                <input data-col="liq" value={liqDraft[b] ?? ''} onKeyDown={keyNav}
                  onChange={e => { setLiqDraft({ ...liqDraft, [b]: e.target.value === '' ? '' : Number(e.target.value) }); setLiqTocada(true) }} />
              </label>
            ))}
            <label title="Monedero BTC personal (cantidad en BTC): se valora a precio de mercado en el cierre">₿ wallet
              <input data-col="liq" value={btcDraft ?? ''} onKeyDown={keyNav}
                onChange={e => setBtcDraft(e.target.value === '' ? '' : Number(e.target.value))} />
            </label>
            <span className="liq-total">Total cuenta: ${fmt$(totalPos + totalLiq)} + ₿</span>
          </div>
        )}

        <div className="bloques-tablas" ref={tablaRef}>
          {grupos.map(g => (
            <TablaBloque key={g.b.id} g={g} cierre={cierre} draft={draft} setDraft={setDraft} keyNav={keyNav} movil={movil}
                         selId={selId} onSel={id => !cierre && setSelId(id)} onBorrar={borrarEnCierre}
                         arrastrando={arrastrando === g.b.id} onAsa={e => empezarArrastre(g.b.id, e)}
                         onWallet={() => !cierre && (setSelId(null), setWalletAbierta(true))} />
          ))}
          {!grupos.length && <p className="placeholder">Sin posiciones abiertas.</p>}
        </div>

        <p className="pos-fuente">
          {cierre
            ? 'Modo cierre: edita VALOR/INVERTIDO (Enter salta a la siguiente fila), ✕ cierra posición, y CERRAR SEMANA sella todo.'
            : 'Agrupadas por bloque (Cartera v3). PESO = valor sobre posiciones + liquidez + wallet BTC · %/día = G/P% ÷ días abiertos · vari/sem = precio vivo Yahoo vs cierre de la semana anterior'}
        </p>
        {!cierre && (
          <div className="pos-leyenda num">
            <span><i className="ev-dot">●</i> evento confirmado · <i className="ev-dot estimado">○</i> fecha estimada, puede desviarse (rojo si faltan &lt;3 días)</span>
            <span><i className="badge new">NEW</i> alta por captura IA</span>
            <span><i className="chip-estr chip-puente">Puente</i> Tesis abierta antes de la regla (30/09): se gestiona como Tesis, no se mide como Tesis</span>
            <span><b>TESIS</b> SL/TP en gris = calculados (−11/+23,5 sobre la entrada), aún no puestos en el ticket</span>
            <EstadoVigia v={raw.vigia} n={raw.positions.filter(p => p.sl_type === 'ALERTA').length} />
          </div>
        )}
      </div>

      {sel && !cierre && (
        <>
          {/* Móvil: el detalle sube como hoja sobre un fondo que cierra al tocarlo */}
          <div className="pos-panel-fondo" onClick={() => setSelId(null)} aria-hidden="true" />
          <PanelDetalle p={sel} onClose={() => setSelId(null)} onChange={recargar} onCerrar={() => cerrarManual(sel)} />
        </>
      )}
      {walletAbierta && !cierre && (
        <>
          <div className="pos-panel-fondo" onClick={() => setWalletAbierta(false)} aria-hidden="true" />
          <PanelWallet wallet={wallet} onClose={() => setWalletAbierta(false)} onChange={recargar} />
        </>
      )}
      {alta && <AltaDialog inicial={alta} onClose={() => cerrarAlta()} onDone={() => { cerrarAlta(); recargar() }} />}
    </div>
  )
}

// ─── Una tabla por bloque, con cabecera de bloque y fila de subtotal ─────
function TablaBloque({ g, cierre, draft, setDraft, keyNav, selId, onSel, onBorrar, onWallet, onAsa, arrastrando = false, movil = false }) {
  const { b, peso, rows, wallet, serie } = g
  const esTesis = b.id === 'TESIS'
  const wInv = wallet?.invertido && wallet?.usd ? wallet.invertido : 0   // wallet con coste: entra en el G/P
  const inv = rows.reduce((a, p) => a + Number(p.invested || 0), 0) + wInv
  const val = rows.reduce((a, p) => a + p.valor, 0) + (wallet?.usd || 0)
  const gp = val - (wInv ? 0 : (wallet?.usd || 0)) - inv
  const gpPct = inv ? gp / inv * 100 : null
  const pesoSum = rows.reduce((a, p) => a + (p.peso || 0), 0) + (wallet?.peso || 0)
  const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'

  // Móvil (fuera del modo cierre): lista de tarjetas de dos líneas, sin tabla
  const lista = movil && !cierre

  return (
    <div className={'card pos-tabla-wrap bloque-card' + (lista ? ' lista' : '') + (arrastrando ? ' arrastrando' : '')} data-bq={b.id}>
      <div className="bloque-cab" title={b.ayuda}>
        <span className="bq-asa" onPointerDown={onAsa} title="Arrastra para cambiar el orden de los bloques" aria-label="Mover bloque">⠿</span>
        <span className="bq-dot" style={{ background: b.color }} />
        <span className="bloque-nombre">{lista ? b.corto : b.label}</span>
        <span className="bloque-n num">{rows.length + (wallet ? 1 : 0)}</span>
        {peso && (
          <span className="bloque-chips num">
            <span className={'chip-peso ' + peso.semaforo} title="peso real · objetivo · desvío en puntos">
              {peso.real?.toFixed(1)}% <i>obj {peso.objetivo}%</i> <b>{fmtPP(peso.desvio)}</b>
            </span>
            <span className={'chip-gp ' + pctClass(gp)}>{gp > 0 ? '+' : ''}${fmt$(gp)} ({fmtPct(gpPct)})</span>
          </span>
        )}
      </div>
      {lista ? (
        <ul className="pos-lista num">
          {rows.map(p => (
            <li key={p.id} onClick={() => onSel(p.id)} className={selId === p.id ? 'sel' : ''}>
              <div className="pl-izq">
                <div className="pl-l1">
                  <span className="ticker">{p.ticker}</span>
                  {estrategiaBTC(p) && <span className="chip-estr">{estrategiaBTC(p).label}</span>}
                  {esPuente(p) && <span className="chip-estr chip-puente" title="Tesis PUENTE: abierta antes de adoptar la regla (30/09/2026). Se gestiona con SL/TP de la Tesis pero no cuenta en la medición de la Tesis nativa.">Puente</span>}
                  {p.sl_type === 'ALERTA' && <span className="vigia-bell" title={tituloVigia(p)}>🔔</span>}
                  {p.evs.length > 0 && <span className={'ev-dot' + (p.evUrgente ? ' urgente' : '') + (p.evConfirmado ? '' : ' estimado')}>{p.evConfirmado ? '●' : '○'}</span>}
                  <span className="broker">{p.broker}</span>
                  {p.apalancamiento > 1 && <span className="pl-apal">x{Number(p.apalancamiento)}</span>}
                </div>
                <div className="pl-l2">
                  {esTesis
                    ? <BarraTesis p={p} etiqueta />
                    : <>{fFecha(p.entry_date)} · inv {fmt$(p.invested)}{p.sl_price != null ? ` · SL ${fmtPx(p.sl_price)}${p.aSLpct != null ? ` (a ${p.aSLpct.toFixed(1)} %)` : ''}` : sinSL(p) ? ' · sin SL por regla' : ''}</>}
                </div>
              </div>
              <div className="pl-der">
                <div className={'pl-gpp ' + pctClass(p.gpPct)}>{fmtPct(p.gpPct)}</div>
                <div className="pl-valor">{fmt$(p.valor)} <i className={pctClass(p.gp)}>{fmt$(p.gp)}</i></div>
                <div className="pl-peso">{p.peso == null ? '' : p.peso.toFixed(1) + '% cartera'}</div>
              </div>
            </li>
          ))}
          {wallet && (
            <li className="fila-wallet" onClick={onWallet}>
              <div className="pl-izq">
                <div className="pl-l1"><span className="ticker">BTC</span><span className="chip-estr">Wallet</span></div>
                <div className="pl-l2">{wallet.qty} ₿ {wallet.precio ? '× $' + fmt$(wallet.precio) : '· sin precio'}{wallet.invertido ? ' · inv ' + fmt$(wallet.invertido) : ' · sin coste'}</div>
              </div>
              <div className="pl-der">
                <div className={'pl-gpp ' + pctClass(wallet.gpPct)}>{wallet.gpPct == null ? '—' : fmtPct(wallet.gpPct)}</div>
                <div className="pl-valor">{wallet.precio ? fmt$(wallet.usd) : '—'}{wallet.gp != null && <> <i className={pctClass(wallet.gp)}>{fmt$(wallet.gp)}</i></>}</div>
                <div className="pl-peso">{wallet.peso == null ? '' : wallet.peso.toFixed(1) + '% cartera'}</div>
              </div>
            </li>
          )}
          {serie?.length > 1 && <li className="fila-serie"><SerieBloque serie={serie} /></li>}
          <li className="subtotal">
            <div className="pl-izq">Σ {b.corto} · inv {fmt$(inv)}</div>
            <div className="pl-der">
              <div className={'pl-gpp ' + pctClass(gpPct)}>{fmtPct(gpPct)}</div>
              <div className="pl-valor">{fmt$(val)} <i className={pctClass(gp)}>{fmt$(gp)}</i></div>
              <div className="pl-peso">{pesoSum.toFixed(1)}% cartera</div>
            </div>
          </li>
        </ul>
      ) : (
      <table className={'pos-tabla num' + (cierre ? ' modo-cierre' : '') + (esTesis ? ' tesis' : '')}>
        <thead>
          <tr>
            <th className="tl" title="Ticker. ● = evento próximo en calendario (rojo si quedan menos de 3 días). NEW/· = alta/actualización por captura IA.">ACTIVO</th>
            <th className="col-gpp" title="Ganancia/pérdida abierta en % sobre invertido: el desempeño">G/P %</th>
            <th className="tl">BROKER</th>
            <th title="Fecha de entrada en la posición">ENTRADA</th>
            <th title="Capital invertido (USD)">INVERTIDO</th>
            <th className="col-clave col-ini" title="Valor actual (USD). Fuente única: tus capturas del cierre de semana.">VALOR</th>
            <th className="col-clave col-fin" title="Ganancia/pérdida abierta en dólares">G/P $</th>
            {esTesis ? (
              <>
                <th title="Precio de entrada (por acción). Se fija al alta o en el panel de detalle.">P.ENT</th>
                <th title="Stop loss del ticket. Gris = calculado −11 % sobre la entrada, aún no puesto.">SL</th>
                <th title="Take profit del ticket. Gris = calculado +23,5 % sobre la entrada, aún no puesto.">TP</th>
                <th className="tl" title="Recorrido del precio entre el SL (−11) y el TP (+23,5). El texto es lo que falta hasta el TP, en puntos.">→ TP</th>
              </>
            ) : (
              <>
                <th title="Stop loss / suelo / pérdida máxima declarada. Raya gris = el bloque no lleva SL por regla (pasa el ratón).">SL</th>
                <th title="Take profit. Raya gris = no aplica en este bloque.">TP</th>
                <th title="Distancia del precio al SL, en %: el margen que queda antes de que salte.">a SL</th>
                <th title="Rendimiento medio diario de la posición: G/P% ÷ días desde la entrada">%/día</th>
                <th title="Variación del activo respecto al cierre de la semana anterior (precio vivo Yahoo vs viernes previo)">vari/sem</th>
              </>
            )}
            <th title="Apalancamiento (x1 = sin apalancar; máximo de la casa x2)">APAL</th>
            <th title="Peso de la posición sobre posiciones + liquidez + wallet BTC">PESO</th>
            {cierre && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} onClick={() => onSel(p.id)}
                className={selId === p.id && !cierre ? 'sel' : ''}>
              <td className="tl ticker">
                {p.ticker}
                {estrategiaBTC(p) && <span className="chip-estr">{estrategiaBTC(p).label}</span>}
                {esPuente(p) && <span className="chip-estr chip-puente" title="Tesis PUENTE: abierta antes de adoptar la regla (30/09/2026). Se gestiona con SL/TP de la Tesis pero no cuenta en la medición de la Tesis nativa.">Puente</span>}
                {p.sl_type === 'ALERTA' && <span className="vigia-bell" title={tituloVigia(p)}>🔔</span>}
                {p.ingest_badge === 'NEW' && <span className="badge new">NEW</span>}
                {p.ingest_badge === 'UPD' && <span className="badge upd">·</span>}
                {p.evs.length > 0 && (
                  <span className={'ev-dot' + (p.evUrgente ? ' urgente' : '') + (p.evConfirmado ? '' : ' estimado')}
                        title={p.evs.map(e => `${e.event_date.slice(2).split('-').reverse().join('/')} · ${e.titulo}`
                          + (e.confirmacion === 'confirmado' ? ' [CONFIRMADO]' : e.confirmacion === 'estimado' ? ' [ESTIMADO — puede desviarse]' : '')
                          + (e.fuente ? ' · ' + e.fuente : '')).join('\n')}>
                    {p.evConfirmado ? '●' : '○'}
                  </span>
                )}
              </td>
              <td className={'col-gpp ' + pctClass(p.gpPct)}>{fmtPct(p.gpPct)}</td>
              <td className="tl broker">{p.broker}</td>
              <td>{p.entry_date ? p.entry_date.slice(2).split('-').reverse().join('/') : '—'}</td>
              <td>{cierre
                ? <input data-col="inv" value={draft[p.id]?.invested ?? p.invested} onKeyDown={keyNav}
                    onChange={e => setDraft(d => ({ ...d, [p.id]: { ...d[p.id], invested: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                : fmt$(p.invested)}</td>
              <td className="col-clave col-ini">{cierre
                ? <input data-col="val" value={draft[p.id]?.current_value ?? p.valor} onKeyDown={keyNav}
                    onChange={e => setDraft(d => ({ ...d, [p.id]: { ...d[p.id], current_value: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                : fmt$(p.valor)}</td>
              <td className={'col-clave col-fin ' + pctClass(p.gp)}>{fmt$(p.gp)}</td>
              {esTesis ? (
                <>
                  <td className={p.entry_price ? '' : 'falta'} title={p.entry_price ? '' : 'Sin precio de entrada: ponlo en el panel de detalle'}>{p.entry_price ? fmtPx(p.entry_price) : '—'}</td>
                  <td className={p.slCalc ? 'calc' : ''} title={p.slCalc ? 'Calculado: −11 % sobre la entrada' : p.sl_price != null ? 'SL puesto en el ticket' : ''}>{p.slTesis != null ? fmtPx(p.slTesis) : '—'}</td>
                  <td className={p.tpCalc ? 'calc' : ''} title={p.tpCalc ? 'Calculado: +23,5 % sobre la entrada' : p.tp_price != null ? 'TP puesto en el ticket' : ''}>{p.tpTesis != null ? fmtPx(p.tpTesis) : '—'}</td>
                  <td className="tl"><BarraTesis p={p} /></td>
                </>
              ) : (
                <>
                  {sinSL(p)
                    ? <td colSpan={3} className="calc na-sl" title={sinSL(p)}>— sin SL por regla —</td>
                    : <>
                        <td title={p.sl_type === 'ALERTA' ? 'Vigilado por el Vigía BTP (el bróker no admite la orden)' : p.sl_price != null ? 'SL / suelo puesto' : 'Sin SL'}>{p.sl_price != null ? fmtPx(p.sl_price) : <span className="falta">—</span>}</td>
                        <td>{p.tp_price != null ? fmtPx(p.tp_price) : <span className="calc">—</span>}</td>
                        <td className={p.aSLpct == null ? 'calc' : p.aSLpct < 5 ? 'down' : ''} title={p.precioRef ? `Precio de referencia ${fmtPx(p.precioRef)}` : ''}>{p.aSLpct == null ? '—' : p.aSLpct.toFixed(1) + ' %'}</td>
                      </>}
                  <td title={p.diasAbiertos ? `${p.diasAbiertos} días abiertos` : ''}>{fmtPct(p.dia)}</td>
                  <td title={p.semFresco || ''}>{fmtPct(p.sem)}</td>
                </>
              )}
              <td>{p.apalancamiento > 1 ? 'x' + Number(p.apalancamiento) : ''}</td>
              <td>{p.peso == null ? '—' : p.peso.toFixed(1) + '%'}</td>
              {cierre && <td><button className="btn-borrar" title="Cerrar posición"
                onClick={e => { e.stopPropagation(); onBorrar(p) }}>✕</button></td>}
            </tr>
          ))}
          {wallet && (
            <tr className="fila-wallet" onClick={onWallet} title="Monedero BTC personal valorado al precio vivo de BTC-USD. Pulsa para ver y añadir aportaciones (fecha, BTC, USD): con ellas tiene coste y G/P.">
              <td className="tl ticker">BTC<span className="chip-estr">Wallet</span></td>
              <td className={'col-gpp ' + pctClass(wallet.gpPct)}>{wallet.gpPct == null ? '—' : fmtPct(wallet.gpPct)}</td>
              <td className="tl broker">wallet</td>
              <td>{wallet.aportes?.length ? wallet.aportes.length + ' aport.' : '—'}</td>
              <td>{wallet.invertido ? fmt$(wallet.invertido) : '—'}</td>
              <td className="col-clave col-ini">{wallet.precio ? fmt$(wallet.usd) : '—'}</td>
              <td className={'col-clave col-fin ' + pctClass(wallet.gp)}>{wallet.gp == null ? '—' : fmt$(wallet.gp)}</td>
              <td colSpan={3} className="calc na-sl" title="Wallet: sin SL. Pérdida no gestionada por orden: es BTC propio, horizonte 2036.">— sin SL —</td>
              <td colSpan={2} className="tl calc">{wallet.qty} ₿ {wallet.precio ? '× $' + fmt$(wallet.precio) : '· sin precio'}</td>
              <td></td>
              <td>{wallet.peso == null ? '—' : wallet.peso.toFixed(1) + '%'}</td>
              {cierre && <td></td>}
            </tr>
          )}
          {serie?.length > 1 && !cierre && (
            <tr className="fila-serie"><td colSpan={99}><SerieBloque serie={serie} /></td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="subtotal">
            <td className="tl">Σ {b.corto}</td>
            <td className={'col-gpp ' + pctClass(gpPct)}>{fmtPct(gpPct)}</td>
            <td colSpan={2}></td>
            <td>{fmt$(inv)}</td>
            <td className="col-clave col-ini">{fmt$(val)}</td>
            <td className={'col-clave col-fin ' + pctClass(gp)}>{fmt$(gp)}</td>
            <td colSpan={esTesis ? 5 : 6}></td>
            <td>{pesoSum.toFixed(1)}%</td>
            {cierre && <td></td>}
          </tr>
        </tfoot>
      </table>
      )}
    </div>
  )
}

// Bloques/estrategias que por regla no llevan SL (§9.2): devuelve el motivo, o null si sí debe llevarlo
const ETF_NUCLEO = /^(CSPX|SXR8|VUAA|IUSA)/i
function sinSL(p) {
  const bq = bloqueDe(p)
  if (bq === 'ORO') return 'ORO: sin SL por regla; sale por invalidación escrita'
  if (bq === 'DELEGADA') return 'COPY TRADING: sin SL por regla; sustitución si 12 meses seguidos por detrás del S&P'
  if (bq === 'BTC' && estrategiaBTC(p)?.id === 'BASE') return 'BTC Base: sin SL, horizonte 2036'
  if (bq === 'NUCLEO' && ETF_NUCLEO.test(p.ticker || '')) return 'ETF del NÚCLEO: sin salida'
  return null
}

// Vigía: texto con los niveles vigilados y la distancia del precio vivo a cada uno
function tituloVigia(p) {
  const px = p.precioVivo, sl = p.sl_price != null ? Number(p.sl_price) : null, tp = p.tp_price != null ? Number(p.tp_price) : null
  const d = (a, b) => (a / b - 1) * 100
  const partes = []
  if (sl) partes.push(`suelo/SL ${fmtPx(sl)}${px ? ` (a ${d(px, sl).toFixed(1)} %)` : ''}`)
  if (tp) partes.push(`TP ${fmtPx(tp)}${px ? ` (a ${d(tp, px).toFixed(1)} %)` : ''}`)
  return 'Vigía BTP: ' + (partes.join(' · ') || 'sin niveles: pon SL y/o TP en Precios del ticket') + (px ? ` · precio ${fmtPx(px)}` : '')
}

// Estado del Vigía en la leyenda: última pasada y aviso si lleva parado más de 20 min en horario de mercado
function EstadoVigia({ v, n }) {
  if (!n && !v) return null
  const hace = v?.last_run ? Math.round((Date.now() - new Date(v.last_run)) / 60000) : null
  const d = new Date(), h = d.getUTCHours(), dow = d.getUTCDay()
  const horario = dow >= 1 && dow <= 5 && h >= 7 && h < 21          // ~09:00-23:00 Madrid
  const parado = n > 0 && (hace == null || (horario && hace > 20))
  return (
    <span className={parado ? 'vigia-parado' : ''}>🔔 <b>Vigía</b> {n} vigilada{n === 1 ? '' : 's'} · {hace == null ? 'aún sin pasadas' : `última pasada hace ${hace < 60 ? hace + ' min' : Math.round(hace / 60) + ' h'}`}{parado ? ' · ¡PARADO! revisa cron-job.org' : ''}{v?.errores?.length ? ` · ${v.errores.length} error(es): ${v.errores.join('; ')}` : ''}</span>
  )
}

// Gráfica de bloque: G/P % agregado por cierre semanal, con la línea del cero
function SerieBloque({ serie }) {
  const ult = serie[serie.length - 1]
  const fF = d => d?.slice(2).split('-').reverse().join('/')
  const color = ult.pct >= 0 ? '#16A34A' : '#E5484D'
  return (
    <div className="serie-bloque num">
      <div className="sb-txt">
        <span title="Rentabilidad ponderada en el tiempo: solo la mueve lo que ganan o pierden las posiciones, no las altas, salidas ni aportaciones">Rentabilidad del bloque (TWR) · desde {fF(serie[0].fecha)}</span>
        <b className={pctClass(ult.pct)}>{fmtPct(ult.pct)} <i>al {fF(ult.fecha)}</i></b>
      </div>
      <ResponsiveContainer width="100%" height={64}>
        <AreaChart data={serie} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
          <XAxis dataKey="fecha" hide />
          <YAxis domain={['auto', 'auto']} hide />
          <ReferenceLine y={0} stroke="#9AA6B8" strokeDasharray="3 3" />
          <Tooltip labelFormatter={fF} isAnimationActive={false} animationDuration={0} wrapperClassName="tip-recharts"
                   formatter={v => [fmtPct(v), 'TWR']} />
          <Area type="monotone" dataKey="pct" stroke={color} strokeWidth={1.6} fill={color} fillOpacity={0.08} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Barra del recorrido −11 → +23,5 con la marca de entrada y el texto "faltan X pp al TP"
function BarraTesis({ p, etiqueta = false }) {
  if (p.ret == null) return <span className="calc">—</span>
  const rango = TESIS_TP - TESIS_SL
  const pos = Math.max(0, Math.min(1, (p.ret - TESIS_SL) / rango))
  const cero = (0 - TESIS_SL) / rango
  const izq = Math.min(pos, cero), ancho = Math.abs(pos - cero)
  const txt = p.ret >= TESIS_TP ? 'TP alcanzado' : p.ret <= TESIS_SL ? 'en SL' : `${p.aTP.toLocaleString('es-ES', { maximumFractionDigits: 1 })} pp${etiqueta ? ' al TP' : ''}`
  return (
    <span className="barra-tesis" title={`Retorno del precio ${fmtPct(p.ret)} · faltan ${p.aTP?.toFixed(1)} pp al TP · ${p.aSL?.toFixed(1)} pp sobre el SL`}>
      <i className="bt-pista">
        <i className={'bt-relleno ' + (p.ret >= 0 ? 'pos' : 'neg')} style={{ left: `${izq * 100}%`, width: `${ancho * 100}%` }} />
        <i className="bt-cero" style={{ left: `${cero * 100}%` }} />
      </i>
      <span className="bt-txt">{txt}</span>
    </span>
  )
}

// ─── Panel de detalle: atributos editables + notas fechadas ─────────────
function PanelDetalle({ p, onClose, onChange, onCerrar }) {
  const arrastre = useArrastreCierre(onClose)   // móvil: cerrar la hoja arrastrando hacia abajo
  const [notas, setNotas] = useState([])
  const [nueva, setNueva] = useState('')
  const [serie, setSerie] = useState([])
  const [estr, setEstr] = useState(p.estrategia || '')  // Estrategia de entrada (texto libre)
  const [estrPend, setEstrPend] = useState(false)       // autoguardado en vuelo
  const [px, setPx] = useState({ entry_price: p.entry_price ?? '', sl_price: p.sl_price ?? '', tp_price: p.tp_price ?? '' })
  const [pxMsg, setPxMsg] = useState(null)
  const estrTimer = useRef(null)
  const estrRef = useRef(null)
  const bloque = bloqueDe(p)

  useEffect(() => {
    fetchNotas(p.id).then(({ data }) => setNotas(data || []))
    clearTimeout(estrTimer.current); setEstr(p.estrategia || ''); setEstrPend(false)
    setPx({ entry_price: p.entry_price ?? '', sl_price: p.sl_price ?? '', tp_price: p.tp_price ?? '' }); setPxMsg(null)
    fetchSeriePosicion(p.ticker, p.broker, p.entry_date).then(({ data }) =>
      setSerie((data || []).map(s => ({ fecha: s.week_end, v: Number(s.value) }))))
  }, [p.id])

  async function setAttr(campo, valor) {
    const { error } = await updatePosicion(p.id, { [campo]: valor })
    if (error) { setPxMsg('No se pudo guardar: ' + error.message); return }
    onChange()
  }
  // Estrategia: autoguardado silencioso (sin botón, sin recarga). Guarda a los
  // 800 ms de dejar de teclear y también al salir del campo (blur).
  function cambiaEstr(v, inmediato = false) {
    setEstr(v); setEstrPend(true)
    clearTimeout(estrTimer.current)
    const salvar = async () => { await updatePosicion(p.id, { estrategia: v.trim() || null }); setEstrPend(false) }
    if (inmediato) salvar(); else estrTimer.current = setTimeout(salvar, 800)
  }
  useEffect(() => () => clearTimeout(estrTimer.current), [])
  // Altura del cajón: crece y encoge con el contenido, sin barras de scroll.
  useEffect(() => {
    const el = estrRef.current
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
  }, [estr, p.id])

  // Precios del ticket: entrada, SL, TP. Se guardan al salir del campo (blur) o con Enter.
  async function guardarPx(campo) {
    const v = px[campo] === '' ? null : Number(String(px[campo]).replace(',', '.'))
    if (v != null && Number.isNaN(v)) { setPxMsg('Número no válido'); return }
    if ((v ?? null) === (p[campo] ?? null)) return
    const { error } = await updatePosicion(p.id, { [campo]: v })
    if (error) setPxMsg('No se pudo guardar ' + campo + ': ' + error.message)
    else { setPxMsg(null); onChange() }
  }
  async function aplicarTesis() {
    const e = Number(String(px.entry_price).replace(',', '.'))
    if (!e) { setPxMsg('Pon primero el precio de entrada'); return }
    const patch = { entry_price: e, sl_price: tesisSL(e), tp_price: tesisTP(e) }
    setPx({ entry_price: e, sl_price: patch.sl_price, tp_price: patch.tp_price })
    const { error } = await updatePosicion(p.id, patch)
    if (error) setPxMsg('No se pudo guardar: ' + error.message); else { setPxMsg(null); onChange() }
  }
  async function borrarNota(n) {
    if (!confirm(`¿Borrar la nota «${n.texto.slice(0, 60)}${n.texto.length > 60 ? '…' : ''}»?`)) return
    await borrarNotaDB(n.id)
    fetchNotas(p.id).then(({ data }) => setNotas(data || []))
  }
  async function guardarNota(e) {
    e.preventDefault()
    if (!nueva.trim()) return
    await addNota(p.id, nueva.trim())
    setNueva('')
    fetchNotas(p.id).then(({ data }) => setNotas(data || []))
  }

  return (
    <aside className="pos-panel card" {...arrastre}>
      <div className="pos-panel-head">
        <h2>{p.ticker} <span className="broker">{p.broker}</span>{estrategiaBTC(p) && <span className="chip-estr">{estrategiaBTC(p).label}</span>}{esPuente(p) && <span className="chip-estr chip-puente" title="Tesis PUENTE: abierta antes de adoptar la regla (30/09/2026). Se gestiona con SL/TP de la Tesis pero no cuenta en la medición de la Tesis nativa.">Puente</span>}</h2>
        <span className="cab-acciones">
          <button className="btn-cerrar-posicion" onClick={onCerrar} title="Cierra la posición y la pasa al histórico (pide confirmación)">Cerrar posición</button>
          <button className="btn-x" onClick={onClose} aria-label="Cerrar detalle" title="Cerrar detalle">✕</button>
        </span>
      </div>
      <dl className="num">
        <div><dt>Entrada</dt><dd>{p.entry_date || '—'} · ${fmt$(p.invested)}</dd></div>
        <div><dt>Valor</dt><dd>${fmt$(p.valor)} <span className={pctClass(p.gpPct)}>({fmtPct(p.gpPct)})</span></dd></div>
        <div><dt>Bloque</dt><dd><i className="bq-dot" style={{ background: BLOQUE_DE_ID[bloque]?.color }} />{BLOQUE_DE_ID[bloque]?.label}{p.bloque ? '' : <span className="calc" title="Bloque por defecto: aún no asignado en la base de datos"> (por defecto)</span>}</dd></div>
        {bloque === 'TESIS' && p.ret != null && <div><dt>Tesis</dt><dd>{fmtPct(p.ret)} precio · {p.aTP?.toFixed(1)} pp al TP · {p.aSL?.toFixed(1)} pp sobre SL</dd></div>}
        {p.ingest_source && <div><dt>Origen</dt><dd>{p.ingest_source}</dd></div>}
      </dl>
      {serie.length > 1 && (
        <div className="pos-grafica num">
          <ResponsiveContainer width="100%" height={90}>
            <AreaChart data={serie} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2E6BF6" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#2E6BF6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="fecha" hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip labelFormatter={f => f?.slice(2).split('-').reverse().join('/')} isAnimationActive={false}
                       animationDuration={0} wrapperClassName="tip-recharts"
                       formatter={v => ['$' + fmt$(v), 'valor']} />
              {p.sl_price && p.entry_price && p.invested &&
                <ReferenceLine y={Number(p.invested) * (1 + (Number(p.sl_price) / Number(p.entry_price) - 1) * Number(p.apalancamiento || 1))}
                               stroke="#E5484D" strokeDasharray="4 3" />}
              <Area type="monotone" dataKey="v" stroke="#2E6BF6" strokeWidth={1.7} fill="url(#gPos)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="hist-n" style={{ textAlign: 'right' }}>{serie.length} cierres semanales{p.sl_price ? ' · línea roja = valor en SL' : ''}</div>
        </div>
      )}
      <div className="attr-selects">
        <label title={BLOQUE_DE_ID[bloque]?.ayuda || ''}>Bloque
          <select value={bloque} onChange={e => {
            const v = e.target.value
            // Regla SATÉLITE: desde la Tesis solo se asciende en ganancia (≥ +23,5); nunca para esquivar un stop
            if (v === 'SATELITE' && bloque === 'TESIS' && !(p.ret >= TESIS_TP) &&
                !window.confirm(`${p.ticker} va ${fmtPct(p.ret)}: la regla solo permite pasar de Tesis a SATÉLITE en ganancia (≥ +23,5 %). ¿Pasarla igualmente?`)) return
            setAttr('bloque', v)
          }}>
            {BLOQUES.map(b => <option key={b.id} value={b.id} title={b.ayuda}>{b.corto}</option>)}
          </select>
        </label>
        {bloque === 'BTC' && (
          <label title="Estrategia BTC de esta posición">Estrategia
            <select value={estrategiaBTC(p)?.clase} onChange={e => setAttr('clase', e.target.value)}>
              {BTC_ESTRATEGIAS.map(x => <option key={x.clase} value={x.clase}>{x.label}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="precios-ticket num">
        <label className="vigia-toggle" title="Para niveles que el bróker no admite como orden (p. ej. ECO en eToro, TP de la Tesis en XTB): el Vigía de BTP comprueba el precio cada 5 minutos y te avisa al móvil si se toca el SL/suelo o el TP, o si el precio se acerca a menos del 2 %.">
          <input type="checkbox" checked={p.sl_type === 'ALERTA'} onChange={e => setAttr('sl_type', e.target.checked ? 'ALERTA' : null)} />
          <span>🔔 Vigía BTP: el bróker no admite esta orden; avísame al móvil</span>
        </label>
        {p.sl_type === 'ALERTA' && <p className="vigia-info">{tituloVigia(p)}</p>}
        <div className="ia-head"><h3>Precios del ticket</h3>
          {bloque === 'TESIS' && <button type="button" className="btn-escape" onClick={aplicarTesis} title="Calcula SL −11 % y TP +23,5 % sobre el precio de entrada y los guarda">Tesis −11/+23,5</button>}
        </div>
        <div className="precios-grid">
          {[['entry_price', 'Entrada'], ['sl_price', 'SL'], ['tp_price', 'TP']].map(([k, l]) => (
            <label key={k}>{l}
              <input value={px[k]} inputMode="decimal" placeholder="—"
                     onChange={e => setPx(x => ({ ...x, [k]: e.target.value }))}
                     onBlur={() => guardarPx(k)}
                     onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
            </label>
          ))}
        </div>
        {pxMsg && <p className="auth-err" style={{ margin: '4px 0 0', fontSize: 12 }}>{pxMsg}</p>}
      </div>

      <div className="estrategia-bloque">
        <div className="ia-head">
          <h3>Estrategia de entrada {estrPend && <span className="hist-n">guardando…</span>}</h3>
        </div>
        <textarea ref={estrRef} value={estr} onChange={e => cambiaEstr(e.target.value)}
          style={{ resize: 'none', overflow: 'hidden' }}
          onBlur={e => estrPend && cambiaEstr(e.target.value, true)}
          placeholder="¿Por qué entraste? Motivación, tesis y expectativa. Material de la revisión de sábado. Se guarda automáticamente." />
      </div>

      <h3>Notas</h3>
      <form onSubmit={guardarNota} className="nota-form">
        <input placeholder="Nueva nota…" value={nueva} onChange={e => setNueva(e.target.value)} />
        <button>+</button>
      </form>
      <ul className="notas">
        {notas.map(n => (
          <li key={n.id}>
            <span className="num nota-fecha">{n.created_at.slice(2, 10).split('-').reverse().join('/')}</span>
            <span className="nota-txt">{n.texto}</span>
            <a className="borrar-x nota-x" title="Borrar nota" onClick={() => borrarNota(n)}>✕</a>
          </li>
        ))}
        {!notas.length && <li className="sin-notas">Sin notas.</li>}
      </ul>

      <button className="btn-cerrar-cajon" onClick={onClose}>Cerrar</button>
    </aside>
  )
}

// ─── Wallet BTC: aportaciones (fecha, BTC, USD) → cantidad, coste y G/P ─────
function PanelWallet({ wallet, onClose, onChange }) {
  const arrastre = useArrastreCierre(onClose)
  const [lista, setLista] = useState(() => (wallet.aportes || []).map(a => ({ ...a })))
  const [n, setN] = useState({ fecha: new Date().toISOString().slice(0, 10), btc: '', usd: '' })
  const [msg, setMsg] = useState(null)
  const num = v => Number(String(v).replace(',', '.'))
  const qty = lista.reduce((a, x) => a + num(x.btc || 0), 0)
  const inv = lista.reduce((a, x) => a + num(x.usd || 0), 0)
  const valor = wallet.precio ? qty * wallet.precio : null
  const gp = valor != null && inv ? valor - inv : null

  async function guardar(nueva) {
    const limpia = nueva.map(a => ({ fecha: a.fecha, btc: num(a.btc), usd: Math.round(num(a.usd) * 100) / 100 }))
      .filter(a => a.btc > 0).sort((a, b) => a.fecha.localeCompare(b.fecha))
    const { error } = await guardarAportesWallet(limpia)
    if (error) { setMsg('No se pudo guardar: ' + error.message); return }
    setLista(limpia); setMsg(null); onChange()
  }
  function añadir(e) {
    e.preventDefault()
    if (!(num(n.btc) > 0) || !(num(n.usd) > 0) || !n.fecha) { setMsg('Fecha, BTC y USD son obligatorios.'); return }
    guardar([...lista, n]); setN({ ...n, btc: '', usd: '' })
  }
  function quitar(i) {
    if (!confirm('¿Quitar esta aportación?')) return
    guardar(lista.filter((_, j) => j !== i))
  }

  return (
    <aside className="pos-panel card" {...arrastre}>
      <div className="pos-panel-head">
        <h2>BTC <span className="broker">wallet</span><span className="chip-estr">Wallet</span></h2>
        <button onClick={onClose}>✕</button>
      </div>
      <dl className="num">
        <div><dt>Cantidad</dt><dd>{(Math.round(qty * 1e8) / 1e8) || wallet.qty} ₿{wallet.precio ? ' × $' + fmt$(wallet.precio) : ''}</dd></div>
        <div><dt>Invertido</dt><dd>{inv ? '$' + fmt$(inv) : 'sin aportaciones registradas'}</dd></div>
        <div><dt>Valor</dt><dd>{valor != null ? '$' + fmt$(valor) : '—'} {gp != null && <span className={pctClass(gp)}>({fmtPct(gp / inv * 100)} · ${fmt$(gp)})</span>}</dd></div>
        {inv > 0 && qty > 0 && <div><dt>Precio medio</dt><dd>${fmt$(inv / qty)} por ₿</dd></div>}
      </dl>
      <h3>Aportaciones</h3>
      <ul className="notas num">
        {lista.map((a, i) => (
          <li key={i}>
            <span className="nota-fecha">{a.fecha.slice(2).split('-').reverse().join('/')}</span>
            <span className="nota-txt">{a.btc} ₿ · ${fmt$(a.usd)} <i className="calc">(${fmt$(a.usd / a.btc)}/₿)</i></span>
            <a className="borrar-x nota-x" title="Quitar aportación" onClick={() => quitar(i)}>✕</a>
          </li>
        ))}
        {!lista.length && <li className="sin-notas">Sin aportaciones: la wallet cuenta en el valor del bloque, pero sin coste ni G/P.</li>}
      </ul>
      <form onSubmit={añadir} className="wallet-form num">
        <input type="date" value={n.fecha} onChange={e => setN({ ...n, fecha: e.target.value })} />
        <input inputMode="decimal" placeholder="BTC" value={n.btc} onChange={e => setN({ ...n, btc: e.target.value })} />
        <input inputMode="decimal" placeholder="USD pagados" value={n.usd} onChange={e => setN({ ...n, usd: e.target.value })} />
        <button>+</button>
      </form>
      <p className="hist-n">USD pagados = coste total de la compra con comisiones. Si compraste en euros, el equivalente en dólares de ese día.</p>
      {msg && <p className="auth-err" style={{ fontSize: 12 }}>{msg}</p>}
    </aside>
  )
}

// ─── Alta de posición (permitida siempre, modo OFF incluido) ────────────
// `inicial`: prellenado (desde el Buscador: ticker, precio de entrada, SL/TP de la Tesis).
export function AltaDialog({ inicial = {}, onClose, onDone }) {
  const [f, setF] = useState({
    ticker: '', broker: 'xtb', entry_date: new Date().toISOString().slice(0, 10),
    invested: '', current_value: '', clase: 'TACTICA', estado: 'OK', fuente: 'YO', estrBtc: 'TACTICA',
    apalancamiento: 1, entry_price: '', sl_price: '', tp_price: '', bloque: 'TESIS',
    ...Object.fromEntries(Object.entries(inicial || {}).filter(([, v]) => v != null)),
  })
  const [err, setErr] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const num = v => v === '' || v == null ? null : Number(String(v).replace(',', '.'))

  // Tesis: al fijar la entrada, SL y TP se rellenan solos si están vacíos
  function entradaBlur() {
    const e = num(f.entry_price)
    if (f.bloque !== 'TESIS' || !e) return
    setF(x => ({ ...x, sl_price: x.sl_price === '' ? tesisSL(e) : x.sl_price, tp_price: x.tp_price === '' ? tesisTP(e) : x.tp_price }))
  }

  async function guardar(e) {
    e.preventDefault()
    const inv = Number(f.invested)
    if (!f.ticker.trim() || !inv) { setErr('Ticker e invertido son obligatorios.'); return }
    const { error } = await altaPosicion({
      ticker: f.ticker.trim().toUpperCase(), broker: f.broker, entry_date: f.entry_date,
      invested: inv, current_value: Number(f.current_value) || inv,
      clase: f.bloque === 'BTC' ? f.estrBtc : f.bloque === 'TESIS' ? 'TACTICA' : f.bloque === 'SATELITE' ? 'DISRUPTIVA' : 'NUCLEO', estado: 'OK', fuente: 'YO', bloque: f.bloque,
      apalancamiento: Number(f.apalancamiento) || 1,
      entry_price: num(f.entry_price), sl_price: num(f.sl_price), tp_price: num(f.tp_price),
    })
    if (error) setErr(error.message); else onDone()
  }

  return (
    <div className="modal-fondo" onClick={onClose}>
      <form className="card modal alta num" onClick={e => e.stopPropagation()} onSubmit={guardar}>
        <h2>Nueva posición {inicial?.nombre && <span className="hist-n">{inicial.nombre}</span>}</h2>
        <div className="alta-grid">
          <label>Ticker<input autoFocus value={f.ticker} onChange={e => set('ticker', e.target.value)} /></label>
          <label>Broker<select value={f.broker} onChange={e => set('broker', e.target.value)}>
            {BROKERS.map(b => <option key={b}>{b}</option>)}</select></label>
          <label>Fecha<input type="date" value={f.entry_date} onChange={e => set('entry_date', e.target.value)} /></label>
          <label>Invertido $<input value={f.invested} onChange={e => set('invested', e.target.value)} /></label>
          <label>Valor $<input placeholder="= invertido" value={f.current_value} onChange={e => set('current_value', e.target.value)} /></label>
          <label>Bloque<select value={f.bloque} onChange={e => set('bloque', e.target.value)}>
            {BLOQUES.map(b => <option key={b.id} value={b.id} title={b.ayuda}>{b.corto}</option>)}</select></label>
          <label>P. entrada<input placeholder="por acción" value={f.entry_price} onChange={e => set('entry_price', e.target.value)} onBlur={entradaBlur} /></label>
          <label>SL<input placeholder={f.bloque === 'TESIS' ? '−11 %' : 'opcional'} value={f.sl_price} onChange={e => set('sl_price', e.target.value)} /></label>
          <label>TP<input placeholder={f.bloque === 'TESIS' ? '+23,5 %' : 'opcional'} value={f.tp_price} onChange={e => set('tp_price', e.target.value)} /></label>
          {f.bloque === 'BTC' && <label>Estrategia<select value={f.estrBtc} onChange={e => set('estrBtc', e.target.value)}>
            {BTC_ESTRATEGIAS.map(x => <option key={x.clase} value={x.clase}>{x.label}</option>)}</select></label>}
          <label>Apal.<input value={f.apalancamiento} onChange={e => set('apalancamiento', e.target.value)} /></label>
        </div>
        {f.bloque === 'TESIS' && <p className="alta-nota">Tesis JOSE −11/+23,5: SL y TP se ponen en el mismo ticket, en el acto de la compra, y no se tocan. Máx. 8 líneas, ticket ≤4 % (small caps 2 %).</p>}
        {err && <p className="auth-err">{err}</p>}
        <div className="modal-botones">
          <button type="button" className="btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn-primario">Añadir</button>
        </div>
      </form>
    </div>
  )
}

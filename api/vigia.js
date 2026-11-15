// BTP · /api/vigia — el Vigía (01/10/2026)
// Vigila los niveles que el bróker NO admite como orden (p. ej. ECO en eToro, TP de la Tesis en XTB):
// posiciones con sl_type = 'ALERTA'. Compara sl_price (suelo/SL) y tp_price (TP) con el precio de Yahoo y,
// si se cruza un nivel, (1) crea una alerta en el Radar y (2) manda una notificación push con ntfy.
// También avisa una vez cuando el precio entra a menos del 2 % de un nivel.
//
// Lo llama cron-job.org cada 5 minutos (el plan Hobby de Vercel solo permite un cron diario).
// Auth: Bearer CRON_SECRET | BELAR_TOKEN | sesión Supabase de la app (autorizarUsuario).
// Variables: NTFY_TOPIC (canal privado de ntfy; sin ella no hay push, pero sí alerta en el Radar).
//
// GET/POST /api/vigia            → pasada normal
//          /api/vigia?dry=1      → simula: no escribe ni notifica, devuelve lo que haría
//          /api/vigia?test=1     → manda una notificación de prueba y sale
//     POST /api/vigia?aviso=1    → manda al móvil el aviso del cuerpo { titulo, mensaje, prioridad?: 3|4|5, tags?: [] } y sale (15/11/2026)
//
// Estado en app_state.vigia = { last_run, last_ok, vigiladas, errores, disparos: { "<id>:<tipo>": { nivel, at, precio } } }.
// Un disparo es de una sola vez por posición, tipo y nivel: si cambias el nivel, se rearma.
// Unidades: el nivel se compara tal cual con el precio de Yahoo del símbolo canónico (tabla symbols);
// ponlo en la moneda de cotización. Londres: Yahoo da peniques (GBp) y BTP guarda los niveles en £ (como XTB):
// el precio GBp se pasa a £ antes de comparar (05/10/2026).
// Las alertas se escriben con autor 'belar' (la tabla alerts solo admite 'app' y 'belar'; el sufijo "(Vigía BTP)" las distingue).

import { autorizarUsuario, rest } from './_belar.js'
import { H } from './_yahoo.js'

const CERCA = 2          // % de distancia para el aviso de proximidad
const NTFY = 'https://ntfy.sh/'
const APP = 'https://btp-belar.vercel.app/'

async function cotizacion(symbol) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`, { headers: H })
  if (!r.ok) throw new Error(`${symbol}: HTTP ${r.status}`)
  const j = await r.json()
  const meta = j?.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice) throw new Error(`${symbol}: sin precio`)
  const now = Math.floor(Date.now() / 1000)
  const p = meta.currentTradingPeriod?.regular
  const cripto = meta.instrumentType === 'CRYPTOCURRENCY' || /-USD$/.test(symbol)
  const abierto = cripto || (p && now >= p.start && now < p.end)
  const k = meta.currency === 'GBp' || meta.currency === 'GBX' ? 0.01 : 1   // peniques → £
  // Mínimo/máximo del día solo si son coherentes con el precio (Yahoo a veces da 0 o valores de otra sesión)
  const precio = meta.regularMarketPrice * k
  // 14/10/2026: mínimo/máximo de las velas de 5 min de la sesión regular de HOY, no de meta.regularMarketDayLow
  // (el 06/10 a la apertura de Londres dio un mínimo falso bajo el SL de ZEG.L con el precio a 17,80).
  // Además se descartan velas a más de un 8 % del precio (prints sueltos).
  const res0 = j.chart.result[0], ts = res0.timestamp || [], qq = res0.indicators?.quote?.[0] || {}
  let lo = precio, hi = precio
  for (let i = 0; i < ts.length; i++) {
    if (p && (ts[i] < p.start || ts[i] >= p.end)) continue
    const l = Number(qq.low?.[i]) * k, h = Number(qq.high?.[i]) * k
    if (l > 0 && Math.abs(l / precio - 1) <= 0.08) lo = Math.min(lo, l)
    if (h > 0 && Math.abs(h / precio - 1) <= 0.08) hi = Math.max(hi, h)
  }
  return {
    precio,
    minimo: lo,
    maximo: hi,
    moneda: k === 1 ? meta.currency : 'GBP', abierto, at: (meta.regularMarketTime || now) * 1000,
  }
}

async function push(topic, { titulo, mensaje, prioridad = 4, tags = [] }) {
  if (!topic) return false
  const r = await fetch(NTFY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, title: titulo, message: mensaje, priority: prioridad, tags, click: APP }),
  })
  return r.ok
}

// Supabase a veces devuelve 500 transitorio ("JWT issued at future"): un reintento a los 2 s (14/10/2026)
async function rest2(path, opts) {
  try { return await rest(path, opts) } catch (e) { await new Promise(r => setTimeout(r, 2000)); return rest(path, opts) }
}

const fx = n => Number(n).toLocaleString('es-ES', { maximumFractionDigits: 4 })
// BTC Combo MA200 sobre velas diarias: régimen por MA200 y RSI(14) de Wilder. dentro = hay posición de la Combo abierta.
async function comboBTC(dentro) {
  const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?range=2y&interval=1d', { headers: H })
  if (!r.ok) throw new Error('BTC-USD: HTTP ' + r.status)
  const res0 = (await r.json())?.chart?.result?.[0], ts = res0?.timestamp || [], cl = res0?.indicators?.quote?.[0]?.close || []
  const corte = Math.floor(Date.now() / 86400000) * 86400          // 00:00 UTC de hoy: la vela de hoy está en curso
  const P = ts.map((t, i) => ({ t, v: cl[i] })).filter(x => x.v != null && x.t < corte)
  if (P.length < 215) return null
  const C = P.map(x => x.v), n = C.length
  let g = 0, p = 0
  for (let i = 1; i <= 14; i++) { const d = C[i] - C[i - 1]; g += Math.max(d, 0); p += Math.max(-d, 0) }
  g /= 14; p /= 14
  const R = new Array(15).fill(null); R[14] = p ? 100 - 100 / (1 + g / p) : 100
  for (let i = 15; i < n; i++) { const d = C[i] - C[i - 1]; g = (g * 13 + Math.max(d, 0)) / 14; p = (p * 13 + Math.max(-d, 0)) / 14; R.push(p ? 100 - 100 / (1 + g / p) : 100) }
  const ma200 = C.slice(n - 200).reduce((a, x) => a + x, 0) / 200, cierre = C[n - 1], rsi = R[n - 1], prev = R[n - 2], mom = cierre > ma200
  const senal = dentro ? ((prev >= 50 && rsi < 50) || rsi >= 67.5 ? 'salida' : null) : ((mom && prev < 70 && rsi >= 70) || (!mom && rsi <= 27.5) ? 'entrada' : null)
  return { fecha: new Date(P[n - 1].t * 1000).toISOString().slice(0, 10), cierre: Math.round(cierre), ma200: Math.round(ma200), regimen: mom ? 'sobre la MA200' : 'bajo la MA200',
    rsi: Math.round(rsi * 10) / 10, rsiPrevio: Math.round(prev * 10) / 10, dentro, senal }
}

// Distancia al SL en % del precio: (px − sl) / px · 100 (misma fórmula que la tabla de Posiciones)
const aSL = (px, sl) => (px - sl) / px * 100

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  const err = await autorizarUsuario(req)
  if (err) { res.status(401).json({ error: err }); return }
  const topic = String(process.env.NTFY_TOPIC || '').trim()
  const dry = req.query.dry === '1'

  if (req.query.test === '1') {
    const ok = await push(topic, { titulo: 'BTP · Vigía: prueba', mensaje: 'Si lees esto, las alertas del Vigía te llegan al móvil.', prioridad: 3, tags: ['white_check_mark'] })
    res.status(ok ? 200 : 500).json({ ok, topic: topic ? 'configurado' : 'FALTA NTFY_TOPIC' })
    return
  }

  // Aviso suelto (15/11/2026): lo usa la pasada diaria de Belar programado. Desde la nube de Claude no se puede publicar
  // en ntfy (la cuota es por IP y esa IP es compartida), así que el aviso sale desde aquí, por el mismo canal del Vigía.
  if (req.query.aviso === '1') {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const titulo = String(b.titulo || '').slice(0, 120), mensaje = String(b.mensaje || '').slice(0, 900)
    if (req.method !== 'POST' || !titulo || !mensaje) { res.status(400).json({ error: 'POST con titulo y mensaje' }); return }
    const ok = await push(topic, { titulo, mensaje, prioridad: [3, 4, 5].includes(b.prioridad) ? b.prioridad : 3,
      tags: Array.isArray(b.tags) && b.tags.length ? b.tags.slice(0, 3).map(String) : ['bell'] })
    res.status(ok ? 200 : 502).json({ ok, topic: topic ? 'configurado' : 'FALTA NTFY_TOPIC' })
    return
  }

  try { await pasada(req, res, topic, dry) }
  catch (e) {   // nunca 500 por un fallo transitorio: se registra y responde 200 (cron-job.org dejaba de mandar correos de fallo)
    const msg = String(e?.message || e).slice(0, 300)
    try { await rest2('app_state?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { key: 'vigia_error', value: { at: new Date().toISOString(), error: msg }, updated_at: new Date().toISOString() } }) } catch {}
    res.status(200).json({ ok: false, error: msg })
  }
}

async function pasada(req, res, topic, dry) {
  const ahora = new Date().toISOString()
  // BTP v4 (15/11/2026): se vigilan TODAS las posiciones con stop u objetivo, no solo las marcadas 🔔. En las marcadas
  // (sl_type = ALERTA) el bróker no tiene la orden y el cierre es manual; en el resto el aviso es informativo.
  // La distancia de aviso depende de la volatilidad: un ATR (aviso 1) y medio ATR (aviso 2), con el ATR que deja la pasada
  // diaria de Belar en app_state.belar_diario.niveles; sin ATR, el 2 % de siempre.
  const [pos, sims, st, di, cb] = await Promise.all([
    rest2('positions?select=id,ticker,broker,sl_price,tp_price,sl_type,bloque&or=(sl_price.not.is.null,tp_price.not.is.null)'),
    rest2('symbols?select=ticker,yahoo_symbol'),
    rest2('app_state?select=value&key=eq.vigia'),
    rest2('app_state?select=value&key=eq.belar_diario'),
    rest2('positions?select=id&bloque=eq.BTC_COMBO'),
  ])
  const niveles = di?.[0]?.value?.niveles || []
  const atrDe = p => { const n = niveles.find(x => x.t === p.ticker && x.br === p.broker); return n && Number(n.atr) > 0 ? Number(n.atr) : null }
  const estado = st?.[0]?.value || {}
  const disparos = { ...(estado.disparos || {}) }
  const yahooDe = t => { const s = (sims || []).find(x => x.ticker === t); return s ? s.yahoo_symbol : t }

  const eventos = [], errores = [], vistas = []
  // Cotizaciones en paralelo (son una veintena de valores; en serie no cabrían en el tiempo de la función)
  const cots = await Promise.all((pos || []).map(async p => {
    const sym = yahooDe(p.ticker)
    if (!sym) return { p, sym, error: `${p.ticker}: sin símbolo cotizable` }
    try { return { p, sym, q: await cotizacion(sym) } } catch (e) { return { p, sym, error: e.message } }
  }))
  for (const { p, sym, q, error } of cots) {
    if (error) { if (p.sl_type === 'ALERTA') errores.push(error); continue }     // sin precio (p. ej. un copy trader): solo es error si era una vigilada 🔔
    const sl = p.sl_price != null ? Number(p.sl_price) : null
    const tp = p.tp_price != null ? Number(p.tp_price) : null
    const atr = atrDe(p), cerca = atr || CERCA, manual = p.sl_type === 'ALERTA'
    const dSL = sl ? aSL(q.precio, sl) : null, dTP = tp ? (tp / q.precio - 1) * 100 : null
    vistas.push({ id: p.id, ticker: p.ticker, simbolo: sym, precio: q.precio, abierto: q.abierto, sl, tp, a_sl: dSL, a_tp: dTP, atr })
    if (!q.abierto) continue                         // fuera de sesión no se dispara nada (evita precios de pre/post)
    const en = d => (atr ? `${(d / atr).toFixed(1)} ATR (${d.toFixed(1)} %)` : `${d.toFixed(1)} %`)
    const cola = manual ? `${p.broker}: el bróker no tiene la orden, cierre manual.` : `${p.broker}: la orden está en el bróker; aviso informativo.`
    const checks = []
    if (sl) {
      if (q.minimo <= sl) checks.push({ tipo: 'sl', nivel: sl, sev: 'alta', prioridad: 5, tags: ['rotating_light'],
        titulo: `${p.ticker}: tocó el stop ${fx(sl)}`, txt: `Precio ${fx(q.precio)} ${q.moneda} (mínimo del día ${fx(q.minimo)}). ${cola}` })
      else if (atr && dSL <= atr / 2) checks.push({ tipo: 'cerca2-sl', nivel: sl, sev: 'media', prioridad: 4, tags: ['warning'],
        titulo: `${p.ticker}: a ${en(dSL)} del stop`, txt: `Segundo aviso. Precio ${fx(q.precio)} ${q.moneda}; stop ${fx(sl)}. ${cola}` })
      else if (dSL <= cerca) checks.push({ tipo: 'cerca-sl', nivel: sl, sev: 'media', prioridad: 4, tags: ['warning'],
        titulo: `${p.ticker}: a ${en(dSL)} del stop`, txt: `Precio ${fx(q.precio)} ${q.moneda}; stop ${fx(sl)}. ${cola}` })
    }
    if (tp) {
      if (q.maximo >= tp) checks.push({ tipo: 'tp', nivel: tp, sev: 'alta', prioridad: 5, tags: ['moneybag'],
        titulo: `${p.ticker}: tocó el objetivo ${fx(tp)}`, txt: `Precio ${fx(q.precio)} ${q.moneda} (máximo del día ${fx(q.maximo)}). ${cola}` })
      else if (atr && dTP <= atr / 2) checks.push({ tipo: 'cerca2-tp', nivel: tp, sev: 'baja', prioridad: 3, tags: ['chart_with_upwards_trend'],
        titulo: `${p.ticker}: a ${en(dTP)} del objetivo`, txt: `Segundo aviso. Precio ${fx(q.precio)} ${q.moneda}; objetivo ${fx(tp)}. ${cola}` })
      else if (dTP <= cerca) checks.push({ tipo: 'cerca-tp', nivel: tp, sev: 'baja', prioridad: 3, tags: ['chart_with_upwards_trend'],
        titulo: `${p.ticker}: a ${en(dTP)} del objetivo`, txt: `Precio ${fx(q.precio)} ${q.moneda}; objetivo ${fx(tp)}. ${cola}` })
    }
    for (const c of checks) {
      const k = `${p.id}:${c.tipo}`
      if (disparos[k]?.nivel === c.nivel) continue   // ya avisado para este nivel
      eventos.push({ ...c, id: p.id, ticker: p.ticker })
      disparos[k] = { nivel: c.nivel, at: ahora, precio: q.precio }
    }
  }

  // BTC Combo MA200: una comprobación al día sobre la última vela diaria CERRADA (BTC-USD de Yahoo; TradingView manda).
  // Avisa solo cuando la señal cambia respecto a la última guardada (la primera vez guarda sin avisar).
  let combo = estado.combo || null
  try {
    const hoyUTC = ahora.slice(0, 10)
    if (!combo || combo.revisado !== hoyUTC) {
      const c = await comboBTC((cb || []).length > 0)
      if (c) {
        if (combo && c.senal && c.senal !== combo.senal) eventos.push({ tipo: 'combo', id: 'combo', ticker: 'BTC', sev: 'alta', prioridad: 5, tags: ['bell'],
          titulo: `BTC Combo: señal de ${c.senal} al cierre del ${c.fecha}`,
          txt: `Cierre ${fx(c.cierre)} $, MA200 ${fx(c.ma200)} (${c.regimen}), RSI ${c.rsi} (anterior ${c.rsiPrevio}). Confirmar en TradingView antes de ejecutar.` })
        combo = { ...c, revisado: hoyUTC }
      }
    }
  } catch (e) { errores.push('combo: ' + String(e.message).slice(0, 120)) }

  let enviados = 0
  if (!dry) {
    for (const e of eventos) {
      try {
        await rest2('alerts', { method: 'POST', prefer: 'return=minimal',
          body: { autor: 'belar', severidad: e.sev, ticker: e.ticker, titulo: e.titulo, detalle: e.txt + ' (Vigía BTP)', activa: true } })
      } catch (x) { errores.push(`Radar ${e.ticker}: ${String(x.message).slice(0, 160)}`) }
      try { if (await push(topic, { titulo: e.titulo, mensaje: e.txt, prioridad: e.prioridad, tags: e.tags })) enviados++ }
      catch (x) { errores.push(`push ${e.ticker}: ${x.message}`) }
    }
    // Disparos de posiciones que ya no se vigilan: fuera, para que no crezca sin fin
    const ids = new Set((pos || []).map(p => String(p.id)))
    for (const k of Object.keys(disparos)) if (!ids.has(k.split(':')[0])) delete disparos[k]
    await rest2('app_state?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { key: 'vigia', value: { last_run: ahora, last_ok: errores.length ? estado.last_ok || null : ahora, vigiladas: vistas.length, errores, disparos, combo }, updated_at: ahora } })
  }
  res.status(200).json({ ok: true, dry, at: ahora, vigiladas: vistas.length, eventos: eventos.map(e => e.titulo), enviados, push: topic ? 'ntfy' : 'FALTA NTFY_TOPIC', errores, vistas })
}

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
  const dayLow = Number(meta.regularMarketDayLow) * k, dayHigh = Number(meta.regularMarketDayHigh) * k
  return {
    precio,
    minimo: dayLow > 0 && dayLow <= precio ? dayLow : precio,
    maximo: dayHigh > 0 && dayHigh >= precio ? dayHigh : precio,
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

const fx = n => Number(n).toLocaleString('es-ES', { maximumFractionDigits: 4 })
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

  const ahora = new Date().toISOString()
  const [pos, sims, st] = await Promise.all([
    rest('positions?select=id,ticker,broker,sl_price,tp_price,sl_type,bloque&sl_type=eq.ALERTA'),
    rest('symbols?select=ticker,yahoo_symbol'),
    rest('app_state?select=value&key=eq.vigia'),
  ])
  const estado = st?.[0]?.value || {}
  const disparos = { ...(estado.disparos || {}) }
  const yahooDe = t => { const s = (sims || []).find(x => x.ticker === t); return s ? s.yahoo_symbol : t }

  const eventos = [], errores = [], vistas = []
  for (const p of pos || []) {
    const sym = yahooDe(p.ticker)
    if (!sym) { errores.push(`${p.ticker}: sin símbolo cotizable`); continue }
    let q
    try { q = await cotizacion(sym) } catch (e) { errores.push(e.message); continue }
    const sl = p.sl_price != null ? Number(p.sl_price) : null
    const tp = p.tp_price != null ? Number(p.tp_price) : null
    vistas.push({ id: p.id, ticker: p.ticker, simbolo: sym, precio: q.precio, abierto: q.abierto, sl, tp,
      a_sl: sl ? aSL(q.precio, sl) : null, a_tp: tp ? (tp / q.precio - 1) * 100 : null })
    if (!q.abierto) continue                         // fuera de sesión no se dispara nada (evita precios de pre/post)
    const checks = []
    if (sl) {
      if (q.minimo <= sl) checks.push({ tipo: 'sl', nivel: sl, sev: 'alta', prioridad: 5, tags: ['rotating_light'],
        titulo: `${p.ticker}: tocó el suelo/SL ${fx(sl)}`, txt: `Precio ${fx(q.precio)} ${q.moneda} (mínimo del día ${fx(q.minimo)}). ${p.broker}: cierre manual según su invalidación.` })
      else if (aSL(q.precio, sl) <= CERCA) checks.push({ tipo: 'cerca-sl', nivel: sl, sev: 'media', prioridad: 4, tags: ['warning'],
        titulo: `${p.ticker}: a ${aSL(q.precio, sl).toFixed(1)} % del suelo/SL`, txt: `Precio ${fx(q.precio)} ${q.moneda}; nivel ${fx(sl)}. ${p.broker}.` })
    }
    if (tp) {
      if (q.maximo >= tp) checks.push({ tipo: 'tp', nivel: tp, sev: 'alta', prioridad: 5, tags: ['moneybag'],
        titulo: `${p.ticker}: tocó el TP ${fx(tp)}`, txt: `Precio ${fx(q.precio)} ${q.moneda} (máximo del día ${fx(q.maximo)}). ${p.broker}: cierre manual del TP.` })
      else if ((tp / q.precio - 1) * 100 <= CERCA) checks.push({ tipo: 'cerca-tp', nivel: tp, sev: 'baja', prioridad: 3, tags: ['chart_with_upwards_trend'],
        titulo: `${p.ticker}: a ${((tp / q.precio - 1) * 100).toFixed(1)} % del TP`, txt: `Precio ${fx(q.precio)} ${q.moneda}; TP ${fx(tp)}. ${p.broker}.` })
    }
    for (const c of checks) {
      const k = `${p.id}:${c.tipo}`
      if (disparos[k]?.nivel === c.nivel) continue   // ya avisado para este nivel
      eventos.push({ ...c, id: p.id, ticker: p.ticker })
      disparos[k] = { nivel: c.nivel, at: ahora, precio: q.precio }
    }
  }

  let enviados = 0
  if (!dry) {
    for (const e of eventos) {
      try {
        await rest('alerts', { method: 'POST', prefer: 'return=minimal',
          body: { autor: 'belar', severidad: e.sev, ticker: e.ticker, titulo: e.titulo, detalle: e.txt + ' (Vigía BTP)', activa: true } })
      } catch (x) { errores.push(`Radar ${e.ticker}: ${String(x.message).slice(0, 160)}`) }
      try { if (await push(topic, { titulo: e.titulo, mensaje: e.txt, prioridad: e.prioridad, tags: e.tags })) enviados++ }
      catch (x) { errores.push(`push ${e.ticker}: ${x.message}`) }
    }
    // Disparos de posiciones que ya no se vigilan: fuera, para que no crezca sin fin
    const ids = new Set((pos || []).map(p => String(p.id)))
    for (const k of Object.keys(disparos)) if (!ids.has(k.split(':')[0])) delete disparos[k]
    await rest('app_state?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { key: 'vigia', value: { last_run: ahora, last_ok: errores.length ? estado.last_ok || null : ahora, vigiladas: vistas.length, errores, disparos }, updated_at: ahora } })
  }
  res.status(200).json({ ok: true, dry, at: ahora, vigiladas: vistas.length, eventos: eventos.map(e => e.titulo), enviados, push: topic ? 'ntfy' : 'FALTA NTFY_TOPIC', errores, vistas })
}

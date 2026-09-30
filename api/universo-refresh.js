// BTP · /api/universo-refresh?paso=auto|forzar|estado|prueba&presupuesto=45
// Refresco del universo del Buscador (Tesis JOSE −11/+23,5) desde el screener de Yahoo.
// Reanudable: cada llamada trabaja hasta `presupuesto` segundos, guarda el progreso en
// app_state.universo_refresh y devuelve { pendiente: true } si queda tarea. El cliente
// (Buscador) encadena llamadas hasta terminar; también vale un cron o Belar por curl.
// Datos de CIERRE, sin tiempo real (decisión 30/09/2026): se refresca una vez al día.
// Auth: BELAR_TOKEN, CRON_SECRET o sesión Supabase del usuario de la app.

import { autorizarUsuario, rest, sinCache, ahora } from './_belar.js'
import { screener, tiposCambioUSD, sesionYahoo, sparkLote, chart, H_CHROME } from './_yahoo.js'

export const config = { maxDuration: 60 }

const SECTORES = ['Technology', 'Healthcare', 'Financial Services', 'Industrials', 'Consumer Cyclical', 'Communication Services',
  'Consumer Defensive', 'Energy', 'Basic Materials', 'Real Estate', 'Utilities']

// Grupos de mercado: bolsas primarias, moneda de la bolsa, suelo de capitalización en USD
// y monedas de reporte admitidas (quita listados extranjeros: Toyota en Londres, NVDA en Varsovia).
const GRUPOS = [
  { market: 'US',    ex: ['NMS', 'NGM', 'NCM', 'NYQ', 'ASE'], moneda: 'USD', suelo: 150e6, fin: null },
  { market: 'EU',    ex: ['LSE'], moneda: 'GBP', suelo: 500e6, fin: ['GBP', 'EUR', 'USD', 'CHF', 'SEK', 'DKK', 'NOK'] },
  { market: 'EU',    ex: ['GER', 'PAR', 'MCE', 'MIL', 'AMS', 'BRU', 'HEL', 'VIE', 'LIS', 'ISE'], moneda: 'EUR', suelo: 500e6, fin: ['EUR', 'GBP', 'CHF', 'SEK', 'DKK', 'NOK', 'PLN', 'USD'] },
  { market: 'EU',    ex: ['EBS'], moneda: 'CHF', suelo: 500e6, fin: ['CHF', 'EUR', 'USD'] },
  { market: 'EU',    ex: ['STO'], moneda: 'SEK', suelo: 500e6, fin: ['SEK', 'EUR', 'USD'] },
  { market: 'EU',    ex: ['CPH'], moneda: 'DKK', suelo: 500e6, fin: ['DKK', 'EUR', 'USD'] },
  { market: 'EU',    ex: ['OSL'], moneda: 'NOK', suelo: 500e6, fin: ['NOK', 'USD', 'EUR'] },
  { market: 'EU',    ex: ['WSE'], moneda: 'PLN', suelo: 500e6, fin: ['PLN', 'EUR'] },
  { market: 'JPKR',  ex: ['JPX'], moneda: 'JPY', suelo: 1e9, fin: ['JPY'] },
  { market: 'JPKR',  ex: ['KSC', 'KOE'], moneda: 'KRW', suelo: 1e9, fin: ['KRW'] },
  { market: 'CN',    ex: ['HKG'], moneda: 'HKD', suelo: 1e9, fin: ['HKD', 'CNY', 'USD'] },
  { market: 'OTROS', ex: ['TOR'], moneda: 'CAD', suelo: 1e9, fin: ['CAD', 'USD'] },
  { market: 'OTROS', ex: ['ASX'], moneda: 'AUD', suelo: 1e9, fin: ['AUD', 'USD'] },
]
const ADR_FIN = { CNY: 'CN', HKD: 'CN', JPY: 'JPKR', KRW: 'JPKR', EUR: 'EU', GBP: 'EU', CHF: 'EU', SEK: 'EU', DKK: 'EU', NOK: 'EU', PLN: 'EU', CAD: 'OTROS', AUD: 'OTROS', TWD: 'OTROS', INR: 'OTROS', BRL: 'OTROS', ILS: 'OTROS', SGD: 'OTROS', MXN: 'OTROS', ZAR: 'OTROS' }

const tareas = () => GRUPOS.flatMap((g, gi) => SECTORES.map(sector => ({ gi, sector })))

const monedaCap = c => c === 'GBp' ? 'GBP' : c === 'ZAc' ? 'ZAR' : c === 'ILA' ? 'ILS' : c
const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null
const fecha = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null

function fila(q, g, sector, fx) {
  const mc = monedaCap(q.currency)
  const tcCap = fx[mc] ?? null
  const tcPx = fx[q.currency] ?? (q.currency === 'GBp' && fx.GBP ? fx.GBP / 100 : null)
  const cap = num(q.marketCap) && tcCap ? q.marketCap * tcCap : null
  const price = num(q.regularMarketPrice)
  const priceUsd = price != null && tcPx ? price * tcPx : null
  const m = String(q.averageAnalystRating || '').match(/^([\d.]+)\s*-\s*(.+)$/)
  const ma50 = num(q.fiftyDayAverage), ma200 = num(q.twoHundredDayAverage), h52 = num(q.fiftyTwoWeekHigh), l52 = num(q.fiftyTwoWeekLow)
  const volAvg = num(q.averageDailyVolume3Month)
  const adr = g.market === 'US' && q.financialCurrency && q.financialCurrency !== 'USD' ? (ADR_FIN[q.financialCurrency] || 'OTROS') : null
  return {
    symbol: q.symbol,
    name: q.longName || q.shortName || q.displayName || q.symbol,
    market: g.market, exchange: q.exchange || null, exchange_name: q.fullExchangeName || null,
    adr, sector, currency: q.currency || null, fin_currency: q.financialCurrency || null,
    price, price_usd: priceUsd, cap_usd: cap, cap_local: num(q.marketCap),
    pe_trailing: num(q.trailingPE), pe_forward: num(q.forwardPE), eps_ttm: num(q.epsTrailingTwelveMonths),
    pb: num(q.priceToBook), div_yield: num(q.dividendYield),
    rating: m ? Number(m[1]) : null, rating_label: m ? m[2].trim() : null,
    earnings_date: fecha(q.earningsTimestamp || q.earningsTimestampStart), earnings_estimada: q.isEarningsDateEstimate ?? null,
    ma50, ma200,
    dist_ma50: price && ma50 ? (price / ma50 - 1) * 100 : null,
    dist_ma200: price && ma200 ? (price / ma200 - 1) * 100 : null,
    high52: h52, low52: l52,
    dist_high52: price && h52 ? (price / h52 - 1) * 100 : null,
    perf_1y: num(q.fiftyTwoWeekChangePercent),
    vol_avg: volAvg, vol_usd: volAvg != null && priceUsd != null ? volAvg * priceUsd : null,
    activo: true, updated_at: ahora(),
  }
}

async function leerEstado() {
  const r = await rest(`app_state?select=value&key=eq.universo_refresh`)
  return r?.[0]?.value || null
}
async function guardarEstado(v) {
  await rest(`app_state?on_conflict=key`, { method: 'POST', body: [{ key: 'universo_refresh', value: v, updated_at: ahora() }], prefer: 'resolution=merge-duplicates,return=minimal' })
}

export default async function handler(req, res) {
  sinCache(res)
  const err = await autorizarUsuario(req)
  if (err) { res.status(401).json({ error: err }); return }
  const paso = String(req.query.paso || 'auto')
  const presupuesto = Math.min(50, Math.max(5, Number(req.query.presupuesto) || 42)) * 1000
  const t0 = Date.now()

  // paso=prueba: diagnóstico de las puertas de Yahoo desde Vercel, sin tocar la base de datos
  if (paso === 'prueba') {
    const out = { served_at: ahora() }
    try { const s = await sesionYahoo(true); out.sesion = `cookie ${s.cookie.length} chars, crumb ${s.crumb.length} chars` } catch (e) { out.sesion = 'ERROR ' + e.message }
    try { const p = await screener([{ operator: 'eq', operands: ['exchange', 'NMS'] }, { operator: 'gt', operands: ['intradaymarketcap', 1e12] }], { size: 3 }); out.screener = `total ${p.total}: ${p.quotes.map(q => q.symbol).join(', ')}` } catch (e) { out.screener = 'ERROR ' + e.message }
    try { const x = await sparkLote(['NVDA', 'EURUSD=X'], '5d', '1d', true); out.spark_sesion = Object.keys(x).join(', ') || 'vacío' } catch (e) { out.spark_sesion = 'ERROR ' + e.message }
    try { const x = await sparkLote(['NVDA', 'EURUSD=X'], '5d', '1d', false); out.spark_sin_sesion = Object.keys(x).join(', ') || 'vacío' } catch (e) { out.spark_sin_sesion = 'ERROR ' + e.message }
    try { const c = await chart('NVDA', '5d', '1d'); out.chart = `${c.close.filter(v => v != null).length} cierres` } catch (e) { out.chart = 'ERROR ' + e.message }
    try { const c = await chart('NVDA', '5d', '1d', H_CHROME); out.chart_ua_chrome = `${c.close.filter(v => v != null).length} cierres` } catch (e) { out.chart_ua_chrome = 'ERROR ' + e.message }
    out.ms = Date.now() - t0
    res.status(200).json(out); return
  }

  try {
    let st = await leerEstado()
    if (paso === 'estado') { res.status(200).json({ estado: st, served_at: ahora() }); return }

    const todas = tareas()
    const hayPendiente = st && st.activo && st.i < todas.length
    if (!hayPendiente) {
      // Al día si terminó hace menos de 18 h (un refresco por día tras el cierre americano)
      if (paso !== 'forzar' && st?.fin && Date.now() - new Date(st.fin).getTime() < 18 * 3600e3) {
        res.status(200).json({ ok: true, al_dia: true, estado: st, served_at: ahora() }); return
      }
      st = { activo: true, inicio: ahora(), i: 0, offset: 0, hechos: 0, escritos: 0, errores: [], n_tareas: todas.length, fx_at: null, fx: null, fin: null, ultimo_fin: st?.fin || null }
    }
    if (!st.fx || Date.now() - new Date(st.fx_at).getTime() > 12 * 3600e3) { st.fx = await tiposCambioUSD(); st.fx_at = ahora() }
    const fx = st.fx

    let llamadas = 0
    while (st.i < todas.length && Date.now() - t0 < presupuesto) {
      const { gi, sector } = todas[st.i]
      const g = GRUPOS[gi]
      const sueloLocal = Math.round(g.suelo / (fx[g.moneda] || 1))
      const operands = [
        { operator: 'or', operands: g.ex.map(e => ({ operator: 'eq', operands: ['exchange', e] })) },
        { operator: 'eq', operands: ['sector', sector] },
        { operator: 'gt', operands: ['intradaymarketcap', sueloLocal] },
      ]
      let pagina
      try {
        pagina = await screener(operands, { size: 250, offset: st.offset })
        llamadas++
      } catch (e) {
        st.errores = [...(st.errores || []).slice(-9), `${g.market}/${g.ex[0]}/${sector}@${st.offset}: ${e.message}`]
        // Tarea que falla dos veces seguidas: se salta para no bloquear el refresco
        if (st.fallo === `${st.i}:${st.offset}`) { st.i++; st.offset = 0; st.fallo = null } else st.fallo = `${st.i}:${st.offset}`
        await guardarEstado(st)
        continue
      }
      const filas = pagina.quotes
        .filter(q => q.symbol && num(q.marketCap) > 0 && num(q.regularMarketPrice) > 0)
        .filter(q => !g.fin || !q.financialCurrency || g.fin.includes(q.financialCurrency))
        .map(q => fila(q, g, sector, fx))
        .filter(f => f.cap_usd != null && f.cap_usd >= g.suelo * 0.9)   // suelo en USD real (el del screener es en moneda local)
      if (filas.length) {
        await rest(`universo?on_conflict=symbol`, { method: 'POST', body: filas, prefer: 'resolution=merge-duplicates,return=minimal' })
        st.escritos += filas.length
      }
      st.hechos += pagina.quotes.length
      if (pagina.quotes.length < 250) { st.i++; st.offset = 0 } else st.offset += 250
      st.fallo = null
      await guardarEstado(st)
    }

    let pendiente = st.i < todas.length
    if (!pendiente) {
      // Fin de la pasada: lo que no ha aparecido en este refresco deja de estar activo
      await rest(`universo?updated_at=lt.${encodeURIComponent(st.inicio)}&activo=eq.true`, { method: 'PATCH', body: { activo: false }, prefer: 'return=minimal' })
      st.activo = false; st.fin = ahora()
      await guardarEstado(st)
    }
    res.status(200).json({ ok: true, pendiente, llamadas, ms: Date.now() - t0, estado: { ...st, fx: undefined }, served_at: ahora() })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), served_at: ahora() })
  }
}

// BTP · GET /api/activos?tipo=ETF|INDICE|CRIPTO[&forzar=1] — Buscador, pestañas no-acciones (02/10/2026).
// Métricas desde cierres diarios de 1 año (Yahoo spark) + nombre y metadatos (quote v7).
// Caché diaria en app_state.activos_<tipo>: el primer acceso del día calcula, los demás leen.
// Sin auth: datos públicos de mercado (como /api/universo).
import { rest, sinCache, ahora } from './_belar.js'
import { spark, quotesV7 } from './_yahoo.js'
import { ETF, INDICE, CRIPTO } from './_activos.js'

export const config = { maxDuration: 60 }

const r2 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100
const pct = (a, b) => a != null && b ? (a / b - 1) * 100 : null

export function metricas(close) {
  const c = (close || []).filter(v => v != null && Number.isFinite(v))
  if (c.length < 30) return null
  const n = c.length, ult = c[n - 1]
  const atras = k => n > k ? c[n - 1 - k] : null
  const ma = k => n >= k ? c.slice(-k).reduce((a, v) => a + v, 0) / k : null
  const cambios = []
  for (let i = Math.max(1, n - 14); i < n; i++) cambios.push(Math.abs(c[i] / c[i - 1] - 1) * 100)
  // RSI 14 de Wilder
  let g = 0, p = 0
  for (let i = 1; i <= 14 && i < n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else p -= d }
  g /= 14; p /= 14
  for (let i = 15; i < n; i++) { const d = c[i] - c[i - 1]; g = (g * 13 + Math.max(d, 0)) / 14; p = (p * 13 + Math.max(-d, 0)) / 14 }
  const rsi = p === 0 ? 100 : 100 - 100 / (1 + g / p)
  const ma50 = ma(50), ma200 = ma(200), max52 = Math.max(...c.slice(-252))
  return {
    price: r2(ult), perf_1m: r2(pct(ult, atras(21))), perf_3m: r2(pct(ult, atras(63))), perf_6m: r2(pct(ult, atras(126))),
    perf_1y: r2(pct(ult, c[0])), dist_ma50: r2(pct(ult, ma50)), dist_ma200: r2(pct(ult, ma200)),
    dist_high52: r2(pct(ult, max52)), high52: r2(max52),
    atr_pct: r2(cambios.reduce((a, v) => a + v, 0) / cambios.length), rsi14: r2(rsi),
  }
}

function lista(tipo) {
  if (tipo === 'ETF') return ETF.map(([symbol, categoria, ucits, acum, replica]) => ({ symbol, categoria, ucits: !!ucits, acumulacion: !!acum, replica }))
  if (tipo === 'INDICE') return INDICE.map(([symbol, region, etf]) => ({ symbol, categoria: region, etf_ucits: etf }))
  if (tipo === 'CRIPTO') return CRIPTO.map(symbol => ({ symbol, categoria: symbol === 'VBTC.DE' ? 'Vehículo bróker' : 'Cripto' }))
  return null
}

export default async function handler(req, res) {
  sinCache(res)
  const tipo = String(req.query.tipo || '').toUpperCase()
  const base = lista(tipo)
  if (!base) { res.status(400).json({ error: 'tipo = ETF | INDICE | CRIPTO' }); return }
  const clave = 'activos_' + tipo.toLowerCase()
  const hoy = ahora().slice(0, 10)
  try {
    if (req.query.forzar !== '1') {
      const st = await rest(`app_state?select=value&key=eq.${clave}`)
      const v = st?.[0]?.value
      if (v?.dia === hoy && v.filas?.length === base.length) { res.status(200).json({ ...v, cache: true }); return }
    }
    const syms = base.map(b => b.symbol)
    const [series, quotes] = await Promise.all([
      spark(syms, '1y', '1d'),
      quotesV7(syms).catch(() => []),
    ])
    const Q = Object.fromEntries(quotes.map(q => [q.symbol, q]))
    const filas = base.map(b => {
      const q = Q[b.symbol] || {}
      const s = series[b.symbol]
      const m = metricas(s?.close) || {}
      const ts = s?.timestamp?.length ? s.timestamp[s.timestamp.length - 1] * 1000 : null
      return {
        ...b, tipo, ...m,
        name: q.longName || q.shortName || b.replica || b.symbol,
        currency: q.currency || null, exchange_name: q.fullExchangeName || q.exchange || null,
        quote_type: q.quoteType || null,
        ter: q.netExpenseRatio ?? null, aum_usd: q.netAssets ?? q.totalAssets ?? null,
        cap_usd: tipo === 'CRIPTO' ? (q.marketCap ?? null) : null,
        ultimo_at: ts,
      }
    })
    const value = { dia: hoy, at: ahora(), tipo, filas }
    await rest('app_state?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { key: clave, value, updated_at: ahora() } })
    res.status(200).json({ ...value, cache: false })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), served_at: ahora() })
  }
}

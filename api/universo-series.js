// BTP · POST /api/universo-series  { symbols: [...] }  (≤100)
// Tendencia por valor a partir de los cierres diarios de Yahoo (spark, 1 año):
// perf 3 sesiones / 1M / 3M / 6M / 1A, MA20, ATR≈ (media del |cambio diario| en 14 sesiones)
// y distancia a la MA20 en ATRs (regla "no perseguir": >2×ATR o +8 % en 3 sesiones).
// Se guarda en `universo` con series_at para no repetir el cálculo el mismo día.
// Auth: sesión Supabase del usuario, BELAR_TOKEN o CRON_SECRET.

import { autorizarUsuario, rest, sinCache, ahora } from './_belar.js'
import { spark } from './_yahoo.js'

const pct = (a, b) => a != null && b ? (a / b - 1) * 100 : null
const r2 = v => v == null ? null : Math.round(v * 100) / 100

export function tendencia(close) {
  const c = (close || []).filter(v => v != null && Number.isFinite(v))
  if (c.length < 25) return null
  const ult = c.at(-1)
  const atras = n => c.length > n ? c[c.length - 1 - n] : null
  const ma = n => c.length >= n ? c.slice(-n).reduce((a, v) => a + v, 0) / n : null
  const ma20 = ma(20)
  const cambios = []
  for (let i = Math.max(1, c.length - 14); i < c.length; i++) cambios.push(Math.abs(c[i] / c[i - 1] - 1) * 100)
  const atr = cambios.length ? cambios.reduce((a, v) => a + v, 0) / cambios.length : null
  const distMa20Atr = ma20 && atr ? ((ult / ma20 - 1) * 100) / atr : null
  const perf3d = pct(ult, atras(3))
  return {
    perf_3d: r2(perf3d), perf_1m: r2(pct(ult, atras(21))), perf_3m: r2(pct(ult, atras(63))),
    perf_6m: r2(pct(ult, atras(126))), perf_1y_serie: r2(pct(ult, c[0])),
    ma20: r2(ma20), atr_pct: r2(atr), dist_ma20_atr: r2(distMa20Atr),
    perseguir: (perf3d != null && perf3d > 8) || (distMa20Atr != null && distMa20Atr > 2),
    sesiones: c.length,
  }
}

export default async function handler(req, res) {
  sinCache(res)
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST' }); return }
  const err = await autorizarUsuario(req)
  if (err) { res.status(401).json({ error: err }); return }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const symbols = [...new Set((body.symbols || []).map(s => String(s).trim()).filter(Boolean))].slice(0, 100)
  if (!symbols.length) { res.status(400).json({ error: 'symbols vacío' }); return }
  try {
    // Solo símbolos que existen en el universo (nunca crea filas nuevas)
    const existentes = new Set((await rest(`universo?select=symbol&symbol=in.(${symbols.map(s => `"${s}"`).join(',')})`)).map(r => r.symbol))
    const series = await spark(symbols, '1y', '1d')
    const filas = []
    for (const s of symbols) {
      const t = tendencia(series[s]?.close)
      if (!t) continue
      const { perseguir, sesiones, perf_1y_serie, ...cols } = t
      filas.push({ symbol: s, ...cols, series_at: ahora() })
    }
    const aGuardar = filas.filter(f => existentes.has(f.symbol))
    if (aGuardar.length) await rest(`universo?on_conflict=symbol`, { method: 'POST', body: aGuardar, prefer: 'resolution=merge-duplicates,return=minimal' })
    res.status(200).json({ n: filas.length, filas, served_at: ahora() })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), served_at: ahora() })
  }
}

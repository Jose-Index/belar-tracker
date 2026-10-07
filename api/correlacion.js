// BTP · POST /api/correlacion { symbols: [...] } (≤150) — correlación con la cartera (02/10/2026).
// Rendimientos SEMANALES de 1 año (robustos a husos horarios distintos entre bolsas). Desde el 07/10/2026
// es una correlación REAL con la cartera: se construye la serie semanal de la cartera
// r_cart,t = Σ w_h · r_h,t (pesos por valor actual × apalancamiento, normalizados cada semana entre las
// posiciones con dato) y se calcula Pearson(r_s, r_cart) en las semanas presentes en ambas.
// Se excluye la propia posición si el símbolo ya está en cartera. Posiciones sin cotización (copy) fuera.
// Auth: sesión Supabase del usuario, BELAR_TOKEN o CRON_SECRET (lee positions).
import { autorizarUsuario, rest, sinCache, ahora } from './_belar.js'
import { spark } from './_yahoo.js'

export const config = { maxDuration: 60 }

function semanal(s) {
  const d = {}
  ;(s?.timestamp || []).forEach((t, i) => {
    const v = s.close?.[i]
    if (v == null || !Number.isFinite(v)) return
    const f = new Date((t + 6 * 3600) * 1000)            // fecha de mercado, no UTC de medianoche
    const j = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()))
    const dia = (j.getUTCDay() + 6) % 7
    j.setUTCDate(j.getUTCDate() - dia)                     // lunes de esa semana
    d[j.toISOString().slice(0, 10)] = v                    // último cierre de la semana
  })
  const k = Object.keys(d).sort()
  const out = {}
  for (let i = 1; i < k.length; i++) out[k[i]] = d[k[i]] / d[k[i - 1]] - 1
  return out
}
function corr(a, b) {
  const k = Object.keys(a).filter(x => x in b)
  if (k.length < 20) return null
  const x = k.map(i => a[i]), y = k.map(i => b[i])
  const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}

// Serie semanal de la cartera: { semana: Σ w_h·r_h ÷ Σ w_h } con las posiciones que tienen dato esa semana.
// Una semana solo cuenta si cubre al menos `cobertura` del peso total (evita semanas con 1-2 valores).
export function serieCartera(W, pesos, excluir = null, cobertura = 0.5) {
  const hs = Object.keys(pesos).filter(h => h !== excluir && pesos[h] > 0 && W[h])
  const total = hs.reduce((a, h) => a + pesos[h], 0)
  if (!total) return {}
  const acc = {}
  for (const h of hs) {
    for (const [t, r] of Object.entries(W[h])) {
      if (!Number.isFinite(r)) continue
      const a = (acc[t] ||= { num: 0, w: 0 })
      a.num += pesos[h] * r; a.w += pesos[h]
    }
  }
  const out = {}
  for (const [t, a] of Object.entries(acc)) if (a.w >= total * cobertura) out[t] = a.num / a.w
  return out
}

export default async function handler(req, res) {
  sinCache(res)
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST' }); return }
  const err = await autorizarUsuario(req)
  if (err) { res.status(401).json({ error: err }); return }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const symbols = [...new Set((body.symbols || []).map(s => String(s).trim()).filter(Boolean))].slice(0, 150)
  if (!symbols.length) { res.status(400).json({ error: 'symbols vacío' }); return }
  try {
    const [pos, sims] = await Promise.all([
      rest('positions?select=ticker,invested,current_value,apalancamiento'),
      rest('symbols?select=ticker,yahoo_symbol'),
    ])
    const ys = t => { const s = (sims || []).find(x => x.ticker === t); return s ? s.yahoo_symbol : t }
    const pesos = {}
    for (const p of pos || []) {
      const y = ys(p.ticker)
      if (!y) continue
      pesos[y] = (pesos[y] || 0) + Number(p.current_value || p.invested || 0) * (Number(p.apalancamiento) || 1)   // exposición
    }
    const cartera = Object.keys(pesos).filter(y => pesos[y] > 0)
    const series = await spark([...new Set([...cartera, ...symbols])], '1y', '1d')
    const W = Object.fromEntries(Object.entries(series).map(([k, v]) => [k, semanal(v)]))
    const out = {}
    const base = serieCartera(W, pesos)                       // cartera completa (símbolos que no están en ella)
    for (const s of symbols) {
      if (!W[s]) { out[s] = null; continue }
      const rc = pesos[s] > 0 ? serieCartera(W, pesos, s) : base   // si ya está en cartera, se excluye
      const c = corr(W[s], rc)
      out[s] = c == null ? null : Math.round(c * 100) / 100
    }
    res.status(200).json({ corr: out, cartera: cartera.length, served_at: ahora() })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), served_at: ahora() })
  }
}

// TWR — rentabilidad ponderada por tiempo (base 100).
// Cada semana: r = (V_t − F_t) / V_{t−1}, con F_t = aportaciones netas de la semana
// (importe REAL en USD del cambio; las aportaciones no son rendimiento).
// El índice encadena los r. Es el método estándar de los fondos: mide la gestión,
// no los depósitos.

export function serieTWR(weeks, contribs) {
  const ws = [...weeks]
    .map(w => ({ t: new Date(w.week_end + 'T00:00:00').getTime(), fecha: w.week_end, v: Number(w.total_value) }))
    .filter(w => w.v > 0)
    .sort((a, b) => a.t - b.t)
  if (ws.length < 2) return []

  // Sin importe_usd: el € se pasa a $ con el EURUSD del cierre semanal en o justo antes de esa fecha
  // (antes se sumaban euros como si fueran dólares). Sin EURUSD conocido, la aportación no cuenta.
  const flujos = (contribs || []).map(c => ({
    t: new Date(c.fecha + 'T00:00:00').getTime(),
    usd: usdDeAportacion(c, weeks) ?? 0,
  }))

  const out = [{ t: ws[0].t, fecha: ws[0].fecha, idx: 100 }]
  let idx = 100
  for (let i = 1; i < ws.length; i++) {
    const prev = ws[i - 1], cur = ws[i]
    const F = flujos.filter(f => f.t > prev.t && f.t <= cur.t).reduce((a, f) => a + f.usd, 0)
    if (prev.v > 0) {
      const r = (cur.v - F) / prev.v - 1
      idx = idx * (1 + r)
    }
    out.push({ t: cur.t, fecha: cur.fecha, idx })
  }
  return out
}

// TWR por broker (eToro, XTB, IBKR, monedero BTC), cada uno con SUS flujos
// (contributions.broker). Cada serie arranca en base 100 cuando el broker nace.
export function serieTWRDesglose(weeks, contribs) {
  const KEY = { etoro: 'etoro', xtb: 'xtb', ibkr: 'ibkr', btc: 'btc_usd' }
  const mapa = new Map()
  for (const b of Object.keys(KEY)) {
    const ws = weeks
      .map(w => {
        const d = w.desglose || w.legacy?.data || {}
        return { week_end: w.week_end, total_value: d[KEY[b]], eurusd: w.eurusd }
      })
      .filter(w => w.total_value != null)
    const serie = serieTWR(ws, (contribs || []).filter(c => c.broker === b))
    for (const p of serie) {
      const row = mapa.get(p.fecha) || { fecha: p.fecha }
      row[b] = p.idx
      mapa.set(p.fecha, row)
    }
  }
  return [...mapa.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
}

// ─── Utilidades puras (auditoría 07/10/2026) ──────────────────────────────

const diaUTC = f => {
  if (f instanceof Date) return Date.UTC(f.getFullYear(), f.getMonth(), f.getDate())
  const [y, m, d] = String(f).slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// EURUSD del cierre semanal en `fecha` o el más reciente anterior (null si no hay ninguno).
export function eurusdEn(weeks, fecha) {
  let fx = null, mejor = ''
  for (const w of weeks || []) {
    const x = Number(w.eurusd)
    if (!(x > 0) || !w.week_end || w.week_end > fecha) continue
    if (w.week_end >= mejor) { mejor = w.week_end; fx = x }
  }
  return fx
}

// Importe en USD de una aportación: importe_usd real; si falta, importe_eur × EURUSD del cierre
// semanal en/antes de su fecha. null = no se puede convertir (sin EURUSD anterior).
export function usdDeAportacion(c, weeks) {
  if (c?.importe_usd != null && c.importe_usd !== '' && Number.isFinite(Number(c.importe_usd))) return Number(c.importe_usd)
  const eur = Number(c?.importe_eur)
  if (!Number.isFinite(eur) || !eur) return eur === 0 ? 0 : null
  const fx = eurusdEn(weeks, c.fecha)
  return fx ? eur * fx : null
}

// Suma en USD de las aportaciones con desde < fecha <= hasta (fechas 'YYYY-MM-DD').
// Devuelve { total, flujos: [{fecha, importe}], sinCambio: n de aportaciones sin conversión posible }.
export function aportacionesEntre(contribs, desde, hasta, weeks) {
  const flujos = []
  let sinCambio = 0
  for (const c of contribs || []) {
    if (!c?.fecha || !(c.fecha > desde) || (hasta != null && c.fecha > hasta)) continue
    const usd = usdDeAportacion(c, weeks)
    if (usd == null) { sinCambio++; continue }
    flujos.push({ fecha: c.fecha, importe: usd })
  }
  return { total: flujos.reduce((a, f) => a + f.importe, 0), flujos, sinCambio }
}

// Rendimiento de un periodo con flujos (semana): (V_t − F_t) / V_{t−1} − 1, en %.
export function pctConFlujos(vAnterior, vActual, flujo = 0) {
  const a = Number(vAnterior), b = Number(vActual)
  if (!(a > 0) || !Number.isFinite(b)) return null
  return ((b - (Number(flujo) || 0)) / a - 1) * 100
}

// Dietz modificado. v0 en d0, v1 en d1; flujos [{ fecha, importe }] (positivos = aportación).
// R = (V1 − V0 − ΣF) / (V0 + Σ w_i·F_i), w_i = (d1 − fecha_i) / (d1 − d0) en días. Devuelve % o null.
// Solo cuentan los flujos con d0 < fecha <= d1.
export function rentabilidadDietz({ v0, d0, v1, d1, flujos = [] }) {
  const V0 = Number(v0), V1 = Number(v1)
  if (!(V0 > 0) || !Number.isFinite(V1) || !d0 || !d1) return null
  const t0 = diaUTC(d0), t1 = diaUTC(d1)
  const T = (t1 - t0) / 86400000
  if (!(T > 0)) return null
  let suma = 0, pond = 0
  for (const f of flujos || []) {
    const F = Number(f.importe)
    if (!Number.isFinite(F) || !f.fecha) continue
    const ti = diaUTC(f.fecha)
    if (!(ti > t0) || ti > t1) continue
    suma += F
    pond += F * ((t1 - ti) / 86400000) / T
  }
  const den = V0 + pond
  if (!(den > 0)) return null
  return (V1 - V0 - suma) / den * 100
}

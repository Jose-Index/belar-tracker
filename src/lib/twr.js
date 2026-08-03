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

  const flujos = (contribs || []).map(c => ({
    t: new Date(c.fecha + 'T00:00:00').getTime(),
    usd: Number(c.importe_usd ?? c.importe_eur ?? 0),
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

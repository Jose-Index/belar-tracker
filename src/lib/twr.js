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

// TWR por broker (eToro, XTB, IBKR, monedero BTC), cada uno con SUS flujos
// (contributions.broker). Cada serie arranca en base 100 cuando el broker nace.
export function serieTWRDesglose(weeks, contribs) {
  const KEY = { etoro: 'etoro', xtb: 'xtb', ibkr: 'ibkr', btc: 'btc_usd' }
  const mapa = new Map()
  for (const b of Object.keys(KEY)) {
    const ws = weeks
      .map(w => {
        const d = w.desglose || w.legacy?.data || {}
        return { week_end: w.week_end, total_value: d[KEY[b]] }
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

// BTP · /api/quotes?symbols=NVDA,^GSPC,EURUSD=X
// Precios vía Yahoo Finance (fuente primaria del protocolo) con timestamp y
// market_state por símbolo. SIN caché engañosa (lección del bug edge 02/08/2026).

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }

async function quote(symbol) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
      { headers: UA },
    )
    if (!r.ok) return { symbol, error: 'HTTP ' + r.status }
    const j = await r.json()
    const meta = j?.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) return { symbol, error: j?.chart?.error?.description || 'sin datos' }

    // market_state inferido de los periodos de negociación
    const now = Math.floor(Date.now() / 1000)
    const p = meta.currentTradingPeriod || {}
    let state = 'closed'
    if (p.regular && now >= p.regular.start && now < p.regular.end) state = 'open'
    else if (p.pre && now >= p.pre.start && now < p.pre.end) state = 'pre'
    else if (p.post && now >= p.post.start && now < p.post.end) state = 'post'

    // Cierre de la semana anterior: último cierre diario anterior al lunes 00:00 UTC
    // de la semana en curso (base de vari/sem en la tabla de posiciones).
    const res0 = j.chart.result[0]
    const ts = res0.timestamp || []
    const closes = res0.indicators?.quote?.[0]?.close || []
    const d = new Date(); const dow = (d.getUTCDay() + 6) % 7  // lunes = 0
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) / 1000
    let week_close = null, week_close_at = null
    for (let i = 0; i < ts.length; i++) {
      if (ts[i] < monday && closes[i] != null) { week_close = closes[i]; week_close_at = ts[i] * 1000 }
    }
    // prev_close: con range=1mo chartPreviousClose apunta al inicio del rango, no a ayer.
    // Se toma de la serie: último cierre de una sesión distinta a la del precio vivo.
    const off = meta.gmtoffset || 0
    const diaDe = t => Math.floor((t + off) / 86400)
    const hoy = diaDe(meta.regularMarketTime || now)
    let prev_close = null
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] != null && diaDe(ts[i]) < hoy) prev_close = closes[i]
    }
    if (prev_close == null) prev_close = meta.previousClose ?? meta.chartPreviousClose ?? null

    return {
      symbol,
      price: meta.regularMarketPrice,
      prev_close,
      week_close,
      week_close_at,
      currency: meta.currency,
      market_state: state,
      quoted_at: (meta.regularMarketTime || now) * 1000, // ms epoch del DATO, no de la respuesta
    }
  } catch (e) {
    return { symbol, error: String(e.message || e) }
  }
}

export default async function handler(req, res) {
  const symbols = String(req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 60)
  if (!symbols.length) { res.status(400).json({ error: 'symbols requerido' }); return }
  const out = await Promise.all(symbols.map(quote))
  res.setHeader('Cache-Control', 'no-store, max-age=0')   // regla de la casa
  res.setHeader('CDN-Cache-Control', 'no-store')
  res.status(200).json({ served_at: Date.now(), quotes: out })
}

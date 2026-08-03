// BTP · /api/history?symbol=NVDA&range=1mo
// Series históricas Yahoo para las gráficas de periodo (1D…MAX). Bajo demanda, sin almacenar.

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
const RANGES = {
  '1d': { range: '1d', interval: '5m' },
  '5d': { range: '5d', interval: '30m' },
  '1mo': { range: '1mo', interval: '1d' },
  '6mo': { range: '6mo', interval: '1d' },
  'ytd': { range: 'ytd', interval: '1d' },
  '1y': { range: '1y', interval: '1wk' },
  '5y': { range: '5y', interval: '1wk' },
  'max': { range: 'max', interval: '1mo' },
}

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || '')
  const r = RANGES[String(req.query.range || '1mo')] || RANGES['1mo']
  if (!symbol) { res.status(400).json({ error: 'symbol requerido' }); return }
  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${r.range}&interval=${r.interval}`,
      { headers: UA },
    )
    const j = await resp.json()
    const result = j?.chart?.result?.[0]
    if (!result) { res.status(404).json({ error: j?.chart?.error?.description || 'sin datos' }); return }
    const ts = result.timestamp || []
    const closes = result.indicators?.quote?.[0]?.close || []
    const points = ts.map((t, i) => ({ t: t * 1000, v: closes[i] })).filter(p => p.v != null)
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.status(200).json({ symbol, range: r.range, served_at: Date.now(), points, currency: result.meta?.currency })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}

import { NextResponse } from 'next/server'

const TICKERS = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'NASDAQ' },
  { symbol: '^IBEX', label: 'IBEX 35' },
  { symbol: '^STOXX50E', label: 'EUROSTOXX' },
  { symbol: 'GC=F', label: 'ORO' },
  { symbol: '^VIX', label: 'VIX' },
  { symbol: 'EURUSD=X', label: 'EUR/USD' },
  { symbol: 'BTC-USD', label: 'BTC' },
]

export const revalidate = 60

export async function GET() {
  try {
    const symbols = TICKERS.map(t => t.symbol).join(',')
    const url = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(symbols)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'application/json',
      },
    })
    if (!res.ok) throw new Error('Yahoo API failed')
    const data = await res.json()
    const quotes = data?.quoteResponse?.result || []
    return NextResponse.json(TICKERS.map(t => {
      const q = quotes.find(qq => qq.symbol === t.symbol)
      return { ...t, price: q?.regularMarketPrice ?? null, change: q?.regularMarketChange ?? null, changePct: q?.regularMarketChangePercent ?? null }
    }))
  } catch {
    // Fallback: try v8 endpoint
    try {
      const results = await Promise.all(TICKERS.map(async t => {
        try {
          const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.symbol)}?range=1d&interval=1d`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          })
          const d = await r.json()
          const meta = d?.chart?.result?.[0]?.meta
          if (meta) {
            const price = meta.regularMarketPrice
            const prevClose = meta.chartPreviousClose || meta.previousClose
            const change = price - prevClose
            const changePct = prevClose ? (change / prevClose) * 100 : 0
            return { ...t, price, change, changePct }
          }
        } catch {}
        return { ...t, price: null, change: null, changePct: null }
      }))
      return NextResponse.json(results)
    } catch {
      return NextResponse.json(TICKERS.map(t => ({ ...t, price: null, change: null, changePct: null })))
    }
  }
}

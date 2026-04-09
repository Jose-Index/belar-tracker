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

export async function GET() {
  try {
    const symbols = TICKERS.map(t => t.symbol).join(',')
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`
    
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 } // cache 60s
    })
    
    if (!res.ok) {
      // Fallback: return empty prices
      return NextResponse.json(TICKERS.map(t => ({ ...t, price: null, change: null, changePct: null })))
    }
    
    const data = await res.json()
    const quotes = data?.quoteResponse?.result || []
    
    const result = TICKERS.map(t => {
      const q = quotes.find(qq => qq.symbol === t.symbol)
      return {
        ...t,
        price: q?.regularMarketPrice ?? null,
        change: q?.regularMarketChange ?? null,
        changePct: q?.regularMarketChangePercent ?? null,
      }
    })
    
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(TICKERS.map(t => ({ ...t, price: null, change: null, changePct: null })))
  }
}

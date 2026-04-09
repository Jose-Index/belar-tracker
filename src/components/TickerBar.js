'use client'

const TICKERS = [
  { label: 'S&P 500', symbol: '^GSPC', color: '#2563eb' },
  { label: 'NASDAQ', symbol: '^IXIC', color: '#7c3aed' },
  { label: 'IBEX 35', symbol: '^IBEX', color: '#dc2626' },
  { label: 'EUROSTOXX', symbol: '^STOXX50E', color: '#0891b2' },
  { label: 'ORO', symbol: 'GC=F', color: '#d97706' },
  { label: 'VIX', symbol: '^VIX', color: '#be123c' },
  { label: 'EUR/USD', symbol: 'EURUSD=X', color: '#059669' },
]

export default function TickerBar() {
  return (
    <div className="bg-white border-b border-slate-100 overflow-hidden">
      <div className="ticker-track flex items-center gap-12 py-2 px-4 whitespace-nowrap">
        {[...TICKERS, ...TICKERS].map((t, i) => (
          <a key={i} href={`https://finance.yahoo.com/quote/${t.symbol}`}
            target="_blank" rel="noopener"
            className="flex items-center gap-1.5 text-xs hover:opacity-70 transition-opacity">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
            <span className="font-semibold" style={{ color: t.color }}>{t.label}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

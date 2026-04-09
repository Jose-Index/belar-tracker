'use client'

const TICKERS = [
  { label: 'S&P 500', symbol: '^GSPC' },
  { label: 'NASDAQ', symbol: '^IXIC' },
  { label: 'IBEX 35', symbol: '^IBEX' },
  { label: 'EUROSTOXX', symbol: '^STOXX50E' },
  { label: 'ORO', symbol: 'GC=F' },
  { label: 'VIX', symbol: '^VIX' },
  { label: 'EUR/USD', symbol: 'EURUSD=X' },
]

export default function TickerBar() {
  return (
    <div className="bg-white border-b border-slate-100 overflow-hidden">
      <div className="ticker-track flex items-center gap-8 py-2 px-4 whitespace-nowrap">
        {[...TICKERS, ...TICKERS].map((t, i) => (
          <a
            key={i}
            href={`https://finance.yahoo.com/quote/${t.symbol}`}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            <span className="font-semibold text-slate-700">{t.label}</span>
            <span className="font-mono text-slate-400">{t.symbol}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

'use client'
import { BROKER_COLORS, BROKER_NAMES, CLASS_COLORS, formatCurrency, pnlColor } from '@/lib/constants'

// Manual favicon mapping for tickers where auto-detection fails
const FAVICON_MAP = {
  'AROC': 'https://logo.clearbit.com/archrock.com',
  'FIX': 'https://logo.clearbit.com/comfortSystemsusa.com',
  'IAU': 'https://logo.clearbit.com/ishares.com',
  'NEM': 'https://logo.clearbit.com/newmont.com',
  'SHELL.L': 'https://logo.clearbit.com/shell.com',
  'Thomaspj': 'https://www.google.com/s2/favicons?domain=etoro.com&sz=32', // CopyTrader on eToro
  'DVN': 'https://logo.clearbit.com/devonenergy.com',
  'DIA': 'https://logo.clearbit.com/spdr.com',
  'EOG': 'https://logo.clearbit.com/eogresources.com',
  'ICE': 'https://logo.clearbit.com/theice.com',
  'CME': 'https://logo.clearbit.com/cmegroup.com',
  'HWM': 'https://logo.clearbit.com/howmet.com',
  'ROST': 'https://logo.clearbit.com/rossstores.com',
  'MOD': 'https://logo.clearbit.com/modinesolutions.com',
  'NOC': 'https://logo.clearbit.com/northropgrumman.com',
  'GD': 'https://logo.clearbit.com/gd.com',
  'AVGO': 'https://logo.clearbit.com/broadcom.com',
  'MU': 'https://logo.clearbit.com/micron.com',
}

function TickerIcon({ ticker }) {
  const url = FAVICON_MAP[ticker]
  if (url === null) {
    // Show initials badge for CopyTraders
    return (
      <div className="w-5 h-5 rounded-md bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
        <span className="text-[8px] font-bold text-white leading-none">{ticker.substring(0, 2).toUpperCase()}</span>
      </div>
    )
  }
  const src = url || `https://logo.clearbit.com/${ticker.toLowerCase().replace('.l','')}.com`
  return (
    <img src={src} alt="" className="w-5 h-5 rounded-md bg-slate-100"
      onError={e => {
        // Fallback to Google favicon
        if (!e.target.dataset.fallback) {
          e.target.dataset.fallback = '1'
          e.target.src = `https://www.google.com/s2/favicons?domain=${ticker.toLowerCase()}.com&sz=64`
        } else {
          e.target.style.display = 'none'
        }
      }} />
  )
}

export default function PositionsTable({ positions }) {
  if (!positions?.length) return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="section-title">Posiciones Abiertas</div>
      <p className="text-sm text-slate-400">Sin posiciones abiertas</p>
    </div>
  )

  const sorted = [...positions].sort((a, b) => {
    const order = { etoro: 1, xtb: 2, ibkr: 3 }
    return (order[a.platform] || 99) - (order[b.platform] || 99)
  })

  const totalInvested = sorted.reduce((s, p) => s + Number(p.invested), 0)
  const totalValue = sorted.reduce((s, p) => s + Number(p.current_value || p.invested), 0)
  const totalPnl = totalValue - totalInvested
  const totalPct = totalInvested > 0 ? totalPnl / totalInvested : 0

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="section-title !mb-0">Posiciones Abiertas</div>
        <span className="text-[10px] text-slate-400 font-mono">{sorted.length} posiciones · {formatCurrency(totalValue)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full belar-table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th>Activo</th>
              <th>Broker</th>
              <th>Entrada</th>
              <th className="text-right">Invertido</th>
              <th className="text-right">Valor</th>
              <th className="text-right">G/P $</th>
              <th className="text-right">G/P %</th>
              <th className="text-right" title="Rendimiento diario"><span className="text-[8px]">%/D</span></th>
              <th>Clase</th>
              <th className="text-right">Peso</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const invested = Number(p.invested)
              const value = Number(p.current_value || invested)
              const pnl = value - invested
              const pct = invested > 0 ? pnl / invested : 0
              const entry = new Date(p.entry_date)
              const days = Math.max(1, Math.floor((new Date() - entry) / 86400000))
              const dailyPct = pct / days
              const weight = totalValue > 0 ? value / totalValue : 0
              const brokerColor = BROKER_COLORS[p.platform] || '#666'
              const classColor = CLASS_COLORS[p.class] || '#6b7280'

              return (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <TickerIcon ticker={p.ticker} />
                      <span className="font-bold text-slate-800 text-[13px]">{p.ticker}</span>
                    </div>
                  </td>
                  <td>
                    <span className="platform-badge" style={{ background: brokerColor + '12', color: brokerColor, border: `1px solid ${brokerColor}30` }}>
                      {BROKER_NAMES[p.platform] || p.platform}
                    </span>
                  </td>
                  <td className="text-slate-500 font-mono text-[11px]">
                    {entry.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="text-right font-mono text-[12px] text-slate-500">{formatCurrency(invested)}</td>
                  <td className="text-right font-mono text-[13px] font-bold text-slate-800">{formatCurrency(value)}</td>
                  <td className={`text-right font-mono text-[12px] font-semibold ${pnlColor(pnl)}`}>
                    {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                  </td>
                  <td className={`text-right font-mono text-[13px] font-bold ${pnlColor(pct)}`}>
                    {pct >= 0 ? '+' : ''}{(pct * 100).toFixed(2)}%
                  </td>
                  <td className={`text-right font-mono text-[9px] ${pnlColor(dailyPct)}`}>
                    {dailyPct >= 0 ? '+' : ''}{(dailyPct * 100).toFixed(3)}%
                  </td>
                  <td>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                      style={{ background: classColor + '12', color: classColor, border: `1px solid ${classColor}30` }}>
                      {p.class}
                    </span>
                  </td>
                  <td className="text-right font-mono text-[11px] text-slate-500">{(weight * 100).toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-200">
              <td colSpan={3} className="text-[11px] text-slate-500 font-semibold">{sorted.length} posiciones</td>
              <td className="text-right font-mono text-[12px] font-semibold text-slate-600">{formatCurrency(totalInvested)}</td>
              <td className="text-right font-mono text-[13px] font-bold text-slate-800">{formatCurrency(totalValue)}</td>
              <td className={`text-right font-mono text-[12px] font-bold ${pnlColor(totalPnl)}`}>
                {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
              </td>
              <td className={`text-right font-mono text-[13px] font-bold ${pnlColor(totalPct)}`}>
                {totalPct >= 0 ? '+' : ''}{(totalPct * 100).toFixed(2)}%
              </td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

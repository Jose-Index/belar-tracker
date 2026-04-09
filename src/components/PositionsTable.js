'use client'
import { BROKER_COLORS, BROKER_NAMES, CLASS_COLORS, formatCurrency, pnlColor } from '@/lib/constants'

export default function PositionsTable({ positions }) {
  if (!positions?.length) return <div className="text-sm text-slate-400">Sin posiciones abiertas</div>

  const sorted = [...positions].sort((a, b) => {
    const order = { etoro: 1, xtb: 2, ibkr: 3 }
    return (order[a.platform] || 99) - (order[b.platform] || 99)
  })

  const totalInvested = sorted.reduce((s, p) => s + Number(p.invested), 0)
  const totalValue = sorted.reduce((s, p) => s + Number(p.current_value || p.invested), 0)
  const totalPnl = totalValue - totalInvested
  const totalPct = totalInvested > 0 ? totalPnl / totalInvested : 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 pb-3">
        <div className="section-title !mb-0">Posiciones Abiertas</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full belar-table">
          <thead>
            <tr className="bg-slate-50">
              <th>Activo</th>
              <th>Plataforma</th>
              <th>Entrada</th>
              <th className="text-right">Invertido</th>
              <th className="text-right">Valor</th>
              <th className="text-right">G/P $</th>
              <th className="text-right">G/P %</th>
              <th className="text-right">%/día</th>
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

              // Days open
              const entry = new Date(p.entry_date)
              const now = new Date()
              const days = Math.max(1, Math.floor((now - entry) / 86400000))
              const dailyPct = pct / days

              // Weight
              const weight = totalValue > 0 ? value / totalValue : 0

              const brokerColor = BROKER_COLORS[p.platform] || '#666'
              const classColor = CLASS_COLORS[p.class] || '#6b7280'

              return (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <img
                        src={p.favicon_url || `https://logo.clearbit.com/${p.ticker.toLowerCase().replace('.l','')}.com`}
                        alt="" className="w-5 h-5 rounded"
                        onError={e => { e.target.style.display = 'none' }}
                      />
                      <span className="font-semibold text-slate-800">{p.ticker}</span>
                    </div>
                  </td>
                  <td>
                    <span className="platform-badge" style={{ background: brokerColor + '15', color: brokerColor }}>
                      {BROKER_NAMES[p.platform] || p.platform}
                    </span>
                  </td>
                  <td className="text-slate-500 font-mono text-xs">
                    {new Date(p.entry_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="text-right font-mono">{formatCurrency(invested)}</td>
                  <td className="text-right font-mono font-semibold">{formatCurrency(value)}</td>
                  <td className={`text-right font-mono font-semibold ${pnlColor(pnl)}`}>
                    {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                  </td>
                  <td className={`text-right font-mono font-semibold ${pnlColor(pct)}`}>
                    {pct >= 0 ? '+' : ''}{(pct * 100).toFixed(2)}%
                  </td>
                  <td className={`text-right font-mono text-xs ${pnlColor(dailyPct)}`}>
                    {dailyPct >= 0 ? '+' : ''}{(dailyPct * 100).toFixed(4)}%
                  </td>
                  <td>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: classColor + '15', color: classColor }}>
                      {p.class}
                    </span>
                  </td>
                  <td className="text-right font-mono text-xs text-slate-500">{(weight * 100).toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={3} className="text-xs text-slate-500">{sorted.length} posiciones</td>
              <td className="text-right font-mono">{formatCurrency(totalInvested)}</td>
              <td className="text-right font-mono">{formatCurrency(totalValue)}</td>
              <td className={`text-right font-mono ${pnlColor(totalPnl)}`}>
                {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
              </td>
              <td className={`text-right font-mono ${pnlColor(totalPct)}`}>
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

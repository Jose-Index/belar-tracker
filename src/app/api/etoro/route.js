import { NextResponse } from 'next/server'

const BASE = 'https://public-api.etoro.com/api/v1'

const INSTRUMENT_MAP = {
  1130: 'MU', 1757: 'NEM', 4365: 'IAU', 4434: 'SHELL.L',
  6602: 'AROC', 9465: 'FIX',
}

async function etoroFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'x-api-key': process.env.ETORO_API_KEY,
      'x-user-key': process.env.ETORO_USER_KEY,
      'x-request-id': crypto.randomUUID(),
    },
  })
  if (!res.ok) throw new Error(`eToro ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'portfolio'

  try {
    if (action === 'portfolio') {
      // Fetch portfolio AND equity in parallel
      const [pnlData, equityData] = await Promise.all([
        etoroFetch('/trading/info/real/pnl'),
        etoroFetch('/trading/info/real/equity').catch(() => null),
      ])

      const portfolio = pnlData.clientPortfolio || pnlData

      // Own positions
      const positions = (portfolio.positions || []).map(p => ({
        ticker: INSTRUMENT_MAP[p.instrumentID] || `ID_${p.instrumentID}`,
        instrumentId: p.instrumentID,
        invested: p.initialAmountInDollars,
        value: p.initialAmountInDollars + (p.unrealizedPnL?.pnL || 0),
        pnl: p.unrealizedPnL?.pnL || 0,
        leverage: p.leverage,
        openRate: p.openRate,
        openDate: p.openDateTime?.split('T')[0],
        stopLoss: p.stopLossRate,
        units: p.initialUnits,
      }))

      // CopyTrader (Thomaspj)
      const mirrors = (portfolio.mirrors || []).map(m => {
        const mPos = m.positions || []
        const mPnl = mPos.reduce((s, p) => s + (p.unrealizedPnL?.pnL || 0), 0)
        const mInv = mPos.reduce((s, p) => s + (p.initialAmountInDollars || 0), 0)
        return {
          name: 'Thomaspj',
          invested: mInv,
          value: mInv + mPnl + (m.closedPositionsNetProfit || 0),
          pnl: mPnl,
          closedProfit: m.closedPositionsNetProfit || 0,
          positionsCount: mPos.length,
        }
      })

      // Use equity endpoint for the real total (includes cash)
      const equity = equityData?.equity ?? equityData?.Equity ?? null

      // Fallback calculation if equity endpoint fails
      const ownValue = positions.reduce((s, p) => s + p.value, 0)
      const mirrorValue = mirrors.reduce((s, m) => s + m.value, 0)
      const calculatedTotal = ownValue + mirrorValue

      return NextResponse.json({
        ok: true,
        equity: equity || calculatedTotal,
        equitySource: equity ? 'etoro_api' : 'calculated',
        cash: equity ? equity - calculatedTotal : null,
        positions,
        mirrors,
      })
    }

    if (action === 'equity') {
      const data = await etoroFetch('/trading/info/real/equity')
      return NextResponse.json({ ok: true, data })
    }

    if (action === 'cash') {
      const data = await etoroFetch('/trading/info/real/available-cash')
      return NextResponse.json({ ok: true, data })
    }

    return NextResponse.json({ error: 'Use action=portfolio|equity|cash' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

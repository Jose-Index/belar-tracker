import { NextResponse } from 'next/server'

const BASE = 'https://public-api.etoro.com/api/v1'

// Known instrument IDs for José's portfolio
const INSTRUMENT_MAP = {
  1130: 'MU',
  1757: 'NEM',
  4365: 'IAU',
  4434: 'SHELL.L',
  6602: 'AROC',
  9465: 'FIX',
}

async function etoroFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'x-api-key': process.env.ETORO_API_KEY,
      'x-user-key': process.env.ETORO_USER_KEY,
      'x-request-id': crypto.randomUUID(),
    },
  })
  if (!res.ok) throw new Error(`eToro API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'portfolio'

  try {
    if (action === 'portfolio') {
      const data = await etoroFetch('/trading/info/real/pnl')
      const portfolio = data.clientPortfolio || data

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
        const mPositions = m.positions || []
        const mirrorPnl = mPositions.reduce((s, p) => s + (p.unrealizedPnL?.pnL || 0), 0)
        const mirrorInvested = mPositions.reduce((s, p) => s + (p.initialAmountInDollars || 0), 0)
        return {
          name: 'Thomaspj',
          invested: mirrorInvested,
          value: mirrorInvested + mirrorPnl + (m.closedPositionsNetProfit || 0),
          pnl: mirrorPnl,
          closedProfit: m.closedPositionsNetProfit || 0,
          positionsCount: mPositions.length,
        }
      })

      const ownInvested = positions.reduce((s, p) => s + p.invested, 0)
      const ownPnl = positions.reduce((s, p) => s + p.pnl, 0)
      const mirrorInvested = mirrors.reduce((s, m) => s + m.invested, 0)
      const mirrorPnl = mirrors.reduce((s, m) => s + m.pnl + m.closedProfit, 0)

      return NextResponse.json({
        ok: true,
        equity: ownInvested + ownPnl + mirrorInvested + mirrorPnl,
        positions,
        mirrors,
        summary: {
          ownInvested, ownPnl, mirrorInvested, mirrorPnl,
          totalEquity: ownInvested + ownPnl + mirrorInvested + mirrorPnl,
        },
      })
    }

    return NextResponse.json({ error: 'Use action=portfolio' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

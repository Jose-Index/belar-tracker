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
    const pnlData = await etoroFetch('/trading/info/real/pnl')
    const p = pnlData.clientPortfolio || pnlData

    // Own positions
    const positions = (p.positions || []).map(pos => ({
      ticker: INSTRUMENT_MAP[pos.instrumentID] || `ID_${pos.instrumentID}`,
      instrumentId: pos.instrumentID,
      invested: pos.initialAmountInDollars,
      value: pos.initialAmountInDollars + (pos.unrealizedPnL?.pnL || 0),
      pnl: pos.unrealizedPnL?.pnL || 0,
      leverage: pos.leverage,
      openRate: pos.openRate,
      openDate: pos.openDateTime?.split('T')[0],
      stopLoss: pos.stopLossRate,
      units: pos.initialUnits,
    }))

    // CopyTrader
    const mirrors = (p.mirrors || []).map(m => {
      const mPos = m.positions || []
      const mPnl = mPos.reduce((s, x) => s + (x.unrealizedPnL?.pnL || 0), 0)
      const mInv = mPos.reduce((s, x) => s + (x.initialAmountInDollars || 0), 0)
      return {
        name: 'Thomaspj',
        invested: mInv,
        value: mInv + mPnl + (m.closedPositionsNetProfit || 0),
        pnl: mPnl,
        closedProfit: m.closedPositionsNetProfit || 0,
        positionsCount: mPos.length,
        availableAmount: m.availableAmount || 0,
      }
    })

    // Calculate equity per eToro formula:
    // Equity = Cash + TotalInvested + PnL
    // Cash = credit - pending orders
    const credit = p.credit || 0
    const ordersForOpen = (p.ordersForOpen || []).filter(o => !o.mirrorID || o.mirrorID === 0)
    const pendingOrdersAmount = ordersForOpen.reduce((s, o) => s + (o.amount || 0), 0)
    const stockOrdersAmount = (p.orders || []).reduce((s, o) => s + (o.amount || 0), 0)
    const cash = credit - pendingOrdersAmount - stockOrdersAmount

    // Total invested = own positions + mirror positions + mirror available (excluding closed profits)
    const ownInvested = positions.reduce((s, x) => s + x.invested, 0)
    const mirrorInvested = mirrors.reduce((s, m) => s + m.invested + m.availableAmount - m.closedProfit, 0)
    const totalInvested = ownInvested + mirrorInvested + pendingOrdersAmount + stockOrdersAmount

    // PnL
    const ownPnl = positions.reduce((s, x) => s + x.pnl, 0)
    const mirrorPnl = mirrors.reduce((s, m) => s + m.pnl + m.closedProfit, 0)
    const totalPnl = ownPnl + mirrorPnl

    const equity = cash + totalInvested + totalPnl

    if (action === 'debug') {
      return NextResponse.json({ credit, cash, pendingOrdersAmount, stockOrdersAmount, ownInvested, mirrorInvested, totalInvested, ownPnl, mirrorPnl, totalPnl, equity, raw: p })
    }

    return NextResponse.json({
      ok: true,
      equity,
      cash,
      positions,
      mirrors,
    })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

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
    const raw = await etoroFetch('/trading/info/real/pnl')
    const p = raw.clientPortfolio || raw
    const m = (p.mirrors || [])[0] || { positions: [], availableAmount: 0, closedPositionsNetProfit: 0 }

    // === EQUITY CALCULATION (official eToro formula) ===
    // Cash
    const credit = p.credit || 0
    const ordersAmt = [...(p.ordersForOpen || []).filter(o => !o.mirrorID), ...(p.orders || [])].reduce((s, o) => s + (o.amount || 0), 0)
    const cash = credit - ordersAmt

    // Invested
    const ownInvested = (p.positions || []).reduce((s, x) => s + (x.amount || 0), 0)
    const mirrorPosInvested = (m.positions || []).reduce((s, x) => s + (x.amount || 0), 0)
    const mirrorExtra = (m.availableAmount || 0) - (m.closedPositionsNetProfit || 0)
    const totalInvested = ownInvested + mirrorPosInvested + mirrorExtra + ordersAmt

    // PnL
    const ownPnl = (p.positions || []).reduce((s, x) => s + (x.unrealizedPnL?.pnL || 0), 0)
    const mirrorPnl = (m.positions || []).reduce((s, x) => s + (x.unrealizedPnL?.pnL || 0), 0)
    const equity = cash + totalInvested + ownPnl + mirrorPnl + (m.closedPositionsNetProfit || 0)

    // Positions for table
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

    // Mirror summary
    const mirrors = [{
      name: 'Thomaspj',
      invested: mirrorPosInvested,
      value: mirrorPosInvested + mirrorPnl + (m.closedPositionsNetProfit || 0) + mirrorExtra,
      pnl: mirrorPnl,
      closedProfit: m.closedPositionsNetProfit || 0,
      positionsCount: (m.positions || []).length,
    }]

    return NextResponse.json({ ok: true, equity, cash, positions, mirrors })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

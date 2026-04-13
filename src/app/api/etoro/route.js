import { NextResponse } from 'next/server'

const BASE = 'https://public-api.etoro.com/api/v1'

async function etoroFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'x-api-key': process.env.ETORO_API_KEY,
      'x-user-key': process.env.ETORO_USER_KEY,
      'x-request-id': crypto.randomUUID(),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`eToro API ${res.status}: ${text}`)
  }
  return res.json()
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'portfolio'

  try {
    if (action === 'portfolio') {
      // Get full P&L data (positions + mirrors/CopyTraders)
      const pnl = await etoroFetch('/trading/info/real/pnl')
      
      // Extract positions
      const positions = (pnl.positions || []).map(p => ({
        instrumentId: p.instrumentId,
        ticker: p.instrumentName || p.instrumentId,
        invested: p.investedAmount,
        currentValue: p.investedAmount + (p.unrealizedPnL?.pnL || 0),
        pnl: p.unrealizedPnL?.pnL || 0,
        pnlPct: p.unrealizedPnL?.pnLPercentage || 0,
        leverage: p.leverage,
        openDate: p.openDateTime,
        stopLoss: p.stopLossRate,
        takeProfit: p.takeProfitRate,
        isBuy: p.isBuy,
      }))
      
      // Extract mirrors (CopyTraders)
      const mirrors = (pnl.mirrors || []).map(m => ({
        name: m.mirrorName || m.parentUsername,
        parentUsername: m.parentUsername,
        invested: m.investedAmount,
        pnl: (m.positions || []).reduce((s, p) => s + (p.unrealizedPnL?.pnL || 0), 0) + (m.closedPositionsNetProfit || 0),
        positions: (m.positions || []).length,
        closedProfit: m.closedPositionsNetProfit || 0,
      }))
      
      // Calculate totals
      const totalPositionsPnl = positions.reduce((s, p) => s + p.pnl, 0)
      const totalMirrorsPnl = mirrors.reduce((s, m) => s + m.pnl, 0)
      const totalPnl = totalPositionsPnl + totalMirrorsPnl
      const totalInvested = positions.reduce((s, p) => s + p.invested, 0) + mirrors.reduce((s, m) => s + m.invested, 0)
      
      return NextResponse.json({
        ok: true,
        totalInvested,
        totalPnl,
        equity: totalInvested + totalPnl,
        positions,
        mirrors,
        raw: pnl, // include raw data for debugging
      })
    }

    if (action === 'equity') {
      const data = await etoroFetch('/trading/info/real/equity')
      return NextResponse.json({ ok: true, ...data })
    }

    if (action === 'cash') {
      const data = await etoroFetch('/trading/info/real/available-cash')
      return NextResponse.json({ ok: true, ...data })
    }

    return NextResponse.json({ error: 'Unknown action. Use: portfolio, equity, cash' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

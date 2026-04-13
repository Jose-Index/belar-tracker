import { NextResponse } from 'next/server'

const BASE = 'https://public-api.etoro.com/api/v1'

// Cached instrument ID → ticker mapping (grows over time)
const INSTRUMENT_MAP = {
  1130: 'MU', 1757: 'NEM', 4365: 'IAU', 4434: 'SHELL.L',
  6602: 'AROC', 9465: 'FIX', 1467: 'NEM', 2040: 'AAPL',
  1246: 'MSFT',
}

const headers = () => ({
  'x-api-key': process.env.ETORO_API_KEY,
  'x-user-key': process.env.ETORO_USER_KEY,
  'x-request-id': crypto.randomUUID(),
})

async function etoroFetch(path) {
  const res = await fetch(`${BASE}${path}`, { headers: headers() })
  if (!res.ok) throw new Error(`eToro ${res.status}`)
  return res.json()
}

async function resolveInstrument(id) {
  if (INSTRUMENT_MAP[id]) return INSTRUMENT_MAP[id]
  try {
    const res = await fetch(`${BASE}/market-data/search?instrumentId=${id}`, { headers: headers() })
    if (res.ok) {
      const data = await res.json()
      const item = data?.instruments?.[0] || data?.[0]
      if (item?.internalSymbolFull || item?.symbolFull) {
        const ticker = item.internalSymbolFull || item.symbolFull
        INSTRUMENT_MAP[id] = ticker
        return ticker
      }
    }
  } catch {}
  return `ID_${id}`
}

export const revalidate = 0 // no cache

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'portfolio'

  try {
    if (action === 'portfolio') {
      const data = await etoroFetch('/trading/info/real/pnl')
      const portfolio = data.clientPortfolio || data

      // Resolve all instrument IDs to tickers
      const rawPositions = portfolio.positions || []
      const unknownIds = rawPositions.map(p => p.instrumentID).filter(id => !INSTRUMENT_MAP[id])
      if (unknownIds.length > 0) {
        await Promise.all(unknownIds.map(id => resolveInstrument(id)))
      }

      const positions = rawPositions.map(p => ({
        ticker: INSTRUMENT_MAP[p.instrumentID] || `ID_${p.instrumentID}`,
        instrumentId: p.instrumentID,
        invested: p.initialAmountInDollars,
        value: p.initialAmountInDollars + (p.unrealizedPnL?.pnL || 0),
        pnl: p.unrealizedPnL?.pnL || 0,
        leverage: p.leverage,
        openRate: p.openRate,
        currentRate: p.unrealizedPnL?.closeRate || null,
        openDate: p.openDateTime?.split('T')[0],
        stopLoss: p.stopLossRate,
        units: p.initialUnits,
      }))

      // CopyTrader (Thomaspj)
      const mirrors = (portfolio.mirrors || []).map(m => {
        const mp = m.positions || []
        const pnl = mp.reduce((s, p) => s + (p.unrealizedPnL?.pnL || 0), 0)
        const inv = mp.reduce((s, p) => s + (p.initialAmountInDollars || 0), 0)
        return {
          name: 'Thomaspj',
          invested: inv,
          value: inv + pnl + (m.closedPositionsNetProfit || 0),
          pnl,
          closedProfit: m.closedPositionsNetProfit || 0,
          positionsCount: mp.length,
        }
      })

      const ownValue = positions.reduce((s, p) => s + p.value, 0)
      const mirrorValue = mirrors.reduce((s, m) => s + m.value, 0)

      return NextResponse.json({
        ok: true,
        equity: ownValue + mirrorValue,
        cash: portfolio.credit || 0,
        positions,
        mirrors,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({ error: 'Use action=portfolio' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

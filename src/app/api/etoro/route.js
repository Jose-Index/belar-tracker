import { NextResponse } from 'next/server'

const BASE = 'https://public-api.etoro.com/api/v1'

const INSTRUMENT_MAP = {
  1130: 'MU', 1757: 'NEM', 4365: 'IAU', 4434: 'SHELL.L',
  6602: 'AROC', 9465: 'FIX',
}

const runtimeCache = new Map()

function authHeaders() {
  return {
    'x-api-key': process.env.ETORO_API_KEY,
    'x-user-key': process.env.ETORO_USER_KEY,
    'x-request-id': crypto.randomUUID(),
  }
}

async function etoroFetch(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`eToro ${res.status}: ${await res.text()}`)
  return res.json()
}

async function resolveInstruments(ids) {
  if (!ids.length) return {}
  const qs = new URLSearchParams({
    instrumentIds: ids.join(','),
    fields: 'instrumentId,internalSymbolFull,displayname,symbolFull',
  })
  try {
    const res = await fetch(`${BASE}/market-data/instruments?${qs}`, { headers: authHeaders() })
    if (!res.ok) return { _err: `status ${res.status}`, _body: await res.text() }
    const data = await res.json()
    const arr = Array.isArray(data) ? data : (data.items || data.instruments || [])
    const out = {}
    for (const it of arr) {
      const id = it.instrumentId || it.InstrumentID || it.instrumentID
      const sym = it.internalSymbolFull || it.symbolFull || it.displayname
      if (id && sym) out[id] = { ticker: sym, name: it.displayname || sym }
    }
    return out
  } catch (e) {
    return { _err: e.message }
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'portfolio'

  if (action === 'resolve') {
    const idsParam = searchParams.get('ids') || ''
    const ids = idsParam.split(',').map(s => parseInt(s.trim())).filter(Boolean)
    const resolved = await resolveInstruments(ids)
    return NextResponse.json({ ok: true, resolved })
  }

  try {
    const raw = await etoroFetch('/trading/info/real/pnl')
    const p = raw.clientPortfolio || raw
    const m = (p.mirrors || [])[0] || { positions: [], availableAmount: 0, closedPositionsNetProfit: 0 }

    const credit = p.credit || 0
    const ordersAmt = [...(p.ordersForOpen || []).filter(o => !o.mirrorID), ...(p.orders || [])].reduce((s, o) => s + (o.amount || 0), 0)
    const cash = credit - ordersAmt

    const ownInvested = (p.positions || []).reduce((s, x) => s + (x.amount || 0), 0)
    const mirrorPosInvested = (m.positions || []).reduce((s, x) => s + (x.amount || 0), 0)
    const mirrorExtra = (m.availableAmount || 0) - (m.closedPositionsNetProfit || 0)
    const totalInvested = ownInvested + mirrorPosInvested + mirrorExtra + ordersAmt

    const ownPnl = (p.positions || []).reduce((s, x) => s + (x.unrealizedPnL?.pnL || 0), 0)
    const mirrorPnl = (m.positions || []).reduce((s, x) => s + (x.unrealizedPnL?.pnL || 0), 0)
    const equity = cash + totalInvested + ownPnl + mirrorPnl + (m.closedPositionsNetProfit || 0)

    const rawPositions = p.positions || []
    const unknownIds = rawPositions
      .map(pos => pos.instrumentID)
      .filter(id => !INSTRUMENT_MAP[id] && !runtimeCache.has(id))

    if (unknownIds.length) {
      const resolved = await resolveInstruments(unknownIds)
      for (const [id, meta] of Object.entries(resolved)) {
        if (meta?.ticker) runtimeCache.set(parseInt(id), meta)
      }
    }

    const positions = rawPositions.map(pos => {
      const id = pos.instrumentID
      const fromStatic = INSTRUMENT_MAP[id]
      const fromCache = runtimeCache.get(id)
      const ticker = fromStatic || fromCache?.ticker || `ID_${id}`
      return {
        ticker,
        name: fromCache?.name || null,
        instrumentId: id,
        invested: pos.initialAmountInDollars,
        value: pos.initialAmountInDollars + (pos.unrealizedPnL?.pnL || 0),
        pnl: pos.unrealizedPnL?.pnL || 0,
        leverage: pos.leverage,
        openRate: pos.openRate,
        openDate: pos.openDateTime?.split('T')[0],
        stopLoss: pos.stopLossRate,
        units: pos.initialUnits,
      }
    })

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

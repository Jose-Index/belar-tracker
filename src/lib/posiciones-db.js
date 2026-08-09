import { supabase } from './supabase'

// ─── Operaciones de datos de Posiciones (RLS: solo José) ─────────────

export async function fetchPosiciones() {
  const [pos, snaps, state] = await Promise.all([
    supabase.from('positions').select('*').order('ticker'),
    supabase.from('position_snapshots').select('week_end,ticker,broker,value')
      .order('week_end', { ascending: false }).limit(150),
    supabase.from('app_state').select('key,value').in('key', ['liquidez', 'last_week_close', 'btc_wallet']),
  ])
  const st = Object.fromEntries((state.data || []).map(r => [r.key, r.value]))
  return {
    positions: pos.data || [],
    snapshots: snaps.data || [],
    liquidez: st.liquidez || { etoro: 0, xtb: 0, ibkr: 0 },
    btcQty: Number(st.btc_wallet?.qty) || 0.014706,   // monedero BTC personal
    lastClose: st.last_week_close || null,
    error: pos.error?.message || null,
  }
}

export function guardarBtcWallet(qty) {
  return supabase.from('app_state').upsert({ key: 'btc_wallet', value: { qty }, updated_at: new Date().toISOString() })
}

export function updatePosicion(id, patch) {
  return supabase.from('positions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function altaPosicion(p) {
  return supabase.from('positions').insert({ ingest_source: 'alta manual', ...p })
}

// Borrar = cerrar: registro en histórico ANTES de borrar. Nunca delete seco.
export async function cerrarPosicion(p, motivo) {
  const inv = p.invested, cv = p.current_value
  const { error } = await supabase.from('position_history').insert({
    ticker: p.ticker, broker: p.broker, entry_date: p.entry_date,
    closed_date: new Date().toISOString().slice(0, 10),
    invested: inv, closed_value: cv,
    pl_pct: inv && cv != null ? Math.round((cv - inv) / inv * 10000) / 100 : null,
    close_reason: motivo, clase: p.clase, fuente: p.fuente,
    apalancamiento: p.apalancamiento,
  })
  if (error) return { error }
  // Repositorio: toda cerrada entra automáticamente
  await supabase.from('repositorio').insert({ ticker: p.ticker, estado: 'CERRADA', nota: motivo })
  return supabase.from('positions').delete().eq('id', p.id)
}

export function guardarLiquidez(liq) {
  return supabase.from('app_state').upsert({ key: 'liquidez', value: liq, updated_at: new Date().toISOString() })
}

// CERRAR SEMANA: snapshot por posición + snapshot cartera (con desglose por broker
// y monedero BTC personal, como la serie histórica) + sello. El commit del sábado.
export async function cerrarSemana(positions, liquidez, btcQty = 0) {
  const week_end = new Date().toISOString().slice(0, 10)
  const totalLiq = Object.values(liquidez).reduce((a, v) => a + (Number(v) || 0), 0)

  // Por broker: posiciones + su liquidez
  const porBroker = {}
  for (const b of ['etoro', 'xtb', 'ibkr']) {
    const pos = positions.filter(p => p.broker === b)
      .reduce((a, p) => a + Number(p.current_value ?? p.invested), 0)
    porBroker[b] = Math.round((pos + (Number(liquidez[b]) || 0)) * 100) / 100
  }

  // Monedero BTC personal (la serie histórica siempre lo incluyó) + EURUSD del momento
  let btcUsd = 0, eurusd = null
  try {
    const r = await fetch('/api/quotes?symbols=BTC-USD,EURUSD%3DX').then(x => x.json())
    const q = Object.fromEntries((r.quotes || []).map(x => [x.symbol, x.price]))
    if (btcQty > 0 && q['BTC-USD']) btcUsd = Math.round(btcQty * q['BTC-USD'] * 100) / 100
    if (q['EURUSD=X']) eurusd = Math.round(q['EURUSD=X'] * 10000) / 10000
  } catch { /* sin precio: btcUsd 0 y se avisa abajo; eurusd null */ }

  const totalPos = positions.reduce((a, p) => a + Number(p.current_value ?? p.invested), 0)
  const total = Math.round((totalPos + totalLiq + btcUsd) * 100) / 100
  const desglose = { ...porBroker, btc_usd: btcUsd, btc_qty: btcQty }

  const { error: e1 } = await supabase.from('weekly_snapshots').upsert({
    week_end, total_value: total, liquidez, desglose, eurusd,
  }, { onConflict: 'week_end' })
  if (e1) return { error: e1 }
  if (btcQty > 0 && btcUsd === 0) console.warn('BTC wallet sin precio: total sin monedero')

  const rows = positions.map(p => ({
    week_end, ticker: p.ticker, broker: p.broker,
    value: p.current_value ?? p.invested, invested: p.invested,
  }))
  const { error: e2 } = await supabase.from('position_snapshots')
    .upsert(rows, { onConflict: 'week_end,ticker,broker' })
  if (e2) return { error: e2 }

  await supabase.from('positions').update({ ingest_badge: null }).not('ingest_badge', 'is', null)
  await supabase.from('app_state').upsert({ key: 'last_week_close', value: { date: week_end }, updated_at: new Date().toISOString() })
  return { week_end }
}

// Serie semanal de UNA posición para la gráfica del detalle
// `desde` = fecha de entrada de la posición ACTUAL. Un mismo ticker puede haberse
// abierto y cerrado varias veces (EWY: una vida 15-20/06 y otra desde el 05/08); sin
// este filtro la gráfica mezclaba las dos y mostraba un registro semanal de junio en
// una posición abierta en agosto.
export function fetchSeriePosicion(ticker, broker, desde) {
  let q = supabase.from('position_snapshots').select('week_end,value,invested')
    .eq('ticker', ticker).eq('broker', broker)
  if (desde) q = q.gte('week_end', desde)
  return q.order('week_end')
}

export function fetchNotas(positionId) {
  return supabase.from('position_notes').select('*').eq('position_id', positionId).order('created_at', { ascending: false })
}

export function addNota(positionId, texto) {
  return supabase.from('position_notes').insert({ position_id: positionId, texto })
}

export function borrarNotaDB(id) {
  return supabase.from('position_notes').delete().eq('id', id)
}

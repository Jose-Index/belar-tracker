import { supabase } from './supabase'
import { walletDe } from './bloques'

// ─── Operaciones de datos de Posiciones (RLS: solo José) ─────────────

export async function fetchPosiciones() {
  const [pos, snaps, state] = await Promise.all([
    supabase.from('positions').select('*').order('ticker'),
    supabase.from('position_snapshots').select('week_end,ticker,broker,value')
      .order('week_end', { ascending: false }).limit(150),
    supabase.from('app_state').select('key,value').in('key', ['liquidez', 'last_week_close', 'btc_wallet', 'bloques_orden']),
  ])
  const st = Object.fromEntries((state.data || []).map(r => [r.key, r.value]))
  return {
    positions: pos.data || [],
    snapshots: snaps.data || [],
    liquidez: st.liquidez || { etoro: 0, xtb: 0, ibkr: 0 },
    btcQty: walletDe(st.btc_wallet).qty || 0.014706,  // monedero BTC personal
    btcWallet: walletDe(st.btc_wallet),               // { qty, invertido, aportes }
    lastClose: st.last_week_close || null,
    bloquesOrden: Array.isArray(st.bloques_orden?.orden) ? st.bloques_orden.orden : null,   // orden de las tablas por bloque
    error: pos.error?.message || null,
  }
}

// Guarda la cantidad del monedero SIN perder las aportaciones (si las hay, la cantidad es su suma).
export async function guardarBtcWallet(qty) {
  const { data } = await supabase.from('app_state').select('value').eq('key', 'btc_wallet').maybeSingle()
  const prev = data?.value || {}
  const value = Array.isArray(prev.aportaciones) && prev.aportaciones.length ? { ...prev, qty: walletDe(prev).qty } : { ...prev, qty }
  return supabase.from('app_state').upsert({ key: 'btc_wallet', value, updated_at: new Date().toISOString() })
}

// Aportaciones de la wallet: [{ fecha: 'YYYY-MM-DD', btc, usd }]. qty se recalcula como su suma.
export function guardarAportesWallet(aportaciones) {
  const value = { aportaciones, qty: walletDe({ aportaciones }).qty }
  return supabase.from('app_state').upsert({ key: 'btc_wallet', value, updated_at: new Date().toISOString() })
}

// Columnas de la Cartera v3 (30/09/2026): `bloque` y `tp_price` en positions.
// Si el DDL aún no se ha ejecutado, la escritura se reintenta sin ellas para que
// el resto de la app no se rompa (PostgREST devuelve "column ... does not exist").
const COLS_V3 = ['bloque', 'tp_price']
const sinColV3 = (obj, msg) => {
  const out = { ...obj }
  for (const c of COLS_V3) if (msg.includes(c)) delete out[c]
  return out
}
const faltaColV3 = e => e && /column|schema cache/i.test(e.message || '') && COLS_V3.some(c => (e.message || '').includes(c))

export async function updatePosicion(id, patch) {
  const r = await supabase.from('positions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (r.error && faltaColV3(r.error)) {
    const p2 = sinColV3(patch, r.error.message)
    if (!Object.keys(p2).length) return { error: new Error('La columna ' + Object.keys(patch).join(', ') + ' aún no existe en BTP (falta el DDL de la Cartera v3)') }
    return supabase.from('positions').update({ ...p2, updated_at: new Date().toISOString() }).eq('id', id)
  }
  return r
}

export async function altaPosicion(p) {
  const r = await supabase.from('positions').insert({ ingest_source: 'alta manual', ...p })
  if (r.error && faltaColV3(r.error)) return supabase.from('positions').insert(sinColV3({ ingest_source: 'alta manual', ...p }, r.error.message))
  return r
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
    ...(p.bloque ? { bloque: p.bloque } : {}),
  })
  if (error) return { error }
  // Repositorio: toda cerrada entra automáticamente
  await supabase.from('repositorio').insert({ ticker: p.ticker, estado: 'CERRADA', nota: motivo })
  return supabase.from('positions').delete().eq('id', p.id)
}

// Registro de cierre por captura (13/08/2026): datos REALES de salida (fecha e
// importe del broker), no el valor de la última semana. Si posId viene, además
// borra la posición abierta correspondiente.
export async function registrarCierre(c) {
  const inv = c.invested, cv = c.closed_value
  const { error } = await supabase.from('position_history').insert({
    ticker: c.ticker, broker: c.broker, entry_date: c.entry_date || null,
    closed_date: c.closed_date || new Date().toISOString().slice(0, 10),
    invested: inv, closed_value: cv,
    pl_pct: inv && cv != null ? Math.round((cv - inv) / inv * 10000) / 100 : null,
    close_reason: c.motivo || 'manual', clase: c.clase || null, fuente: c.fuente || null,
    apalancamiento: c.apalancamiento || 1,
    ...(c.bloque ? { bloque: c.bloque } : {}),
  })
  if (error) return { error }
  await supabase.from('repositorio').insert({ ticker: c.ticker, estado: 'CERRADA', nota: `${c.motivo || 'manual'} · captura` })
  if (c.posId) return supabase.from('positions').delete().eq('id', c.posId)
  return {}
}

// Orden de los bloques en Posiciones (arrastrar y soltar, 01/10/2026): app_state.bloques_orden = { orden: [ids] }
export function guardarOrdenBloques(orden) {
  return supabase.from('app_state').upsert({ key: 'bloques_orden', value: { orden }, updated_at: new Date().toISOString() })
}

// Todos los cierres semanales por posición (para la gráfica de cada bloque). Paginado: PostgREST corta en 1000.
export async function fetchSnapsBloques() {
  const filas = []
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await supabase.from('position_snapshots').select('week_end,ticker,broker,value,invested')
      .order('week_end').range(desde, desde + 999)
    if (error || !data?.length) break
    filas.push(...data)
    if (data.length < 1000) break
  }
  return filas
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

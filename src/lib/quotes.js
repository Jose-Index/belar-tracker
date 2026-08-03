// Cliente de precios: /api/quotes y /api/history (Yahoo vía serverless, sin caché).
import { supabase } from './supabase'

let simbolosCache = null

export async function getSimbolos() {
  if (simbolosCache) return simbolosCache
  const { data } = await supabase.from('symbols').select('*')
  simbolosCache = data || []
  return simbolosCache
}

export function yahooDe(ticker, simbolos) {
  const s = simbolos.find(x => x.ticker === ticker)
  if (s) return s.yahoo_symbol           // null explícito = no cotizable (copy)
  return ticker                          // por defecto, el ticker tal cual
}

export async function fetchQuotes(yahooSymbols) {
  const uniq = [...new Set(yahooSymbols.filter(Boolean))]
  if (!uniq.length) return {}
  try {
    const r = await fetch('/api/quotes?symbols=' + encodeURIComponent(uniq.join(',')))
    const j = await r.json()
    return Object.fromEntries((j.quotes || []).filter(q => !q.error).map(q => [q.symbol, q]))
  } catch { return {} }
}

export async function fetchHistory(symbol, range) {
  const r = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&range=${range}`)
  return r.json()
}

// Etiqueta de frescura del protocolo: TIEMPO REAL / RETRASADO ~15min / CIERRE
export function frescura(q) {
  if (!q?.quoted_at) return ''
  const min = (Date.now() - q.quoted_at) / 60000
  if (q.market_state === 'open') return min <= 15 ? 'TIEMPO REAL' : `RETRASADO ~${Math.round(min)}min`
  const d = new Date(q.quoted_at)
  return 'CIERRE ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
}

export const pctDia = q =>
  q && q.prev_close ? (q.price - q.prev_close) / q.prev_close * 100 : null

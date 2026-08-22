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

// Variación de HOY (precio vivo vs cierre anterior). Ya no es la columna %/día.
export const pctHoy = q =>
  q && q.prev_close ? (q.price - q.prev_close) / q.prev_close * 100 : null

// vari/sem: precio vivo vs cierre de la semana anterior (viernes previo).
export const pctSem = q =>
  q && q.week_close ? (q.price - q.week_close) / q.week_close * 100 : null

// %/día: rendimiento medio diario de la posición = G/P% ÷ días abiertos.
// Definición José 22/08/2026 (sustituye a la de la spec 03/08).
export const diasAbiertos = entryDate => {
  if (!entryDate) return null
  const ms = Date.now() - new Date(entryDate + 'T00:00:00Z').getTime()
  return Math.max(1, Math.floor(ms / 86400000))
}
export const pctDia = (gpPct, entryDate) => {
  const n = diasAbiertos(entryDate)
  return gpPct == null || n == null ? null : gpPct / n
}

// ─── Resolución de nombres de captura → ticker canónico ─────────────────
// Los brokers no llaman igual al mismo activo: XTB escribe "Micron" o "MU.US"
// donde BTP tiene "MU". Se resuelve por ticker, aliases y display_name, con
// normalización y sufijo de mercado, y lo aprendido se guarda como alias.

const SUFIJO_MERCADO = /\.(US|UK|ES|DE|IT|FR|NL|PL|CH|PT|SE|NO|FI|AT|BE|IE)$/

export function normalizarTexto(x) {
  return String(x || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\b(INC|CORP|CORPORATION|COMPANY|PLC|LTD|LLC|NV|AG|SE|SA|THE|ADR|GDR|CLASS|HOLDINGS|HOLDING)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

// Variantes con las que comparar un texto de captura
export function variantes(txt) {
  const raw = String(txt || '').trim().toUpperCase()
  if (!raw) return []
  const sinSufijo = raw.replace(SUFIJO_MERCADO, '')
  return [...new Set([raw, sinSufijo, normalizarTexto(raw), normalizarTexto(sinSufijo)].filter(Boolean))]
}

const clavesDe = s => [s.ticker, ...(s.aliases || []), s.display_name].filter(Boolean)

// Devuelve el ticker canónico o null. Nunca adivina: si hay más de un candidato
// por prefijo, prefiere no resolver y que José lo mapee a mano.
export function resolverSimbolo(textos, simbolos) {
  const cands = (textos || []).filter(Boolean).flatMap(variantes)
  if (!cands.length) return null
  for (const s of simbolos || []) {
    if (clavesDe(s).flatMap(variantes).some(k => cands.includes(k))) return s.ticker.toUpperCase()
  }
  // Prefijo por nombre: "MICRON" ↔ "MICRON TECHNOLOGY". Mínimo 4 caracteres y
  // resultado único, o no se resuelve.
  const largos = cands.filter(c => c.length >= 4)
  if (!largos.length) return null
  const hits = (simbolos || []).filter(s =>
    clavesDe(s).map(normalizarTexto).some(k => k.length >= 4 && largos.some(c => k.startsWith(c) || c.startsWith(k))))
  return hits.length === 1 ? hits[0].ticker.toUpperCase() : null
}

// Guarda en symbols los nombres con los que un broker llama a este ticker,
// para que la próxima captura lo reconozca sola. Idempotente.
export async function aprenderAlias(ticker, textos) {
  const t = String(ticker || '').trim().toUpperCase()
  if (!t) return 0
  const nuevos = [...new Set((textos || []).filter(Boolean).map(x => String(x).trim().toUpperCase()))]
    .filter(a => a && a !== t)
  if (!nuevos.length) return 0
  const sims = await getSimbolos()
  const s = sims.find(x => String(x.ticker).toUpperCase() === t)
  if (s) {
    const ya = new Set([...(s.aliases || []).map(a => String(a).toUpperCase()), t])
    const add = nuevos.filter(a => !ya.has(a))
    if (!add.length) return 0
    const aliases = [...(s.aliases || []), ...add]
    const { error } = await supabase.from('symbols').update({ aliases }).eq('id', s.id)
    if (error) return 0
    s.aliases = aliases                       // cache viva, sin recargar
    return add.length
  }
  const { data } = await supabase.from('symbols')
    .insert({ ticker: t, yahoo_symbol: t, asset_type: 'stock', aliases: nuevos })
    .select().maybeSingle()
  if (data) sims.push(data)
  return data ? nuevos.length : 0
}

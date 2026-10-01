// Cliente del Buscador (Tesis JOSE −11/+23,5): universo, series de tendencia y refresco.
import { supabase } from './supabase'

export const MERCADOS = [
  { id: 'US', label: 'USA' }, { id: 'EU', label: 'Europa' }, { id: 'CN', label: 'China/HK' },
  { id: 'JPKR', label: 'Japón/Corea' }, { id: 'OTROS', label: 'Otros' },
]
export const CAPS = [
  { id: 'MG', label: 'Mega + Grande', ayuda: '≥ 10.000 M$' },
  { id: 'M', label: 'Media', ayuda: '2.000 – 10.000 M$' },
  { id: 'P', label: 'Pequeña + Micro', ayuda: '< 2.000 M$ (micro <300 M$ marcada: fuera de la Tesis)' },
]
export const SECTORES = [
  ['Technology', 'Tecnología'], ['Healthcare', 'Salud'], ['Financial Services', 'Financiero'], ['Industrials', 'Industria'],
  ['Consumer Cyclical', 'Consumo cíclico'], ['Communication Services', 'Comunicación'], ['Consumer Defensive', 'Consumo defensivo'],
  ['Energy', 'Energía'], ['Basic Materials', 'Materiales'], ['Real Estate', 'Inmobiliario'], ['Utilities', 'Utilities'],
]
export const SECTOR_ES = Object.fromEntries(SECTORES)
// Rating de analistas por tramos de la media de Yahoo (1 = compra fuerte … 5 = venta fuerte).
// Selección independiente; ninguno o los cinco = cualquiera (01/10/2026).
export const RATINGS = [
  { id: 'FC', label: 'Fuerte compra', min: null, max: 1.5 },
  { id: 'C', label: 'Compra', min: 1.5, max: 2.5 },
  { id: 'N', label: 'Neutral', min: 2.5, max: 3.5 },
  { id: 'V', label: 'Venta', min: 3.5, max: 4.5 },
  { id: 'FV', label: 'Fuerte venta', min: 4.5, max: null },
]
const RATING_DESDE_MAX = { 1.5: ['FC'], 2.5: ['FC', 'C'], 3.5: ['FC', 'C', 'N'] }

// Valores por defecto de la Tesis (30/09/2026; PER y ATR 01/10/2026): USA, las tres capitalizaciones, PER futuro 8-25,
// ATR % 1,5-5,5 (techo = regla 2×ATR con SL −11; suelo = sin recorrido para el +23,5),
// todos los sectores, rating compra o mejor, resultados a ≤15 días fuera.
export const FILTROS_DEFECTO = {
  mercado: ['US'], cap: ['MG', 'M', 'P'], pe_campo: 'fwd', pe_min: 8, pe_max: 25, pe_na: false,
  atr_on: true, atr_min: 1.5, atr_max: 5.5, sin_perseguir: false,
  sector: SECTORES.map(s => s[0]), rating: ['FC', 'C'], rating_na: true, earn_dias: 15,
  ma50: false, ma200: false, p3m: false, q: '', orden: 'cap_usd.desc',
}

const KEY = 'btp-buscador-filtros'
export function cargarFiltros() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!j) return { ...FILTROS_DEFECTO }
    if (!Array.isArray(j.rating)) {   // filtros guardados con el formato anterior (rating_max)
      j.rating = j.rating_max != null ? (RATING_DESDE_MAX[j.rating_max] || []) : FILTROS_DEFECTO.rating
    }
    delete j.rating_max
    if (!j.pe_campo) { j.pe_campo = 'fwd'; j.pe_min = FILTROS_DEFECTO.pe_min; j.pe_max = FILTROS_DEFECTO.pe_max }   // decisión 01/10/2026
    return { ...FILTROS_DEFECTO, ...j }
  }
  catch { return { ...FILTROS_DEFECTO } }
}
export function guardarFiltros(f) { try { localStorage.setItem(KEY, JSON.stringify(f)) } catch { /* sin storage */ } }

export async function jwt() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || ''
}

export async function buscarUniverso(f, limite = 400) {
  const p = new URLSearchParams()
  if (f.mercado?.length) p.set('mercado', f.mercado.join(','))
  if (f.cap?.length) p.set('cap', f.cap.join(','))
  if (f.pe_min !== '' && f.pe_min != null) p.set('pe_min', f.pe_min)
  if (f.pe_max !== '' && f.pe_max != null) p.set('pe_max', f.pe_max)
  if (f.pe_na) p.set('pe_na', '1')
  if (f.pe_campo === 'fwd') p.set('pe_campo', 'fwd')
  if (f.sector?.length && f.sector.length < SECTORES.length) p.set('sector', f.sector.join(','))
  if (f.rating?.length && f.rating.length < RATINGS.length) { p.set('rating', f.rating.join(',')); if (f.rating_na) p.set('rating_na', '1') }
  if (f.earn_dias) p.set('earn_dias', f.earn_dias)
  if (f.ma50) p.set('ma50', '1')
  if (f.ma200) p.set('ma200', '1')
  if (f.p3m) p.set('p3m', '1')
  if (f.q?.trim()) p.set('q', f.q.trim())
  p.set('orden', f.orden || 'cap_usd.desc')
  p.set('limite', String(limite))
  const r = await fetch('/api/universo?' + p.toString())
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return j
}

// VIX (volatilidad del S&P 500) para el semáforo del Buscador: < 20 verde, 20-30 ámbar, > 30 rojo.
// Informativo (01/10/2026); pasa a regla solo si el banco lo justifica.
export async function vixActual() {
  const r = await fetch('/api/quotes?symbols=' + encodeURIComponent('^VIX'))
  const q = (await r.json()).quotes?.[0]
  if (!q || q.error) throw new Error(q?.error || 'sin VIX')
  return { v: q.price, prev: q.prev_close, at: q.quoted_at, estado: q.market_state }
}
export const nivelVix = v => v == null ? null : v < 20 ? 'verde' : v <= 30 ? 'ambar' : 'rojo'

export async function estadoUniverso() {
  const r = await fetch('/api/universo?estado=1')
  return r.json()
}

export async function seriesUniverso(symbols) {
  if (!symbols.length) return []
  const t = await jwt()
  const r = await fetch('/api/universo-series', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: JSON.stringify({ symbols }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return j.filas || []
}

// Refresco encadenado: cada llamada trabaja ~40 s y devuelve pendiente=true hasta acabar
export async function refrescarUniverso(onProgreso, forzar = false) {
  const t = await jwt()
  let paso = forzar ? 'forzar' : 'auto'
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`/api/universo-refresh?paso=${paso}&presupuesto=42`, { method: 'POST', headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    if (j.error) throw new Error(j.error)
    onProgreso && onProgreso(j)
    if (j.al_dia || !j.pendiente) return j
    paso = 'auto'
  }
  throw new Error('refresco demasiado largo (40 tandas)')
}

// ¿Está viejo el universo? Se refresca una vez al día tras el cierre americano
// (22:00 Madrid en horario de verano, 22:30 en invierno). Antes de eso, el de ayer vale.
export function universoViejo(estado) {
  if (!estado?.fin) return true
  const fin = new Date(estado.fin).getTime()
  const ahora = new Date()
  const cierreHoy = new Date(ahora); cierreHoy.setUTCHours(20, 30, 0, 0)   // 20:30 UTC ≈ cierre USA + 30 min
  const ultimoCierre = ahora.getTime() >= cierreHoy.getTime() ? cierreHoy.getTime() : cierreHoy.getTime() - 86400e3
  return fin < ultimoCierre
}

// Capitalización a la española: B$ = billones (10^12), M$ = millones
const miles = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
export const fmtCap = v => v == null ? '—' : v >= 1e12 ? (v / 1e12).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' B$' : miles(v / 1e6) + ' M$'
export const capBucket = v => v == null ? '' : v >= 200e9 ? 'Mega' : v >= 10e9 ? 'Grande' : v >= 2e9 ? 'Media' : v >= 300e6 ? 'Pequeña' : 'Micro'
export const diasHasta = d => d ? Math.ceil((new Date(d + 'T00:00:00') - Date.now()) / 86400e3) : null

// ─── Estrellas del Buscador (01/10/2026) ─────────────────────────────────────
// app_state.buscador_estrellas = { SYMBOL: { fecha: 'YYYY-MM-DD', precio, moneda, nombre } }.
// La estrella guarda fecha y precio al marcar: es la cartera sombra sin trabajo extra y mide el ojo de José
// (estrellas no ejecutadas frente al S&P y frente a las ejecutadas, en el panel mensual).
export async function leerEstrellas() {
  const { data } = await supabase.from('app_state').select('value').eq('key', 'buscador_estrellas').maybeSingle()
  return data?.value || {}
}
export async function guardarEstrellas(estrellas) {
  return supabase.from('app_state').upsert({ key: 'buscador_estrellas', value: estrellas, updated_at: new Date().toISOString() })
}
// Freno visible de la Tesis: líneas abiertas (máx. 8) y entradas del mes en curso (máx. 4)
export async function contadoresTesis() {
  const { data } = await supabase.from('positions').select('ticker,bloque,entry_date')
  const mes = new Date().toISOString().slice(0, 7)
  const tesis = (data || []).filter(p => (p.bloque || 'TESIS') === 'TESIS')
  return { lineas: tesis.length, entradasMes: tesis.filter(p => (p.entry_date || '').startsWith(mes)).length }
}

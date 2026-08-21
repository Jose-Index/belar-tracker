import { supabase } from './supabase'

// ─── Ingesta de capturas ───
// Reescala en el navegador (máx 1800px) y comprime a JPEG: evita el límite de
// 4.5MB por petición de Vercel y estandariza lo que ve el extractor.
export function leerImagen(file) {
  return new Promise((ok, ko) => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1800
      const esc = Math.min(1, MAX / img.width)
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * esc)
      c.height = Math.round(img.height * esc)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      ok({ data: c.toDataURL('image/jpeg', 0.85).split(',')[1], media_type: 'image/jpeg' })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = ko
    img.src = URL.createObjectURL(file)
  })
}

export async function extraerCapturas(files) {
  const images = await Promise.all([...files].map(leerImagen))
  const r = await fetch('/api/ia-capturas', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ images }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return j.extracciones || []
}

// Pantallas de posiciones CERRADAS / historial del broker (13/08/2026):
// fecha real de cierre e importe real de salida para el histórico.
export async function extraerCierres(files) {
  const images = await Promise.all([...files].map(leerImagen))
  const r = await fetch('/api/ia-capturas', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ images, modo: 'cerradas' }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return j.extracciones || []
}

// ─── Calendario: solo lectura/purga. La regeneración IA de 24h y el análisis IA
// se retiraron el 13/08/2026 (coste de Console); la revisión la hace Belar en sesión.
// Universo vigilado del calendario: posiciones ABIERTAS + repositorio (ENTRAR YA / RADAR).
// Las cerradas no pintan nada aquí (regla José 03/08).
export async function tickersVigilados() {
  const [p, r] = await Promise.all([
    supabase.from('positions').select('ticker'),
    supabase.from('repositorio').select('ticker').in('estado', ['ENTRAR_YA', 'RADAR']),
  ])
  return [...new Set([...(p.data || []).map(x => x.ticker), ...(r.data || []).map(x => x.ticker)])]
}

// Purga eventos futuros de tickers fuera del universo (los manuales se respetan)
export async function purgarCalendario(vigilados) {
  const hoy = new Date().toISOString().slice(0, 10)
  const { data } = await supabase.from('calendar_events').select('id,ticker,source').gte('event_date', hoy)
  const fuera = (data || []).filter(e => e.ticker && e.source !== 'manual' && !vigilados.includes(e.ticker)).map(e => e.id)
  if (fuera.length) await supabase.from('calendar_events').delete().in('id', fuera)
  return fuera.length
}

export async function eventosProximos() {
  const hoy = new Date().toISOString().slice(0, 10)
  const lim = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const { data } = await supabase.from('calendar_events').select('*')
    .gte('event_date', hoy).lte('event_date', lim).order('event_date')
  return data || []
}

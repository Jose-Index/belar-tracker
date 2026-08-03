import { supabase } from './supabase'

// ─── Ingesta de capturas ───
export function leerImagen(file) {
  return new Promise((ok, ko) => {
    const r = new FileReader()
    r.onload = () => ok({ data: String(r.result).split(',')[1], media_type: file.type || 'image/png' })
    r.onerror = ko
    r.readAsDataURL(file)
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

// ─── Calendario automático (regla única: >24h con BTP abierto) ───
export async function estadoCalendario() {
  const { data } = await supabase.from('app_state').select('value').eq('key', 'last_calendar_update').maybeSingle()
  return data?.value?.at || null
}

export async function refrescarCalendario(tickers) {
  const r = await fetch('/api/ia-calendario', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tickers }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  const hoy = new Date().toISOString().slice(0, 10)
  await supabase.from('calendar_events').delete().eq('source', 'ia').gte('event_date', hoy)
  const eventos = (j.eventos || []).filter(e => e.event_date >= hoy).map(e => ({
    ticker: e.ticker || null, event_date: e.event_date,
    event_type: ['earnings', 'exdiv', 'fed', 'bce', 'cripto'].includes(e.event_type) ? e.event_type : 'otro',
    titulo: e.titulo, source: 'ia',
  }))
  if (eventos.length) await supabase.from('calendar_events').insert(eventos)
  await supabase.from('app_state').upsert({ key: 'last_calendar_update', value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() })
  return eventos.length
}

export async function asegurarCalendario(tickers) {
  const at = await estadoCalendario()
  if (at && Date.now() - new Date(at).getTime() < 24 * 3600 * 1000) return { fresco: true, at }
  try {
    const n = await refrescarCalendario(tickers)
    return { fresco: false, n, at: new Date().toISOString() }
  } catch (e) {
    return { error: String(e.message || e), at }
  }
}

export async function eventosProximos() {
  const hoy = new Date().toISOString().slice(0, 10)
  const lim = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const { data } = await supabase.from('calendar_events').select('*')
    .gte('event_date', hoy).lte('event_date', lim).order('event_date')
  return data || []
}

// ─── Análisis IA ───
export async function analizarPosicion(p) {
  const r = await fetch('/api/ia-analisis', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ position: p }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return j
}

export async function guardarVeredicto(p, v) {
  await supabase.from('positions').update({
    veredicto_ia: v.veredicto, veredicto_ia_at: new Date().toISOString(),
  }).eq('id', p.id)
  await supabase.from('verdict_history').insert({
    ticker: p.ticker, broker: p.broker, veredicto: v.veredicto,
    justificacion: v.justificacion, dimension: v.dimension, invalidacion: v.invalidacion,
  })
  if (v.alerta) {
    await supabase.from('alerts').insert({
      autor: 'app', severidad: 'alta', ticker: p.ticker,
      titulo: `[Análisis IA] ${p.ticker}: ${v.alerta}`, detalle: v.justificacion,
    })
  }
}

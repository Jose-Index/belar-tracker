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

// ─── Calendario automático (regla única: >24h con BTP abierto) ───
export async function estadoCalendario() {
  const { data } = await supabase.from('app_state').select('value').eq('key', 'last_calendar_update').maybeSingle()
  return data?.value?.at || null
}

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

export async function refrescarCalendario(tickers) {
  const vigilados = await tickersVigilados()
  const universo = [...new Set([...(tickers || []), ...vigilados])]
  const hoy = new Date().toISOString().slice(0, 10)

  // Persecución: los estimados vivos se re-verifican en cada pasada hasta que la
  // compañía convoque (o hasta que la fecha pase). Un estimado nunca se da por bueno.
  const { data: estimados } = await supabase.from('calendar_events')
    .select('ticker,event_date,titulo')
    .eq('confirmacion', 'estimado').not('ticker', 'is', null).gte('event_date', hoy)

  const r = await fetch('/api/ia-calendario', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tickers: universo, perseguir: estimados || [] }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error)

  await supabase.from('calendar_events').delete().eq('source', 'ia').gte('event_date', hoy)
  await purgarCalendario(universo)

  const ahora = new Date().toISOString()
  const eventos = (j.eventos || []).filter(e => e.event_date >= hoy).map(e => ({
    ticker: e.ticker || null, event_date: e.event_date,
    event_type: ['earnings', 'exdiv', 'fed', 'bce', 'cripto'].includes(e.event_type) ? e.event_type : 'otro',
    titulo: e.titulo, source: 'ia',
    // Sin clasificación explícita de la IA => estimado. Nunca se asume confirmado.
    confirmacion: ['confirmado', 'estimado', 'na'].includes(e.confirmacion) ? e.confirmacion : 'estimado',
    fuente: e.fuente || null,
    verificado_at: ahora,
  }))
  if (eventos.length) await supabase.from('calendar_events').insert(eventos)
  await supabase.from('app_state').upsert({ key: 'last_calendar_update', value: { at: ahora }, updated_at: ahora })

  const confirmados = eventos.filter(e => e.confirmacion === 'confirmado').length
  return { n: eventos.length, confirmados, estimados: eventos.length - confirmados }
}

export async function asegurarCalendario(tickers) {
  const at = await estadoCalendario()
  if (at && Date.now() - new Date(at).getTime() < 24 * 3600 * 1000) return { fresco: true, at }
  try {
    const r = await refrescarCalendario(tickers)
    return { fresco: false, ...r, at: new Date().toISOString() }
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

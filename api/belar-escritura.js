// BTP · POST /api/belar-escritura — escritura acotada para Belar (Claude), protegida por BELAR_TOKEN.
// Body: { tabla, accion: 'insert'|'update'|'upsert', datos: {...} | [{...}], filtro?: { col: valor }, nota?: 'motivo' }
//  - update exige filtro (nunca toca la tabla entera). No hay delete: cerrar = update is_open=false.
//  - Verifica columnas contra el esquema real antes de escribir (regla de oro nº3).
//  - Cada escritura queda en los logs de Vercel con nota, tabla, acción y filas afectadas.

import { autorizar, rest, esquema, sinCache, ahora } from './_belar.js'

const PERMITIDAS = {
  positions: ['insert', 'update', 'upsert'],
  alerts: ['insert', 'update', 'upsert'],
  calendar_events: ['insert', 'update', 'upsert'],
  position_notes: ['insert'],
  repositorio: ['insert', 'update', 'upsert'],
  verdict_history: ['insert'],
}

export default async function handler(req, res) {
  sinCache(res)
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST' }); return }
  const err = autorizar(req)
  if (err) { res.status(401).json({ error: err }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const { tabla, accion, datos, filtro, nota } = body
  const filas = Array.isArray(datos) ? datos : (datos ? [datos] : [])

  if (!PERMITIDAS[tabla]) { res.status(400).json({ error: 'tabla no permitida', permitidas: Object.keys(PERMITIDAS) }); return }
  if (!PERMITIDAS[tabla].includes(accion)) { res.status(400).json({ error: `acción '${accion}' no permitida en ${tabla}`, permitidas: PERMITIDAS[tabla] }); return }
  if (filas.length === 0) { res.status(400).json({ error: 'datos vacío' }); return }
  if (accion === 'update' && (!filtro || Object.keys(filtro).length === 0)) { res.status(400).json({ error: 'update exige filtro' }); return }
  if (accion === 'update' && filas.length !== 1) { res.status(400).json({ error: 'update admite un único objeto en datos' }); return }

  try {
    // Verificación de columnas contra el esquema real
    const esq = await esquema()
    const cols = new Set((esq[tabla] || []).map(c => c.col))
    if (cols.size === 0) { res.status(500).json({ error: `esquema de ${tabla} no disponible` }); return }
    const desconocidas = new Set()
    for (const f of filas) for (const k of Object.keys(f)) if (!cols.has(k)) desconocidas.add(k)
    for (const k of Object.keys(filtro || {})) if (!cols.has(k)) desconocidas.add(k)
    if (desconocidas.size) { res.status(400).json({ error: 'columnas inexistentes', columnas: [...desconocidas], existentes: [...cols] }); return }

    let resultado
    if (accion === 'insert') {
      resultado = await rest(tabla, { method: 'POST', body: filas, prefer: 'return=representation' })
    } else if (accion === 'upsert') {
      resultado = await rest(tabla, { method: 'POST', body: filas, prefer: 'return=representation,resolution=merge-duplicates' })
    } else {
      const q = Object.entries(filtro).map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(String(v))}`).join('&')
      resultado = await rest(`${tabla}?${q}`, { method: 'PATCH', body: filas[0], prefer: 'return=representation' })
    }
    const n = Array.isArray(resultado) ? resultado.length : 0
    console.log(`[belar-escritura] ${ahora()} ${tabla} ${accion} filas=${n} filtro=${JSON.stringify(filtro || null)} nota=${nota || '-'}`)
    res.status(200).json({ ok: true, tabla, accion, filas_afectadas: n, resultado, served_at: ahora() })
  } catch (e) {
    console.error(`[belar-escritura] ERROR ${ahora()} ${tabla} ${accion}: ${e.message}`)
    res.status(500).json({ error: String(e.message || e), served_at: ahora() })
  }
}

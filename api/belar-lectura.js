// BTP · GET /api/belar-lectura?que=todo|posiciones|alertas|calendario|liquidez|historico|esquema|tabla&tabla=X&limite=N
// Lectura de solo consulta para Belar (Claude), protegida por BELAR_TOKEN.
// Devuelve cada tabla tal cual está en Supabase (sin renombrar columnas) + served_at + esquema opcional.

import { autorizar, rest, esquema, sinCache, ahora } from './_belar.js'

const TABLAS_LIBRES = new Set([
  'positions', 'position_history', 'position_notes', 'alerts', 'calendar_events',
  'weekly_snapshots', 'position_snapshots', 'contributions', 'symbols', 'repositorio',
  'plan_rector', 'hitos', 'yearly_results', 'app_state', 'verdict_history', 'positions_sandbox',
])

export default async function handler(req, res) {
  sinCache(res)
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET' }); return }
  const err = autorizar(req)
  if (err) { res.status(401).json({ error: err }); return }

  const que = String(req.query.que || 'todo')
  const limite = Math.min(Number(req.query.limite || 500), 5000)
  const out = { served_at: ahora(), que }

  try {
    if (que === 'esquema') { out.esquema = await esquema(); res.status(200).json(out); return }

    if (que === 'tabla') {
      const tabla = String(req.query.tabla || '')
      if (!TABLAS_LIBRES.has(tabla)) { res.status(400).json({ error: 'tabla no permitida', permitidas: [...TABLAS_LIBRES] }); return }
      out[tabla] = await rest(`${tabla}?select=*&limit=${limite}${req.query.orden ? '&order=' + encodeURIComponent(String(req.query.orden)) : ''}`)
      res.status(200).json(out); return
    }

    const quiere = k => que === 'todo' || que === k
    const tareas = []
    if (quiere('posiciones')) tareas.push(rest(`positions?select=*&is_open=eq.true&order=platform,ticker&limit=${limite}`).then(d => out.posiciones = d))
    if (quiere('alertas')) tareas.push(rest(`alerts?select=*&order=created_at.desc&limit=${limite}`).then(d => out.alertas = d))
    if (quiere('calendario')) tareas.push(rest(`calendar_events?select=*&date=gte.${ahora().slice(0, 10)}&order=date&limit=${limite}`).then(d => out.calendario = d))
    if (quiere('liquidez')) tareas.push(rest(`app_state?select=*`).then(d => out.app_state = d))
    if (quiere('historico')) tareas.push(rest(`positions?select=*&is_open=eq.false&order=closed_date.desc.nullslast,updated_at.desc&limit=${limite}`).then(d => out.cerradas = d))
    if (que === 'todo') tareas.push(rest(`weekly_snapshots?select=*&order=week_date.desc&limit=4`).then(d => out.ultimos_snapshots = d))
    if (tareas.length === 0) { res.status(400).json({ error: 'que no reconocido', valores: 'todo|posiciones|alertas|calendario|liquidez|historico|esquema|tabla' }); return }
    await Promise.all(tareas)
    res.status(200).json(out)
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), served_at: ahora() })
  }
}

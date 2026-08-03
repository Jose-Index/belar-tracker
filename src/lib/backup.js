// Export completo de la BD a JSON versionado por fecha. Usado por Herramientas
// (manual) y por el cierre de semana (automático, solo tras commit exitoso).
import { supabase } from './supabase'

const TABLAS = ['positions', 'position_history', 'position_snapshots', 'weekly_snapshots', 'contributions',
  'calendar_events', 'alerts', 'repositorio', 'plan_rector', 'hitos', 'frases', 'position_notes',
  'symbols', 'yearly_results', 'app_state', 'verdict_history', 'positions_sandbox']

export async function exportBackup(prefijo = 'btp-backup') {
  const out = { exportado: new Date().toISOString(), tablas: {} }
  for (const t of TABLAS) {
    const { data, error } = await supabase.from(t).select('*')
    out.tablas[t] = error ? { error: error.message } : data
  }
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${prefijo}-${new Date().toISOString().slice(0, 10)}.json`
  a.click(); URL.revokeObjectURL(a.href)
  return Object.values(out.tablas).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0)
}

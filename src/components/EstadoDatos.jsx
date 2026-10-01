// Indicador de frescura de los datos + botón de refresco global (01/10/2026).
// Escritorio: pie del menú lateral. Móvil: barra superior.
import { useEffect, useState } from 'react'
import { useEstadoDatos, refrescarTodo } from '../lib/cache'

const hhmm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const hace = ms => ms < 60e3 ? `${Math.max(1, Math.round(ms / 1000))} s` : ms < 3600e3 ? `${Math.round(ms / 60e3)} min` : `${Math.round(ms / 3600e3)} h`

export default function EstadoDatos({ compacto = false }) {
  const { at, cargando } = useEstadoDatos()
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 15e3); return () => clearInterval(t) }, [])
  const texto = !at ? 'sin datos aún' : compacto ? `hace ${hace(Date.now() - at)}` : `${hhmm(at)} · hace ${hace(Date.now() - at)}`
  return (
    <div className={'estado-datos' + (compacto ? ' compacto' : '')} aria-live="polite">
      <span className={'punto' + (cargando ? ' vivo' : '')} aria-hidden="true" />
      <span className="num txt">{cargando ? 'actualizando…' : texto}</span>
      <button type="button" className="btn-refrescar" onClick={refrescarTodo} disabled={cargando}
              title="Volver a leer posiciones, precios y series" aria-label="Refrescar datos">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
        </svg>
      </button>
    </div>
  )
}

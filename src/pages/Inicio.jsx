import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Inicio() {
  const [status, setStatus] = useState('conectando…')

  useEffect(() => {
    supabase.from('weekly_snapshots')
      .select('week_end,total_value')
      .order('week_end', { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) setStatus('BD: ' + error.message)
        else if (data?.length) setStatus(`BD conectada · último cierre ${data[0].week_end}`)
        else setStatus('BD conectada · sin datos visibles (RLS)')
      })
  }, [])

  return (
    <div>
      <h1>Inicio</h1>
      <div className="card">
        <p>Esqueleto BTP v0.1 — Fase 2.</p>
        <p className="num">{status}</p>
      </div>
      <p className="placeholder" style={{ marginTop: 18 }}>
        Aquí vivirán: gráfica principal con hitos e histórico semanal, boxes de importes,
        indicador Platt y franja Mercados.
      </p>
    </div>
  )
}

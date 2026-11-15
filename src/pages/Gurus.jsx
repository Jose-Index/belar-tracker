// BTP v4 · Gurús (15/11/2026): actividad reciente de los gestores que sigue José, por fecha. La escribe cada mañana una
// tarea programada de Claude ("Belar gurús") en app_state.gurus_feed = { actualizado, entradas: [{ fecha, gestor, tipo,
// titulo, detalle, url, toca: [tickers en cartera] }] }. Una idea de aquí es materia prima para un Análisis Oportunidad,
// nunca una orden (CONVICCIÓN, origen GURÚ).
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCache } from '../lib/cache'
import './portada.css'

const NIVELES = [
  ['A · seguir de cerca', 'Berkshire Hathaway (Greg Abel), Pershing Square (Bill Ackman), Fundsmith (Terry Smith), Himalaya (Li Lu), TCI (Chris Hohn), Cobas (Francisco García Paramés)'],
  ['B · contexto', 'Duquesne (Druckenmiller), Soros Fund, Bridgewater, Appaloosa (Tepper), Baupost (Klarman), Oaktree (Howard Marks)'],
  ['C · activistas', 'Carl Icahn, Elliott (Paul Singer)'],
]
const fecha = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4) : '—')
async function loader() {
  const { data } = await supabase.from('app_state').select('value').eq('key', 'gurus_feed').maybeSingle()
  return data?.value || { entradas: [] }
}

export default function Gurus() {
  const { data } = useCache('gurus', loader, { ttl: 5 * 60e3, persist: true })
  const [solo, setSolo] = useState('')
  if (!data) return <div className="pt"><p className="pt-estado">Cargando…</p></div>
  const entradas = [...(data.entradas || [])].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  const gestores = [...new Set(entradas.map(e => e.gestor))].sort()
  const lista = solo ? entradas.filter(e => e.gestor === solo) : entradas
  return (
    <div className="pt rd">
      <div className="pt-controles">
        <div className="pt-control"><span className="pt-mini">Gestor</span>
          <div className="pt-chips envuelve">
            {[''].concat(gestores).map(g => <button key={g || 'todos'} type="button" className={'pt-chip pq' + (g === solo ? ' on' : '')} aria-pressed={g === solo} onClick={() => setSolo(g)}>{g || 'Todos'}</button>)}
          </div>
        </div>
        <span className="pt-n">{data.actualizado ? 'Última revisión: ' + fecha(data.actualizado.slice(0, 10)) : 'Aún sin revisiones'}</span>
      </div>
      <div className="pt-cal-lista">
        {lista.map((e, i) => (
          <div key={i} className="pt-cal-fila gu-fila">
            <span className="pt-cal-dia">{fecha(e.fecha)}</span>
            <span className="gu-gestor">{e.gestor}<span className="pt-sec gu-tipo">{e.tipo}</span></span>
            <span className="pt-cal-txt"><b>{e.titulo}</b>{e.toca?.length > 0 && <i className="pt-puente gu-toca">en cartera: {e.toca.join(', ')}</i>}
              <span className="gu-det">{e.detalle}</span>
              {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="gu-url">Fuente</a>}</span>
          </div>
        ))}
        {!lista.length && <p className="pt-estado">Todavía no hay actividad registrada. La primera revisión se hace mañana por la mañana.</p>}
      </div>
      <section className="rd-bloque" aria-label="A quién se sigue">
        <h2 className="pt-gnombre">A quién se sigue</h2>
        <div className="pt-cal-lista">
          {NIVELES.map(([n, q]) => <div key={n} className="pt-cal-fila"><span className="gu-gestor">{n}</span><span className="pt-cal-txt">{q}</span></div>)}
        </div>
        <p className="pt-pie">Nadie publica las operaciones de estos gestores en directo: lo más fresco es el día en que sale cada documento (participaciones de más del 5 % en cinco días hábiles, operaciones de quien ya tiene más del 10 % en dos, cartas y entrevistas el mismo día, y la cartera completa hasta 45 días después de cada trimestre). Una idea de aquí pasa siempre por un Análisis Oportunidad antes de entrar.</p>
      </section>
    </div>
  )
}

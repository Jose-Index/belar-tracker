import { useEffect, useState } from 'react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { fetchQuotes, fetchHistory, frescura } from '../lib/quotes'
import { serieTWR } from '../lib/twr'
import './mercados.css'

const PERIODOS = [['1d', '1D'], ['5d', '1S'], ['1mo', '1M'], ['6mo', '6M'], ['ytd', 'YTD'], ['1y', '1A'], ['5y', '5A'], ['max', 'MAX']]
const COMPARABLES = ['1mo', '6mo', 'ytd', '1y', '5y', 'max']  // la cartera es semanal: 1D/1S no comparan
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fFecha = t => {
  const d = new Date(t)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
}

export default function Mercados() {
  const [lista, setLista] = useState([])
  const [quotes, setQuotes] = useState({})
  const [series, setSeries] = useState({})      // yahoo_symbol -> points
  const [range, setRange] = useState(() => localStorage.getItem('btp-mercados-range') || '6mo')
  const [comparando, setComparando] = useState(null)  // symbol row
  const [edit, setEdit] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [propuesta, setPropuesta] = useState(null)  // {symbol, nombre, duda} pendiente de confirmar

  useEffect(() => { localStorage.setItem('btp-mercados-range', range) }, [range])

  async function cargarLista() {
    const { data } = await supabase.from('symbols').select('*')
      .not('watchlist_pos', 'is', null).order('watchlist_pos')
    setLista(data || [])
    setQuotes(await fetchQuotes((data || []).map(s => s.yahoo_symbol)))
    return data || []
  }
  useEffect(() => { cargarLista() }, [])

  // Series de todos los boxes para el periodo seleccionado
  useEffect(() => {
    if (!lista.length) return
    let vivo = true
    setSeries({})
    Promise.all(lista.map(async s => {
      try {
        const h = await fetchHistory(s.yahoo_symbol, range)
        return [s.yahoo_symbol, h.points || []]
      } catch { return [s.yahoo_symbol, []] }
    })).then(pares => { if (vivo) setSeries(Object.fromEntries(pares)) })
    return () => { vivo = false }
  }, [lista, range])

  async function quitar(s) {
    await supabase.from('symbols').update({ watchlist_pos: null }).eq('id', s.id)
    cargarLista()
  }
  async function insertarSimbolo(symbol, nombre) {
    const pos = (lista.at(-1)?.watchlist_pos || 0) + 1
    const { data: ex } = await supabase.from('symbols').select('id').eq('yahoo_symbol', symbol).maybeSingle()
    if (ex) await supabase.from('symbols').update({ watchlist_pos: pos }).eq('id', ex.id)
    else await supabase.from('symbols').insert({
      ticker: symbol, yahoo_symbol: symbol, display_name: nombre || null,
      asset_type: 'stock', watchlist_pos: pos,
    })
    setNuevo(''); setPropuesta(null); cargarLista()
  }

  // Resolver IA: "oro" → GC=F, "eurostoxx" → ^STOXX50E. Símbolo exacto entra directo.
  async function añadir(e) {
    e.preventDefault()
    const q = nuevo.trim()
    if (!q || buscando) return
    setBuscando(true); setPropuesta(null)
    try {
      const r = await fetch('/api/ia-ticker?q=' + encodeURIComponent(q)).then(x => x.json())
      if (r.error) setPropuesta({ error: r.error })
      else if (r.via === 'exacto') await insertarSimbolo(r.symbol, r.nombre)
      else setPropuesta(r)   // confirmación: José valida antes de añadir
    } catch { setPropuesta({ error: 'sin respuesta del resolutor' }) }
    setBuscando(false)
  }
  // Reordenación por drag & drop: optimista en pantalla, posiciones 1..n en BD
  async function soltar(fromId, toId) {
    if (fromId === toId) return
    const i = lista.findIndex(x => x.id === fromId), j = lista.findIndex(x => x.id === toId)
    if (i < 0 || j < 0) return
    const nueva = [...lista]
    const [mov] = nueva.splice(i, 1)
    nueva.splice(j, 0, mov)
    setLista(nueva)
    await Promise.all(nueva.map((s, k) =>
      s.watchlist_pos === k + 1 ? null : supabase.from('symbols').update({ watchlist_pos: k + 1 }).eq('id', s.id)
    ).filter(Boolean))
    cargarLista()
  }

  return (
    <div className="mercados">
      <div className="mercados-head">
        <div className="periodos num">
          {PERIODOS.map(([r, l]) => (
            <button key={r} className={range === r ? 'on' : ''} onClick={() => { setRange(r); setComparando(null) }}>{l}</button>
          ))}
        </div>
        <a className="edit-toggle" onClick={() => setEdit(!edit)}>{edit ? 'hecho' : 'editar'}</a>
      </div>

      <div className="m-boxes">
        {lista.map(s => (
          <BoxSimbolo key={s.id} s={s} q={quotes[s.yahoo_symbol]} pts={series[s.yahoo_symbol]}
            range={range} comparable={COMPARABLES.includes(range)}
            comparando={comparando?.id === s.id}
            onComparar={() => setComparando(comparando?.id === s.id ? null : s)}
            edit={edit} onQuitar={() => quitar(s)} onSoltar={fromId => soltar(fromId, s.id)} />
        ))}
        {edit && (
          <form className="m-box m-box-add" onSubmit={añadir}>
            <input placeholder='+ ticker o "oro", "eurostoxx"…' value={nuevo}
                   onChange={e => { setNuevo(e.target.value); setPropuesta(null) }} disabled={buscando} />
            {buscando && <span className="m-add-estado">resolviendo…</span>}
            {propuesta?.error && <span className="m-add-estado err">{propuesta.error}</span>}
            {propuesta && !propuesta.error && (
              <div className="m-add-propuesta num">
                <b>{propuesta.symbol}</b> · {propuesta.nombre || '—'}
                {propuesta.duda && <span className="duda" title={propuesta.duda}> ⚠</span>}
                <span className="acciones">
                  <a onClick={() => insertarSimbolo(propuesta.symbol, propuesta.nombre)}>✓ añadir</a>
                  <a className="x" onClick={() => setPropuesta(null)}>✕</a>
                </span>
              </div>
            )}
          </form>
        )}
      </div>

      {comparando && COMPARABLES.includes(range) && (
        <Comparativa s={comparando} pts={series[comparando.yahoo_symbol] || []} range={range}
                     onCerrar={() => setComparando(null)} />
      )}
    </div>
  )
}

// ─── Box: gráfica abierta + % del periodo + botón comparar ───────────────
function BoxSimbolo({ s, q, pts, range, comparable, comparando, onComparar, edit, onQuitar, onSoltar }) {
  const serie = pts || []
  const [sobre, setSobre] = useState(false)
  // % como Apple/Yahoo: precio VIVO contra el cierre previo (1D) o contra el
  // cierre de inicio del periodo. Nunca entre velas del propio gráfico.
  let pct = null
  if (range === '1d') {
    if (q?.price && q?.prev_close) pct = (q.price - q.prev_close) / q.prev_close * 100
  } else if (serie.length > 1) {
    const fin = q?.price ?? serie.at(-1).v
    pct = (fin - serie[0].v) / serie[0].v * 100
  }
  const col = pct == null ? '#8A93A6' : pct >= 0 ? '#16A34A' : '#E5484D'

  return (
    <div className={'m-box card num' + (comparando ? ' on' : '') + (edit ? ' arrastrable' : '') + (sobre ? ' sobre' : '')}
         draggable={edit}
         onDragStart={e => e.dataTransfer.setData('text/btp-symbol', String(s.id))}
         onDragOver={e => { if (edit) { e.preventDefault(); setSobre(true) } }}
         onDragLeave={() => setSobre(false)}
         onDrop={e => {
           e.preventDefault(); setSobre(false)
           const fromId = Number(e.dataTransfer.getData('text/btp-symbol'))
           if (fromId) onSoltar(fromId)
         }}>
      <div className="m-box-head">
        <span className="t" title={s.display_name || ''}>{s.ticker}</span>
        <span className={'d ' + pctClass(pct)}>{fmtPct(pct)}</span>
      </div>
      <div className="m-box-precio" title={q ? frescura(q) : 'sin dato'}>
        {q ? Number(q.price).toLocaleString('es-ES', q.price < 1
          ? { minimumFractionDigits: 4, maximumFractionDigits: 4 }
          : { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
      </div>
      <div className="m-box-chart">
        {serie.length > 1 ? (
          <ResponsiveContainer width="100%" height={64}>
            <AreaChart data={serie} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={'mg' + s.id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={col} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={col} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Area type="monotone" dataKey="v" stroke={col} strokeWidth={1.6}
                    fill={`url(#mg${s.id})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <div className="m-box-cargando">···</div>}
      </div>
      <div className="m-box-pie">
        {edit ? (
          <span className="acciones">
            <span className="agarre" title="Arrastra el box para reordenar">⠿</span>
            <a className="x" onClick={onQuitar}>✕</a>
          </span>
        ) : (
          <button className="btn-vs" disabled={!comparable} onClick={onComparar}
                  title={comparable ? 'Comparar con la evolución del portfolio' : 'Comparación disponible de 1M en adelante (la cartera es semanal)'}>
            {comparando ? '✕ cerrar' : 'vs cartera'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Comparativa rebasada: activo vs cartera desde el inicio del periodo ──
function Comparativa({ s, pts, range, onCerrar }) {
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    let vivo = true
    async function montar() {
      const [{ data: weeks }, { data: contribs }] = await Promise.all([
        supabase.from('weekly_snapshots').select('week_end,total_value').order('week_end'),
        supabase.from('contributions').select('fecha,importe_eur,importe_usd'),
      ])
      if (!vivo || !weeks?.length || pts.length < 2) { setDatos({ vacio: true }); return }
      const desde = pts[0].t
      // Cartera en TWR: comparar en bruto sería tramposo (las aportaciones inflarían la línea)
      const cartera = serieTWR(weeks, contribs)
        .map(p => ({ t: p.t, v: p.idx }))
        .filter(p => p.t >= desde - 4 * 86400000)
      if (cartera.length < 2) { setDatos({ vacio: true }); return }
      // Rebase a 0%: ambas series parten del mismo punto y se mide el desvío
      const reb = (serie) => {
        const base = serie[0].v
        return serie.map(p => ({ t: p.t, pct: (p.v - base) / base * 100 }))
      }
      const sim = reb(pts), car = reb(cartera)
      // fusionar por timestamp para recharts (dos claves)
      const mapa = new Map()
      for (const p of sim) mapa.set(p.t, { t: p.t, sim: p.pct })
      for (const p of car) mapa.set(p.t, { ...(mapa.get(p.t) || { t: p.t }), car: p.pct })
      const serie = [...mapa.values()].sort((a, b) => a.t - b.t)
      setDatos({ serie, finSim: sim.at(-1).pct, finCar: car.at(-1).pct })
    }
    montar()
    return () => { vivo = false }
  }, [s.id, range, pts])

  if (!datos) return <div className="card comparativa"><p className="placeholder" style={{ padding: 24 }}>Montando comparativa…</p></div>
  if (datos.vacio) return <div className="card comparativa"><p className="placeholder" style={{ padding: 24 }}>No hay datos de cartera suficientes en este periodo.</p></div>

  return (
    <div className="card comparativa num">
      <div className="comp-head">
        <h3>
          <span className="dot" style={{ background: '#3BC9F5' }} /> {s.ticker} <b className={pctClass(datos.finSim)}>{fmtPct(datos.finSim)}</b>
          <span className="dot" style={{ background: '#2E6BF6', marginLeft: 18 }} /> Cartera <b className={pctClass(datos.finCar)}>{fmtPct(datos.finCar)}</b>
          <span className="comp-desvio">desvío {fmtPct(datos.finSim - datos.finCar)}</span>
        </h3>
        <button onClick={onCerrar}>✕</button>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={datos.serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E3E8F0" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
                 tickFormatter={fFecha} tick={{ fontSize: 10.5, fontFamily: 'JetBrains Mono' }} minTickGap={70} />
          <YAxis tickFormatter={v => v.toFixed(0) + '%'} tick={{ fontSize: 10.5, fontFamily: 'JetBrains Mono' }} width={46} />
          <Tooltip labelFormatter={fFecha}
                   formatter={(v, k) => [fmtPct(v), k === 'sim' ? s.ticker : 'Cartera']} />
          <ReferenceLine y={0} stroke="#8A93A6" strokeDasharray="4 3" />
          <Line type="monotone" dataKey="sim" stroke="#3BC9F5" strokeWidth={1.8} dot={false} connectNulls />
          <Line type="monotone" dataKey="car" stroke="#2E6BF6" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <p className="comp-nota">Ambas series parten de 0% al inicio del periodo ({fFecha(datos.serie[0].t)}): desempeño relativo. La cartera va en RENTABILIDAD (TWR, sin efecto de las aportaciones) y con resolución semanal.</p>
    </div>
  )
}

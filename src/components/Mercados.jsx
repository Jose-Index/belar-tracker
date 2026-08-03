import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { fetchQuotes, fetchHistory, frescura, pctDia } from '../lib/quotes'
import './mercados.css'

const PERIODOS = [['1d', '1D'], ['5d', '1S'], ['1mo', '1M'], ['6mo', '6M'], ['ytd', 'YTD'], ['1y', '1A'], ['5y', '5A'], ['max', 'MAX']]
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''

export default function Mercados() {
  const [lista, setLista] = useState([])       // symbols con watchlist_pos
  const [quotes, setQuotes] = useState({})
  const [sel, setSel] = useState(null)
  const [edit, setEdit] = useState(false)
  const [nuevo, setNuevo] = useState('')

  async function cargar() {
    const { data } = await supabase.from('symbols').select('*')
      .not('watchlist_pos', 'is', null).order('watchlist_pos')
    setLista(data || [])
    setQuotes(await fetchQuotes((data || []).map(s => s.yahoo_symbol)))
  }
  useEffect(() => { cargar() }, [])

  async function quitar(s) {
    await supabase.from('symbols').update({ watchlist_pos: null }).eq('id', s.id)
    cargar()
  }
  async function añadir(e) {
    e.preventDefault()
    const t = nuevo.trim().toUpperCase()
    if (!t) return
    const pos = (lista.at(-1)?.watchlist_pos || 0) + 1
    // si existe el símbolo se promociona; si no, se crea con yahoo=ticker
    const { data: ex } = await supabase.from('symbols').select('id').eq('ticker', t).maybeSingle()
    if (ex) await supabase.from('symbols').update({ watchlist_pos: pos }).eq('id', ex.id)
    else await supabase.from('symbols').insert({ ticker: t, yahoo_symbol: t, asset_type: 'stock', watchlist_pos: pos })
    setNuevo(''); cargar()
  }
  async function mover(s, dir) {
    const i = lista.indexOf(s), j = i + dir
    if (j < 0 || j >= lista.length) return
    const o = lista[j]
    await supabase.from('symbols').update({ watchlist_pos: o.watchlist_pos }).eq('id', s.id)
    await supabase.from('symbols').update({ watchlist_pos: s.watchlist_pos }).eq('id', o.id)
    cargar()
  }

  return (
    <div className="mercados">
      <div className="chips">
        {lista.map(s => {
          const q = quotes[s.yahoo_symbol]
          const d = pctDia(q)
          return (
            <button key={s.id} className={'chip-m num' + (sel?.id === s.id ? ' on' : '')}
                    title={q ? frescura(q) : 'sin dato'}
                    onClick={() => setSel(sel?.id === s.id ? null : s)}>
              <span className="t">{s.ticker}</span>
              <span className="p">{q ? Number(q.price).toLocaleString('es-ES', { maximumFractionDigits: q.price > 100 ? 0 : 4 }) : '—'}</span>
              <span className={'d ' + pctClass(d)}>{fmtPct(d)}</span>
              {edit && <span className="acciones">
                <a onClick={e => { e.stopPropagation(); mover(s, -1) }}>‹</a>
                <a onClick={e => { e.stopPropagation(); mover(s, 1) }}>›</a>
                <a className="x" onClick={e => { e.stopPropagation(); quitar(s) }}>✕</a>
              </span>}
            </button>
          )
        })}
        {edit && (
          <form className="chip-add" onSubmit={añadir}>
            <input placeholder="+ ticker Yahoo" value={nuevo} onChange={e => setNuevo(e.target.value)} />
          </form>
        )}
        <a className="edit-toggle" onClick={() => setEdit(!edit)}>{edit ? 'hecho' : 'editar'}</a>
      </div>
      {sel && <GraficaSimbolo s={sel} q={quotes[sel.yahoo_symbol]} />}
    </div>
  )
}

function GraficaSimbolo({ s, q }) {
  const [range, setRange] = useState('6mo')
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    setDatos(null)
    fetchHistory(s.yahoo_symbol, range).then(setDatos)
  }, [s.id, range])

  const pts = datos?.points || []
  const sube = pts.length > 1 && pts.at(-1).v >= pts[0].v
  const col = sube ? '#16A34A' : '#E5484D'   // semántico: dirección del periodo

  return (
    <div className="card grafica-simbolo">
      <div className="gs-head">
        <h3 className="num">{s.display_name || s.ticker}
          {q && <span className="gs-precio"> {Number(q.price).toLocaleString('es-ES')} <span className="gs-fresco">{frescura(q)}</span></span>}
        </h3>
        <div className="periodos num">
          {PERIODOS.map(([r, l]) => (
            <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{l}</button>
          ))}
        </div>
      </div>
      {!datos ? <p className="placeholder" style={{ padding: 30 }}>Cargando serie…</p> : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={pts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={'g' + s.id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={col} stopOpacity={0.18} />
                <stop offset="100%" stopColor={col} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tickFormatter={t => {
              const d = new Date(t)
              return range === '1d' || range === '5d'
                ? `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
                : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
            }} tick={{ fontSize: 10.5, fontFamily: 'JetBrains Mono' }} minTickGap={70} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10.5, fontFamily: 'JetBrains Mono' }} width={56}
                   tickFormatter={v => Number(v).toLocaleString('es-ES', { maximumFractionDigits: v > 100 ? 0 : 3 })} />
            <Tooltip formatter={v => Number(v).toLocaleString('es-ES')} labelFormatter={t => new Date(t).toLocaleString('es-ES')} />
            <Area type="monotone" dataKey="v" stroke={col} strokeWidth={1.8} fill={`url(#g${s.id})`} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

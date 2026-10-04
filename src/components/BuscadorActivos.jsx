// Buscador · pestañas ETF / Índices / Cripto (02/10/2026).
// Listas seleccionadas (api/_activos.js) con métricas de cierre diario y correlación con la cartera.
// Sin entrada de Tesis: los ETF van a bloques núcleo (veto §7.4), los índices son contexto y la cripto
// solo como núcleo BTC o regla RSI-BTC 70/50. La ficha muestra lo que aplica a cada tipo.
import { useEffect, useMemo, useState } from 'react'
import { fetchActivos, correlacionCartera, nivelCorr, fmtCorr } from '../lib/universo'
import { useCache } from '../lib/cache'
import Ficha from './Ficha.jsx'

const fmtPct = (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(d) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fmtPx = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 3 : 2 })

// Texto sin acentos ni mayúsculas, para comparar
const norm = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const AYUDA = {
  ETF: 'Vehículos para los bloques NÚCLEO, O/MERCADOS y ORO. Sin entrada de Tesis: los ETF operados como táctica están vetados (20 % de acierto).',
  INDICE: 'Contexto de mercado: no se operan. Cada índice indica el ETF UCITS con el que se replica.',
  CRIPTO: 'Solo BTC: núcleo sin SL o regla RSI-BTC 70/50. La cripto operada está vetada (19 operaciones, 21 % de acierto).',
}

export default function BuscadorActivos({ tipo, estrellas, onEstrella, vix }) {
  const { data, error, cargando, recargar } = useCache('activos:' + tipo, () => fetchActivos(tipo), { ttl: 30 * 60e3, persist: true, deps: [tipo] })
  const [cat, setCat] = useState('TODAS')
  const [soloUcits, setSoloUcits] = useState(true)
  const [soloAcc, setSoloAcc] = useState(false)
  const [orden, setOrden] = useState({ col: 'corr', desc: false })
  const [corrs, setCorrs] = useState({})
  const [sel, setSel] = useState(null)
  // Buscador de texto (04/10/2026): símbolo, nombre, qué replica, categoría o ETF UCITS.
  // Con texto se busca en toda la lista: categoría, "solo UCITS" y "solo acumulación" no ocultan resultados.
  const [q, setQ] = useState('')
  useEffect(() => { setCat('TODAS'); setSel(null); setQ('') }, [tipo])

  const filas = data?.filas || null
  useEffect(() => {
    if (!filas?.length) return
    let vivo = true
    correlacionCartera(filas.map(r => r.symbol)).then(c => { if (vivo) setCorrs(c) }).catch(() => {})
    return () => { vivo = false }
  }, [data?.at, tipo])

  const cats = useMemo(() => [...new Set((filas || []).map(r => r.categoria))], [filas])
  const vista = useMemo(() => {
    if (!filas) return null
    let b = filas.map(r => ({ ...r, corr: corrs[r.symbol] ?? null }))
    const t = norm(q).trim()
    if (t) {
      const palabras = t.split(/\s+/)
      b = b.filter(r => { const h = norm([r.symbol, r.name, r.replica, r.categoria, r.etf_ucits].join(' ')); return palabras.every(w => h.includes(w)) })
    } else {
      if (cat !== 'TODAS') b = b.filter(r => r.categoria === cat)
      if (tipo === 'ETF' && soloUcits) b = b.filter(r => r.ucits)
      if (tipo === 'ETF' && soloAcc) b = b.filter(r => r.acumulacion)
    }
    const { col, desc } = orden
    return [...b].sort((a, c) => {
      const x = a[col], y = c[col]
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      const r = typeof x === 'string' ? x.localeCompare(y) : x - y
      return desc ? -r : r
    })
  }, [filas, corrs, cat, soloUcits, soloAcc, orden, tipo, q])

  const COLS = [
    { id: 'name', l: 'VALOR', tl: true },
    { id: 'categoria', l: tipo === 'INDICE' ? 'REGIÓN' : 'CATEGORÍA', tl: true },
    ...(tipo === 'ETF' ? [{ id: 'replica', l: 'REPLICA', tl: true }, { id: 'acumulacion', l: 'ACC/DIST' }, { id: 'currency', l: 'DIVISA' }] : []),
    ...(tipo === 'INDICE' ? [{ id: 'etf_ucits', l: 'ETF UCITS', tl: true }] : []),
    ...(tipo === 'CRIPTO' ? [{ id: 'rsi14', l: 'RSI14', t: 'RSI de 14 sesiones (cierre diario de Yahoo)' }] : []),
    { id: 'perf_1m', l: '1M' }, { id: 'perf_3m', l: '3M' }, { id: 'perf_6m', l: '6M' }, { id: 'perf_1y', l: '1A' },
    { id: 'dist_ma50', l: 'vs MA50' }, { id: 'dist_ma200', l: 'vs MA200' },
    { id: 'dist_high52', l: 'vs MÁX52', t: 'Distancia al máximo de 52 semanas (≤ 0)' },
    { id: 'atr_pct', l: 'ATR', t: 'Variación diaria media de 14 sesiones (%)' },
    { id: 'corr', l: 'CORR. CART.', t: 'Correlación semanal (1 año) con tu cartera abierta, ponderada por importe. < 0,15 diversifica; > 0,35 se parece a lo que ya tienes' },
  ]
  const ordenar = c => setOrden(o => o.col === c ? { col: c, desc: !o.desc } : { col: c, desc: !['name', 'categoria', 'replica', 'etf_ucits', 'corr', 'currency'].includes(c) })

  return (
    <>
      <div className="card filtros num activos-filtros">
        <div className="activos-q">
          <input className="f-q" type="search" placeholder={tipo === 'INDICE' ? 'índice, región o ETF (p. ej. Hang Seng, Asia)' : tipo === 'CRIPTO' ? 'símbolo o nombre' : 'símbolo, nombre o qué replica (p. ej. China, oro, KWEB)'}
                 value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Escape' && setQ('')} />
          {q && <button type="button" className="btn-sec" onClick={() => setQ('')}>Borrar</button>}
          {q && <span className="activos-ayuda">buscando en toda la lista: los filtros de abajo no ocultan resultados</span>}
        </div>
        <div className={'f-fila' + (q ? ' f-pausa' : '')}>
          <span className="f-l">{tipo === 'INDICE' ? 'Región' : 'Categoría'}</span>
          <div className="chips">
            <button className={cat === 'TODAS' ? 'on' : ''} onClick={() => setCat('TODAS')}>Todas</button>
            {cats.map(c => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
          </div>
        </div>
        {tipo === 'ETF' && (
          <div className={'f-fila' + (q ? ' f-pausa' : '')}>
            <span className="f-l">Vehículo</span>
            <div className="chips">
              <label className="check" title="Solo ETF europeos (UCITS): los americanos no se pueden comprar como minorista europeo, salvo por CFD"><input type="checkbox" checked={soloUcits} onChange={e => setSoloUcits(e.target.checked)} /> solo UCITS</label>
              <label className="check"><input type="checkbox" checked={soloAcc} onChange={e => setSoloAcc(e.target.checked)} /> solo acumulación</label>
            </div>
          </div>
        )}
        <p className="activos-ayuda">{AYUDA[tipo]}</p>
      </div>

      {error && <p className="auth-err">{error.message || String(error)}</p>}
      <div className="card pos-tabla-wrap">
        {!vista ? <p className="placeholder" style={{ margin: 12 }}>{cargando ? 'Calculando (el primer acceso del día tarda unos segundos)…' : 'Cargando…'}</p> : (
          <table className="pos-tabla num tabla-busc">
            <thead>
              <tr>
                <th>★</th>
                {COLS.map(c => (
                  <th key={c.id} className={(c.tl ? 'tl ' : '') + (orden.col === c.id ? 'ord' : '')} title={c.t || ''} onClick={() => ordenar(c.id)}>
                    {c.l}{orden.col === c.id ? (orden.desc ? ' ↓' : ' ↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vista.map(r => (
                <tr key={r.symbol} onClick={() => setSel(r)} className={sel?.symbol === r.symbol ? 'sel' : ''}>
                  <td className="estrella-td" onClick={e => { e.stopPropagation(); onEstrella(r) }}>
                    <span className={'estrella' + (estrellas[r.symbol] ? ' on' : '')}>{estrellas[r.symbol] ? '★' : '☆'}</span>
                  </td>
                  <td className="tl ticker"><b>{r.symbol}</b> <span className="nombre">{r.name}</span>{tipo === 'ETF' && !r.ucits && <span className="tag-fuera" title="ETF americano: no comprable como minorista europeo (PRIIPs), solo referencia o CFD">EE. UU.</span>}</td>
                  <td className="tl">{r.categoria}</td>
                  {tipo === 'ETF' && <><td className="tl">{r.replica}</td><td>{r.acumulacion ? 'Acc' : 'Dist'}</td><td>{r.currency || '—'}</td></>}
                  {tipo === 'INDICE' && <td className="tl">{r.etf_ucits || '—'}</td>}
                  {tipo === 'CRIPTO' && <td className={r.rsi14 >= 70 ? 'up' : r.rsi14 <= 50 ? 'down' : ''}>{r.rsi14 == null ? '—' : r.rsi14.toFixed(0)}</td>}
                  <td className={pctClass(r.perf_1m)}>{fmtPct(r.perf_1m)}</td>
                  <td className={pctClass(r.perf_3m)}>{fmtPct(r.perf_3m)}</td>
                  <td className={pctClass(r.perf_6m)}>{fmtPct(r.perf_6m)}</td>
                  <td className={pctClass(r.perf_1y)}>{fmtPct(r.perf_1y)}</td>
                  <td className={pctClass(r.dist_ma50)}>{fmtPct(r.dist_ma50)}</td>
                  <td className={pctClass(r.dist_ma200)}>{fmtPct(r.dist_ma200)}</td>
                  <td className="neutro">{fmtPct(r.dist_high52)}</td>
                  <td>{r.atr_pct == null ? '—' : r.atr_pct.toFixed(2) + '%'}</td>
                  <td><span className={'corr ' + nivelCorr(r.corr)}>{fmtCorr(r.corr)}</span></td>
                </tr>
              ))}
              {!vista.length && <tr><td colSpan={COLS.length + 1} className="tl" style={{ color: 'var(--texto-neutro)' }}>{q ? `Sin resultados para "${q}" en la lista. Si falta un ETF o índice, pídeselo a Belar: la lista es ampliable.` : 'Sin resultados con estos filtros.'}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p className="pos-fuente">
        {vista ? `${vista.length} ${tipo === 'INDICE' ? 'índices' : tipo === 'CRIPTO' ? 'activos' : 'ETF'}` : ''} · fuente Yahoo Finance (cierre diario{data?.at ? ', calculado ' + new Date(data.at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}) · lista seleccionada, ampliable en api/_activos.js · <a onClick={() => fetchActivos(tipo, true).then(() => recargar(true))}>recalcular</a>
      </p>

      {sel && (() => {
        const lista = vista || []
        const i = lista.findIndex(r => r.symbol === sel.symbol)
        return <Ficha valor={sel} modo={tipo} onClose={() => setSel(null)} lista={lista} indice={i} onNav={j => setSel(lista[j])}
                      estrella={estrellas[sel.symbol] || null} onEstrella={onEstrella} vix={vix || null} />
      })()}
    </>
  )
}

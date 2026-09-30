// Buscador de la Tesis JOSE −11/+23,5 (30/09/2026).
// Filtra el universo (datos de cierre, refrescados una vez al día) por mercado,
// capitalización, PER, sector, rating de analistas, resultados próximos y tendencia.
// Clic en un valor → Ficha (gráfica de línea a 2 años, MA50/MA200) con "Entrada" y "A la sombra".
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MERCADOS, CAPS, SECTORES, SECTOR_ES, RATINGS, FILTROS_DEFECTO, cargarFiltros, guardarFiltros,
  buscarUniverso, estadoUniverso, seriesUniverso, refrescarUniverso, universoViejo, fmtCap, capBucket, diasHasta,
} from '../lib/universo'
import Ficha from '../components/Ficha.jsx'
import './buscador.css'

const fmtPct = (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(d) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fmtNum = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'
const fHora = iso => iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const COLS = [
  { id: 'symbol', l: 'VALOR', tl: true },
  { id: 'market', l: 'MERC.', tl: true },
  { id: 'sector', l: 'SECTOR', tl: true },
  { id: 'cap_usd', l: 'CAP.', t: 'Capitalización en dólares' },
  { id: 'pe_trailing', l: 'PER', t: 'PER trailing (12 meses)' },
  { id: 'pe_forward', l: 'PER fwd', t: 'PER estimado próximos 12 meses' },
  { id: 'rating', l: 'RATING', t: 'Media de analistas (1 = compra fuerte … 5 = venta)' },
  { id: 'earnings_date', l: 'RESULT.', t: 'Próxima presentación de resultados (rojo si ≤15 días: bandera roja de la Tesis)' },
  { id: 'perf_1m', l: '1M' }, { id: 'perf_3m', l: '3M' }, { id: 'perf_6m', l: '6M' }, { id: 'perf_1y', l: '1A', t: 'Variación 52 semanas' },
  { id: 'dist_ma50', l: 'vs MA50', t: 'Precio sobre la media de 50 sesiones' },
  { id: 'dist_ma200', l: 'vs MA200', t: 'Precio sobre la media de 200 sesiones' },
  { id: 'dist_high52', l: 'a MÁX52', t: 'Distancia al máximo de 52 semanas' },
]

export default function Buscador() {
  const [f, setF] = useState(cargarFiltros)
  const [filas, setFilas] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [err, setErr] = useState(null)
  const [estado, setEstado] = useState(null)     // {estado, total, por_mercado}
  const [refresco, setRefresco] = useState(null) // texto de progreso
  const [orden, setOrden] = useState({ col: 'cap_usd', desc: true })
  const [sel, setSel] = useState(null)
  const [series, setSeries] = useState({})       // symbol → tendencia (perf, atr, perseguir)
  const seriesPedidas = useRef(new Set())
  const refrescando = useRef(false)

  useEffect(() => { guardarFiltros(f) }, [f])
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const toggle = (k, id) => setF(x => ({ ...x, [k]: x[k].includes(id) ? x[k].filter(v => v !== id) : [...x[k], id] }))

  async function cargarEstado() {
    try { const e = await estadoUniverso(); setEstado(e); return e } catch { return null }
  }

  async function refrescar(forzar = false) {
    if (refrescando.current) return
    refrescando.current = true
    setRefresco(forzar ? 'Refrescando universo…' : 'Universo viejo: refrescando…')
    try {
      await refrescarUniverso(j => {
        if (j.al_dia) { setRefresco(null); return }
        const st = j.estado || {}
        setRefresco(`Refrescando universo · ${st.i}/${st.n_tareas} tandas · ${st.escritos} valores${j.pendiente ? '…' : ' · listo'}`)
      }, forzar)
      setRefresco(null)
      await cargarEstado()
      await buscar()
    } catch (e) { setRefresco('Refresco fallido: ' + e.message) }
    refrescando.current = false
  }

  async function buscar() {
    setCargando(true); setErr(null)
    try {
      const j = await buscarUniverso(f)
      setFilas(j.filas)
    } catch (e) { setErr(e.message); setFilas([]) }
    setCargando(false)
  }

  // Arranque: estado del universo; si está viejo (o vacío), refresco automático; luego búsqueda
  useEffect(() => {
    (async () => {
      const e = await cargarEstado()
      if (!e || e.total === 0 || universoViejo(e.estado)) refrescar(false)
      else buscar()
    })()
  }, [])

  // Tendencia (perf 1M/3M/6M, ATR, "perseguir") para las filas visibles que no la tengan de hoy
  useEffect(() => {
    if (!filas?.length) return
    const hoy = new Date().toISOString().slice(0, 10)
    const faltan = filas.filter(r => !(r.series_at || '').startsWith(hoy) && !seriesPedidas.current.has(r.symbol)).map(r => r.symbol).slice(0, 100)
    if (!faltan.length) return
    faltan.forEach(s => seriesPedidas.current.add(s))
    seriesUniverso(faltan).then(rows => {
      setSeries(prev => ({ ...prev, ...Object.fromEntries(rows.map(r => [r.symbol, r])) }))
    }).catch(() => {})
  }, [filas])

  const filasVista = useMemo(() => {
    if (!filas) return null
    const conSerie = filas.map(r => {
      const x = { ...r, ...(series[r.symbol] || {}) }
      // Regla "no perseguir" (Tesis §3.3): +8 % en 3 sesiones o más de 2×ATR sobre la MA20
      x.perseguir = (x.perf_3d != null && x.perf_3d > 8) || (x.dist_ma20_atr != null && x.dist_ma20_atr > 2)
      return x
    })
    const { col, desc } = orden
    const v = r => r[col]
    return [...conSerie].sort((a, b) => {
      const x = v(a), y = v(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y
      return desc ? -c : c
    })
  }, [filas, series, orden])

  const ordenar = col => setOrden(o => o.col === col ? { col, desc: !o.desc } : { col, desc: !['symbol', 'market', 'sector', 'earnings_date', 'rating'].includes(col) })
  const total = estado?.total || 0

  return (
    <div className="buscador">
      <div className="pos-head">
        <h1>Buscador <span className="hist-n">Tesis JOSE −11/+23,5 · datos de cierre, sin tiempo real</span></h1>
        <div className="pos-controls num">
          <span className="sello">
            {estado ? `universo ${total.toLocaleString('es-ES')} valores · ${estado.estado?.fin ? 'refrescado ' + fHora(estado.estado.fin) : 'sin refrescar'}` : 'universo…'}
          </span>
          <button className="btn-sec" onClick={() => refrescar(true)} disabled={!!refrescando.current} title="Vuelve a leer el universo entero de Yahoo (2-3 minutos)">Actualizar</button>
        </div>
      </div>
      {refresco && <p className="pos-msg num">{refresco}</p>}

      <div className="card filtros num">
        <div className="filtro">
          <span className="f-t">Mercado</span>
          <div className="chips">
            {MERCADOS.map(m => <button key={m.id} className={f.mercado.includes(m.id) ? 'on' : ''} onClick={() => toggle('mercado', m.id)}>{m.label}</button>)}
            <button className={f.mercado.length === MERCADOS.length ? 'on' : ''} onClick={() => set('mercado', f.mercado.length === MERCADOS.length ? ['US'] : MERCADOS.map(m => m.id))}>Todos</button>
          </div>
        </div>
        <div className="filtro">
          <span className="f-t">Capitalización</span>
          <div className="chips">
            {CAPS.map(c => <button key={c.id} title={c.ayuda} className={f.cap.includes(c.id) ? 'on' : ''} onClick={() => toggle('cap', c.id)}>{c.label}</button>)}
          </div>
        </div>
        <div className="filtro">
          <span className="f-t">PER</span>
          <div className="chips rango">
            <input value={f.pe_min} onChange={e => set('pe_min', e.target.value)} inputMode="decimal" title="PER mínimo" />
            <span>–</span>
            <input value={f.pe_max} onChange={e => set('pe_max', e.target.value)} inputMode="decimal" title="PER máximo" />
            <label className="check"><input type="checkbox" checked={f.pe_na} onChange={e => set('pe_na', e.target.checked)} /> incluir sin beneficios</label>
          </div>
        </div>
        <div className="filtro">
          <span className="f-t">Rating analistas</span>
          <div className="chips">
            {RATINGS.map(r => <button key={r.id} className={Number(f.rating_max) === r.id ? 'on' : ''} onClick={() => set('rating_max', r.id)}>{r.label}</button>)}
            <label className="check"><input type="checkbox" checked={f.rating_na} onChange={e => set('rating_na', e.target.checked)} /> incluir sin rating</label>
          </div>
        </div>
        <div className="filtro">
          <span className="f-t">Resultados</span>
          <div className="chips rango">
            <label className="check"><input type="checkbox" checked={!!f.earn_dias} onChange={e => set('earn_dias', e.target.checked ? 15 : 0)} /> excluir resultados a menos de</label>
            <input value={f.earn_dias || ''} disabled={!f.earn_dias} onChange={e => set('earn_dias', Number(e.target.value) || 0)} inputMode="numeric" />
            <span>días</span>
          </div>
        </div>
        <div className="filtro">
          <span className="f-t">Tendencia</span>
          <div className="chips">
            <button className={f.ma50 ? 'on' : ''} onClick={() => set('ma50', !f.ma50)} title="Precio por encima de la media de 50 sesiones">&gt; MA50</button>
            <button className={f.ma200 ? 'on' : ''} onClick={() => set('ma200', !f.ma200)} title="Precio por encima de la media de 200 sesiones">&gt; MA200</button>
            <button className={f.p3m ? 'on' : ''} onClick={() => set('p3m', !f.p3m)} title="Sube en los últimos 3 meses (solo valores con tendencia ya calculada)">3M positivo</button>
          </div>
        </div>
        <div className="filtro sectores">
          <span className="f-t">Sectores <a onClick={() => set('sector', f.sector.length === SECTORES.length ? [] : SECTORES.map(s => s[0]))}>{f.sector.length === SECTORES.length ? 'ninguno' : 'todos'}</a></span>
          <div className="chips">
            {SECTORES.map(([id, l]) => <label key={id} className="check"><input type="checkbox" checked={f.sector.includes(id)} onChange={() => toggle('sector', id)} /> {l}</label>)}
          </div>
        </div>
        <div className="filtro acciones">
          <input className="f-q" placeholder="símbolo o nombre" value={f.q} onChange={e => set('q', e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} />
          <button className="btn-primario" onClick={buscar} disabled={cargando}>{cargando ? 'Buscando…' : 'Buscar'}</button>
          <button className="btn-escape" onClick={() => setF({ ...FILTROS_DEFECTO })}>valores por defecto</button>
        </div>
      </div>

      {err && <p className="auth-err">{err}</p>}

      <div className="card pos-tabla-wrap">
        {!filasVista ? <p className="placeholder" style={{ margin: 12 }}>{refresco || 'Cargando…'}</p> : (
          <table className="pos-tabla num tabla-busc">
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.id} className={(c.tl ? 'tl ' : '') + (orden.col === c.id ? 'ord' : '')} title={c.t || ''} onClick={() => ordenar(c.id)}>
                    {c.l}{orden.col === c.id ? (orden.desc ? ' ↓' : ' ↑') : ''}
                  </th>
                ))}
                <th title="Señales: ⚠ perseguir (+8 % en 3 sesiones o >2×ATR sobre MA20) · µ micro cap (fuera de la Tesis) · ADR">⚑</th>
              </tr>
            </thead>
            <tbody>
              {filasVista.map(r => {
                const dias = diasHasta(r.earnings_date)
                const earnCerca = dias != null && dias >= 0 && dias <= 15
                return (
                  <tr key={r.symbol} onClick={() => setSel(r)} className={sel?.symbol === r.symbol ? 'sel' : ''}>
                    <td className="tl ticker"><b>{r.symbol}</b> <span className="nombre">{r.name}</span></td>
                    <td className="tl merc">{r.market}{r.adr ? <i title={'ADR · empresa de ' + r.adr}> ADR</i> : ''}</td>
                    <td className="tl sector">{SECTOR_ES[r.sector] || r.sector}</td>
                    <td title={capBucket(r.cap_usd)}>{fmtCap(r.cap_usd)}</td>
                    <td>{r.pe_trailing == null ? <span className="calc">n/a</span> : fmtNum(r.pe_trailing, 1)}</td>
                    <td>{r.pe_forward == null ? '—' : fmtNum(r.pe_forward, 1)}</td>
                    <td title={r.rating_label || ''}>{r.rating == null ? '—' : <span className={'rat r' + Math.round(r.rating)}>{r.rating.toFixed(1)}</span>}</td>
                    <td className={earnCerca ? 'earn-cerca' : ''} title={r.earnings_date ? `${dias} días · ${r.earnings_estimada ? 'estimada' : 'confirmada'}` : ''}>
                      {r.earnings_date ? fFecha(r.earnings_date) + (r.earnings_estimada ? '~' : '') : '—'}
                    </td>
                    <td className={pctClass(r.perf_1m)}>{fmtPct(r.perf_1m)}</td>
                    <td className={pctClass(r.perf_3m)}>{fmtPct(r.perf_3m)}</td>
                    <td className={pctClass(r.perf_6m)}>{fmtPct(r.perf_6m)}</td>
                    <td className={pctClass(r.perf_1y)}>{fmtPct(r.perf_1y)}</td>
                    <td className={pctClass(r.dist_ma50)}>{fmtPct(r.dist_ma50)}</td>
                    <td className={pctClass(r.dist_ma200)}>{fmtPct(r.dist_ma200)}</td>
                    <td className={pctClass(r.dist_high52)}>{fmtPct(r.dist_high52)}</td>
                    <td className="flags">
                      {r.perseguir && <span className="warn" title="No perseguir: +8 % en 3 sesiones o más de 2×ATR sobre la MA20">⚠</span>}
                      {r.cap_usd != null && r.cap_usd < 300e6 && <span title="Micro cap: fuera del universo de la Tesis">µ</span>}
                    </td>
                  </tr>
                )
              })}
              {!filasVista.length && <tr><td colSpan={COLS.length + 1} className="tl" style={{ color: 'var(--texto-neutro)' }}>Sin resultados con estos filtros{total ? '' : ' (el universo está vacío: pulsa Actualizar)'}.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p className="pos-fuente">
        {filasVista ? `${filasVista.length} valores` : ''} · fuente Yahoo Finance (cierre diario) · 1M/3M/6M y ⚠ se calculan al vuelo para los valores en pantalla · PER n/a = sin beneficios · rating 1 compra fuerte → 5 venta
      </p>

      {sel && <Ficha valor={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

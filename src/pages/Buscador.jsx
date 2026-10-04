// Buscador de la Tesis JOSE −11/+23,5 (30/09/2026).
// Filtra el universo (datos de cierre, refrescados una vez al día) por mercado,
// capitalización, PER, sector, rating de analistas, resultados próximos y tendencia.
// Clic en un valor → Ficha (gráfica de línea a 2 años, MA50/MA200) con "Entrada" y "A la sombra".
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MERCADOS, CAPS, SECTORES, SECTOR_ES, RATINGS, FILTROS_DEFECTO, cargarFiltros, guardarFiltros,
  buscarUniverso, estadoUniverso, seriesUniverso, refrescarUniverso, universoViejo, fmtCap, capBucket, diasHasta,
  leerEstrellas, guardarEstrellas, contadoresTesis, vixActual, valoresUniverso, TIPOS, correlacionCartera, nivelCorr, fmtCorr,
} from '../lib/universo'
import Ficha, { ChipVix } from '../components/Ficha.jsx'
import BuscadorActivos from '../components/BuscadorActivos.jsx'
import { useMovil } from '../lib/movil'
import { useCache, cargar, fijar } from '../lib/cache'
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
  { id: 'dist_high52', l: 'vs MÁX52', t: 'Distancia al máximo de 52 semanas: siempre ≤ 0 (0 % = en máximos). No es una pérdida: se muestra en gris neutro' },
  { id: 'corr', l: 'CORR. CART.', t: 'Correlación semanal (1 año) con tu cartera abierta, ponderada por importe. < 0,15 diversifica; > 0,35 se parece a lo que ya tienes' },
]

export default function Buscador() {
  const [f, setF] = useState(cargarFiltros)
  // Tipo de activo (02/10/2026): Acciones (Tesis) · ETF · Índices · Cripto
  const [tipo, setTipoEstado] = useState(() => { try { return localStorage.getItem('btp-buscador-tipo') || 'ACC' } catch { return 'ACC' } })
  const setTipo = t => { setTipoEstado(t); try { localStorage.setItem('btp-buscador-tipo', t) } catch { /* sin storage */ } }
  const [corrs, setCorrs] = useState({})      // symbol → correlación con la cartera
  const corrPedidas = useRef(new Set())
  const [filas, setFilas] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [err, setErr] = useState(null)
  // Estado del universo: cacheado y compartido (cuenta en el indicador de datos de la cabecera)
  const { data: estado } = useCache('universo:estado', estadoUniverso, { ttl: 60e3, persist: true, activo: false })
  const [refresco, setRefresco] = useState(null) // texto de progreso
  const [orden, setOrden] = useState({ col: 'cap_usd', desc: true })
  const [sel, setSel] = useState(null)
  const [series, setSeries] = useState({})       // symbol → tendencia (perf, atr, perseguir)
  const seriesPedidas = useRef(new Set())
  const refrescando = useRef(false)
  const movil = useMovil()
  const [plegado, setPlegado] = useState(false)   // móvil: filtros plegados tras buscar
  // Estrellas (app_state.buscador_estrellas) y filtro "Solo ★" (01/10/2026)
  const { data: estrellasCache } = useCache('buscador:estrellas', leerEstrellas, { ttl: 60e3, persist: true })
  const estrellas = estrellasCache || {}
  const [soloEstrellas, setSoloEstrellas] = useState(false)
  const { data: contadores } = useCache('buscador:contadores', contadoresTesis, { ttl: 60e3 })
  const { data: vix } = useCache('buscador:vix', vixActual, { ttl: 5 * 60e3 })
  async function alternarEstrella(r) {
    const nuevo = { ...estrellas }
    if (nuevo[r.symbol]) delete nuevo[r.symbol]
    else nuevo[r.symbol] = { fecha: new Date().toISOString().slice(0, 10), precio: r.price, moneda: r.currency || null, nombre: r.name || null }
    fijar('buscador:estrellas', nuevo)                 // pinta al instante
    const { error } = await guardarEstrellas(nuevo)
    if (error) { setErr('No se pudo guardar la estrella: ' + error.message); cargar('buscador:estrellas', leerEstrellas, { forzar: true }) }
  }
  // Borrar todas las estrellas (01/10/2026): doble pulsación, la segunda en menos de 4 s
  const [confirmaBorrar, setConfirmaBorrar] = useState(false)
  async function borrarEstrellas() {
    if (!confirmaBorrar) { setConfirmaBorrar(true); setTimeout(() => setConfirmaBorrar(false), 4000); return }
    setConfirmaBorrar(false)
    const antes = estrellas
    fijar('buscador:estrellas', {})
    const { error } = await guardarEstrellas({})
    if (error) { setErr('No se pudieron borrar las estrellas: ' + error.message); fijar('buscador:estrellas', antes) }
    setSoloEstrellas(false)
  }
  const desdeEstrella = r => { const e = estrellas[r.symbol]; return e?.precio && r.price ? (r.price / e.precio - 1) * 100 : null }

  useEffect(() => { guardarFiltros(f) }, [f])
  // Interruptor "Sin filtros" (04/10/2026): para buscar un valor concreto en todo el universo.
  // Los filtros guardados no se tocan: se ignoran mientras está activo y vuelven al apagarlo.
  const [libre, setLibre] = useState(() => { try { return localStorage.getItem('btp-buscador-libre') === '1' } catch { return false } })
  const fEf = useMemo(() => libre ? {
    ...FILTROS_DEFECTO, q: f.q, orden: f.orden, mercado: MERCADOS.map(m => m.id), cap: [], pe_min: '', pe_max: '', pe_na: true,
    sector: SECTORES.map(x => x[0]), rating: [], rating_na: true, earn_dias: 0, ma50: false, ma200: false, p3m: false,
    atr_on: false, sin_perseguir: false,
  } : f, [libre, f])
  const alternarLibre = () => fijarLibre(!libre)
  // Relanza la búsqueda tras cambiar de modo (interruptor o "Filtros por defecto"), ya con el estado nuevo pintado
  const [relanzar, setRelanzar] = useState(0)
  const primeraLibre = useRef(true)
  useEffect(() => { if (primeraLibre.current) { primeraLibre.current = false; return } buscar() }, [libre, relanzar])
  const fijarLibre = n => { setLibre(n); try { localStorage.setItem('btp-buscador-libre', n ? '1' : '0') } catch { /* sin storage */ } }
  // "Filtros por defecto" (04/10/2026): solo EE. UU. y los estándares de la Tesis; apaga "Sin filtros"; conserva el texto buscado
  const porDefecto = () => { setF(x => ({ ...FILTROS_DEFECTO, q: x.q })); fijarLibre(false); setRelanzar(n => n + 1) }
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const ratingTodos = !f.rating?.length || f.rating.length >= RATINGS.length
  const alternarRating = id => setF(x => {
    const act = !x.rating?.length || x.rating.length >= RATINGS.length ? [] : x.rating
    const nuevo = act.includes(id) ? act.filter(r => r !== id) : RATINGS.map(r => r.id).filter(r => r === id || act.includes(r))
    return { ...x, rating: nuevo.length >= RATINGS.length ? [] : nuevo }
  })
  // Filtros distintos del valor por defecto (● en la etiqueta y recuento en la barra) · 01/10/2026
  const igual = (x, y) => JSON.stringify(Array.isArray(x) ? [...x].sort() : x) === JSON.stringify(Array.isArray(y) ? [...y].sort() : y)
  const D = FILTROS_DEFECTO
  const CLAVES = {
    mercado: ['mercado'], cap: ['cap'], sector: ['sector'], pe: ['pe_campo', 'pe_min', 'pe_max', 'pe_na'],
    rating: ['rating', 'rating_na'], tendencia: ['ma50', 'ma200', 'p3m'], earn: ['earn_dias'],
    atr: ['atr_on', 'atr_min', 'atr_max'], perseguir: ['sin_perseguir'],
  }
  const cambiado = id => CLAVES[id].some(k => !igual(f[k] ?? null, D[k] ?? null) && !(String(f[k]) === String(D[k])))
  const GRUPOS = { universo: ['mercado', 'cap', 'sector'], valor: ['pe', 'rating'], grafico: ['tendencia'], reglas: ['earn', 'atr', 'perseguir'] }
  const grupoCambiado = g => GRUPOS[g].some(cambiado)
  const nCambiados = Object.keys(CLAVES).filter(cambiado).length
  const [cerrados, setCerrados] = useState({})   // móvil: bloques plegables
  const alternarGrupo = g => { if (movil) setCerrados(c => ({ ...c, [g]: !c[g] })) }
  const despSectores = useRef(null)
  useEffect(() => {                              // cierra el desplegable de sectores al pulsar fuera
    const fuera = e => { const d = despSectores.current; if (d?.open && !d.contains(e.target)) d.open = false }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [])
  const toggle = (k, id) => setF(x => ({ ...x, [k]: x[k].includes(id) ? x[k].filter(v => v !== id) : [...x[k], id] }))

  async function cargarEstado() {
    try { return await cargar('universo:estado', estadoUniverso, { forzar: true, persist: true }) } catch { return null }
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
      const j = await buscarUniverso(fEf)
      setFilas(j.filas)
      fijar('universo:busqueda', { n: j.filas?.length || 0 })   // marca de frescura para la cabecera
      setPlegado(true)
    } catch (e) { setErr(e.message); setFilas([]) }
    setCargando(false)
  }

  // Resumen de los filtros activos (cabecera plegada en móvil)
  const resumenFiltros = libre ? `sin filtros${f.q ? ` · "${f.q}"` : ''}` : [
    f.mercado.length === MERCADOS.length ? 'todos los mercados' : f.mercado.join('/'),
    f.cap.length ? f.cap.map(c => CAPS.find(x => x.id === c)?.label || c).join('/') : null,
    (f.pe_min || f.pe_max) ? `PER ${f.pe_campo === 'fwd' ? 'fut. ' : ''}${f.pe_min || '0'}–${f.pe_max || '∞'}` : null,
    f.atr_on ? `ATR ${f.atr_min}–${f.atr_max} %` : null,
    f.sin_perseguir ? 'sin ⚠' : null,
    ratingTodos ? null : 'rating ' + f.rating.map(id => RATINGS.find(r => r.id === id)?.label).join('/'),
    f.earn_dias ? `sin result. <${f.earn_dias}d` : null,
    [f.ma50 && '>MA50', f.ma200 && '>MA200', f.p3m && '3M+'].filter(Boolean).join(' ') || null,
    f.sector.length === SECTORES.length ? null : `${f.sector.length} sectores`,
    f.q ? `"${f.q}"` : null,
  ].filter(Boolean).join(' · ')

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
    // Todas las filas (no solo las 100 primeras): el filtro ATR se aplica sobre el ATR calculado. Tandas de 100.
    const faltan = filas.filter(r => !(r.series_at || '').startsWith(hoy) && !seriesPedidas.current.has(r.symbol)).map(r => r.symbol)
    if (!faltan.length) return
    faltan.forEach(s => seriesPedidas.current.add(s))
    ;(async () => {
      for (let i = 0; i < faltan.length; i += 100) {
        try {
          const rows = await seriesUniverso(faltan.slice(i, i + 100))
          setSeries(prev => ({ ...prev, ...Object.fromEntries(rows.map(r => [r.symbol, r])) }))
        } catch { /* la tanda se queda sin tendencia */ }
      }
    })()
  }, [filas])

  // Estrellas que la búsqueda deja fuera: se añaden atenuadas ("fuera de filtro"); solo desaparecen al quitar la estrella
  const pidiendoFuera = useRef('')
  useEffect(() => {
    if (!filas) return
    const dentro = new Set(filas.map(r => r.symbol))
    const faltan = Object.keys(estrellas).filter(s => !dentro.has(s)).sort()
    const clave = faltan.join(',')
    if (!faltan.length || pidiendoFuera.current === clave) return
    pidiendoFuera.current = clave
    valoresUniverso(faltan).then(rows => {
      setFilas(prev => {
        const ya = new Set((prev || []).map(r => r.symbol))
        return [...(prev || []), ...rows.filter(r => !ya.has(r.symbol)).map(r => ({ ...r, fuera: true }))]
      })
    }).catch(() => {}).finally(() => { pidiendoFuera.current = '' })
  }, [filas, estrellasCache])

  const filasVista = useMemo(() => {
    if (!filas) return null
    const conSerie = filas.map(r => {
      const x = { ...r, ...(series[r.symbol] || {}), corr: corrs[r.symbol] ?? null }
      // Regla "no perseguir" (Tesis §3.3): +8 % en 3 sesiones o más de 2×ATR sobre la MA20
      x.perseguir = (x.perf_3d != null && x.perf_3d > 8) || (x.dist_ma20_atr != null && x.dist_ma20_atr > 2)
      return x
    })
    const { col, desc } = orden
    const v = r => r[col]
    let base = conSerie.filter(r => !r.fuera || estrellas[r.symbol])     // fuera de filtro: solo mientras tenga estrella
    if (soloEstrellas) base = base.filter(r => estrellas[r.symbol])
    // Filtros en cliente (ATR, perseguir): las estrellas no se ocultan, se marcan "fuera de filtro" (01/10/2026)
    const lo = Number(fEf.atr_min) || 0, hi = Number(fEf.atr_max) || Infinity
    base = base.map(r => {
      if (!estrellas[r.symbol] || r.fuera) return r
      const sale = (fEf.sin_perseguir && r.perseguir) || (fEf.atr_on && r.atr_pct != null && (r.atr_pct < lo || r.atr_pct > hi))
      return sale ? { ...r, fuera: true } : r
    })
    if (fEf.sin_perseguir) base = base.filter(r => r.fuera || !r.perseguir)
    if (fEf.atr_on) base = base.filter(r => r.fuera || r.atr_pct == null || (r.atr_pct >= lo && r.atr_pct <= hi))
    return [...base].sort((a, b) => {
      const x = v(a), y = v(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y
      return desc ? -c : c
    })
  }, [filas, series, corrs, orden, soloEstrellas, estrellas, fEf.atr_on, fEf.atr_min, fEf.atr_max, fEf.sin_perseguir])
  const atrPendientes = fEf.atr_on && filasVista ? filasVista.filter(r => r.atr_pct == null).length : 0

  const ordenar = col => setOrden(o => o.col === col ? { col, desc: !o.desc } : { col, desc: !['symbol', 'market', 'sector', 'earnings_date', 'rating', 'corr'].includes(col) })

  // Correlación con la cartera de las filas de la búsqueda (02/10/2026), por tandas de 150
  useEffect(() => {
    if (!filas?.length) return
    const faltan = filas.map(r => r.symbol).filter(s => !corrPedidas.current.has(s))
    if (!faltan.length) return
    faltan.forEach(s => corrPedidas.current.add(s))
    correlacionCartera(faltan).then(c => setCorrs(prev => ({ ...prev, ...c }))).catch(() => {})
  }, [filas])
  const total = estado?.total || 0

  return (
    <div className="buscador">
      <div className="pos-head">
        <h1>Buscador <span className="hist-n">{tipo === 'ACC' ? 'Tesis JOSE −11/+23,5 · ' : ''}datos de cierre, sin tiempo real</span></h1>
        <div className="pos-controls num">
          {vix?.v != null && <ChipVix vix={vix} />}
          {tipo === 'ACC' && <><span className="sello">
            {estado ? `universo ${total.toLocaleString('es-ES')} valores · ${estado.estado?.fin ? 'refrescado ' + fHora(estado.estado.fin) : 'sin refrescar'}` : 'universo…'}
          </span>
          <button className="btn-sec" onClick={() => refrescar(true)} disabled={!!refrescando.current} title="Vuelve a leer el universo entero de Yahoo (2-3 minutos)">Actualizar</button></>}
        </div>
      </div>
      <div className="tipos-activo" role="tablist">
        {TIPOS.map(t => <button key={t.id} role="tab" aria-selected={tipo === t.id} className={tipo === t.id ? 'on' : ''} onClick={() => setTipo(t.id)}>{t.label}</button>)}
      </div>
      {tipo !== 'ACC' ? <BuscadorActivos tipo={tipo} estrellas={estrellas} onEstrella={alternarEstrella} vix={vix} /> : <>
      {refresco && <p className="pos-msg num">{refresco}</p>}

      {movil && (
        <button type="button" className={'filtros-resumen num' + (plegado ? '' : ' abierto')} onClick={() => setPlegado(v => !v)} aria-expanded={!plegado}>
          <span className="fr-t">Filtros</span>
          <span className="fr-txt">{resumenFiltros}</span>
          <span className="fr-flecha" aria-hidden="true">{plegado ? '▾' : '▴'}</span>
        </button>
      )}
      <div className={'card filtros num' + (movil && plegado ? ' plegado' : '') + (libre ? ' libre' : '')}>
        <div className="f-grupos" title={libre ? 'Filtros en pausa: apaga "Sin filtros" para usarlos' : undefined}>
          <section className={'f-grupo' + (cerrados.universo ? ' cerrado' : '')}>
            <h3 onClick={() => alternarGrupo('universo')}>Qué universo{grupoCambiado('universo') && <i className="f-dot" />}</h3>
            <div className="f-fila">
              <span className="f-l">Mercado{cambiado('mercado') && <i className="f-dot" />}</span>
              <div className="chips">
                {MERCADOS.map(m => <button key={m.id} className={f.mercado.includes(m.id) ? 'on' : ''} onClick={() => toggle('mercado', m.id)}>{m.label}</button>)}
                <button className={f.mercado.length === MERCADOS.length ? 'on' : ''} onClick={() => set('mercado', f.mercado.length === MERCADOS.length ? ['US'] : MERCADOS.map(m => m.id))}>Todos</button>
              </div>
            </div>
            <div className="f-fila">
              <span className="f-l">Tamaño{cambiado('cap') && <i className="f-dot" />}</span>
              <div className="chips">
                {CAPS.map(c => <button key={c.id} title={c.ayuda} className={f.cap.includes(c.id) ? 'on' : ''} onClick={() => toggle('cap', c.id)}>{c.label}</button>)}
              </div>
            </div>
            <div className="f-fila">
              <span className="f-l">Sectores{cambiado('sector') && <i className="f-dot" />}</span>
              <details className="f-desp" ref={despSectores}>
                <summary>{f.sector.length === SECTORES.length ? 'Todos' : f.sector.length === 0 ? 'Ninguno' : `${f.sector.length} de ${SECTORES.length}`}</summary>
                <div className="f-desp-panel">
                  <a onClick={() => set('sector', f.sector.length === SECTORES.length ? [] : SECTORES.map(x => x[0]))}>{f.sector.length === SECTORES.length ? 'ninguno' : 'todos'}</a>
                  {SECTORES.map(([id, l]) => <label key={id} className="check"><input type="checkbox" checked={f.sector.includes(id)} onChange={() => toggle('sector', id)} /> {l}</label>)}
                </div>
              </details>
            </div>
          </section>

          <section className={'f-grupo' + (cerrados.valor ? ' cerrado' : '')}>
            <h3 onClick={() => alternarGrupo('valor')}>Cuánto vale{grupoCambiado('valor') && <i className="f-dot" />}</h3>
            <div className="f-fila">
              <span className="f-l">PER{cambiado('pe') && <i className="f-dot" />}</span>
              <div className="chips rango">
                <span className="segm">
                  <button className={f.pe_campo === 'fwd' ? 'on' : ''} onClick={() => set('pe_campo', 'fwd')} title="Sobre el beneficio estimado de los próximos 12 meses">Futuro</button>
                  <button className={f.pe_campo !== 'fwd' ? 'on' : ''} onClick={() => set('pe_campo', 'ttm')} title="Sobre el beneficio de los últimos 12 meses">Actual</button>
                </span>
                <input value={f.pe_min} onChange={e => set('pe_min', e.target.value)} inputMode="decimal" title="PER mínimo" />
                <span>–</span>
                <input value={f.pe_max} onChange={e => set('pe_max', e.target.value)} inputMode="decimal" title="PER máximo" />
              </div>
              <span />
              <label className="check sub"><input type="checkbox" checked={f.pe_na} onChange={e => set('pe_na', e.target.checked)} /> {f.pe_campo === 'fwd' ? 'incluir sin estimación' : 'incluir sin beneficios'}</label>
            </div>
            <div className="f-fila">
              <span className="f-l">Rating{cambiado('rating') && <i className="f-dot" />}</span>
              <div className="chips">
                {RATINGS.map(r => <button key={r.id} className={!ratingTodos && f.rating.includes(r.id) ? 'on' : ''} onClick={() => alternarRating(r.id)}
                  title={r.min == null ? `media ≤ ${r.max}` : r.max == null ? `media > ${r.min}` : `media ${r.min} – ${r.max}`}>{r.label}</button>)}
                <button className={ratingTodos ? 'on' : ''} onClick={() => set('rating', [])} title="Sin filtro de rating (incluye los que no tienen)">Cualquiera</button>
              </div>
              <span />
              <label className="check sub"><input type="checkbox" checked={f.rating_na} disabled={ratingTodos} onChange={e => set('rating_na', e.target.checked)} /> incluir sin rating</label>
            </div>
          </section>

          <section className={'f-grupo' + (cerrados.grafico ? ' cerrado' : '')}>
            <h3 onClick={() => alternarGrupo('grafico')}>Cómo está el gráfico{grupoCambiado('grafico') && <i className="f-dot" />}</h3>
            <div className="f-fila">
              <span className="f-l">Tendencia{cambiado('tendencia') && <i className="f-dot" />}</span>
              <div className="chips">
                <button className={f.ma50 ? 'on' : ''} onClick={() => set('ma50', !f.ma50)} title="Precio por encima de la media de 50 sesiones">&gt; MA50</button>
                <button className={f.ma200 ? 'on' : ''} onClick={() => set('ma200', !f.ma200)} title="Precio por encima de la media de 200 sesiones">&gt; MA200</button>
                <button className={f.p3m ? 'on' : ''} onClick={() => set('p3m', !f.p3m)} title="Sube en los últimos 3 meses (solo valores con tendencia ya calculada)">3M positivo</button>
              </div>
            </div>
          </section>

          <section className={'f-grupo reglas' + (cerrados.reglas ? ' cerrado' : '')}>
            <h3 onClick={() => alternarGrupo('reglas')}>Reglas de la Tesis{grupoCambiado('reglas') && <i className="f-dot" />}</h3>
            <div className="f-regla">
              <label className="check"><input type="checkbox" checked={!!f.earn_dias} onChange={e => set('earn_dias', e.target.checked ? 15 : 0)} /> Sin resultados a menos de</label>
              <input value={f.earn_dias || ''} disabled={!f.earn_dias} onChange={e => set('earn_dias', Number(e.target.value) || 0)} inputMode="numeric" />
              <span>días</span>{cambiado('earn') && <i className="f-dot" />}
            </div>
            <div className="f-regla" title="Techo 5,5: con SL −11 el buffer es ≥ 2×ATR. Suelo 1,5: por debajo, el +23,5 en 20 semanas es improbable.">
              <label className="check"><input type="checkbox" checked={!!f.atr_on} onChange={e => set('atr_on', e.target.checked)} /> ATR entre</label>
              <input value={f.atr_min} disabled={!f.atr_on} onChange={e => set('atr_min', e.target.value)} inputMode="decimal" title="ATR % mínimo" />
              <span>–</span>
              <input value={f.atr_max} disabled={!f.atr_on} onChange={e => set('atr_max', e.target.value)} inputMode="decimal" title="ATR % máximo" />
              <span>%</span>{cambiado('atr') && <i className="f-dot" />}
            </div>
            <div className="f-regla" title="Oculta los valores marcados ⚠: +8 % en 3 sesiones o más de 2×ATR sobre la MA20 (bandera roja: no se persigue)">
              <label className="check"><input type="checkbox" checked={!!f.sin_perseguir} onChange={e => set('sin_perseguir', e.target.checked)} /> Ocultar "perseguir" ⚠</label>
              {cambiado('perseguir') && <i className="f-dot" />}
            </div>
          </section>
        </div>

        <div className="filtro acciones">
          <input className="f-q" placeholder="símbolo o nombre" value={f.q} onChange={e => set('q', e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} />
          <button className="btn-primario" onClick={buscar} disabled={cargando}>{cargando ? 'Buscando…' : 'Buscar'}</button>
          <button type="button" role="switch" aria-checked={libre} className={'f-libre' + (libre ? ' on' : '')} onClick={alternarLibre}
                  title="Ignora todos los filtros (mercado, tamaño, PER, rating, resultados, ATR…) para buscar un valor concreto en todo el universo. Tus filtros se conservan.">
            <span className="f-libre-pista" aria-hidden="true"><span /></span> Sin filtros
          </button>
          <button type="button" className="btn-sec f-defecto" onClick={porDefecto} disabled={!nCambiados && !libre}
                  title="Solo EE. UU. y los filtros estándar de la Tesis: PER futuro 8–25, ATR 1,5–5,5 %, rating Fuerte compra / Compra, sin resultados a menos de 15 días">Filtros por defecto</button>
          <span className="f-estado">
            {filasVista ? `${filasVista.length} valores` : ''}
            {libre ? ' · sin filtros: todo el universo' : nCambiados ? <> · {nCambiados} {nCambiados === 1 ? 'filtro cambiado' : 'filtros cambiados'} <i className="f-dot" /></> : ' · filtros por defecto'}
          </span>
        </div>
      </div>

      {err && <p className="auth-err">{err}</p>}

      {filasVista && (
        <div className="busc-estrellas num">
          <button type="button" className={'chip-solo' + (soloEstrellas ? ' on' : '')} onClick={() => setSoloEstrellas(v => !v)}
                  title="Muestra solo los valores marcados con estrella (dentro de este filtro)">★ Solo estrellas</button>
          {Object.keys(estrellas).length > 0 && (
            <button type="button" className={'chip-borrar' + (confirmaBorrar ? ' confirma' : '')} onClick={borrarEstrellas}
                    title="Quita todas las estrellas (se pierden su fecha y su precio de marca)">
              {confirmaBorrar ? `¿Seguro? Pulsa otra vez para borrar ${Object.keys(estrellas).length}` : 'Borrar todas'}
            </button>
          )}
          <span className="hist-n">{Object.keys(estrellas).length} con estrella{filasVista && filasVista.some(r => r.fuera) ? ` · ${filasVista.filter(r => r.fuera).length} fuera del filtro (atenuadas)` : ''} · en la ficha: ‹ › o flechas para pasar, S para la estrella</span>
        </div>
      )}
      {movil && filasVista && (
        <div className="busc-orden num">
          <span>{filasVista.length} valores · orden</span>
          <select value={orden.col} onChange={e => ordenar(e.target.value)}>
            {COLS.map(c => <option key={c.id} value={c.id}>{c.l}</option>)}
          </select>
          <button type="button" className="btn-dir" onClick={() => setOrden(o => ({ ...o, desc: !o.desc }))}>{orden.desc ? '↓' : '↑'}</button>
        </div>
      )}
      <div className="card pos-tabla-wrap">
        {!filasVista ? <p className="placeholder" style={{ margin: 12 }}>{refresco || 'Cargando…'}</p> : movil ? (
          <ul className="busc-lista num">
            {filasVista.map(r => {
              const dias = diasHasta(r.earnings_date)
              const earnCerca = dias != null && dias >= 0 && dias <= 15
              return (
                <li key={r.symbol} onClick={() => setSel(r)} className={r.fuera ? 'fuera' : ''}>
                  <div className="bl-izq">
                    <div className="bl-l1">
                      <span className={'estrella' + (estrellas[r.symbol] ? ' on' : '')} onClick={e => { e.stopPropagation(); alternarEstrella(r) }}>{estrellas[r.symbol] ? '★' : '☆'}</span>
                      <b>{r.symbol}</b><span className="nombre">{r.name}</span>{r.fuera && <span className="tag-fuera">fuera</span>}
                      {desdeEstrella(r) != null && <span className={'desde-est ' + pctClass(desdeEstrella(r))}>{fmtPct(desdeEstrella(r))}</span>}
                    </div>
                    <div className="bl-l2">
                      {r.market}{r.adr ? ' ADR' : ''} · {fmtCap(r.cap_usd)} · PER {r.pe_trailing == null ? 'n/a' : fmtNum(r.pe_trailing, 0)}
                      {r.rating != null ? <> · <span className={'rat r' + Math.round(r.rating)} title="rating analistas">★{r.rating.toFixed(1)}</span></> : null}
                      {r.earnings_date ? <> · <span className={earnCerca ? 'earn-cerca' : ''} title="próximos resultados">{fFecha(r.earnings_date)}{r.earnings_estimada ? '~' : ''}</span></> : null}
                      {r.corr != null && <> · <span className={'corr ' + nivelCorr(r.corr)} title="correlación con tu cartera">corr {fmtCorr(r.corr)}</span></>}
                      {r.perseguir && <span className="warn" title="No perseguir"> ⚠</span>}
                    </div>
                  </div>
                  <div className="bl-der">
                    <div className={'bl-3m ' + pctClass(r.perf_3m)}>{fmtPct(r.perf_3m)}<i>3M</i></div>
                    <div className="bl-sec neutro">{fmtPct(r.dist_high52)}<i>vs máx</i></div>
                  </div>
                </li>
              )
            })}
            {!filasVista.length && <li className="vacio">Sin resultados con estos filtros{total ? '' : ' (el universo está vacío: pulsa Actualizar)'}.</li>}
          </ul>
        ) : (
          <table className="pos-tabla num tabla-busc">
            <thead>
              <tr>
                <th title="Estrella: marca/desmarca (guarda fecha y precio). La cifra es la variación desde la estrella.">★</th>
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
                  <tr key={r.symbol} onClick={() => setSel(r)} className={(sel?.symbol === r.symbol ? 'sel' : '') + (r.fuera ? ' fuera' : '')}>
                    <td className="estrella-td" onClick={e => { e.stopPropagation(); alternarEstrella(r) }}
                        title={estrellas[r.symbol] ? `★ desde ${estrellas[r.symbol].fecha.slice(2).split('-').reverse().join('/')} a ${estrellas[r.symbol].precio}` : 'Marcar con estrella'}>
                      <span className={'estrella' + (estrellas[r.symbol] ? ' on' : '')}>{estrellas[r.symbol] ? '★' : '☆'}</span>
                      {desdeEstrella(r) != null && <i className={'desde-est ' + pctClass(desdeEstrella(r))}>{fmtPct(desdeEstrella(r))}</i>}
                    </td>
                    <td className="tl ticker"><b>{r.symbol}</b> <span className="nombre">{r.name}</span>{r.fuera && <span className="tag-fuera" title="Con estrella pero fuera de los filtros actuales. Desaparece al quitar la estrella.">fuera de filtro</span>}</td>
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
                    <td className="neutro">{fmtPct(r.dist_high52)}</td>
                    <td><span className={'corr ' + nivelCorr(r.corr)}>{fmtCorr(r.corr)}</span></td>
                    <td className="flags">
                      {r.perseguir && <span className="warn" title="No perseguir: +8 % en 3 sesiones o más de 2×ATR sobre la MA20">⚠</span>}
                      {r.cap_usd != null && r.cap_usd < 300e6 && <span title="Micro cap: fuera del universo de la Tesis">µ</span>}
                    </td>
                  </tr>
                )
              })}
              {!filasVista.length && <tr><td colSpan={COLS.length + 2} className="tl" style={{ color: 'var(--texto-neutro)' }}>Sin resultados con estos filtros{total ? '' : ' (el universo está vacío: pulsa Actualizar)'}.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p className="pos-fuente">
        {filasVista ? `${filasVista.length} valores` : ''}{atrPendientes ? ` (${atrPendientes} pendientes de ATR)` : ''} · fuente Yahoo Finance (cierre diario) · 1M/3M/6M y ⚠ se calculan al vuelo para los valores en pantalla · PER n/a = sin beneficios · rating 1 compra fuerte → 5 venta
      </p>

      {sel && (() => {
        const lista = filasVista || []
        const i = lista.findIndex(r => r.symbol === sel.symbol)
        return <Ficha valor={sel} onClose={() => setSel(null)} lista={lista} indice={i} onNav={j => setSel(lista[j])}
                      estrella={estrellas[sel.symbol] || null} onEstrella={alternarEstrella} contadores={contadores || null} vix={vix || null} />
      })()}
      </>}
    </div>
  )
}

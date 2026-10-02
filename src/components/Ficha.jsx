// Ficha de un valor del Buscador: gráfica de línea (cierres) a 2 años por defecto con
// MA50 y MA200, datos de la Tesis y dos acciones: Entrada (alta prellenada con SL −11 /
// TP +23,5) y A la sombra (cartera sombra en el repositorio, con precio y fecha).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { supabase } from '../lib/supabase'
import { fetchHistory } from '../lib/quotes'
import { useArrastreCierre } from '../lib/movil'
import { tesisSL, tesisTP } from '../lib/bloques'
import { SECTOR_ES, fmtCap, capBucket, diasHasta, nivelVix, nivelCorr, fmtCorr } from '../lib/universo'

const VISTAS = [['3m', '3M'], ['6m', '6M'], ['1y', '1A'], ['2y', '2A'], ['5y', '5A']]
const DIAS = { '3m': 92, '6m': 183, '1y': 366, '2y': 731 }
const fmtPct = (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(d) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fmtPctEje = x => (x > 0.05 ? '+' : '') + (Math.abs(x) < 0.05 ? '0' : x.toLocaleString('es-ES', { maximumFractionDigits: Math.abs(x) < 10 && x % 1 ? 1 : 0 })) + ' %'
// Etiqueta del último cierre sobre el eje de precio (derecha)
function EtiquetaPrecio({ viewBox, texto }) {
  if (!viewBox) return null
  const x = viewBox.x + viewBox.width, y = viewBox.y
  const w = texto.length * 7 + 10
  return (
    <g>
      <rect x={x + 2} y={y - 9} width={w} height={18} rx={3} fill="#2E6BF6" />
      <text x={x + 7} y={y + 4} fontSize={11} fontFamily="JetBrains Mono" fill="#fff">{texto}</text>
    </g>
  )
}
const fmtPx = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 3 : 2 })
const fFecha = t => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}` }

// Caché de series por símbolo (01/10/2026): al pasar de una ficha a otra se precargan la anterior y la
// siguiente, así el paso es instantáneo.
const cacheSerie = new Map()
function serieDiaria(symbol) {
  if (!cacheSerie.has(symbol)) {
    cacheSerie.set(symbol, fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&range=3y&ohlc=1`).then(r => r.json())
      .then(j => j.points ? j : { points: [] }).catch(() => { cacheSerie.delete(symbol); return { points: [] } }))
  }
  return cacheSerie.get(symbol)
}

// Navegación (01/10/2026): lista = filas en el orden y filtro del Buscador; indice = posición actual.
// ‹ › / flechas del teclado / deslizar en el móvil. Estrella ★ (tecla S). Freno visible de la Tesis.
// Semáforo del VIX (informativo, 01/10/2026): < 20 verde, 20-30 ámbar, > 30 rojo
export function ChipVix({ vix }) {
  const nivel = nivelVix(vix.v)
  const dif = vix.prev ? (vix.v / vix.prev - 1) * 100 : null
  const cuando = new Date(vix.at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
  const fresc = vix.estado === 'open' ? 'RETRASADO ~15 min' : 'CIERRE'
  return (
    <span className={'chip-vix ' + nivel} title={`VIX ${vix.v.toFixed(2)} · ${fresc} ${cuando} (Madrid). Semáforo informativo: < 20 calma, 20-30 tensión, > 30 miedo. Con VIX alto, más gaps y más correlación: mira el Filtro Platt.`}>
      VIX {vix.v.toLocaleString('es-ES', { maximumFractionDigits: 1 })}{dif != null ? <small> {dif >= 0 ? '+' : ''}{dif.toFixed(1)} %</small> : null}
    </span>
  )
}

export default function Ficha({ valor: v, onClose, lista = null, indice = -1, onNav, estrella = null, onEstrella, contadores = null, vix = null, modo = 'ACC' }) {
  const tesis = modo === 'ACC'   // ETF / INDICE / CRIPTO: sin Tesis (02/10/2026)
  const arrastre = useArrastreCierre(onClose)   // móvil: cerrar arrastrando hacia abajo
  const [vista, setVista] = useState(() => localStorage.getItem('btp-ficha-vista') || '2y')
  const [diaria, setDiaria] = useState(null)   // 3 años diarios con OHLC (para MA200 y ATR reales)
  const [semanal, setSemanal] = useState(null)  // 5 años semanales
  const [msg, setMsg] = useState(null)
  const nav = useNavigate()
  useEffect(() => { localStorage.setItem('btp-ficha-vista', vista) }, [vista])

  useEffect(() => {
    let vivo = true
    setDiaria(null); setSemanal(null); setMsg(null)
    serieDiaria(v.symbol).then(j => { if (vivo) setDiaria(j) })
    // precarga de la anterior y la siguiente
    if (lista && indice >= 0) [lista[indice + 1], lista[indice - 1]].forEach(x => x && serieDiaria(x.symbol))
    return () => { vivo = false }
  }, [v.symbol])

  const hayLista = !!(lista && lista.length > 1 && indice >= 0 && onNav)
  const ir = d => { if (!hayLista) return; const j = indice + d; if (j >= 0 && j < lista.length) onNav(j) }
  // Teclado: ← → navegan, S marca/desmarca la estrella, Esc cierra
  useEffect(() => {
    const fn = e => {
      if (/input|textarea|select/i.test(e.target?.tagName || '')) return
      if (e.key === 'ArrowRight') { e.preventDefault(); ir(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(-1) }
      else if ((e.key === 's' || e.key === 'S') && onEstrella) { e.preventDefault(); onEstrella(v) }
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  })
  // Móvil: deslizar a izquierda/derecha sobre la gráfica
  const toque = useRef(null)
  const gestos = {
    onTouchStart: e => { toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } },
    onTouchEnd: e => {
      const t = toque.current; toque.current = null
      if (!t) return
      const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.stopPropagation(); ir(dx < 0 ? 1 : -1) }
    },
  }
  useEffect(() => {
    if (vista !== '5y' || semanal) return
    let vivo = true
    fetchHistory(v.symbol, '5y').then(j => vivo && setSemanal(j.points || [])).catch(() => vivo && setSemanal([]))
    return () => { vivo = false }
  }, [vista, v.symbol, semanal])

  // Medias sobre la serie diaria completa; luego se recorta a la vista
  const calc = useMemo(() => {
    const pts = diaria?.points || []
    if (!pts.length) return null
    const out = []
    let s50 = 0, s200 = 0
    for (let i = 0; i < pts.length; i++) {
      s50 += pts[i].v; s200 += pts[i].v
      if (i >= 50) s50 -= pts[i - 50].v
      if (i >= 200) s200 -= pts[i - 200].v
      out.push({ t: pts[i].t, v: pts[i].v, ma50: i >= 49 ? s50 / 50 : null, ma200: i >= 199 ? s200 / 200 : null })
    }
    // ATR14 real (Wilder simple) con máximos y mínimos de sesión
    let atr = null
    const n = pts.length
    if (n > 15 && pts[n - 1].h != null) {
      let suma = 0, k = 0
      for (let i = n - 14; i < n; i++) {
        const h = pts[i].h, l = pts[i].l, pc = pts[i - 1].v
        if (h == null || l == null) continue
        suma += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)); k++
      }
      atr = k ? suma / k : null
    }
    const ult = pts[n - 1].v
    const ma20 = n >= 20 ? pts.slice(-20).reduce((a, p) => a + p.v, 0) / 20 : null
    const atrPct = atr && ult ? atr / ult * 100 : null
    const p3d = n > 3 ? (ult / pts[n - 4].v - 1) * 100 : null
    const distMa20Atr = ma20 && atr ? (ult - ma20) / atr : null
    return { serie: out, ult, atr, atrPct, ma20, p3d, distMa20Atr, perseguir: (p3d != null && p3d > 8) || (distMa20Atr != null && distMa20Atr > 2), ultT: pts[n - 1].t }
  }, [diaria])

  const serieVista = useMemo(() => {
    if (vista === '5y') return (semanal || []).map(p => ({ t: p.t, v: p.v }))
    if (!calc) return []
    const desde = Date.now() - DIAS[vista] * 86400e3
    return calc.serie.filter(p => p.t >= desde)
  }, [calc, semanal, vista])

  const pctVista = serieVista.length > 1 ? (serieVista.at(-1).v / serieVista[0].v - 1) * 100 : null
  const dias = diasHasta(v.earnings_date)
  const earnCerca = dias != null && dias >= 0 && dias <= 15
  const precio = calc?.ult ?? v.price
  const sl = tesisSL(precio), tp = tesisTP(precio)

  // Ejes (opción A, 01/10/2026): precio a la derecha con etiqueta del último cierre; % a la izquierda
  // relativo al último cierre (0 % = hoy), así SL −11 y TP +23,5 caen sobre sus marcas.
  const ejes = useMemo(() => {
    if (serieVista.length < 2 || !precio) return null
    const vals = serieVista.flatMap(p => [p.v, p.ma50, p.ma200]).filter(x => x != null)
    if (tesis && vista !== '5y') vals.push(sl, tp)
    vals.push(precio)
    let lo = Math.min(...vals), hi = Math.max(...vals)
    const pad = (hi - lo) * 0.04 || hi * 0.02
    lo -= pad; hi += pad
    const pLo = (lo / precio - 1) * 100, pHi = (hi / precio - 1) * 100
    const rango = pHi - pLo
    const paso = [2, 5, 10, 20, 25, 50, 100, 200, 500].find(x => rango / x <= 7) || 1000
    const ticksPct = []
    for (let k = Math.ceil(pLo / paso) * paso; k <= pHi; k += paso) ticksPct.push(precio * (1 + k / 100))
    return { dominio: [lo, hi], ticksPct }
  }, [serieVista, precio, sl, tp, vista, tesis])

  async function aLaSombra() {
    const nota = `sombra · ${fmtPx(precio)} ${v.currency || ''} · ${new Date().toLocaleDateString('es-ES')} · Buscador`
    // estado RADAR + nota "SOMBRA ·" hasta que repositorio_estado_check admita SOMBRA (DDL pendiente de José)
    const { error } = await supabase.from('repositorio').insert({ ticker: v.symbol, estado: 'RADAR', nota: 'SOMBRA · ' + nota })
    setMsg(error ? 'No se pudo guardar en la sombra: ' + error.message : `${v.symbol} a la cartera sombra a ${fmtPx(precio)}`)
  }
  function entrada() {
    const alta = { ticker: v.symbol, nombre: v.name, entry_price: precio, sl_price: sl, tp_price: tp, bloque: 'TESIS', clase: 'TACTICA', fuente: 'YO' }
    nav('/?alta=' + encodeURIComponent(JSON.stringify(alta)))
  }

  return (
    <div className="modal-fondo" onClick={onClose}>
      <div className="card modal ficha num" onClick={e => e.stopPropagation()} {...arrastre}>
        <div className="ficha-head">
          <div>
            <h2>
              {onEstrella && <button className={'estrella' + (estrella ? ' on' : '')} onClick={() => onEstrella(v)}
                title={estrella ? `Quitar estrella (★ desde ${estrella.fecha.slice(2).split('-').reverse().join('/')} a ${fmtPx(estrella.precio)})` : 'Marcar con estrella (tecla S): guarda fecha y precio'}>{estrella ? '★' : '☆'}</button>}
              {v.symbol} <span className="nombre">{v.name}</span>
            </h2>
            <div className="ficha-sub">
              {tesis
                ? <>{v.exchange_name || v.exchange} · {v.market}{v.adr ? ' (ADR)' : ''} · {SECTOR_ES[v.sector] || v.sector} · {capBucket(v.cap_usd)} {fmtCap(v.cap_usd)}</>
                : <>{[v.exchange_name, v.categoria, v.replica, v.currency, modo === 'ETF' ? (v.ucits ? 'UCITS' : 'EE. UU. (no UCITS)') : null, modo === 'ETF' ? (v.acumulacion ? 'acumulación' : 'distribución') : null].filter(Boolean).join(' · ')}</>}
            </div>
          </div>
          <div className="ficha-nav">
            {hayLista && (
              <span className="ficha-pasar">
                <button disabled={indice <= 0} onClick={() => ir(-1)} aria-label="Anterior" title="Anterior (←)">‹</button>
                <span className="ficha-pos">{indice + 1} / {lista.length}</span>
                <button disabled={indice >= lista.length - 1} onClick={() => ir(1)} aria-label="Siguiente" title="Siguiente (→)">›</button>
              </span>
            )}
            <button className="cerrar" onClick={onClose}>✕</button>
          </div>
        </div>
        {estrella && (
          <p className="ficha-estrella">★ desde {estrella.fecha.slice(2).split('-').reverse().join('/')} a {fmtPx(estrella.precio)}
            {precio && estrella.precio ? <> · <b className={pctClass(precio / estrella.precio - 1)}>{fmtPct((precio / estrella.precio - 1) * 100)}</b> desde la estrella</> : null}</p>
        )}

        {!tesis && (
          <div className="ficha-datos">
            <Dato l="Último cierre" v={`${fmtPx(precio)} ${v.currency || ''}`} s={calc?.ultT ? fFecha(calc.ultT) : ''} />
            <Dato l="1M / 3M" v={`${fmtPct(v.perf_1m)} / ${fmtPct(v.perf_3m)}`} cls={pctClass(v.perf_3m)} />
            <Dato l="1 año" v={fmtPct(v.perf_1y)} cls={pctClass(v.perf_1y)} />
            <Dato l="vs MA50 / MA200" v={`${fmtPct(v.dist_ma50)} / ${fmtPct(v.dist_ma200)}`} cls={pctClass(v.dist_ma200)} />
            <Dato l="vs máx. 52 s" v={fmtPct(v.dist_high52)} s={v.high52 ? 'máx ' + fmtPx(v.high52) : ''} />
            <Dato l="ATR14" v={calc?.atrPct != null ? calc.atrPct.toFixed(2) + '%' : '—'} s={calc?.atr ? fmtPx(calc.atr) : ''} />
            <Dato l={modo === 'CRIPTO' ? 'RSI14' : modo === 'ETF' ? 'Gastos / patrimonio' : 'Réplica UCITS'}
                  v={modo === 'CRIPTO' ? (v.rsi14 == null ? '—' : v.rsi14.toFixed(0)) : modo === 'ETF' ? (v.ter != null ? v.ter.toFixed(2) + '%' : '—') : (v.etf_ucits || '—')}
                  s={modo === 'ETF' && v.aum_usd ? fmtCap(v.aum_usd) : modo === 'CRIPTO' ? (v.dist_ma200 > 0 ? 'sobre MA200' : 'bajo MA200') : ''} />
            <Dato l="Corr. cartera" v={fmtCorr(v.corr)} cls={nivelCorr(v.corr)} s={v.corr == null ? '' : v.corr < 0.15 ? 'diversifica' : v.corr <= 0.35 ? 'algo' : 'se parece a tu cartera'} />
          </div>
        )}
        {tesis && <div className="ficha-datos">
          <Dato l="Último cierre" v={`${fmtPx(precio)} ${v.currency || ''}`} s={calc?.ultT ? fFecha(calc.ultT) : ''} />
          <Dato l="PER" v={v.pe_trailing == null ? 'n/a' : v.pe_trailing.toFixed(1)} s={v.pe_forward != null ? 'fwd ' + v.pe_forward.toFixed(1) : ''} />
          <Dato l="Rating" v={v.rating == null ? '—' : v.rating.toFixed(1)} s={v.rating_label || ''} />
          <Dato l="Resultados" v={v.earnings_date ? v.earnings_date.slice(2).split('-').reverse().join('/') + (v.earnings_estimada ? '~' : '') : '—'}
                s={dias != null ? (dias >= 0 ? `en ${dias} días` : 'pasados') : ''} cls={earnCerca ? 'earn-cerca' : ''} />
          <Dato l="vs MA50 / MA200" v={`${fmtPct(v.dist_ma50)} / ${fmtPct(v.dist_ma200)}`} cls={pctClass(v.dist_ma200)} />
          <Dato l="vs máx. 52 s" v={fmtPct(v.dist_high52)} s={v.high52 ? 'máx ' + fmtPx(v.high52) : ''} />
          <Dato l="ATR14" v={calc?.atrPct != null ? calc.atrPct.toFixed(2) + '%' : '—'} s={calc?.atr ? fmtPx(calc.atr) : ''} />
          <Dato l="3 sesiones" v={fmtPct(calc?.p3d)} s={calc?.distMa20Atr != null ? `${calc.distMa20Atr.toFixed(1)}×ATR sobre MA20` : ''} cls={calc?.perseguir ? 'warn' : ''} />
        </div>}

        {tesis && (earnCerca || calc?.perseguir) && (
          <p className="ficha-aviso">
            {earnCerca && <span>⛔ Resultados a {dias} días: bandera roja de la Tesis (menos de 15 días). </span>}
            {calc?.perseguir && <span>⚠ No perseguir: {calc.p3d > 8 ? `+${calc.p3d.toFixed(1)} % en 3 sesiones` : `${calc.distMa20Atr.toFixed(1)}×ATR sobre la MA20`}.</span>}
          </p>
        )}

        <div className="ficha-chart" {...gestos}>
          <div className="ficha-chart-head">
            <div className="periodos">
              {VISTAS.map(([id, l]) => <button key={id} className={vista === id ? 'on' : ''} onClick={() => setVista(id)}>{l}</button>)}
            </div>
            <span className={'ficha-pct ' + pctClass(pctVista)}>{fmtPct(pctVista)} en la vista</span>
            <span className="leyenda"><i style={{ background: '#2E6BF6' }} /> cierre <i style={{ background: '#F0A020' }} /> MA50 <i style={{ background: '#8A93A6' }} /> MA200</span>
          </div>
          {!diaria ? <p className="placeholder" style={{ padding: 30 }}>Cargando serie…</p> : serieVista.length < 2 ? <p className="placeholder" style={{ padding: 30 }}>Sin serie para {v.symbol}.</p> : (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={serieVista} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E3E8F0" vertical={false} yAxisId="pct" />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fFecha}
                       tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} minTickGap={70} />
                <YAxis yAxisId="pct" orientation="left" type="number" domain={ejes?.dominio || ['auto', 'auto']} allowDataOverflow
                       ticks={ejes?.ticksPct} tickFormatter={x => fmtPctEje((x / precio - 1) * 100)}
                       tick={{ fontSize: 11, fontFamily: 'JetBrains Mono', fill: '#8A93A6' }} width={48} />
                <YAxis yAxisId="px" orientation="right" type="number" domain={ejes?.dominio || ['auto', 'auto']} allowDataOverflow
                       tickFormatter={x => fmtPx(x)} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} width={68} />
                <Tooltip labelFormatter={fFecha} isAnimationActive={false} animationDuration={0} wrapperClassName="tip-recharts"
                         formatter={(x, k) => [`${fmtPx(x)} (${fmtPctEje((x / precio - 1) * 100)} vs hoy)`, k === 'v' ? 'cierre' : k === 'ma50' ? 'MA50' : 'MA200']} />
                {tesis && vista !== '5y' && <ReferenceLine yAxisId="px" y={sl} stroke="#E5484D" strokeDasharray="4 3" label={{ value: 'SL −11', fontSize: 10, fill: '#E5484D', position: 'insideBottomLeft' }} />}
                {tesis && vista !== '5y' && <ReferenceLine yAxisId="px" y={tp} stroke="#16A34A" strokeDasharray="4 3" label={{ value: 'TP +23,5', fontSize: 10, fill: '#16A34A', position: 'insideTopLeft' }} />}
                <ReferenceLine yAxisId="px" y={precio} stroke="#2E6BF6" strokeOpacity={0.35} strokeDasharray="2 3" label={<EtiquetaPrecio texto={fmtPx(precio)} />} />
                <Line yAxisId="px" type="monotone" dataKey="v" stroke="#2E6BF6" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                {vista !== '5y' && <Line yAxisId="px" type="monotone" dataKey="ma50" stroke="#F0A020" strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} />}
                {vista !== '5y' && <Line yAxisId="px" type="monotone" dataKey="ma200" stroke="#8A93A6" strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} />}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {!tesis && (
          <div className="ficha-pie">
            {vix?.v != null && <ChipVix vix={vix} />}
            <span className="ficha-tesis">{contextoActivo(modo, v)}</span>
          </div>
        )}
        {tesis && <div className="ficha-pie">
          {contadores && (
            <span className={'ficha-freno' + (contadores.lineas >= 8 || contadores.entradasMes >= 4 ? ' lleno' : '')}
                  title="Freno visible de la Tesis: máx. 8 líneas abiertas y 4 entradas nuevas al mes. No prohíbe: avisa.">
              Tesis: {contadores.lineas}/8 líneas · {contadores.entradasMes}/4 entradas este mes
            </span>
          )}
          {vix?.v != null && <ChipVix vix={vix} />}
          <span className="ficha-tesis">Tesis sobre el último cierre: entrada ≤ {fmtPx(precio * 1.005)} (cierre +0,5 %) · SL {fmtPx(sl)} · TP {fmtPx(tp)}</span>
          <div className="modal-botones" style={{ margin: 0 }}>
            <button className="btn-sec" onClick={aLaSombra} title="Registra la idea en la cartera sombra con precio y fecha, sin entrar">A la sombra</button>
            <button className="btn-primario" onClick={entrada} title="Abre el alta de posición con precio, SL −11 y TP +23,5 ya calculados">Entrada…</button>
          </div>
        </div>}
        {msg && <p className="pos-msg" style={{ margin: '8px 0 0' }}>{msg}</p>}
      </div>
    </div>
  )
}

// Qué regla aplica a cada tipo de activo que no es acción (02/10/2026)
function contextoActivo(modo, v) {
  if (modo === 'ETF') return v.ucits
    ? 'Sin entrada de Tesis (ETF operados como táctica: vetados). Vehículo para NÚCLEO, O/MERCADOS u ORO: se compra por bloque, sin SL de Tesis.'
    : 'ETF americano: un minorista europeo no puede comprarlo (PRIIPs), solo como CFD. Úsalo como referencia y busca su equivalente UCITS.'
  if (modo === 'INDICE') return `No se opera: contexto de mercado.${v.etf_ucits ? ' Se replica con ' + v.etf_ucits + ' (UCITS).' : ''}`
  if (modo === 'CRIPTO') {
    if (v.symbol === 'BTC-USD' || v.symbol === 'VBTC.DE') {
      const r = v.rsi14
      const estado = r == null ? '' : r >= 70 ? 'por encima de 70: zona de entrada de la táctica si acaba de cruzar al alza' : r <= 50 ? 'por debajo de 50: táctica fuera (salida por cruce bajista)' : 'entre 50 y 70: mantener si estás dentro; si estás fuera, esperar el cruce de 70'
      return `Bloque BTC: núcleo sin SL (horizonte 2036). Regla RSI-BTC 70/50 sobre VBTC.DE: RSI14 ${r == null ? '—' : r.toFixed(0)}, ${estado}. Aproximado con el cierre de Yahoo; la regla oficial usa el cierre diario de Binance.`
    }
    return 'Cripto operada: vetada (19 operaciones, 21 % de acierto). Solo BTC como núcleo o con la regla RSI-BTC 70/50.'
  }
  return ''
}

function Dato({ l, v, s, cls = '' }) {
  return (
    <div className={'dato ' + cls}>
      <span className="d-l">{l}</span>
      <span className="d-v">{v}</span>
      {s ? <span className="d-s">{s}</span> : null}
    </div>
  )
}

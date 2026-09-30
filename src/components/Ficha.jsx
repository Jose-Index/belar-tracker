// Ficha de un valor del Buscador: gráfica de línea (cierres) a 2 años por defecto con
// MA50 y MA200, datos de la Tesis y dos acciones: Entrada (alta prellenada con SL −11 /
// TP +23,5) y A la sombra (cartera sombra en el repositorio, con precio y fecha).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { supabase } from '../lib/supabase'
import { fetchHistory } from '../lib/quotes'
import { tesisSL, tesisTP } from '../lib/bloques'
import { SECTOR_ES, fmtCap, capBucket, diasHasta } from '../lib/universo'

const VISTAS = [['3m', '3M'], ['6m', '6M'], ['1y', '1A'], ['2y', '2A'], ['5y', '5A']]
const DIAS = { '3m': 92, '6m': 183, '1y': 366, '2y': 731 }
const fmtPct = (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(d) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fmtPx = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: v < 10 ? 3 : 2 })
const fFecha = t => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}` }

export default function Ficha({ valor: v, onClose }) {
  const [vista, setVista] = useState(() => localStorage.getItem('btp-ficha-vista') || '2y')
  const [diaria, setDiaria] = useState(null)   // 3 años diarios con OHLC (para MA200 y ATR reales)
  const [semanal, setSemanal] = useState(null)  // 5 años semanales
  const [msg, setMsg] = useState(null)
  const nav = useNavigate()
  useEffect(() => { localStorage.setItem('btp-ficha-vista', vista) }, [vista])

  useEffect(() => {
    let vivo = true
    setDiaria(null); setSemanal(null); setMsg(null)
    fetch(`/api/history?symbol=${encodeURIComponent(v.symbol)}&range=3y&ohlc=1`).then(r => r.json())
      .then(j => { if (vivo) setDiaria(j.points ? j : { points: [] }) }).catch(() => vivo && setDiaria({ points: [] }))
    return () => { vivo = false }
  }, [v.symbol])
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

  async function aLaSombra() {
    const nota = `sombra · ${fmtPx(precio)} ${v.currency || ''} · ${new Date().toLocaleDateString('es-ES')} · Buscador`
    const { error } = await supabase.from('repositorio').insert({ ticker: v.symbol, estado: 'SOMBRA', nota })
    setMsg(error ? 'No se pudo guardar en la sombra: ' + error.message : `${v.symbol} a la cartera sombra a ${fmtPx(precio)}`)
  }
  function entrada() {
    const alta = { ticker: v.symbol, nombre: v.name, entry_price: precio, sl_price: sl, tp_price: tp, bloque: 'TESIS', clase: 'TACTICA', fuente: 'YO' }
    nav('/?alta=' + encodeURIComponent(JSON.stringify(alta)))
  }

  return (
    <div className="modal-fondo" onClick={onClose}>
      <div className="card modal ficha num" onClick={e => e.stopPropagation()}>
        <div className="ficha-head">
          <div>
            <h2>{v.symbol} <span className="nombre">{v.name}</span></h2>
            <div className="ficha-sub">
              {v.exchange_name || v.exchange} · {v.market}{v.adr ? ' (ADR)' : ''} · {SECTOR_ES[v.sector] || v.sector} · {capBucket(v.cap_usd)} {fmtCap(v.cap_usd)}
            </div>
          </div>
          <button className="cerrar" onClick={onClose}>✕</button>
        </div>

        <div className="ficha-datos">
          <Dato l="Último cierre" v={`${fmtPx(precio)} ${v.currency || ''}`} s={calc?.ultT ? fFecha(calc.ultT) : ''} />
          <Dato l="PER" v={v.pe_trailing == null ? 'n/a' : v.pe_trailing.toFixed(1)} s={v.pe_forward != null ? 'fwd ' + v.pe_forward.toFixed(1) : ''} />
          <Dato l="Rating" v={v.rating == null ? '—' : v.rating.toFixed(1)} s={v.rating_label || ''} />
          <Dato l="Resultados" v={v.earnings_date ? v.earnings_date.slice(2).split('-').reverse().join('/') + (v.earnings_estimada ? '~' : '') : '—'}
                s={dias != null ? (dias >= 0 ? `en ${dias} días` : 'pasados') : ''} cls={earnCerca ? 'earn-cerca' : ''} />
          <Dato l="vs MA50 / MA200" v={`${fmtPct(v.dist_ma50)} / ${fmtPct(v.dist_ma200)}`} cls={pctClass(v.dist_ma200)} />
          <Dato l="A máx. 52 s" v={fmtPct(v.dist_high52)} s={v.high52 ? 'máx ' + fmtPx(v.high52) : ''} cls={pctClass(v.dist_high52)} />
          <Dato l="ATR14" v={calc?.atrPct != null ? calc.atrPct.toFixed(2) + '%' : '—'} s={calc?.atr ? fmtPx(calc.atr) : ''} />
          <Dato l="3 sesiones" v={fmtPct(calc?.p3d)} s={calc?.distMa20Atr != null ? `${calc.distMa20Atr.toFixed(1)}×ATR sobre MA20` : ''} cls={calc?.perseguir ? 'warn' : ''} />
        </div>

        {(earnCerca || calc?.perseguir) && (
          <p className="ficha-aviso">
            {earnCerca && <span>⛔ Resultados a {dias} días: bandera roja de la Tesis (menos de 15 días). </span>}
            {calc?.perseguir && <span>⚠ No perseguir: {calc.p3d > 8 ? `+${calc.p3d.toFixed(1)} % en 3 sesiones` : `${calc.distMa20Atr.toFixed(1)}×ATR sobre la MA20`}.</span>}
          </p>
        )}

        <div className="ficha-chart">
          <div className="ficha-chart-head">
            <div className="periodos">
              {VISTAS.map(([id, l]) => <button key={id} className={vista === id ? 'on' : ''} onClick={() => setVista(id)}>{l}</button>)}
            </div>
            <span className={'ficha-pct ' + pctClass(pctVista)}>{fmtPct(pctVista)} en la vista</span>
            <span className="leyenda"><i style={{ background: '#2E6BF6' }} /> cierre <i style={{ background: '#F0A020' }} /> MA50 <i style={{ background: '#8A93A6' }} /> MA200</span>
          </div>
          {!diaria ? <p className="placeholder" style={{ padding: 30 }}>Cargando serie…</p> : serieVista.length < 2 ? <p className="placeholder" style={{ padding: 30 }}>Sin serie para {v.symbol}.</p> : (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={serieVista} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E3E8F0" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fFecha}
                       tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} minTickGap={70} />
                <YAxis domain={vista === '5y' ? ['auto', 'auto'] : [d => Math.min(d, sl) * 0.99, d => Math.max(d, tp) * 1.01]}
                       tickFormatter={x => fmtPx(x)} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }} width={64} />
                <Tooltip labelFormatter={fFecha} isAnimationActive={false} animationDuration={0} wrapperClassName="tip-recharts"
                         formatter={(x, k) => [fmtPx(x), k === 'v' ? 'cierre' : k === 'ma50' ? 'MA50' : 'MA200']} />
                {vista !== '5y' && <ReferenceLine y={sl} stroke="#E5484D" strokeDasharray="4 3" label={{ value: 'SL −11', fontSize: 10, fill: '#E5484D', position: 'insideBottomLeft' }} />}
                {vista !== '5y' && <ReferenceLine y={tp} stroke="#16A34A" strokeDasharray="4 3" label={{ value: 'TP +23,5', fontSize: 10, fill: '#16A34A', position: 'insideTopLeft' }} />}
                <Line type="monotone" dataKey="v" stroke="#2E6BF6" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                {vista !== '5y' && <Line type="monotone" dataKey="ma50" stroke="#F0A020" strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} />}
                {vista !== '5y' && <Line type="monotone" dataKey="ma200" stroke="#8A93A6" strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} />}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="ficha-pie">
          <span className="ficha-tesis">Tesis sobre el último cierre: entrada ≤ {fmtPx(precio * 1.005)} (cierre +0,5 %) · SL {fmtPx(sl)} · TP {fmtPx(tp)}</span>
          <div className="modal-botones" style={{ margin: 0 }}>
            <button className="btn-sec" onClick={aLaSombra} title="Registra la idea en la cartera sombra con precio y fecha, sin entrar">A la sombra</button>
            <button className="btn-primario" onClick={entrada} title="Abre el alta de posición con precio, SL −11 y TP +23,5 ya calculados">Entrada…</button>
          </div>
        </div>
        {msg && <p className="pos-msg" style={{ margin: '8px 0 0' }}>{msg}</p>}
      </div>
    </div>
  )
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

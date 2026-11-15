// BTP v4 · BTC Combo MA200 (15/11/2026): precio diario con su media de 200 sesiones y, debajo, el RSI(14) de Wilder con
// los umbrales de la regla. Datos: BTC-USD de Yahoo (no BINANCE:BTCUSDT): la estrategia de TradingView manda.
// Regla: sobre la MA200, entrada con cruce alcista de 70 y salida con cruce bajista de 50; bajo la MA200, entrada con
// RSI ≤ 27,5 y salida con RSI ≥ 67,5. El aviso al móvil lo da el Vigía una vez al día (app_state.vigia.combo).
import { useMemo, useState } from 'react'
import { useCache } from '../lib/cache'
import { fetchHistory } from '../lib/quotes'
import './portada.css'

const num = (v, d = 0) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
const fecha = t => { const s = new Date(t).toISOString(); return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4) }
const VENTANAS = [['3m', '3M', 92], ['6m', '6M', 183], ['1a', '1A', 366]]

export default function Combo() {
  const { data } = useCache('ph3:BTC-USD', () => fetchHistory('BTC-USD', '3y'), { ttl: 15 * 60e3 })
  const [ven, setVen] = useState('6m')

  const c = useMemo(() => {
    const hoy = Math.floor(Date.now() / 86400000) * 86400000
    const P = (data?.points || []).filter(x => x.v != null)
    if (P.length < 215) return null
    const C = P.map(x => x.v), n = C.length
    const ma = C.map((_, i) => (i >= 199 ? C.slice(i - 199, i + 1).reduce((a, x) => a + x, 0) / 200 : null))
    let g = 0, p = 0
    for (let i = 1; i <= 14; i++) { const d = C[i] - C[i - 1]; g += Math.max(d, 0); p += Math.max(-d, 0) }
    g /= 14; p /= 14
    const R = new Array(14).fill(null); R.push(p ? 100 - 100 / (1 + g / p) : 100)
    for (let i = 15; i < n; i++) { const d = C[i] - C[i - 1]; g = (g * 13 + Math.max(d, 0)) / 14; p = (p * 13 + Math.max(-d, 0)) / 14; R.push(p ? 100 - 100 / (1 + g / p) : 100) }
    const enCurso = P[n - 1].t >= hoy, k = enCurso ? n - 2 : n - 1           // k = última vela cerrada
    const mom = C[k] > ma[k]
    const entrada = (mom && R[k - 1] < 70 && R[k] >= 70) || (!mom && R[k] <= 27.5)
    const salida = (R[k - 1] >= 50 && R[k] < 50) || R[k] >= 67.5
    const dias = VENTANAS.find(v => v[0] === ven)[2], i0 = Math.max(200, n - dias)
    const xs = P.slice(i0), W = 640
    const vals = xs.map(x => x.v).concat(ma.slice(i0)), mn = Math.min(...vals), mx = Math.max(...vals)
    const xx = j => (j / (xs.length - 1) * W).toFixed(1), yy = v => (212 - (v - mn) / ((mx - mn) || 1) * 204).toFixed(1), yr = v => (116 - v / 100 * 112).toFixed(1)
    return { precio: xs.map((x, j) => xx(j) + ',' + yy(x.v)).join(' '), media: ma.slice(i0).map((v, j) => xx(j) + ',' + yy(v)).join(' '),
      rsi: R.slice(i0).map((v, j) => xx(j) + ',' + yr(v)).join(' '), y: { a70: yr(70), a50: yr(50), a675: yr(67.5), a275: yr(27.5) },
      desde: fecha(xs[0].t), hasta: fecha(P[n - 1].t), cierre: C[k], ma200: ma[k], rsiK: R[k], rsiPrev: R[k - 1], fechaK: fecha(P[k].t), mom, entrada, salida,
      vivo: enCurso ? { precio: C[n - 1], rsi: R[n - 1] } : null, mxp: mx, mnp: mn }
  }, [data, ven])

  if (!c) return <div className="pt"><p className="pt-estado">Cargando BTC…</p></div>
  return (
    <div className="pt num rd">
      <section className="pt-resumen" aria-label="Estado de la señal">
        <div><div className="pt-rot">BTC · cierre del {c.fechaK}</div><div className="pt-total">{num(c.cierre)}&nbsp;$</div></div>
        <div><div className="pt-rot">Régimen</div><div className="pt-cifra">{c.mom ? 'Sobre la MA200' : 'Bajo la MA200'}</div></div>
        <div><div className="pt-rot">MA200</div><div className="pt-cifra">{num(c.ma200)}&nbsp;$</div></div>
        <div><div className="pt-rot">RSI (14)</div><div className="pt-cifra">{num(c.rsiK, 1)} <span className="cb-prev">ayer {num(c.rsiPrev, 1)}</span></div></div>
      </section>
      <p className={'cb-senal' + (c.entrada || c.salida ? ' on' : '')}>
        {c.entrada ? 'Condición de ENTRADA en la última vela cerrada' + (c.mom ? ' (RSI cruza 70 al alza sobre la MA200).' : ' (RSI en 27,5 o menos, bajo la MA200).')
          : c.salida ? 'Condición de SALIDA en la última vela cerrada (solo aplica si la Combo está dentro).'
          : 'Sin señal en la última vela cerrada.'}
        {' '}Confirmar siempre en TradingView antes de ejecutar.
        {c.vivo && <> Vela en curso: {num(c.vivo.precio)}&nbsp;$, RSI {num(c.vivo.rsi, 1)}.</>}
      </p>

      <div className="pt-controles">
        <div className="pt-control"><span className="pt-mini">Periodo</span>
          <div className="pt-chips">{VENTANAS.map(([id, l]) => <button key={id} type="button" className={'pt-chip' + (id === ven ? ' on' : '')} aria-pressed={id === ven} onClick={() => setVen(id)}>{l}</button>)}</div>
        </div>
        <div className="pt-leyenda"><span><i className="pt-cuadro mia" />Precio</span><span><i className="pt-cuadro otra" />Media de 200 sesiones</span></div>
      </div>
      <svg viewBox="0 0 640 220" preserveAspectRatio="none" role="img" aria-label="Precio de BTC y su media de 200 sesiones" className="pt-svg rd-svg">
        <polyline points={c.media} className="otra" />
        <polyline points={c.precio} className="mia" />
      </svg>
      <div className="pt-ejes rd-ejes"><span>{c.desde} · mínimo {num(c.mnp)}&nbsp;$</span><span>máximo {num(c.mxp)}&nbsp;$ · {c.hasta}</span></div>

      <div className="pt-leyenda cb-rsi-ley"><span><i className="pt-cuadro mia" />RSI (14)</span><span className="pt-sec">líneas continuas: 70 y 50 (sobre la MA200) · discontinuas: 67,5 y 27,5 (bajo la MA200)</span></div>
      <svg viewBox="0 0 640 120" preserveAspectRatio="none" role="img" aria-label="RSI de 14 sesiones con los umbrales de la regla" className="pt-svg cb-rsi">
        <line x1="0" x2="640" y1={c.y.a70} y2={c.y.a70} className="cero" /><line x1="0" x2="640" y1={c.y.a50} y2={c.y.a50} className="cero" />
        <line x1="0" x2="640" y1={c.y.a675} y2={c.y.a675} className="cero disc" /><line x1="0" x2="640" y1={c.y.a275} y2={c.y.a275} className="cero disc" />
        <polyline points={c.rsi} className="mia" />
      </svg>
      <p className="pt-pie">Regla: sobre la MA200, entrada con cruce alcista de 70 y salida con cruce bajista de 50; bajo la MA200, entrada con RSI de 27,5 o menos y salida con 67,5 o más. Compra en la siguiente apertura del vehículo y stop catastrófico del −10 % en el acto. Datos de BTC-USD (Yahoo), no de Binance: la estrategia de TradingView manda. El Vigía comprueba la señal una vez al día y avisa al móvil cuando cambia.</p>
    </div>
  )
}

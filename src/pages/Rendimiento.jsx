// BTP v4 · Rendimiento (15/11/2026), diseño A: rentabilidad en el tiempo del total y de cada cuenta (eToro, XTB, IBKR,
// wallet BTC), por cierres de semana y sin contar las aportaciones (TWR), con un solo comparador a la vez.
// Debajo, tabla por periodos y tabla por años. Las aportaciones siguen en Histórico (más abajo en la misma página).
import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCache } from '../lib/cache'
import { serieTWR, serieTWRDesglose, eurusdEn } from '../lib/twr'
import { fetchHistory } from '../lib/quotes'
import './portada.css'

const CUENTAS = [['total', 'Total'], ['etoro', 'eToro'], ['xtb', 'XTB'], ['ibkr', 'IBKR'], ['btc', 'Wallet BTC']]
const COMPARADORES = [['', 'Ninguno'], ['^GSPC', 'S&P 500'], ['^NDX', 'Nasdaq 100'], ['GC=F', 'Oro'], ['^IBEX', 'Ibex 35'], ['^STOXX50E', 'Euro Stoxx 50'], ['BTC-USD', 'Bitcoin']]
const PERIODOS = [['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['ytd', 'Año'], ['1a', '1A'], ['todo', 'Todo']]
const DIA = 86400000
const num = (v, d = 0) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
const sig = v => (v > 0 ? '+' : v < 0 ? '−' : '')
const pct = v => (v == null || !Number.isFinite(v) ? '—' : sig(v) + num(Math.abs(v), 1) + ' %')
const tono = v => (v > 0 ? 'pt-sube' : v < 0 ? 'pt-baja' : '')
const fecha = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4) : '—')

async function loaderRend() {
  const [w, c, yr] = await Promise.all([
    supabase.from('weekly_snapshots').select('*').order('week_end'),
    supabase.from('contributions').select('fecha,broker,importe_eur,importe_usd'),
    supabase.from('yearly_results').select('id,year,rentabilidad_pct,sp500_pct,ibex_pct,valor_cierre_usd,legacy').order('year'),
  ])
  return { weeks: w.data || [], contribs: c.data || [], anuales: yr.data || [] }
}

// Fecha de corte de un periodo, contada desde el último cierre
function corteDe(per, fin) {
  const d = new Date(fin)
  if (per === 'ytd') return Date.UTC(d.getUTCFullYear() - 1, 11, 31)
  return per === '1m' ? fin - 31 * DIA : per === '3m' ? fin - 92 * DIA : per === '6m' ? fin - 183 * DIA : per === '1a' ? fin - 366 * DIA : 0
}
// % de una serie [{ t, v }] desde el último punto en o antes del corte
function tramo(serie, per) {
  if (serie.length < 2) return null
  const fin = serie[serie.length - 1].t, corte = corteDe(per, fin)
  let i0 = 0
  for (let i = 0; i < serie.length; i++) if (serie[i].t <= corte) i0 = i
  if (corte && serie[0].t > corte && per !== 'todo') return per === 'ytd' || serie[0].t - corte > 10 * DIA ? null : (serie[serie.length - 1].v / serie[0].v - 1) * 100
  return (serie[serie.length - 1].v / serie[i0].v - 1) * 100
}

// Cierre de año (15/11/2026): el año que toca sellar es el anterior mientras no esté sellado y estemos en el primer
// trimestre; si no, el año en curso. Todo sale de cierres de semana (TWR) y del último cierre diario de cada índice.
function anoObjetivo(anuales, hoy) {
  const y = Number(hoy.slice(0, 4)), prev = anuales.find(a => Number(a.year) === y - 1)
  return Number(hoy.slice(5, 7)) <= 3 && !(prev && prev.legacy && prev.legacy.sellado) ? y - 1 : y
}
function pctIndice(h, d0, d1) {
  const c = (h?.points || []).filter(x => x.v != null)
  if (!c.length) return null
  const en = lim => { let v = null; for (const x of c) { if (x.t <= lim) v = x.v; else break } return v }
  const a = en(Date.parse(d0 + 'T23:59:59Z')), b = en(Date.parse(d1 + 'T23:59:59Z'))
  return a && b ? (b / a - 1) * 100 : null
}

export default function Rendimiento() {
  const { data, recargar } = useCache('rendimiento', loaderRend, { ttl: 5 * 60e3, persist: true })
  const [cuenta, setCuenta] = useState('total')
  const [per, setPer] = useState('todo')
  const [comp, setComp] = useState('')
  const { data: hComp } = useCache('ph2:' + comp, () => fetchHistory(comp, '3y'), { ttl: 15 * 60e3, activo: !!comp })
  const { data: hSp } = useCache('ph2:^GSPC', () => fetchHistory('^GSPC', '3y'), { ttl: 15 * 60e3 })
  const { data: hIbex } = useCache('ph2:^IBEX', () => fetchHistory('^IBEX', '3y'), { ttl: 15 * 60e3 })
  const [sello, setSello] = useState(null) // null | 'guardando' | 'ok' | texto de error

  const hoy = new Date().toISOString().slice(0, 10)
  const curso = useMemo(() => {
    if (!data) return null
    const ano = anoObjetivo(data.anuales, hoy), d0 = `${ano - 1}-12-31`, d1 = `${ano}-12-31`
    const tw = serieTWR(data.weeks, data.contribs).filter(p => p.fecha <= d1)
    const ini = [...tw].reverse().find(p => p.fecha <= d0), fin = tw[tw.length - 1]
    const semana = [...data.weeks].reverse().find(w => w.week_end <= d1 && Number(w.total_value) > 0)
    if (!fin || !semana) return null
    const base = ini || tw[0]
    const fx = eurusdEn(data.weeks, semana.week_end)
    return {
      ano, hasta: fin.fecha, parcial: !ini, sellable: hoy >= d1,
      fila: {
        year: ano, rentabilidad_pct: +((fin.idx / base.idx - 1) * 100).toFixed(2),
        sp500_pct: (v => (v == null ? null : +v.toFixed(2)))(pctIndice(hSp, d0, fin.fecha)),
        ibex_pct: (v => (v == null ? null : +v.toFixed(2)))(pctIndice(hIbex, d0, fin.fecha)),
        valor_cierre_usd: +Number(semana.total_value).toFixed(2),
        eurusd_cierre: fx || null, valor_cierre_eur: fx ? +(Number(semana.total_value) / fx).toFixed(2) : null,
      },
    }
  }, [data, hSp, hIbex, hoy])

  async function sellar() {
    if (!curso || !curso.sellable) return
    setSello('guardando')
    const previa = data.anuales.find(a => Number(a.year) === curso.ano)
    const legacy = { ...(previa?.legacy || {}), sellado: hoy, metodo: 'TWR por cierres de semana', hasta: curso.hasta }
    const fila = { ...curso.fila, legacy }
    const q = previa ? supabase.from('yearly_results').update(fila).eq('id', previa.id) : supabase.from('yearly_results').insert(fila)
    const { error } = await q
    if (error) { setSello(error.message); return }
    setSello('ok'); recargar && recargar()
  }

  const series = useMemo(() => {
    if (!data) return null
    const t = f => new Date(f + 'T00:00:00Z').getTime()
    // El total arranca en la primera semana en que los brókers entran en los cierres (el valor se multiplica ≥5 de una
    // semana a otra): antes solo estaba la wallet, con importes mínimos que deformaban el acumulado.
    const ws = data.weeks.filter(w => Number(w.total_value) > 0)
    let desde = ''
    for (let i = 1; i < ws.length; i++) if (Number(ws[i].total_value) >= 5 * Number(ws[i - 1].total_value)) desde = ws[i].week_end
    const out = { total: serieTWR(data.weeks, data.contribs).filter(p => p.fecha >= desde).map(p => ({ t: t(p.fecha), v: p.idx })), desde }
    const d = serieTWRDesglose(data.weeks, data.contribs)
    for (const [k] of CUENTAS.slice(1)) out[k] = d.filter(r => r[k] != null).map(r => ({ t: t(r.fecha), v: r[k] }))
    return out
  }, [data])

  const g = useMemo(() => {
    const s = series?.[cuenta] || []
    if (s.length < 2) return null
    const fin = s[s.length - 1].t, corte = corteDe(per, fin)
    let i0 = 0
    for (let i = 0; i < s.length; i++) if (s[i].t <= corte) i0 = i
    const mia = s.slice(i0).map(x => ({ t: x.t, v: (x.v / s[i0].v - 1) * 100 }))
    if (mia.length < 2) return null
    let otra = []
    const c = comp ? (hComp?.points || []).filter(x => x.v != null) : []
    if (c.length) {
      let j = 0
      const en = tt => { while (j + 1 < c.length && c[j + 1].t <= tt + DIA) j++; return c[j].v }
      const c0 = en(mia[0].t)
      otra = mia.map(x => ({ t: x.t, v: (en(x.t) / c0 - 1) * 100 }))
    }
    const todo = mia.map(x => x.v).concat(otra.map(x => x.v), [0]), mn = Math.min(...todo), mx = Math.max(...todo), alto = (mx - mn) || 1
    const yy = v => (228 - (v - mn) / alto * 216).toFixed(1), xx = k => (k / (mia.length - 1) * 640).toFixed(1)
    const puntos = q => q.map((x, k) => xx(k) + ',' + yy(x.v)).join(' ')
    const iso = tt => new Date(tt).toISOString().slice(0, 10)
    return { linea: puntos(mia), lineaComp: puntos(otra), y0: yy(0), fin: mia[mia.length - 1].v, finComp: otra.length ? otra[otra.length - 1].v : null, desde: fecha(iso(mia[0].t)), hasta: fecha(iso(fin)) }
  }, [series, cuenta, per, comp, hComp])

  if (!series) return <div className="pt"><p className="pt-estado">Cargando el rendimiento…</p></div>
  const nombre = id => (CUENTAS.find(c => c[0] === id) || ['', ''])[1]
  const nombreComp = (COMPARADORES.find(q => q[0] === comp) || ['', ''])[1]
  const chips = (items, valor, onPick, etiqueta, pq) => (
    <div className="pt-chips envuelve" role="group" aria-label={etiqueta}>
      {items.map(([id, label]) => <button key={id} type="button" className={'pt-chip' + (pq ? ' pq' : '') + (id === valor ? ' on' : '')} aria-pressed={id === valor} onClick={() => onPick(id)}>{label}</button>)}
    </div>
  )

  return (
    <div className="pt num rd">
      <section aria-label="Evolución">
        <div className="pt-controles">
          <div className="pt-control"><span className="pt-mini">Cuenta</span>{chips(CUENTAS, cuenta, setCuenta, 'Cuenta')}</div>
          <div className="pt-control"><span className="pt-mini">Periodo</span>{chips(PERIODOS, per, setPer, 'Periodo')}</div>
        </div>
        <div className="pt-leyenda rd-leyenda">
          <span><i className="pt-cuadro mia" />{nombre(cuenta)} {g && <b className={'rd-grande ' + tono(g.fin)}>{pct(g.fin)}</b>}</span>
          {g && g.finComp != null && <span><i className="pt-cuadro otra" />{nombreComp} <b className={tono(g.finComp)}>{pct(g.finComp)}</b></span>}
        </div>
        {g ? (
          <>
            <svg viewBox="0 0 640 240" preserveAspectRatio="none" role="img" aria-label="Rentabilidad acumulada en el periodo" className="pt-svg rd-svg">
              <line x1="0" x2="640" y1={g.y0} y2={g.y0} className="cero" />
              <polyline points={g.lineaComp} className="otra" />
              <polyline points={g.linea} className="mia" />
            </svg>
            <div className="pt-ejes rd-ejes"><span>{g.desde}</span><span>{g.hasta}</span></div>
          </>
        ) : <p className="pt-estado">Sin cierres de semana suficientes para esta cuenta y este periodo.</p>}
        <div className="pt-control rd-comp"><span className="pt-mini">Comparar con</span>{chips(COMPARADORES, comp, setComp, 'Comparar con', true)}</div>
        <p className="pt-pie">Rentabilidad por cierres de semana, sin contar las aportaciones (lo que mide es la gestión, no los ingresos de dinero). El comparador es el índice en su moneda, sin dividendos.{series.desde ? ` El total cuenta desde el ${fecha(series.desde)}, primera semana con los brókers en los cierres.` : ''}</p>
      </section>

      <section aria-label="Por periodos" className="rd-bloque">
        <h2 className="pt-gnombre">Por periodos</h2>
        <div className="rd-tabla">
          <div className="rd-fila rd-cab"><span>Cuenta</span>{PERIODOS.map(([id, l]) => <span key={id} className="r">{l}</span>)}</div>
          {CUENTAS.map(([id, l]) => (
            <button key={id} type="button" className={'rd-fila rd-dato' + (id === cuenta ? ' on' : '')} onClick={() => setCuenta(id)}>
              <span className="rd-nombre">{l}</span>
              {PERIODOS.map(([p]) => { const v = tramo(series[id] || [], p); return <span key={p} className={'r ' + tono(v)}>{pct(v)}</span> })}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Por años" className="rd-bloque">
        <h2 className="pt-gnombre">Por años</h2>
        <div className="rd-tabla">
          <div className="rd-fila rd-anos rd-cab"><span>Año</span><span className="r">Cartera</span><span className="r">S&P 500</span><span className="r">Ibex 35</span><span className="r">Cierre</span></div>
          {data.anuales.filter(a => !(curso && Number(a.year) === curso.ano && !(a.legacy && a.legacy.sellado))).concat(curso && !data.anuales.some(a => Number(a.year) === curso.ano && a.legacy && a.legacy.sellado) ? [{ ...curso.fila, enCurso: true }] : []).map(a => (
            <div key={a.year} className="rd-fila rd-anos rd-dato">
              <span className="rd-nombre">{a.year}{a.enCurso && <span className="pt-mini"> · hasta {fecha(curso.hasta)}</span>}</span>
              <span className={'r ' + tono(a.rentabilidad_pct)}>{pct(a.rentabilidad_pct == null ? null : Number(a.rentabilidad_pct))}</span>
              <span className={'r ' + tono(a.sp500_pct)}>{pct(a.sp500_pct == null ? null : Number(a.sp500_pct))}</span>
              <span className={'r ' + tono(a.ibex_pct)}>{pct(a.ibex_pct == null ? null : Number(a.ibex_pct))}</span>
              <span className="r">{a.valor_cierre_usd ? num(a.valor_cierre_usd) + ' $' : '—'}</span>
            </div>
          ))}
          {!data.anuales.length && <p className="pt-estado">Aún no hay años cerrados.</p>}
        </div>
        {curso && !data.anuales.some(a => Number(a.year) === curso.ano && a.legacy && a.legacy.sellado) && (
          <div className="rd-sello">
            <button type="button" className="pt-gestion" disabled={!curso.sellable || sello === 'guardando' || sello === 'ok'} onClick={sellar}>
              {sello === 'guardando' ? 'Sellando…' : sello === 'ok' ? `${curso.ano} sellado` : `Sellar el cierre de ${curso.ano}`}
            </button>
            <span className="pt-pie">{curso.sellable ? `Guarda la fila de ${curso.ano} con el último cierre de semana del año (${fecha(curso.hasta)}). Hazlo después del cierre de semana que incluya el 31/12.` : `Disponible a partir del 31/12/${curso.ano}. Hasta entonces la fila de ${curso.ano} se calcula sola con cada cierre de semana.`}</span>
            {sello && sello !== 'ok' && sello !== 'guardando' && <span className="pt-pie pt-baja">No se pudo sellar: {sello}</span>}
          </div>
        )}
        <p className="pt-pie">Cartera: rentabilidad sin contar las aportaciones, por cierres de semana{curso?.parcial ? ' (sin cierre del año anterior: cuenta desde el primer cierre disponible)' : ''}. Índices en su moneda, sin dividendos. Los años anteriores a 2026 conservan la cifra que ya tenían.</p>
      </section>
    </div>
  )
}

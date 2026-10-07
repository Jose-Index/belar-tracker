// Portada (30/09/2026): Inicio y Posiciones fusionadas en una sola pantalla.
// Mercados → boxes → bloques (Cartera v3) → posiciones por bloque → evolución → cuentas.
import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { serieTWRDesglose, rentabilidadDietz, aportacionesEntre, eurusdEn } from '../lib/twr'
import { fetchQuotes, intervaloPrecios, getSimbolos, yahooDe } from '../lib/quotes'
import { filtroPlatt, precioEnUnidadNivel } from '../lib/riesgo'
import { fechaLocalISO } from '../lib/fechas'
import { useCache, useSondeo, invalidar } from '../lib/cache'
import { walletDe } from '../lib/bloques'
import Mercados from '../components/Mercados.jsx'
import Bloques from '../components/Bloques.jsx'
import Evolucion, { BROKER_COLS, BROKER_LBL } from '../components/Evolucion.jsx'
import Posiciones from './Posiciones.jsx'
import './inicio.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = v => !Number.isFinite(Number(v)) ? '—' : Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v))
const fmtPct = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const val = p => Number(p.current_value ?? p.invested) || 0
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'

// Todo lo que necesita la portada en una sola carga, cacheada y compartida (ver lib/cache.js)
async function loaderInicio() {
  const [w, p, c, st, yr] = await Promise.all([
    supabase.from('weekly_snapshots').select('*').order('week_end'),
    supabase.from('positions').select('*'),
    supabase.from('contributions').select('fecha,broker,importe_eur,importe_usd'),
    supabase.from('app_state').select('key,value').in('key', ['liquidez', 'btc_wallet', 'bloques_objetivo']),
    supabase.from('yearly_results').select('year,valor_cierre_usd,valor_cierre_eur,eurusd_cierre'),
  ])
  const estado = Object.fromEntries((st.data || []).map(r => [r.key, r.value]))
  return {
    weeks: w.data || [], positions: p.data || [], contribs: c.data || [], anuales: yr.data || [],
    liquidez: estado.liquidez || {}, btcQty: walletDe(estado.btc_wallet).qty, btcInv: walletDe(estado.btc_wallet).invertido,
    objetivos: estado.bloques_objetivo || null,
  }
}
const loaderBtc = () => fetchQuotes(['BTC-USD'])
// Filtro Platt: precio vivo SOLO de las posiciones con SL y sin precio de entrada → { ticker: quote }
async function loaderPlatt(tickers) {
  if (!tickers.length) return {}
  const simbolos = await getSimbolos()
  const ys = Object.fromEntries(tickers.map(t => [t, yahooDe(t, simbolos)]))
  const q = await fetchQuotes(Object.values(ys))
  return Object.fromEntries(tickers.map(t => [t, q[ys[t]] || null]))
}

export default function Inicio() {
  const { data } = useCache('inicio', loaderInicio, { ttl: 60e3, persist: true })
  const { data: qBtc } = useSondeo('quotes:BTC-USD', loaderBtc, { intervalo: intervaloPrecios, persist: true })
  const weeks = data?.weeks || null
  const positions = data?.positions || []
  const contribs = data?.contribs || []
  const liquidez = data?.liquidez || {}
  const btcQty = data?.btcQty || 0
  const objetivos = data?.objetivos || null   // app_state.bloques_objetivo (opcional)
  const btcPrecio = qBtc?.['BTC-USD']?.price || null
  const sinEntrada = [...new Set(positions.filter(p => p.sl_price && !p.entry_price && p.invested).map(p => p.ticker))].sort()
  const clavePlatt = 'quotes:platt:' + sinEntrada.join(',')
  const { data: qPlatt } = useSondeo(clavePlatt, () => loaderPlatt(sinEntrada),
    { intervalo: intervaloPrecios, persist: true, activo: sinEntrada.length > 0, deps: [clavePlatt] })
  const location = useLocation()
  // Alta prellenada desde el Buscador: /?alta=<json>
  const altaInicial = useMemo(() => {
    const q = new URLSearchParams(location.search).get('alta')
    if (!q) return null
    try { return JSON.parse(q) } catch { return null }
  }, [location.search])

  // Las posiciones cambian desde la tabla embebida (cierre de semana, altas, cierres…): se invalida
  // la carga de la portada y se vuelve a leer en segundo plano
  function posicionesCambiaron() { invalidar(['inicio', 'evolucion', 'historico', 'calendario']) }

  const serie = useMemo(() => (weeks || []).map(w => ({ fecha: w.week_end, usd: Number(w.total_value) })), [weeks])

  // TWR por cuenta para los % de periodo (semanas CERRADAS, sin efecto aportaciones)
  const twrD = useMemo(() => weeks ? serieTWRDesglose(weeks, contribs) : [], [weeks, contribs])
  function periodosDe(b) {
    const s = twrD.filter(r => r[b] != null)
    if (s.length < 2) return null
    const last = s.at(-1)
    const pct = i0 => (i0 ? (last[b] / i0 - 1) * 100 : null)
    const en = f => { let v = null; for (const r of s) { if (r.fecha <= f) v = r[b]; else break } return v }
    const d = new Date(last.fecha + 'T00:00:00')
    const mes = new Date(d); mes.setMonth(d.getMonth() - 1)
    const seis = new Date(d); seis.setMonth(d.getMonth() - 6)
    return {
      sem: pct(s.at(-2)[b]),
      m: pct(en(mes.toISOString().slice(0, 10))),
      m6: pct(en(seis.toISOString().slice(0, 10))),
      ytd: pct(en(`${d.getFullYear() - 1}-12-31`)),
    }
  }

  // Boxes
  const totalPos = positions.reduce((a, p) => a + val(p), 0)
  const totalInv = positions.reduce((a, p) => a + (Number(p.invested) || 0), 0)
  const totalLiq = Object.values(liquidez).reduce((a, v) => a + (Number(v) || 0), 0)
  const btcUsd = btcQty && btcPrecio ? btcQty * btcPrecio : 0
  const totalCuenta = totalPos + totalLiq + btcUsd
  const vivoOk = !btcQty || !!btcPrecio      // con wallet y sin precio de BTC, el total vivo aún no es fiable
  const cuentas = ['etoro', 'xtb', 'ibkr'].map(b => {
    const pos = positions.filter(p => p.broker === b).reduce((a, p) => a + val(p), 0)
    const liq = Number(liquidez[b]) || 0
    return { b, pos, liq, total: pos + liq, per: periodosDe(b) }
  })
  const perBtc = periodosDe('btc')
  const gp = totalPos - totalInv
  const gpPct = totalInv ? gp / totalInv * 100 : null
  const ult = serie.at(-1)
  const hoy = fechaLocalISO()
  // Semana en curso: total vivo frente al último cierre, descontando las aportaciones posteriores a ese cierre
  const fSem = ult ? aportacionesEntre(contribs, ult.fecha, hoy, weeks).total : 0
  const semPct = ult && ult.usd > 0 && vivoOk ? ((totalCuenta - fSem) / ult.usd - 1) * 100 : null
  const año = new Date().getFullYear()
  const aportadoAño = contribs.filter(c => c.fecha?.startsWith(String(año))).reduce((a, c) => a + (Number(c.importe_eur) || 0), 0)
  const aportadoTotal = contribs.reduce((a, c) => a + (Number(c.importe_eur) || 0), 0)
  const rAño = useMemo(() => anioDietz({ año, weeks: weeks || [], contribs, anuales: data?.anuales || [], vivo: vivoOk ? totalCuenta : null, hoy }),
    [año, weeks, contribs, data, vivoOk, totalCuenta, hoy])
  const añoPct = rAño.usd

  // Filtro Platt: si todos los SLs saltan a la vez, ¿cuánto se pierde? (lib/riesgo.js)
  // Con precio de entrada: valor actual − valor en SL. Sin entrada: con el precio vivo (peniques → £).
  const platt = filtroPlatt(positions, p => precioEnUnidadNivel(qPlatt?.[p.ticker]))
  const plattPerdida = platt.perdida
  const plattPct = vivoOk && totalCuenta ? plattPerdida / totalCuenta * 100 : null
  const plattOk = plattPct != null && plattPct <= 10

  if (!weeks) return <p className="placeholder">Cargando…</p>

  return (
    <div className="inicio">
      <Mercados />

      <div className="boxes resumen num">
        <div className="card box box-total">
          <span className="box-t">Valor total cuenta</span>
          <span className="box-v">${fmt$(totalCuenta)}</span>
          <span className="box-s">posiciones ${fmtK(totalPos)} + liquidez ${fmtK(totalLiq)} + ₿ ${fmtK(btcUsd)}</span>
        </div>
        <div className="card box">
          <span className="box-t">G/P abierto</span>
          <span className={'box-v ' + pctClass(gpPct)}>{fmtPct(gpPct)}</span>
          <span className={'box-s ' + pctClass(gp)}>{gp > 0 ? '+' : ''}${fmt$(gp)} sobre invertido</span>
        </div>
        <div className="card box">
          <span className="box-t">Semana en curso</span>
          <span className={'box-v ' + pctClass(semPct)}>{fmtPct(semPct)}</span>
          <span className="box-s" title={fSem ? `Descontadas aportaciones posteriores al cierre: $${fmt$(fSem)}` : ''}>vs cierre {fFecha(ult?.fecha)}{vivoOk ? '' : ' · esperando precio ₿'}</span>
        </div>
        <div className="card box">
          <span className="box-t" title={`Rentabilidad ${año} por Dietz modificado: (V1 − V0 − ΣF) ÷ (V0 + Σ wᵢ·Fᵢ). V0 = cierre ${año - 1}${rAño.fuenteV0 ? ' (' + rAño.fuenteV0 + ')' : ''}; V1 = ${rAño.fuenteV1}; F = aportaciones del año ponderadas por el tiempo que han estado invertidas.${rAño.sinCambio ? ` ${rAño.sinCambio} aportación(es) sin importe $ ni EURUSD: no computan.` : ''}`}>{año}</span>
          <span className={'box-v ' + pctClass(añoPct)}>{fmtPct(añoPct)}</span>
          <span className={'box-s ' + pctClass(rAño.eur)}>en €: {fmtPct(rAño.eur)}{rAño.fuenteV1 === 'último cierre' ? ` · al cierre ${fFecha(rAño.d1)}` : ''}{rAño.sinCambio ? ' · ⚠' : ''}</span>
          <span className="box-s">aportado {año}: {fmt$(aportadoAño)}€ · total: {fmt$(aportadoTotal)}€</span>
        </div>
        <div className="card box box-platt"
             title={'Filtro Platt: pérdida si TODOS los SLs saltaran a la vez, sobre el capital total (posiciones + liquidez + ₿ wallet). Umbral de aviso: 10%. '
               + 'Con precio de entrada se usa el SL frente a la entrada; sin entrada, el SL frente al precio vivo. Posiciones sin SL no computan (no saltan).'
               + (platt.sinDatos ? ` ${platt.sinDatos} posición(es) con SL sin precio de entrada ni precio vivo: no computan.` : '')}>
          <span className="box-t">Platt</span>
          {platt.n && plattPct != null
            ? <span className={'box-v ' + (plattOk ? 'up' : 'warn')}>−{plattPct.toFixed(1)}%</span>
            : <span className="box-v warn">—</span>}
          <span className="box-s">
            {platt.n
              ? `−$${fmtK(plattPerdida)} si saltan los ${platt.n} SLs · umbral 10%`
              : `sin SLs calibrados aún (${positions.length} posiciones)`}
            {platt.sinDatos ? ` · ${platt.sinDatos} posiciones sin datos` : ''}
          </span>
        </div>
      </div>

      <Evolucion />

      <Posiciones embed onCambio={posicionesCambiaron} seleccionInicial={altaInicial} wallet={{ qty: btcQty, usd: btcUsd, precio: btcPrecio, invertido: data?.btcInv || null }} />

      <Bloques positions={positions} liquidez={liquidez} objetivos={objetivos} wallet={{ qty: btcQty, usd: btcUsd, precio: btcPrecio, invertido: data?.btcInv || null }} />

      <div className="boxes cuentas num">
        {cuentas.map(c => (
          <div key={c.b} className="card box">
            <span className="box-t" style={{ color: BROKER_COLS[c.b] }}>{BROKER_LBL[c.b]}</span>
            <span className="box-v">${fmt$(c.total)}</span>
            <span className="box-s">posiciones ${fmtK(c.pos)} + liquidez ${fmt$(c.liq)}</span>
            <Periodos per={c.per} />
          </div>
        ))}
        <div className="card box">
          <span className="box-t" style={{ color: BROKER_COLS.btc }}>{BROKER_LBL.btc}</span>
          <span className="box-v">{btcUsd ? '$' + fmt$(btcUsd) : '—'}</span>
          <span className="box-s">{btcQty} ₿ {btcPrecio ? '× $' + fmtK(btcPrecio) : '· sin precio'}</span>
          <Periodos per={perBtc} />
        </div>
      </div>
    </div>
  )
}

// % por periodo de cada cuenta: TWR sobre semanas cerradas, sin efecto de aportaciones
function Periodos({ per }) {
  if (!per) return null
  const f = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1)
  return (
    <span className="box-per" title="% TWR sobre semanas cerradas (sin efecto de las aportaciones). S = última semana cerrada">
      {[['S', per.sem], ['M', per.m], ['6M', per.m6], ['YTD', per.ytd]].map(([l, v]) => (
        <span key={l} className={pctClass(v)}><i>{l}</i> {f(v)}</span>
      ))}
    </span>
  )
}

// Rentabilidad del año en curso (Dietz modificado, USD y €). V0 = cierre del año anterior
// (yearly_results o, si no hay, último cierre semanal ≤ 31/12); V1 = total vivo o, sin él, último cierre.
function anioDietz({ año, weeks, contribs, anuales, vivo, hoy }) {
  const d0 = `${año - 1}-12-31`
  const yr = anuales.find(r => Number(r.year) === año - 1)
  const snap0 = [...weeks].reverse().find(w => w.week_end <= d0 && Number(w.total_value) > 0)
  let v0 = null, fuenteV0 = null
  if (yr && Number(yr.valor_cierre_usd) > 0) { v0 = Number(yr.valor_cierre_usd); fuenteV0 = 'resultados anuales' }
  else if (snap0) { v0 = Number(snap0.total_value); fuenteV0 = 'cierre semanal ' + snap0.week_end }
  const ult = weeks.at(-1)
  let v1, d1, fuenteV1
  if (vivo != null && vivo > 0) { v1 = vivo; d1 = hoy; fuenteV1 = 'total vivo' }
  else if (ult) { v1 = Number(ult.total_value); d1 = ult.week_end; fuenteV1 = 'último cierre' }
  if (v0 == null || v1 == null || !(d1 > d0)) return { usd: null, eur: null, fuenteV0, fuenteV1, d1 }
  const ap = aportacionesEntre(contribs, d0, d1, weeks)
  const usd = rentabilidadDietz({ v0, d0, v1, d1, flujos: ap.flujos })
  // €: V0€ del cierre anual (o V0 / EURUSD de cierre), V1€ = V1 / EURUSD del último cierre semanal, flujos = importe €
  const fx0 = Number(yr?.eurusd_cierre) > 0 ? Number(yr.eurusd_cierre) : eurusdEn(weeks, d0)
  const v0e = yr && Number(yr.valor_cierre_eur) > 0 ? Number(yr.valor_cierre_eur) : fx0 ? v0 / fx0 : null
  const fx1 = eurusdEn(weeks, d1)
  const flujosEur = contribs.filter(c => c.fecha > d0 && c.fecha <= d1 && Number.isFinite(Number(c.importe_eur)))
    .map(c => ({ fecha: c.fecha, importe: Number(c.importe_eur) }))
  const eur = v0e && fx1 ? rentabilidadDietz({ v0: v0e, d0, v1: v1 / fx1, d1, flujos: flujosEur }) : null
  return { usd, eur, fuenteV0, fuenteV1, d1, sinCambio: ap.sinCambio }
}

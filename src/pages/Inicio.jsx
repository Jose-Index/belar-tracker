import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { serieTWRDesglose } from '../lib/twr'
import { fetchQuotes } from '../lib/quotes'
import Mercados from '../components/Mercados.jsx'
import Evolucion, { BROKER_COLS, BROKER_LBL } from '../components/Evolucion.jsx'
import './inicio.css'

const fmt$ = v => v == null ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v))
const fmtPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'
const pctClass = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fFecha = d => d ? d.slice(2).split('-').reverse().join('/') : '—'

export default function Inicio() {
  const [weeks, setWeeks] = useState(null)
  const [positions, setPositions] = useState([])
  const [contribs, setContribs] = useState([])
  const [liquidez, setLiquidez] = useState({})
  const [btcQty, setBtcQty] = useState(0)
  const [btcPrecio, setBtcPrecio] = useState(null)

  async function cargar() {
    const [w, p, c, st] = await Promise.all([
      supabase.from('weekly_snapshots').select('*').order('week_end'),
      supabase.from('positions').select('broker,invested,current_value,entry_price,sl_price,apalancamiento'),
      supabase.from('contributions').select('fecha,broker,importe_eur,importe_usd'),
      supabase.from('app_state').select('key,value').in('key', ['liquidez', 'btc_wallet']),
    ])
    const estado = Object.fromEntries((st.data || []).map(r => [r.key, r.value]))
    setWeeks(w.data || []); setPositions(p.data || [])
    setContribs(c.data || []); setLiquidez(estado.liquidez || {})
    setBtcQty(Number(estado.btc_wallet?.qty) || 0)
    fetchQuotes(['BTC-USD']).then(q => setBtcPrecio(q['BTC-USD']?.price || null))
  }
  useEffect(() => { cargar() }, [])

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
  const totalPos = positions.reduce((a, p) => a + Number(p.current_value ?? p.invested), 0)
  const totalInv = positions.reduce((a, p) => a + Number(p.invested), 0)
  const totalLiq = Object.values(liquidez).reduce((a, v) => a + (Number(v) || 0), 0)
  const btcUsd = btcQty && btcPrecio ? btcQty * btcPrecio : 0
  const totalCuenta = totalPos + totalLiq + btcUsd
  const cuentas = ['etoro', 'xtb', 'ibkr'].map(b => {
    const pos = positions.filter(p => p.broker === b).reduce((a, p) => a + Number(p.current_value ?? p.invested), 0)
    const liq = Number(liquidez[b]) || 0
    return { b, pos, liq, total: pos + liq, per: periodosDe(b) }
  })
  const perBtc = periodosDe('btc')
  const gp = totalPos - totalInv
  const gpPct = totalInv ? gp / totalInv * 100 : null
  const ult = serie.at(-1), pen = serie.at(-2)
  const semPct = ult && pen ? (ult.usd - pen.usd) / pen.usd * 100 : null
  const año = new Date().getFullYear()
  const aportadoAño = contribs.filter(c => c.fecha?.startsWith(String(año))).reduce((a, c) => a + Number(c.importe_eur), 0)
  const aportadoTotal = contribs.reduce((a, c) => a + Number(c.importe_eur), 0)
  const iniAño = serie.find(s => s.fecha >= `${año}-01-01`)
  const añoPct = ult && iniAño && iniAño !== ult ? (ult.usd - iniAño.usd) / iniAño.usd * 100 : null

  // Filtro Platt: si todos los SLs saltan a la vez, ¿cuánto se pierde?
  // Pérdida por posición = valor actual − valor en SL (entrada, apalancamiento).
  const conSL = positions.filter(p => p.sl_price && p.entry_price && p.invested)
  const plattPerdida = conSL.reduce((a, p) => {
    const retSL = (Number(p.sl_price) / Number(p.entry_price) - 1) * Number(p.apalancamiento || 1)
    const valorEnSL = Number(p.invested) * (1 + retSL)
    return a + Math.max(0, Number(p.current_value ?? p.invested) - valorEnSL)
  }, 0)
  const plattPct = totalCuenta ? plattPerdida / totalCuenta * 100 : null
  const plattOk = plattPct != null && plattPct <= 10

  if (!weeks) return <p className="placeholder">Cargando…</p>

  return (
    <div>
      <Mercados />

      <div className="boxes num">
        <div className="card box">
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
          <span className="box-s">vs cierre {fFecha(pen?.fecha)}</span>
        </div>
        <div className="card box">
          <span className="box-t">{año}</span>
          <span className={'box-v ' + pctClass(añoPct)}>{fmtPct(añoPct)}</span>
          <span className="box-s">aportado {año}: {fmt$(aportadoAño)}€ · total: {fmt$(aportadoTotal)}€</span>
        </div>
        <div className="card box box-platt"
             title="Filtro Platt: pérdida si TODOS los SLs saltaran a la vez, sobre el capital total. Umbral de aviso: 10%. Posiciones sin SL no computan (no saltan).">
          <span className="box-t">Platt</span>
          {conSL.length
            ? <span className={'box-v ' + (plattOk ? 'up' : 'warn')}>−{plattPct.toFixed(1)}%</span>
            : <span className="box-v warn">—</span>}
          <span className="box-s">
            {conSL.length
              ? `−$${fmtK(plattPerdida)} si saltan los ${conSL.length} SLs · umbral 10%`
              : `sin SLs calibrados aún (${positions.length} posiciones)`}
          </span>
        </div>
      </div>

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

      <Evolucion />
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

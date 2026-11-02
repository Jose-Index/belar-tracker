// BTP · Tesis JOSE −11/+23,5 — desempeño real desde la adopción (30/09/2026), abiertas + cerradas.
// Cálculo en src/lib/tesis.js. Nativa y Puente por separado (§9.1): las conclusiones salen de la nativa.
import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCache } from '../lib/cache'
import { fechaLocalISO } from '../lib/fechas'
import { operacionesTesis, conSP, resumen, BANCO } from '../lib/tesis'
import { TESIS_ADOPCION } from '../lib/bloques'
import './inicio.css'
import './tesis.css'

const fmt$ = v => v == null ? '—' : (v < 0 ? '−' : v > 0 ? '+' : '') + '$' + Math.abs(v).toLocaleString('es-ES', { maximumFractionDigits: 0 })
const fmtPct = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d).replace('.', ',') + '%'
const cls = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
const fF = d => d ? d.slice(2).split('-').reverse().join('/') : '—'

async function loader() {
  const [p, h, s] = await Promise.all([
    supabase.from('positions').select('*'),
    supabase.from('position_history').select('*').eq('bloque', 'TESIS'),
    fetch('/api/history?symbol=SPY&range=1yd').then(r => r.json()).catch(() => null),
  ])
  return { positions: p.data || [], cierres: h.data || [], spy: s?.points || [] }
}

const GRUPOS = [
  { id: 'NATIVA', label: 'Nativa', ayuda: `Entradas desde el ${fF(TESIS_ADOPCION)}. La única que mide la regla.` },
  { id: 'PUENTE', label: 'Puente', ayuda: 'Abiertas antes del 30/09, gestionadas con SL/TP de la Tesis. Ocupan peso, no miden la regla.' },
  { id: 'TODAS', label: 'Todas', ayuda: 'Nativa + Puente.' },
]

export default function Tesis() {
  const { data } = useCache('tesis:desempeno', loader, { ttl: 5 * 60e3, persist: true })
  const [grupo, setGrupo] = useState('NATIVA')
  const hoy = fechaLocalISO()

  const ops = useMemo(() => data ? conSP(operacionesTesis(data.positions, data.cierres, hoy), data.spy, hoy) : [], [data, hoy])
  const res = useMemo(() => ({
    NATIVA: resumen(ops.filter(o => o.grupo === 'NATIVA')),
    PUENTE: resumen(ops.filter(o => o.grupo === 'PUENTE')),
    TODAS: resumen(ops),
  }), [ops])
  const visibles = grupo === 'TODAS' ? ops : ops.filter(o => o.grupo === grupo)
  const fechaCaptura = ops.filter(o => o.abierta && o.fechaValor).map(o => o.fechaValor).sort().pop()

  if (!data) return <p className="placeholder">Cargando…</p>
  const r = res.NATIVA

  return (
    <div className="tesis-pag">
      <div className="card historico">
        <h2>Tesis JOSE −11/+23,5 · desempeño real
          <span className="hist-n">desde {fF(TESIS_ADOPCION)} · abiertas + cerradas · abiertas a CIERRE {fF(fechaCaptura)}</span></h2>

        <div className="tesis-kpis num">
          <Kpi t="Resultado nativa" v={fmt$(r.total)} c={cls(r.total)} s={`${fmtPct(r.pctTotal)} sobre lo invertido · realizado ${fmt$(r.realizado)} · latente ${fmt$(r.latente)}`} />
          <Kpi t="Acierto (cerradas)" v={r.acierto == null ? '—' : r.acierto.toFixed(0) + '%'} s={`${r.tp} TP · ${r.sl} SL · ${r.manual} manual · banco ${BANCO.aciertoMin}-${BANCO.aciertoMax}%`} />
          <Kpi t="Neto/op cerradas" v={fmtPct(r.netoCer)} c={cls(r.netoCer)} s={`banco +${BANCO.netoMin}/+${BANCO.netoMax} · con abiertas a valor ${fmtPct(r.netoTodas)}`} />
          <Kpi t="Frente al S&P (SPY)" v={fmtPct(r.exceso)} c={cls(r.exceso)} s={`S&P mismas fechas ${fmtPct(r.sp)} · baten al S&P ${r.batenSp}/${r.nSp}`} />
        </div>

        {r.nCer < 30 && <p className="tesis-aviso">Muestra corta: {r.nCer} cerradas nativas. El banco se mide sobre cientos de operaciones de ~{BANCO.semanas} semanas; con menos de 30 cierres esto es seguimiento, no veredicto sobre la regla.</p>}

        <table className="tabla-hist num tesis-res">
          <thead><tr>
            <th>GRUPO</th><th title="Operaciones: cerradas / abiertas">OPS</th><th>ACIERTO</th>
            <th title="Media del % de las cerradas">NETO/OP</th><th>GAN. MEDIA</th><th>PÉRD. MEDIA</th>
            <th title="Días medios de las cerradas">DÍAS</th><th>REALIZADO</th><th title="G/P de las abiertas a la última captura">LATENTE</th>
            <th>TOTAL</th><th title="Total ÷ capital comprometido en todas las operaciones">% S/INV.</th><th title="Media del % de cada operación menos el S&P (SPY) en sus mismas fechas">VS S&P</th>
          </tr></thead>
          <tbody>
            {GRUPOS.map(g => { const x = res[g.id]; return (
              <tr key={g.id} className={g.id === 'TODAS' ? 'tesis-total' : ''} title={g.ayuda}>
                <td>{g.label}</td>
                <td>{x.nCer} / {x.nAb}</td>
                <td>{x.acierto == null ? '—' : x.acierto.toFixed(0) + '%'}</td>
                <td className={cls(x.netoCer)}>{fmtPct(x.netoCer)}</td>
                <td>{fmtPct(x.ganMedia)}</td>
                <td>{fmtPct(x.perMedia)}</td>
                <td>{x.diasCer == null ? '—' : Math.round(x.diasCer)}</td>
                <td className={cls(x.realizado)}>{fmt$(x.realizado)}</td>
                <td className={cls(x.latente)}>{fmt$(x.latente)}</td>
                <td className={cls(x.total)}><b>{fmt$(x.total)}</b></td>
                <td className={cls(x.pctTotal)}>{fmtPct(x.pctTotal)}</td>
                <td className={cls(x.exceso)}>{fmtPct(x.exceso)}</td>
              </tr>) })}
            <tr className="tesis-banco" title="Expectativa medida en banco (tesis-jose-11-235.md)">
              <td>Banco</td><td>—</td><td>{BANCO.aciertoMin}-{BANCO.aciertoMax}%</td><td>+{BANCO.netoMin}/+{BANCO.netoMax}%</td>
              <td>—</td><td>—</td><td>~{BANCO.semanas * 7}</td><td colSpan="5">azar emparejado 7,6-9,7 % anual · Tesis 11-15 % anual</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card historico">
        <h2>Operaciones
          <span className="tesis-chips">
            {GRUPOS.map(g => (
              <button key={g.id} className={'btn-sec' + (grupo === g.id ? ' activo' : '')} onClick={() => setGrupo(g.id)} title={g.ayuda}>
                {g.label} <span className="hist-n">{res[g.id].n}</span>
              </button>))}
          </span>
        </h2>
        <div className="tesis-scroll">
          <table className="tabla-hist num">
            <thead><tr>
              <th>VALOR</th><th>BRÓKER</th><th>ORIGEN</th><th>ENTRADA</th><th>SALIDA</th><th>DÍAS</th>
              <th>INVERTIDO</th><th>G/P $</th><th>G/P %</th><th title="S&P (SPY) en las mismas fechas">S&P</th><th title="G/P % menos S&P">VS S&P</th>
            </tr></thead>
            <tbody>
              {visibles.map(o => (
                <tr key={o.id} className={o.abierta ? 'tesis-abierta' : ''}>
                  <td>{o.ticker}{o.apal ? <span className="tesis-tag" title="Apalancada: el % es sobre el margen">x2</span> : null}{grupo === 'TODAS' && o.grupo === 'PUENTE' ? <span className="tesis-tag">puente</span> : null}</td>
                  <td>{o.broker}</td>
                  <td>{o.origen}</td>
                  <td>{fF(o.entrada)}</td>
                  <td>{o.abierta ? <span className="tesis-tag viva">abierta</span> : <>{fF(o.salida)} <span className={'tesis-mot ' + o.motivo}>{o.motivo}</span></>}</td>
                  <td>{o.dias}</td>
                  <td>${Math.round(o.invertido).toLocaleString('es-ES')}</td>
                  <td className={cls(o.gp)}>{fmt$(o.gp)}</td>
                  <td className={cls(o.pct)}>{fmtPct(o.pct)}</td>
                  <td>{fmtPct(o.sp)}</td>
                  <td className={cls(o.exceso)}>{fmtPct(o.exceso)}</td>
                </tr>))}
              {!visibles.length && <tr><td colSpan="11">Sin operaciones en este grupo.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="tesis-nota">Cerradas: importes sellados por la ingesta de capturas (position_history, incluyen costes del bróker). Abiertas: valor de la última captura, no precio vivo. Los cierres de limpieza de la transición (30/09-01/10) no cuentan. S&P = SPY sin dividendos, cierre del día de entrada → cierre del día de salida o último disponible.</p>
      </div>
    </div>
  )
}

function Kpi({ t, v, s, c = '' }) {
  return <div className="tesis-kpi"><span className="box-t">{t}</span><b className={c}>{v}</b><small>{s}</small></div>
}

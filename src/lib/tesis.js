// BTP · Desempeño de la Tesis JOSE −11/+23,5 (02/11/2026, petición de José).
// Mide abiertas + cerradas desde la adopción (30/09/2026), no solo lo que sigue vivo.
//  · Nativa: entrada ≥ TESIS_ADOPCION. Es la única que sirve para sacar conclusiones de la regla.
//  · Puente: entrada anterior, gestionada con SL/TP de la Tesis tras la transición (abierta o cerrada
//    después de FIN_TRANSICION). Los cierres manuales de limpieza del 30/09-01/10 (MRX, MCK, SAN1, SCI)
//    no son de la regla y quedan fuera.
//  · Abiertas: a valor de la última captura (current_value), etiquetadas CIERRE dd/mm.
//  · S&P emparejado: SPY de cierre en la fecha de entrada → cierre en la fecha de salida (o último).
import { bloqueDe, TESIS_ADOPCION } from './bloques'

export const FIN_TRANSICION = '2026-10-01'
// Expectativa medida en banco (tesis-jose-11-235.md)
export const BANCO = { aciertoMin: 47, aciertoMax: 49, netoMin: 4.4, netoMax: 5.5, semanas: 20 }

const dias = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5))

export function operacionesTesis(positions = [], cierres = [], hoy) {
  const ops = []
  for (const p of positions || []) {
    if (bloqueDe(p) !== 'TESIS' || !p.entry_date) continue
    const inv = Number(p.invested), val = Number(p.current_value)
    if (!(inv > 0) || !Number.isFinite(val)) continue
    ops.push({
      id: 'a' + p.id, ticker: p.ticker, broker: p.broker, origen: p.fuente || '—',
      grupo: p.entry_date >= TESIS_ADOPCION ? 'NATIVA' : 'PUENTE',
      entrada: p.entry_date, salida: null, abierta: true, motivo: 'abierta',
      invertido: inv, valor: val, gp: val - inv, pct: (val / inv - 1) * 100,
      dias: dias(p.entry_date, hoy), apal: Number(p.apalancamiento) > 1,
      sl: p.sl_price, tp: p.tp_price, entryPrice: p.entry_price, fechaValor: p.updated_at?.slice(0, 10),
    })
  }
  for (const c of cierres || []) {
    const bq = c.bloque || null
    if (bq !== 'TESIS' || !c.entry_date || !c.closed_date) continue
    const nativa = c.entry_date >= TESIS_ADOPCION
    if (!nativa && c.closed_date <= FIN_TRANSICION) continue        // limpieza de la transición
    const inv = Number(c.invested), val = Number(c.closed_value)
    if (!(inv > 0) || !Number.isFinite(val)) continue
    ops.push({
      id: 'c' + c.id, ticker: c.ticker, broker: c.broker, origen: c.fuente || '—',
      grupo: nativa ? 'NATIVA' : 'PUENTE',
      entrada: c.entry_date, salida: c.closed_date, abierta: false, motivo: c.close_reason || '—',
      invertido: inv, valor: val, gp: val - inv,
      pct: Number.isFinite(Number(c.pl_pct)) ? Number(c.pl_pct) : (val / inv - 1) * 100,
      dias: dias(c.entry_date, c.closed_date), apal: Number(c.apalancamiento) > 1,
    })
  }
  return ops.sort((a, b) => (a.entrada < b.entrada ? 1 : a.entrada > b.entrada ? -1 : a.ticker.localeCompare(b.ticker)))
}

// Cierre de SPY en (o justo antes de) una fecha ISO
export function precioEn(serie, fecha) {
  if (!serie?.length || !fecha) return null
  const lim = Date.parse(fecha + 'T23:59:59Z')
  let v = null
  for (const p of serie) { if (p.t <= lim) v = p.v; else break }
  return v
}

export function conSP(ops, serie, hoy) {
  return ops.map(o => {
    const a = precioEn(serie, o.entrada), b = precioEn(serie, o.salida || hoy)
    const sp = a && b ? (b / a - 1) * 100 : null
    return { ...o, sp, exceso: sp == null ? null : o.pct - sp }
  })
}

const media = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null

export function resumen(ops) {
  const cer = ops.filter(o => !o.abierta), ab = ops.filter(o => o.abierta)
  const gan = cer.filter(o => o.pct > 0), per = cer.filter(o => o.pct <= 0)
  const inv = ops.reduce((s, o) => s + o.invertido, 0)
  const realizado = cer.reduce((s, o) => s + o.gp, 0), latente = ab.reduce((s, o) => s + o.gp, 0)
  const conSp = ops.filter(o => o.sp != null)
  return {
    n: ops.length, nCer: cer.length, nAb: ab.length,
    tp: cer.filter(o => o.motivo === 'xTP').length,
    sl: cer.filter(o => o.motivo === 'xSL').length,
    manual: cer.filter(o => o.motivo !== 'xTP' && o.motivo !== 'xSL').length,
    acierto: cer.length ? gan.length / cer.length * 100 : null,
    netoCer: media(cer.map(o => o.pct)),
    ganMedia: media(gan.map(o => o.pct)), perMedia: media(per.map(o => o.pct)),
    realizado, latente, total: realizado + latente,
    invAb: ab.reduce((s, o) => s + o.invertido, 0),
    pctLatente: ab.length ? latente / ab.reduce((s, o) => s + o.invertido, 0) * 100 : null,
    pctTotal: inv ? (realizado + latente) / inv * 100 : null,
    netoTodas: media(ops.map(o => o.pct)),
    enVerde: ab.filter(o => o.pct > 0).length,
    sp: media(conSp.map(o => o.sp)), exceso: media(conSp.map(o => o.exceso)),
    batenSp: conSp.filter(o => o.exceso > 0).length, nSp: conSp.length,
    diasCer: media(cer.map(o => o.dias)),
  }
}

// BTP · Cartera v3 (adoptada 30/09/2026): seis bloques con peso objetivo + caja.
// Fuente de verdad de la estructura de cartera. Los pesos objetivo se pueden
// sobrescribir desde app_state (key 'bloques_objetivo') sin tocar código.
// Regla §7.3: un bloque a más de +5 puntos de su objetivo no recibe entradas nuevas.

export const BLOQUES = [
  { id: 'BTC',       label: 'BTC',                 corto: 'BTC',        objetivo: 10, color: '#17202E',
    ayuda: 'Cuatro estrategias, cada posición etiquetada: Base (eToro, sin salida, horizonte 2036, 110 €/mes), Wallet (BTC propio), Combo MA200 v1 (VBTC.DE, entra y sale por la regla) y Táctica (VBTC.DE, con stop).' },
  { id: 'ORO',       label: 'ORO',                 corto: 'ORO',        objetivo: 8,  color: '#B08D2F',
    ayuda: 'IGLN físico. Compras solo en retroceso: nunca a <5 % del máximo de 52 semanas ni tras +15 % en 3 meses. Sin SL, invalidación escrita.' },
  { id: 'NUCLEO',    label: 'NÚCLEO',              corto: 'NÚCLEO',     objetivo: 24, color: '#2E6BF6',
    ayuda: '16 % ETF S&P 500 UCITS de acumulación (CSPX) con la aportación IBKR + 8 % en 3-5 convicciones (NVDA, GOOGL, MU…) con invalidación escrita. ETF sin salida; convicciones −25 % estructural, revisión semestral.' },
  { id: 'DELEGADA',  label: 'COPY TRADING',         corto: 'COPY',   objetivo: 10, color: '#7C5CFF',
    ayuda: 'BRK.B 7 % (contado, IBKR) + UN solo copy trader de eToro 3 %. Sin SL. Sustitución si 12 meses seguidos por detrás del S&P.' },
  { id: 'OMERCADOS', label: 'O/MERCADOS',          corto: 'O/MERCADOS', objetivo: 10, color: '#3BC9F5',
    ayuda: 'Grandes corporaciones no USA aguantadas meses (Samsung, SoftBank, Kawasaki), EWY. China ≤5 %. Francia excluida. Salida −20/−25 % o revisión semestral.' },
  { id: 'TESIS',     label: 'Tesis JOSE −11/+23,5', corto: 'TESIS',     objetivo: 25, color: '#0F2A6B',
    ayuda: 'Renta variable táctica. Máx. 8 líneas, ticket ≤4 % (small caps 2 %), hasta 4 entradas al mes, decisión en vista de 2 años. SL −11 / TP +23,5 fijos en el ticket, no se tocan.' },
  { id: 'SATELITE',  label: 'SATÉLITE',            corto: 'SATÉLITE',   objetivo: 5,  color: '#F07D2E',
    ayuda: 'Estrategia libre (01/10/2026): disruptivas/loterías declaradas el día de compra y cohetes ascendidos desde la Tesis SOLO en ganancia (≥ +23,5). Peso 5 %, techo 8 %, máx. 4 líneas. Invalidación escrita por línea: ascendidas, suelo fijo +10 % sobre entrada puesto una vez (no sube); loterías, pérdida máxima asumida. Revisión semestral.' },
]
export const CAJA = { id: 'CAJA', label: 'Caja', corto: 'CAJA', objetivo: 8, color: '#C7D0E0',
  ayuda: '8 % mientras se construye el NÚCLEO; después 5 %.' }

export const BLOQUE_IDS = BLOQUES.map(b => b.id)
export const BLOQUE_DE_ID = Object.fromEntries(BLOQUES.map(b => [b.id, b]))

// Tesis JOSE −11/+23,5 (documento tesis-jose-11-235.md)
export const TESIS_SL = -11
export const TESIS_TP = 23.5
export const tesisSL = entry => entry ? Math.round(entry * (1 + TESIS_SL / 100) * 10000) / 10000 : null
export const tesisTP = entry => entry ? Math.round(entry * (1 + TESIS_TP / 100) * 10000) / 10000 : null

// Bloque efectivo de una posición: el asignado o, si aún no tiene, uno por defecto
// (transición 30/09/2026: las 25 abiertas se asignan por API; lo nuevo entra por el alta).
const NUCLEO_TK = new Set(['NVDA', 'GOOGL', 'GOOG', 'MU', 'CSPX', 'CSPX.L', 'CSPX.UK', 'CSPX.DE'])
const OMERC_TK = new Set(['EWY', 'SMSN.UK', 'SMSN.IL', '7012.T', 'CSKR.UK', '9984.T', 'KWEB', 'FXI', 'MCHI'])
const DELEG_TK = new Set(['BRK.B', 'BRK-B', 'BRKB', 'BRK.B.US'])
export function bloquePorDefecto(p) {
  const t = String(p?.ticker || '').toUpperCase()
  if (t === 'BTC' || t.startsWith('VBTC') || t === 'BTC-USD') return 'BTC'
  if (t === 'IGLN' || t === 'IGLN.L' || t.startsWith('XAU') || t === 'GC=F') return 'ORO'
  if (NUCLEO_TK.has(t)) return 'NUCLEO'
  if (DELEG_TK.has(t) || /INVESTMENTS|COPY|TRADER/.test(t)) return 'DELEGADA'
  if (OMERC_TK.has(t)) return 'OMERCADOS'
  return 'TESIS'
}
export const bloqueDe = p => (p?.bloque && BLOQUE_DE_ID[p.bloque]) ? p.bloque : bloquePorDefecto(p)

// Estrategias dentro del bloque BTC (01/10/2026). Sin DDL: se guardan en `clase`, cuyo CHECK
// solo admite NUCLEO/MOMENTUM/TACTICA/DISRUPTIVA → NUCLEO = Base, MOMENTUM = Combo MA200 v1,
// TACTICA = Táctica. La Wallet no es una posición (vive en app_state.btc_wallet).
export const BTC_ESTRATEGIAS = [
  { clase: 'NUCLEO',   id: 'BASE',    label: 'Base' },
  { clase: 'MOMENTUM', id: 'COMBO',   label: 'Combo MA200 v1' },
  { clase: 'TACTICA',  id: 'TACTICA', label: 'Táctica' },
]
export const estrategiaBTC = p => {
  if (bloqueDe(p) !== 'BTC') return null
  return BTC_ESTRATEGIAS.find(e => e.clase === p?.clase) || (p?.broker === 'etoro' ? BTC_ESTRATEGIAS[0] : BTC_ESTRATEGIAS[2])
}

// Tesis PUENTE (01/10/2026): posiciones del bloque Tesis abiertas ANTES de adoptar la regla (30/09/2026).
// Se gestionan con las reglas de la Tesis (SL/TP fijos) pero NO se miden como Tesis nativa en el panel mensual.
// Automático por fecha de entrada: no hay campo que marcar ni forma de colar una entrada nueva como puente.
export const TESIS_ADOPCION = '2026-09-30'
export const esPuente = p => bloqueDe(p) === 'TESIS' && !!p?.entry_date && p.entry_date < TESIS_ADOPCION

// Wallet BTC personal (app_state.btc_wallet). Desde el 01/10/2026 guarda las aportaciones
// [{ fecha, btc, usd }]: la cantidad es su suma y el invertido la suma de los USD, así la wallet
// tiene G/P y G/P %. Sin aportaciones se usa `qty` a secas y no hay coste (no entra en el G/P).
export function walletDe(v) {
  const aportes = Array.isArray(v?.aportaciones) ? v.aportaciones.filter(a => Number(a.btc) > 0) : []
  if (aportes.length) {
    const qty = Math.round(aportes.reduce((a, x) => a + Number(x.btc), 0) * 1e8) / 1e8
    const invertido = Math.round(aportes.reduce((a, x) => a + (Number(x.usd) || 0), 0) * 100) / 100
    return { qty, invertido: aportes.every(x => Number(x.usd) > 0) ? invertido : null, aportes }
  }
  return { qty: Number(v?.qty) || 0, invertido: null, aportes: [] }
}

// Semáforo de desvío en puntos porcentuales respecto al objetivo (§7.3)
export const DESVIO_ROJO = 5
export const DESVIO_AMBAR = 3
export const semaforoDesvio = pp => pp == null ? '' : Math.abs(pp) > DESVIO_ROJO ? 'rojo' : Math.abs(pp) > DESVIO_AMBAR ? 'ambar' : 'ok'

// Pesos reales por bloque. Base = posiciones + liquidez de brókers + wallet BTC personal
// (decisión de José del 30/09/2026: la wallet entra en la base y suma al bloque BTC núcleo).
// wallet = { qty, usd, invertido? } — usd ya valorado a precio de mercado; sin precio, usd = 0 y no cuenta.
export function pesosBloques(positions, liquidez, objetivos, wallet) {
  const val = p => Number(p.current_value ?? p.invested) || 0
  const totalPos = (positions || []).reduce((a, p) => a + val(p), 0)
  const caja = Object.values(liquidez || {}).reduce((a, v) => a + (Number(v) || 0), 0)
  const walletUsd = Number(wallet?.usd) > 0 ? Number(wallet.usd) : 0
  const base = totalPos + caja + walletUsd
  const obj = { ...Object.fromEntries(BLOQUES.map(b => [b.id, b.objetivo])), CAJA: CAJA.objetivo, ...(objetivos || {}) }
  const filas = BLOQUES.map(b => {
    const ps = (positions || []).filter(p => bloqueDe(p) === b.id)
    const extra = b.id === 'BTC' ? walletUsd : 0            // la wallet suma al bloque BTC
    const walletInv = b.id === 'BTC' && extra && Number(wallet?.invertido) > 0 ? Number(wallet.invertido) : 0
    const valor = ps.reduce((a, p) => a + val(p), 0) + extra
    const invertido = ps.reduce((a, p) => a + (Number(p.invested) || 0), 0) + walletInv
    const gp = valor - (walletInv ? 0 : extra) - invertido   // con coste de la wallet registrado, entra en el G/P
    const real = base ? valor / base * 100 : null
    const objetivo = Number(obj[b.id]) || 0
    const desvio = real == null ? null : real - objetivo
    return {
      ...b, objetivo, n: ps.length + (extra ? 1 : 0), valor, invertido, gp,
      gpPct: invertido ? gp / invertido * 100 : null,
      wallet: extra || 0,
      real, desvio, usd: real == null ? null : (objetivo - real) / 100 * base, // $ que faltan (+) o sobran (−)
      semaforo: semaforoDesvio(desvio),
    }
  })
  const realCaja = base ? caja / base * 100 : null
  const objCaja = Number(obj.CAJA) || 0
  const filaCaja = {
    ...CAJA, objetivo: objCaja, n: 0, valor: caja, invertido: caja, gp: 0, gpPct: null,
    real: realCaja, desvio: realCaja == null ? null : realCaja - objCaja,
    usd: realCaja == null ? null : (objCaja - realCaja) / 100 * base, semaforo: semaforoDesvio(realCaja == null ? null : realCaja - objCaja),
  }
  return { base, totalPos, caja, walletUsd, filas, filaCaja, todas: [...filas, filaCaja] }
}

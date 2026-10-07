// BTP · Cálculos puros de riesgo y unidades (auditoría 07/10/2026).
// Convención: los niveles (entry/sl/tp) de Londres (.L) se guardan en LIBRAS. Yahoo da esos precios
// en peniques (currency 'GBp' o 'GBX'): antes de comparar con un nivel hay que dividir entre 100.

export const esPeniques = moneda => moneda === 'GBp' || moneda === 'GBX'

// Precio de una cotización en la unidad de los niveles guardados (peniques → libras).
export function precioEnUnidadNivel(q) {
  const px = Number(q?.price)
  if (!(px > 0)) return null
  return esPeniques(q?.currency) ? px / 100 : px
}

// Distancia del precio al SL en % del precio: (px − sl) / px · 100. Positivo = margen hasta el SL.
export function distanciaSLpct(px, sl) {
  const a = Number(px), b = Number(sl)
  if (!(a > 0) || !(b > 0)) return null
  return (a - b) / a * 100
}

// Pérdida de UNA posición si salta su SL (Filtro Platt). p = { invested, current_value, entry_price,
// sl_price, apalancamiento }; px = precio vivo ya en la unidad del SL (o null).
// Devuelve { perdida } o null si no se puede calcular (sin entrada ni precio vivo).
export function perdidaEnSL(p, px = null) {
  const sl = Number(p?.sl_price), inv = Number(p?.invested)
  if (!(sl > 0) || !(inv > 0)) return null
  const cv = Number(p.current_value ?? p.invested) || 0
  const apal = Number(p.apalancamiento || 1) || 1
  const entry = Number(p.entry_price)
  if (entry > 0) {
    const valorEnSL = inv * (1 + (sl / entry - 1) * apal)
    return { perdida: Math.max(0, cv - valorEnSL), via: 'entrada' }
  }
  const x = Number(px)
  if (x > 0) return { perdida: Math.max(0, cv * apal * (1 - sl / x)), via: 'precio' }
  return null
}

// Filtro Platt sobre una lista de posiciones. precioDe(p) → precio vivo en la unidad del SL o null.
// Las posiciones sin sl_price no computan (por diseño: no saltan). Devuelve
// { perdida, n (computadas), sinDatos (con SL pero sin entrada ni precio vivo) }.
export function filtroPlatt(positions, precioDe = () => null) {
  let perdida = 0, n = 0, sinDatos = 0
  for (const p of positions || []) {
    if (!(Number(p?.sl_price) > 0) || !(Number(p?.invested) > 0)) continue
    const r = perdidaEnSL(p, precioDe(p))
    if (!r) { sinDatos++; continue }
    perdida += r.perdida; n++
  }
  return { perdida, n, sinDatos }
}

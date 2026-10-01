// BTP · /api/ia-capturas — extrae posiciones de capturas de pantalla de brokers.
// POST { images: [{ data: base64, media_type }], modo?: 'cerradas', conocidas?: [{ broker, ticker, invertido }] }
// conocidas (01/10/2026): posiciones ya registradas; la lectura debe usar esos tickers exactos cuando el
// "Invertido" coincide, en vez de inventar un nombre parecido a partir del texto de la captura.
// modo ausente → posiciones abiertas: { extracciones: [{ broker, liquidez|null, posiciones: [...] }] }
// modo 'cerradas' (13/08/2026) → pantallas de historial/posiciones cerradas:
//   { extracciones: [{ broker, cierres: [{nombre, ticker, invertido, valor_cierre, gp, fecha_cierre, fecha_apertura, apalancamiento}] }] }

import { anthropic, jsonDe } from './_anthropic.js'

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } }

const PROMPT = `Eres el extractor de datos de BTP (Belar Tracker Pro), el tracker de inversiones de José.
Analiza las capturas de pantalla adjuntas de sus brokers (eToro, XTB y/o IBKR) y extrae TODAS las posiciones visibles.

Devuelve EXCLUSIVAMENTE un JSON con esta forma, sin texto adicional:
{"extracciones":[{"broker":"etoro|xtb|ibkr","liquidez":123.45,"posiciones":[{"nombre":"NVIDIA Corp","ticker":"NVDA","invertido":1717.08,"valor":1728.69,"gp":11.61,"apalancamiento":1,"fecha_apertura":"2026-05-14"}]}]}

Reglas:
- broker: dedúcelo por los RÓTULOS de las columnas, no por los colores (xStation también tiene tema claro):
  · XTB (xStation) si ves "Instrumento/Posición", "Valor de apertura", "Beneficio neto", "Swap", "Rollover", "Hora de apertura", "Valor de Mis Operaciones", "Capital disponible", etiquetas de apalancamiento tipo "x2" y números de orden largos (10 dígitos) en las sublíneas.
  · eToro si ves "Invertido", "Beneficio", avatares de CopyTrader o nombres de personas como instrumento.
  · IBKR si ves "Position", "Mkt Value", "Avg Price", "Unrealized P&L" o la interfaz de Client Portal.
  Si no puedes decidirlo con esos rótulos, pon el que más se parezca; José lo corrige en pantalla.
- invertido = lo que costó abrir la posición; valor = lo que vale AHORA. En USD (moneda operativa). Usa punto decimal. NO los intercambies: por broker,
  · IBKR: invertido = "Cost Basis" / "Coste base"; valor = "Mkt Value" / "Market Value" / "Valor de mercado". "Avg Price" es precio por acción, NO es el invertido.
  · XTB: invertido = "Valor de apertura"; valor = "Valor".
  · eToro: invertido = "Invertido"; valor = "Valor" o "Valor Neto". La vista web "Mi Portafolio" tiene además las columnas "Precio", "Corto" y "Comprar", que son PRECIOS POR UNIDAD (botones de venta/compra): NUNCA los uses como invertido ni como valor, aunque sean las últimas columnas de la fila. Lee "Invertido" (segunda columna) y "Valor Neto" (justo antes de "Corto"). Comprobación: en eToro invertido y valor son importes en dólares del mismo orden de magnitud (cientos o miles); si te salen dos números casi iguales entre sí y muy distintos de "Invertido", has leído precios.
  Comprobación obligatoria antes de responder: invertido + gp = valor. Si te sale al revés, es que los has puesto cambiados; corrígelo.
- gp = la columna G/P $ / Beneficio neto / PyG no realizadas SI está visible, CON SU SIGNO (negativo si la posición pierde); si no, null. Debe cumplirse invertido + gp = valor. Si no te cuadra, revisa qué columna es cada cosa antes de responder; nunca devuelvas gp con el signo cambiado.
- ticker: el símbolo si aparece; si solo hay nombre comercial, tu mejor conversión a ticker (p.ej. "NVIDIA Corp"→"NVDA"). CopyTraders de eToro: usa el nombre del trader tal cual.
- apalancamiento: x1 si no se indica.
- fecha_apertura: fecha de apertura SI aparece en la captura, en formato YYYY-MM-DD. En XTB es la columna "Hora de apertura" (formato dd.mm.aaaa, conviértela). Si no aparece, null: NO la deduzcas ni pongas la de hoy.
- AGREGACIÓN: si un instrumento aparece con varias sublíneas/lotes (XTB despliega cada orden), devuelve UNA sola posición por instrumento: usa los importes de la fila resumen del instrumento y, como fecha_apertura, la MÁS ANTIGUA de sus lotes. No devuelvas una posición por lote. EXCEPCIÓN: si en la lista de posiciones registradas (al final) el mismo broker y ticker aparece MÁS DE UNA VEZ, son estrategias distintas: devuelve cada lote por separado, con su propio invertido, valor y fecha.
- liquidez: el saldo disponible/cash SI aparece en la captura; si no, null. PUEDE SER NEGATIVA (saldo deudor por margen): respeta el signo, un "-0,31" se devuelve como -0.31, nunca como 0.31 ni como otra cifra de la pantalla. Por broker: eToro "Disponible"; XTB "Capital disponible"; IBKR "Cash"/"Available Funds". Si no distingues con certeza cuál es el saldo, devuelve null antes que una cifra de otro campo.
- Si una cifra no se lee con certeza, pon null antes que inventarla.
- CRÍTICO: transcribe cada importe dígito a dígito y reléelo antes de escribirlo (confundir un 5 con un 6, o perder los decimales, corrompe la cartera). Ante ambigüedad visual, null.`

// Modo "cerradas" (13/08/2026): pantallas de historial / posiciones cerradas del broker.
// Objetivo: fecha REAL de cierre e importe REAL de salida, que el cierre por ausencia
// en captura no tiene (usa el valor de la última semana).
const PROMPT_CERRADAS = `Eres el extractor de datos de BTP (Belar Tracker Pro), el tracker de inversiones de José.
Las capturas adjuntas son pantallas de POSICIONES CERRADAS / HISTORIAL de sus brokers (eToro, XTB y/o IBKR).
Extrae TODOS los cierres visibles.

Devuelve EXCLUSIVAMENTE un JSON con esta forma, sin texto adicional:
{"extracciones":[{"broker":"etoro|xtb|ibkr","cierres":[{"nombre":"NVIDIA Corp","ticker":"NVDA","invertido":1717.08,"valor_cierre":1925.54,"gp":208.46,"fecha_cierre":"2026-08-11","fecha_apertura":"2026-04-15","apalancamiento":1}]}]}

Reglas:
- broker: dedúcelo por los RÓTULOS de las columnas, no por los colores. eToro "Historial"/"Cerradas" muestra "Invertido", "Beneficio", "Cerrada"; XTB (xStation) "Historial de órdenes"/"Posiciones cerradas" con "Valor de apertura", "Beneficio neto", "Hora de cierre"; IBKR muestra "Realized P&L", "Trade History". Si no puedes decidirlo, pon el que más se parezca; José lo corrige en pantalla.
- invertido = lo que costó abrir; valor_cierre = el importe al cerrar (invertido + beneficio realizado). En USD, punto decimal.
- gp = beneficio/pérdida REALIZADA con su signo si está visible; si no, null. Debe cumplirse invertido + gp = valor_cierre; si no cuadra, revisa qué columna es cada cosa.
- Si la pantalla solo da invertido y gp, calcula valor_cierre = invertido + gp. Si solo da valor_cierre y gp, calcula invertido = valor_cierre - gp.
- fecha_cierre: la fecha REAL de cierre en YYYY-MM-DD (XTB usa dd.mm.aaaa: conviértela). Si no aparece, null: NO pongas la de hoy.
- fecha_apertura: si aparece, YYYY-MM-DD; si no, null.
- ticker: el símbolo si aparece; si solo hay nombre comercial, tu mejor conversión ("NVIDIA Corp"→"NVDA"). CopyTraders de eToro: el nombre del trader tal cual.
- apalancamiento: x1 si no se indica.
- AGREGACIÓN: varias sublíneas/lotes del mismo instrumento cerrados el mismo día = UN cierre con los importes totales. Cierres del mismo instrumento en fechas distintas = cierres separados.
- Si una cifra no se lee con certeza, null antes que inventarla.
- CRÍTICO: transcribe cada importe dígito a dígito y reléelo antes de escribirlo. Ante ambigüedad visual, null.`

// Lista de posiciones ya registradas para anclar los tickers a lo que existe de verdad.
function textoConocidas(conocidas) {
  if (!Array.isArray(conocidas) || !conocidas.length) return ''
  const lineas = conocidas.slice(0, 80).map(c => `${c.broker} · ${c.ticker} · invertido ${Number(c.invertido).toFixed(2)}`)
  return `\n\nPOSICIONES YA REGISTRADAS (broker · ticker · invertido en USD):\n${lineas.join('\n')}\n` +
    `Regla de anclaje: si una fila de la captura tiene el MISMO "Invertido" (al céntimo) que una de estas posiciones del mismo broker, su ticker ES ese ticker exacto: devuélvelo tal cual aunque el texto de la pantalla te parezca otro (los nombres cortos se leen mal: "RR.L" no es "XRP", "MATX" no es "MTTR"). ` +
    `Solo devuelve un ticker que no esté en la lista si su invertido no coincide con ninguno. No inventes posiciones nuevas por una lectura dudosa del nombre.`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST' }); return }
  try {
    const { images, modo, conocidas } = req.body || {}
    if (!images?.length) { res.status(400).json({ error: 'images requerido' }); return }
    const content = [
      ...images.slice(0, 8).map(im => ({
        type: 'image',
        source: { type: 'base64', media_type: im.media_type || 'image/png', data: im.data },
      })),
      { type: 'text', text: modo === 'cerradas' ? PROMPT_CERRADAS : PROMPT + textoConocidas(conocidas) },
    ]
    const msg = await anthropic({ messages: [{ role: 'user', content }] })
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(jsonDe(msg))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}

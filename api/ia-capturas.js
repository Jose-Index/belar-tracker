// BTP · /api/ia-capturas — extrae posiciones de capturas de pantalla de brokers.
// POST { images: [{ data: base64, media_type }], modo?: 'cerradas', conocidas?: [{ broker, ticker, invertido }] }
// conocidas (01/10/2026): posiciones ya registradas; la lectura debe usar esos tickers exactos cuando el
// "Invertido" coincide, en vez de inventar un nombre parecido a partir del texto de la captura.
// modo ausente → posiciones abiertas: { extracciones: [{ broker, liquidez|null, total_cuenta|null, posiciones: [...] }] }
// 25/10/2026: modelo de alta resolución (MODEL_VISION), fecha de hoy en el prompt, moneda y gp_pct por fila,
// total_cuenta para cuadrar, columnas del historial de eToro y barra inferior de eToro / cabecera de XTB.
// modo 'cerradas' (13/08/2026) → pantallas de historial/posiciones cerradas:
//   { extracciones: [{ broker, cierres: [{nombre, ticker, invertido, valor_cierre, gp, fecha_cierre, fecha_apertura, apalancamiento}] }] }
// modo 'auto' (24/10/2026, ingesta única del cierre de semana) → UNA captura por llamada; la IA decide
//   si es de posiciones abiertas o de historial y devuelve { tipo: 'abiertas'|'cerradas', extracciones } con
//   el formato del modo correspondiente.

import { anthropic, jsonDe, MODEL_VISION } from './_anthropic.js'

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } }

const PROMPT = `Eres el extractor de datos de BTP (Belar Tracker Pro), el tracker de inversiones de José.
Analiza las capturas de pantalla adjuntas de sus brokers (eToro, XTB y/o IBKR) y extrae TODAS las posiciones visibles.

Devuelve EXCLUSIVAMENTE un JSON con esta forma, sin texto adicional:
{"extracciones":[{"broker":"etoro|xtb|ibkr","liquidez":123.45,"total_cuenta":10730.74,"posiciones":[{"nombre":"NVIDIA Corp","ticker":"NVDA","invertido":1717.08,"valor":1728.69,"gp":11.61,"gp_pct":0.68,"moneda":"USD","apalancamiento":1,"fecha_apertura":"2026-05-14"}]}]}

Reglas:
- broker: dedúcelo por los RÓTULOS de las columnas, no por los colores (xStation también tiene tema claro):
  · XTB (xStation) si ves "Instrumento/Posición", "Valor de apertura", "Beneficio neto", "Swap", "Rollover", "Hora de apertura", "Valor de Mis Operaciones", "Capital disponible", etiquetas de apalancamiento tipo "x2" y números de orden largos (10 dígitos) en las sublíneas.
  · eToro si ves "Invertido", "Beneficio", avatares de CopyTrader o nombres de personas como instrumento.
  · IBKR si ves "Position", "Mkt Value", "Avg Price", "Unrealized P&L" o la interfaz de Client Portal.
  Si no puedes decidirlo con esos rótulos, pon el que más se parezca; José lo corrige en pantalla.
- moneda: la divisa en la que la FILA da sus importes. IBKR escribe la divisa debajo de cada importe ("USD", "EUR", "GBP"): cópiala y NO conviertas nada (BAMNB con "506,40 EUR" → invertido 506.4, moneda "EUR"). eToro y XTB dan los importes en la divisa de la cuenta: "USD".
- invertido = lo que costó abrir la posición; valor = lo que vale AHORA. En la divisa de la fila (campo moneda). Usa punto decimal; IBKR usa coma decimal ("1.546,70" = 1546.70). NO los intercambies: por broker,
  · IBKR: invertido = "Cost Basis" / "Coste base"; valor = "Mkt Value" / "Market Value" / "Valor de mercado". "Avg Price" es precio por acción, NO es el invertido.
  · XTB: invertido = "Valor de apertura"; valor = "Valor". La fila RESUMEN de un instrumento va con su nombre y sin número de orden; las SUBLÍNEAS llevan un número de orden de 10 dígitos y "Comprar". En la fila resumen, "Valor de apertura" es el total invertido de todos sus lotes y "Valor" el total actual: no los mezcles con los de una sublínea.
  · eToro: invertido = "Invertido"; valor = "Valor" o "Valor Neto". La columna "P/L Diario" es el resultado SOLO de hoy: NUNCA es el gp; el gp es la columna "G/P" (en $) y gp_pct la columna "G/P (%)". La vista web "Mi Portafolio" tiene además las columnas "Precio", "Corto" y "Comprar", que son PRECIOS POR UNIDAD (botones de venta/compra): NUNCA los uses como invertido ni como valor, aunque sean las últimas columnas de la fila. Lee "Invertido" (segunda columna) y "Valor Neto" (justo antes de "Corto"). Comprobación: en eToro invertido y valor son importes en dólares del mismo orden de magnitud (cientos o miles); si te salen dos números casi iguales entre sí y muy distintos de "Invertido", has leído precios.
  Comprobación obligatoria antes de responder: invertido + gp = valor. Si te sale al revés, es que los has puesto cambiados; corrígelo.
- gp_pct = el % de G/P de la fila CON SU SIGNO ("G/P (%)" en eToro, "Beneficio neto %" en XTB); en IBKR no hay columna de % de la posición ("% VARIACIÓN" es la del día): null.
- gp = la columna G/P $ / Beneficio neto / PyG no realizadas SI está visible, CON SU SIGNO (negativo si la posición pierde); si no, null. Debe cumplirse invertido + gp = valor. Si no te cuadra, revisa qué columna es cada cosa antes de responder; nunca devuelvas gp con el signo cambiado.
- ticker: el símbolo si aparece; si solo hay nombre comercial, tu mejor conversión a ticker (p.ej. "NVIDIA Corp"→"NVDA"). CopyTraders de eToro: usa el nombre del trader tal cual.
- apalancamiento: x1 si no se indica.
- fecha_apertura: fecha de apertura SI aparece en la captura, en formato YYYY-MM-DD. En XTB es la columna "Hora de apertura" (formato dd.mm.aaaa: el DÍA va primero; "12.08.2026" → "2026-08-12"). Copia el AÑO con sus cuatro cifras tal como aparece: no lo cambies por otro. Si no aparece, null: NO la deduzcas ni pongas la de hoy.
- AGREGACIÓN: si un instrumento aparece con varias sublíneas/lotes (XTB despliega cada orden), devuelve UNA sola posición por instrumento: usa los importes de la fila resumen del instrumento y, como fecha_apertura, la MÁS ANTIGUA de sus lotes. No devuelvas una posición por lote. EXCEPCIÓN: si en la lista de posiciones registradas (al final) el mismo broker y ticker aparece MÁS DE UNA VEZ, son estrategias distintas: devuelve cada lote por separado, con su propio invertido, valor y fecha.
- liquidez: el saldo disponible/cash SI aparece en la captura (mira también la BARRA INFERIOR y la CABECERA de la pantalla, no solo la tabla); si no, null. PUEDE SER NEGATIVA (saldo deudor por margen): respeta el signo, un "-0,31" se devuelve como -0.31, nunca como 0.31 ni como otra cifra de la pantalla. Por broker: eToro "Saldo Total Disponible" / "Disponible" (barra inferior de "Mi Portafolio"); XTB "Capital disponible" (cabecera superior, junto a "Valor de Mis Operaciones"); IBKR "Efectivo liquidado" / "Efectivo total (in USD)" / "Cash". En eToro el saldo disponible NO es "Total Invertido" ni "Ganancia/Pérdida".
- total_cuenta: el valor TOTAL de la cuenta en USD si aparece (sirve para cuadrar): eToro "Valor Total" (barra inferior); XTB "Valor de Mis Operaciones" (cabecera); IBKR el importe junto a "Cuenta" / "Net Liquidation" / "Valor liquidativo". Si no aparece, null. Si no distingues con certeza cuál es el saldo, devuelve null antes que una cifra de otro campo.
- Si una cifra no se lee con certeza, pon null antes que inventarla.
- CRÍTICO: transcribe cada importe dígito a dígito y reléelo antes de escribirlo (confundir un 5 con un 6, o perder los decimales, corrompe la cartera). Ante ambigüedad visual, null.`

// Modo "cerradas" (13/08/2026): pantallas de historial / posiciones cerradas del broker.
// Objetivo: fecha REAL de cierre e importe REAL de salida, que el cierre por ausencia
// en captura no tiene (usa el valor de la última semana).
const PROMPT_CERRADAS = `Eres el extractor de datos de BTP (Belar Tracker Pro), el tracker de inversiones de José.
Las capturas adjuntas son pantallas de POSICIONES CERRADAS / HISTORIAL de sus brokers (eToro, XTB y/o IBKR).
Extrae TODOS los cierres visibles.

Devuelve EXCLUSIVAMENTE un JSON con esta forma, sin texto adicional:
{"extracciones":[{"broker":"etoro|xtb|ibkr","cierres":[{"nombre":"NVIDIA Corp","ticker":"NVDA","invertido":1717.08,"valor_cierre":1925.54,"gp":208.46,"fecha_cierre":"2026-08-11","fecha_apertura":"2026-04-15","gp_pct":12.14,"precio_apertura":149.75,"precio_cierre":184.95,"motivo_broker":"TP","apalancamiento":1}]}]}

Reglas:
- broker: dedúcelo por los RÓTULOS de las columnas y por el formato de las filas, no por los colores. eToro: filas "COMPRAR <ticker>" / "VENDER <ticker>" con un distintivo cuadrado "SL"/"TP" a la izquierda, importes en dólares con coma de miles y punto decimal ("$1,000.00"), unidades, precio y fecha+hora de apertura, precio y fecha+hora de cierre, beneficio en $ y en %; también "Historial"/"Cerradas", "Invertido", "Beneficio". Si ves "COMPRAR"/"VENDER" + ticker o el distintivo SL/TP, es eToro aunque no haya cabecera. XTB (xStation) "Historial de órdenes"/"Posiciones cerradas" con "Valor de apertura", "Beneficio neto", "Hora de cierre"; IBKR muestra "Realized P&L", "Trade History". Si no puedes decidirlo, pon el que más se parezca; José lo corrige en pantalla.
- eToro, historial ("Historial"): las columnas van en este orden: Acción | Invertido | Unidades | Abierto | Hora De Apertura | Cerrado | Hora De Cierre | G/P ($) | G/P (%). "Abierto" y "Cerrado" son PRECIOS POR UNIDAD (precio_apertura y precio_cierre), NUNCA importes; "Unidades" es el número de acciones. invertido = "Invertido"; gp = "G/P ($)"; gp_pct = "G/P (%)"; valor_cierre = invertido + gp. Ticker = la palabra tras "COMPRAR"/"VENDER" en la línea en negrita ("COMPRAR SSL" → "SSL"), letra a letra.
  Las filas "Transferir", "Intereses abonados", "Dividendos", "Comisiones", "Flujos de caja netos", "Depósito" o "Retirada" NO son cierres: ignóralas.
- invertido = lo que costó abrir; valor_cierre = el importe al cerrar (invertido + beneficio realizado). En USD, punto decimal.
- gp = beneficio/pérdida REALIZADA con su signo si está visible; si no, null. Debe cumplirse invertido + gp = valor_cierre; si no cuadra, revisa qué columna es cada cosa.
- Si la pantalla solo da invertido y gp, calcula valor_cierre = invertido + gp. Si solo da valor_cierre y gp, calcula invertido = valor_cierre - gp.
- fecha_cierre: la fecha REAL de cierre en YYYY-MM-DD (XTB usa dd.mm.aaaa: conviértela). Si no aparece, null: NO pongas la de hoy.
- fecha_apertura: si aparece, YYYY-MM-DD; si no, null. Con dos fechas por fila, la primera es la de apertura y la segunda la de cierre (eToro: dd/mm/aaaa hh:mm:ss, el DÍA va primero: "23/10/2026" → "2026-10-23"; "24/08/2026" → "2026-08-24"). La fecha de cierre nunca es anterior a la de apertura.
- gp_pct: el % de beneficio/pérdida de la fila, CON SU SIGNO, si aparece (eToro lo muestra en la última columna); si no, null.
- FECHAS: copia el año tal como aparece, con sus cuatro cifras (las capturas son del año en curso o del anterior); no lo inventes.
- precio_apertura / precio_cierre: precio por unidad de entrada y de salida si aparecen (pueden ir en peniques o en moneda local: cópialos tal cual, sin convertir); si no, null. NO son el invertido ni el valor de cierre.
- motivo_broker: "SL" si la fila lleva el distintivo/etiqueta de stop loss, "TP" si lleva el de take profit; si no hay distintivo, null. No lo deduzcas del resultado.
- ticker: el símbolo si aparece; si solo hay nombre comercial, tu mejor conversión ("NVIDIA Corp"→"NVDA"). CopyTraders de eToro: el nombre del trader tal cual.
- apalancamiento: x1 si no se indica.
- AGREGACIÓN: varias sublíneas/lotes del mismo instrumento cerrados el mismo día = UN cierre con los importes totales. Cierres del mismo instrumento en fechas distintas = cierres separados.
- Si una cifra no se lee con certeza, null antes que inventarla.
- CRÍTICO: transcribe cada importe dígito a dígito y reléelo antes de escribirlo. Ante ambigüedad visual, null.`

// Modo auto: primero clasificar la pantalla, después aplicar las reglas del tipo que toque.
const PROMPT_AUTO = `Eres el extractor de datos de BTP (Belar Tracker Pro). Recibes UNA captura de un broker (eToro, XTB o IBKR).
PASO 1 · Decide qué pantalla es:
- "abiertas": cartera / posiciones abiertas (valor actual, G/P no realizada, "Mi Portafolio", "Posiciones abiertas", "Positions", "Portfolio").
- "cerradas": historial / posiciones cerradas / operaciones cerradas (fecha u hora de CIERRE, beneficio REALIZADO, "Historial", "Cerradas", "Posiciones cerradas", "Historial de órdenes", "Realized P&L", "Trade History").
La captura puede venir RECORTADA, sin cabecera de columnas. Es "cerradas" si las filas llevan DOS fechas (apertura y cierre), un precio de cierre, o un distintivo "SL"/"TP" de cierre (eToro). Una cartera abierta lleva una sola fecha (o ninguna) por fila.
PASO 2 · Extrae con las reglas del tipo elegido (abajo van las dos). Responde EXCLUSIVAMENTE un JSON:
- si es "abiertas": {"tipo":"abiertas","extracciones":[...formato de ABIERTAS...]}
- si es "cerradas": {"tipo":"cerradas","extracciones":[...formato de CERRADAS...]}

===== REGLAS DE ABIERTAS =====
${PROMPT}

===== REGLAS DE CERRADAS =====
${PROMPT_CERRADAS}`

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
    const auto = modo === 'auto'
    const hoy = new Date().toISOString().slice(0, 10)
    const cab = `HOY ES ${hoy}. Las fechas de las capturas son de este año o del anterior.\n\n`
    const content = [
      ...images.slice(0, auto ? 1 : 8).map(im => ({
        type: 'image',
        source: { type: 'base64', media_type: im.media_type || 'image/png', data: im.data },
      })),
      { type: 'text', text: cab + (auto ? PROMPT_AUTO + textoConocidas(conocidas)
        : modo === 'cerradas' ? PROMPT_CERRADAS : PROMPT + textoConocidas(conocidas)) },
    ]
    // Si el modelo de alta resolución no está disponible para la clave, se reintenta con el general (y se avisa en _modelo).
    let msg
    try { msg = await anthropic({ model: MODEL_VISION, max_tokens: 8192, messages: [{ role: 'user', content }] }) }
    catch (e) {
      if (!/model|not_found|not found/i.test(String(e.message || e))) throw e
      msg = await anthropic({ max_tokens: 8192, messages: [{ role: 'user', content }] })
    }
    res.setHeader('Cache-Control', 'no-store')
    const j = jsonDe(msg)
    if (auto && j.tipo !== 'cerradas') j.tipo = 'abiertas'
    j._modelo = msg.model || MODEL_VISION
    res.status(200).json(j)
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}

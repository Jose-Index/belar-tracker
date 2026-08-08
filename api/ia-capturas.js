// BTP · /api/ia-capturas — extrae posiciones de capturas de pantalla de brokers.
// POST { images: [{ data: base64, media_type }] }
// Respuesta: { extracciones: [{ broker, liquidez|null, posiciones: [{nombre, ticker, invertido, valor, apalancamiento}] }] }

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
  · eToro: invertido = "Invertido"; valor = "Valor".
  Comprobación obligatoria antes de responder: invertido + gp = valor. Si te sale al revés, es que los has puesto cambiados; corrígelo.
- gp = la columna G/P $ / Beneficio neto / PyG no realizadas SI está visible, CON SU SIGNO (negativo si la posición pierde); si no, null. Debe cumplirse invertido + gp = valor. Si no te cuadra, revisa qué columna es cada cosa antes de responder; nunca devuelvas gp con el signo cambiado.
- ticker: el símbolo si aparece; si solo hay nombre comercial, tu mejor conversión a ticker (p.ej. "NVIDIA Corp"→"NVDA"). CopyTraders de eToro: usa el nombre del trader tal cual.
- apalancamiento: x1 si no se indica.
- fecha_apertura: fecha de apertura SI aparece en la captura, en formato YYYY-MM-DD. En XTB es la columna "Hora de apertura" (formato dd.mm.aaaa, conviértela). Si no aparece, null: NO la deduzcas ni pongas la de hoy.
- AGREGACIÓN: si un instrumento aparece con varias sublíneas/lotes (XTB despliega cada orden), devuelve UNA sola posición por instrumento: usa los importes de la fila resumen del instrumento y, como fecha_apertura, la MÁS ANTIGUA de sus lotes. No devuelvas una posición por lote.
- liquidez: el saldo disponible/cash SI aparece en la captura; si no, null.
- Si una cifra no se lee con certeza, pon null antes que inventarla.
- CRÍTICO: transcribe cada importe dígito a dígito y reléelo antes de escribirlo (confundir un 5 con un 6, o perder los decimales, corrompe la cartera). Ante ambigüedad visual, null.`

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST' }); return }
  try {
    const { images } = req.body || {}
    if (!images?.length) { res.status(400).json({ error: 'images requerido' }); return }
    const content = [
      ...images.slice(0, 8).map(im => ({
        type: 'image',
        source: { type: 'base64', media_type: im.media_type || 'image/png', data: im.data },
      })),
      { type: 'text', text: PROMPT },
    ]
    const msg = await anthropic({ messages: [{ role: 'user', content }] })
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(jsonDe(msg))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}

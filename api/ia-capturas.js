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
- broker: dedúcelo del diseño de la app (eToro fondo claro/verde con avatares, XTB rojo/oscuro xStation, IBKR sobrio azul/blanco). Si no es deducible usa "etoro".
- invertido = importe invertido/amount/base de coste/valor de apertura; valor = valor actual/neto/de mercado. En USD (moneda operativa). Usa punto decimal.
- gp = la columna G/P $ / Beneficio neto / PyG no realizadas SI está visible (con su signo); si no, null. Sirve de verificación aritmética: invertido + gp = valor.
- ticker: el símbolo si aparece; si solo hay nombre comercial, tu mejor conversión a ticker (p.ej. "NVIDIA Corp"→"NVDA"). CopyTraders de eToro: usa el nombre del trader tal cual.
- apalancamiento: x1 si no se indica.
- fecha_apertura: fecha de apertura de la posición SI aparece en la captura, en formato YYYY-MM-DD (XTB e IBKR suelen mostrarla; eToro la trae en el detalle). Si no aparece, null: NO la deduzcas ni pongas la de hoy.
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

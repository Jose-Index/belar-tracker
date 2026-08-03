// BTP · /api/ia-capturas — extrae posiciones de capturas de pantalla de brokers.
// POST { images: [{ data: base64, media_type }] }
// Respuesta: { extracciones: [{ broker, liquidez|null, posiciones: [{nombre, ticker, invertido, valor, apalancamiento}] }] }

import { anthropic, jsonDe } from './_anthropic.js'

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } }

const PROMPT = `Eres el extractor de datos de BTP (Belar Tracker Pro), el tracker de inversiones de José.
Analiza las capturas de pantalla adjuntas de sus brokers (eToro, XTB y/o IBKR) y extrae TODAS las posiciones visibles.

Devuelve EXCLUSIVAMENTE un JSON con esta forma, sin texto adicional:
{"extracciones":[{"broker":"etoro|xtb|ibkr","liquidez":123.45,"posiciones":[{"nombre":"NVIDIA Corp","ticker":"NVDA","invertido":1717.08,"valor":1728.69,"apalancamiento":1}]}]}

Reglas:
- broker: dedúcelo del diseño de la app (eToro fondo claro/verde con avatares, XTB rojo/oscuro xStation, IBKR sobrio azul/blanco). Si no es deducible usa "etoro".
- invertido = importe invertido/amount; valor = valor actual/market value. En USD (es la moneda operativa). Usa punto decimal.
- ticker: el símbolo si aparece; si solo hay nombre comercial, tu mejor conversión a ticker (p.ej. "NVIDIA Corp"→"NVDA"). CopyTraders de eToro: usa el nombre del trader tal cual.
- apalancamiento: x1 si no se indica.
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

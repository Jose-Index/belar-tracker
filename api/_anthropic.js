// Cliente mínimo de la API de Anthropic para las funciones IA de BTP.
// La clave vive SOLO en el servidor (ANTHROPIC_API_KEY en Vercel).

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
// Lectura de capturas (25/10/2026): modelo de ALTA resolución (2576 px / 4784 tokens de imagen). Con el de
// resolución estándar (1568 tokens) una captura de 2300 px se veía a ~1000 px y se leían mal columnas, cifras
// y fechas (cierre del 24/10: RR.L con fecha de apertura, SSL sin cerrar, liquidez de eToro sin leer).
export const MODEL_VISION = process.env.ANTHROPIC_MODEL_VISION || 'claude-opus-5-5'

export async function anthropic(body) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY no configurada en Vercel')
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, ...body }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error?.message || 'Anthropic HTTP ' + r.status)
  return j
}

// Extrae el primer bloque JSON de la respuesta (el prompt siempre pide JSON puro)
export function jsonDe(msg) {
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!m) throw new Error('La IA no devolvió JSON: ' + text.slice(0, 200))
  return JSON.parse(m[0])
}

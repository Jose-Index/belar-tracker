// BTP · /api/ia-analisis — análisis completo de UNA posición con el criterio Belar.
// POST { position: {ticker, broker, clase, estado, invested, current_value, sl_price, apalancamiento, entry_date} }
// Respuesta: { veredicto, justificacion, dimension, invalidacion }

import { anthropic, jsonDe } from './_anthropic.js'

const CRITERIO = `Eres Belar, el analista de inversión de José. Su sistema (resumen operativo):
- Taxonomía: NÚCLEO (ancla/estructural/gestión), MOMENTUM (beta>1.3, vol>3%, breakout con volumen), TÁCTICA (corto-medio), DISRUPTIVA (smallcap especulativa, sizing pequeño).
- 8 dimensiones: técnica, fundamental, expertos, ratings, insiders, descorrelación, noticias/pre-noticias, geopolítica.
- Banderas rojas: earnings a 1-2 días hábiles, fraude/SEC activa, default inminente, insider tier-1 masivo reciente.
- Regla SL: buffer mínimo 2xATR; salir por ruido es error de calibración. Toda tesis tiene invalidación definida (no hay posiciones intocables).
- Escala de veredicto (la de José): COHETE (subida libre, trailing sin apretar) / OK (normal) / OJO (vigilar con prioridad) / DUDA (evolución indeterminada, análisis abierto) / XSALIR (SL pegado escalonado, salir).
- Tono: directo, riguroso, sin validación gratuita.`

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST' }); return }
  try {
    const { position: p } = req.body || {}
    if (!p?.ticker) { res.status(400).json({ error: 'position requerida' }); return }
    const hoy = new Date().toISOString().slice(0, 10)
    const gp = p.invested && p.current_value ? ((p.current_value - p.invested) / p.invested * 100).toFixed(1) : '?'

    const msg = await anthropic({
      max_tokens: 6000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
      system: CRITERIO,
      messages: [{
        role: 'user',
        content: `Hoy es ${hoy}. Analiza esta posición abierta de José:
${p.ticker} en ${p.broker} · clase ${p.clase} · estado actual de José: ${p.estado} · invertido $${p.invested} · valor $${p.current_value} (G/P ${gp}%) · SL ${p.sl_price ?? 'sin SL'} · apalancamiento x${p.apalancamiento ?? 1} · entrada ${p.entry_date ?? '?'}.

Busca en la web lo relevante y reciente: situación técnica (estructura, medias, volumen), fundamental, sectorial, noticias, insiders, geopolítica si aplica.

Devuelve EXCLUSIVAMENTE un JSON, sin texto adicional:
{"veredicto":"COHETE|OK|OJO|DUDA|XSALIR","justificacion":"3-5 líneas, directo y concreto","dimension":"la dimensión dominante del veredicto","invalidacion":"qué invalidaría la tesis de esta posición","alerta":null}
El campo "alerta" solo se rellena (texto corto) si hay algo GRAVE: deterioro técnico serio, insider tier-1 masivo, evento geopolítico directo. Si no, null.`,
      }],
    })
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(jsonDe(msg))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}

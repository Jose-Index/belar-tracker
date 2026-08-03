// BTP · /api/ia-calendario — eventos próximos por activo (earnings, ex-div, FED/BCE, cripto).
// POST { tickers: ["NVDA","MU",...] }
// Respuesta: { eventos: [{ticker|null, event_date:"YYYY-MM-DD", event_type, titulo}] }

import { anthropic, jsonDe } from './_anthropic.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST' }); return }
  try {
    const { tickers } = req.body || {}
    if (!tickers?.length) { res.status(400).json({ error: 'tickers requerido' }); return }
    const hoy = new Date().toISOString().slice(0, 10)

    const msg = await anthropic({
      max_tokens: 8000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 12 }],
      messages: [{
        role: 'user',
        content: `Hoy es ${hoy}. Cartera de José (BTP): ${tickers.join(', ')}.

Busca en la web y devuelve los eventos de los PRÓXIMOS 30 DÍAS que afecten a estos activos:
- Fechas de earnings confirmadas o estimadas de cada ticker (lo principal; marca "(estimado)" si no está confirmada).
- Ex-dividendos relevantes de estos tickers.
- Próximas reuniones FOMC (FED) y BCE (afectan a toda la cartera; ticker null).
- Eventos cripto relevantes si hay exposición BTC.

Devuelve EXCLUSIVAMENTE un JSON, sin texto adicional:
{"eventos":[{"ticker":"NVDA","event_date":"YYYY-MM-DD","event_type":"earnings|exdiv|fed|bce|cripto|otro","titulo":"NVIDIA Q2 FY27 earnings (AMC, confirmado)"}]}

Solo eventos con fecha >= ${hoy}. Si no encuentras fecha fiable para un ticker, omítelo (mejor omitir que inventar).`,
      }],
    })
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(jsonDe(msg))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}

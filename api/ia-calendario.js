// BTP · /api/ia-calendario — eventos próximos por activo (earnings, ex-div, FED/BCE, cripto).
// POST { tickers: [...], perseguir: [{ticker, event_date, titulo}] }
//   perseguir = eventos ESTIMADOS que deben re-verificarse contra convocatoria oficial.
// Respuesta: { eventos: [{ticker|null, event_date, event_type, titulo, confirmacion, fuente}] }
//
// Regla dura de la casa: un evento solo es "confirmado" si la propia compañía lo ha
// convocado (nota de prensa / sección Investor Relations / 8-K). Los agregadores
// (Zacks, Nasdaq, Investing, MarketBeat, TipRanks...) publican ESTIMACIONES basadas en
// el patrón histórico y se desvían con frecuencia: eso es "estimado", nunca confirmado.

import { anthropic, jsonDe } from './_anthropic.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST' }); return }
  try {
    const { tickers, perseguir } = req.body || {}
    if (!tickers?.length) { res.status(400).json({ error: 'tickers requerido' }); return }
    const hoy = new Date().toISOString().slice(0, 10)

    const bloquePerseguir = perseguir?.length
      ? `\n\nPRIORIDAD MÁXIMA — estos eventos están hoy marcados como ESTIMADOS y hay que
perseguirlos hasta confirmarlos o corregirlos. Para cada uno busca específicamente la
convocatoria oficial de la compañía (web de Investor Relations, nota de prensa, 8-K):
${perseguir.map(e => `- ${e.ticker}: ${e.event_date} · ${e.titulo}`).join('\n')}
Si encuentras convocatoria oficial, devuélvelo con la fecha oficial (aunque cambie) y
confirmacion "confirmado". Si sigue sin haberla, devuélvelo igualmente como "estimado".`
      : ''

    const msg = await anthropic({
      max_tokens: 8000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 18 }],
      messages: [{
        role: 'user',
        content: `Hoy es ${hoy}. Cartera y radar de José (BTP): ${tickers.join(', ')}.

Busca en la web los eventos de los PRÓXIMOS 30 DÍAS que afecten a estos activos:
- Fechas de earnings de cada ticker (lo principal).
- Ex-dividendos relevantes de estos tickers.
- Próximas reuniones FOMC (FED) y BCE (afectan a toda la cartera; ticker null).
- Eventos cripto relevantes si hay exposición BTC.

CLASIFICACIÓN OBLIGATORIA de cada evento en el campo "confirmacion":
- "confirmado" SOLO si la fuente es la propia compañía o el organismo oficial:
  nota de prensa de convocatoria, sección Investor Relations, 8-K de la SEC, o el
  calendario oficial de la FED/BCE. Debe existir una fecha anunciada por ellos.
- "estimado" en TODO lo demás: fechas de agregadores (Zacks, Nasdaq, Investing,
  MarketBeat, TipRanks, StockAnalysis, Yahoo), proyecciones por patrón histórico
  ("suele presentar la primera semana de agosto"), o consenso sin convocatoria.
- "na" para eventos sin noción de confirmación.

En caso de duda: "estimado". Marcar como confirmado algo que no lo está es el peor
error posible de este sistema. En "fuente" pon el dominio de donde sale el dato
(p.ej. "ir.geogroup.com" o "zacks.com"). El campo "titulo" NO debe repetir la palabra
confirmado/estimado: eso ya va en "confirmacion".${bloquePerseguir}

Devuelve EXCLUSIVAMENTE un JSON, sin texto adicional:
{"eventos":[{"ticker":"NVDA","event_date":"YYYY-MM-DD","event_type":"earnings|exdiv|fed|bce|cripto|otro","titulo":"NVIDIA Q2 FY27 earnings (AMC)","confirmacion":"confirmado|estimado|na","fuente":"dominio.com"}]}

Solo eventos con fecha >= ${hoy}. Si no encuentras fecha fiable para un ticker, omítelo
(mejor omitir que inventar).`,
      }],
    })
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(jsonDe(msg))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}

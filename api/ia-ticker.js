// BTP · /api/ia-ticker?q=oro
// Resuelve una descripción en lenguaje natural ("oro", "eurostoxx", "bono USA 10 años")
// al mejor símbolo Yahoo operable. Primero busca candidatos en Yahoo Search;
// la IA elige aplicando el criterio de símbolo canónico de la casa.

import { anthropic, jsonDe } from './_anthropic.js'

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }

async function buscarYahoo(q) {
  const r = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`,
    { headers: UA },
  )
  if (!r.ok) return []
  const j = await r.json()
  return (j.quotes || []).map(x => ({
    symbol: x.symbol, nombre: x.shortname || x.longname || '',
    tipo: x.quoteType, exchange: x.exchDisp || x.exchange || '',
  }))
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  const q = String(req.query.q || '').trim()
  if (!q) { res.status(400).json({ error: 'q requerido' }); return }

  try {
    const candidatos = await buscarYahoo(q)

    // Atajo símbolo exacto: solo si viene tecleado COMO ticker (mayúsculas tal cual).
    // "oro" en minúsculas NO es el ETF "ORO": eso lo decide la IA con el criterio canónico.
    const exacto = q === q.toUpperCase() && candidatos.find(c => c.symbol === q)
    if (exacto) { res.status(200).json({ symbol: exacto.symbol, nombre: exacto.nombre, via: 'exacto' }); return }

    const msg = await anthropic({
      max_tokens: 300,
      system: `Eres el resolutor de símbolos de un tracker de inversión. El usuario describe un activo en lenguaje natural (español o inglés) y debes devolver el MEJOR símbolo de Yahoo Finance, operable y representativo.

Criterio canónico de la casa:
- Materias primas: futuro continuo (oro GC=F, plata SI=F, crudo WTI CL=F, brent BZ=F, gas natural NG=F, cobre HG=F).
- Índices: contado con ^ (S&P 500 ^GSPC, Nasdaq 100 ^NDX, Dow ^DJI, Eurostoxx 50 ^STOXX50E, DAX ^GDAXI, IBEX 35 ^IBEX, Nikkei ^N225).
- Divisas: par =X (EURUSD=X). Cripto: par -USD (BTC-USD, ETH-USD).
- Bonos: rendimiento ^TNX (10a USA), ^FVX (5a), ^TYX (30a).
- Acciones: el listado principal salvo que el usuario indique otra bolsa.
Si hay candidatos de Yahoo, elige de entre ellos salvo que el canónico correcto no esté en la lista (entonces usa tu conocimiento). Responde SOLO JSON: {"symbol":"...","nombre":"nombre legible del activo","duda":"solo si la petición es ambigua, alternativa en texto breve, si no null"}`,
      messages: [{
        role: 'user',
        content: `Petición: "${q}"\nCandidatos Yahoo:\n${JSON.stringify(candidatos, null, 1)}`,
      }],
    })
    const v = jsonDe(msg)

    // Verificación: el símbolo elegido debe cotizar de verdad en Yahoo
    const chk = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(v.symbol)}?range=1d&interval=1d`,
      { headers: UA },
    ).then(x => x.json()).catch(() => null)
    const ok = !!chk?.chart?.result?.[0]?.meta?.regularMarketPrice
    if (!ok) {
      // plan B: primer candidato de Yahoo Search del tipo más razonable
      const alt = candidatos[0]
      if (alt) { res.status(200).json({ symbol: alt.symbol, nombre: alt.nombre, duda: 'la IA propuso ' + v.symbol + ' pero no cotiza; te doy el primer resultado de Yahoo', via: 'fallback' }); return }
      res.status(200).json({ error: `Sin símbolo operable para "${q}"` }); return
    }
    res.status(200).json({ symbol: v.symbol, nombre: v.nombre || '', duda: v.duda || null, via: 'ia' })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
}

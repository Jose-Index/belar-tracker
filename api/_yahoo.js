// BTP · api/_yahoo.js — acceso a Yahoo Finance desde el servidor (30/09/2026).
// Tres puertas:
//  · chart (v8, un símbolo por llamada): sin credenciales. Es la que usan api/quotes y api/history
//    y la única que Yahoo no limita desde las IPs de Vercel (comprobado el 30/09/2026).
//  · spark (v8, 20 símbolos por llamada): desde Vercel devuelve 429 sin cookie+crumb; aquí se pide
//    con sesión y, si aun así falla, se cae a chart símbolo a símbolo (4 en paralelo).
//  · screener (v1/finance/screener) y quote (v7): necesitan cookie + crumb.
//    La cookie sale de fc.yahoo.com y el crumb de /v1/test/getcrumb (mismo patrón que yfinance).
//    Las funciones de Vercel corren en EE. UU. (iad1): sin muro de consentimiento europeo.
// Verificado el 30/09/2026 desde Chrome (campos y límites): screener max 250 por página,
// spark max 20 símbolos por llamada, screener ~0,5 s por página.
// Diagnóstico desde producción: POST /api/universo-refresh?paso=prueba (con BELAR_TOKEN).

// Cabeceras: el User-Agent mínimo es el que usan api/quotes y api/history y Yahoo lo acepta desde Vercel;
// el UA completo de Chrome (sin el resto de cabeceras de un navegador real) recibió 429 en todas las puertas (30/09/2026).
export const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
export const H_CHROME = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9' }

let sesion = null   // { cookie, crumb, at } — cacheada en la instancia mientras viva

export async function sesionYahoo(forzar = false) {
  if (!forzar && sesion && Date.now() - sesion.at < 30 * 60e3) return sesion
  const r1 = await fetch('https://fc.yahoo.com/', { headers: H, redirect: 'manual' })
  const set = typeof r1.headers.getSetCookie === 'function' ? r1.headers.getSetCookie() : [r1.headers.get('set-cookie')].filter(Boolean)
  const cookie = set.map(c => c.split(';')[0]).filter(Boolean).join('; ')
  if (!cookie) throw new Error('yahoo: fc.yahoo.com no devolvió cookie (HTTP ' + r1.status + ')')
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { ...H, Cookie: cookie } })
  const crumb = (await r2.text()).trim()
  if (!r2.ok || !crumb || crumb.length > 40 || crumb.includes('<')) throw new Error('yahoo: crumb no válido (HTTP ' + r2.status + ') ' + crumb.slice(0, 60))
  sesion = { cookie, crumb, at: Date.now() }
  return sesion
}

async function conSesion(fn) {
  let s = await sesionYahoo()
  let r = await fn(s)
  if (r.status === 401 || r.status === 403) { s = await sesionYahoo(true); r = await fn(s) }
  return r
}

// Screener: operands = [{operator:'eq', operands:['region','us']}, …]. Devuelve { total, quotes }.
export async function screener(operands, { size = 250, offset = 0, sortField = 'intradaymarketcap', sortType = 'DESC' } = {}) {
  const body = { size, offset, sortField, sortType, quoteType: 'EQUITY', query: { operator: 'and', operands }, userId: '', userIdType: 'guid' }
  const r = await conSesion(s => fetch(
    `https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(s.crumb)}&lang=en-US&region=US&formatted=false&corsDomain=finance.yahoo.com`,
    { method: 'POST', headers: { ...H, Cookie: s.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  const texto = await r.text()
  let j = null
  try { j = JSON.parse(texto) } catch { throw new Error('screener: respuesta no JSON (HTTP ' + r.status + ') ' + texto.slice(0, 120)) }
  const res = j?.finance?.result?.[0]
  if (!r.ok || !res) throw new Error('screener: HTTP ' + r.status + ' ' + (j?.finance?.error?.description || texto.slice(0, 120)))
  return { total: res.total ?? 0, quotes: res.quotes || [] }
}

// Cotizaciones v7 por lotes (≤100 símbolos): mismos campos que el screener.
export async function quotesV7(symbols) {
  const out = []
  for (let i = 0; i < symbols.length; i += 100) {
    const lote = symbols.slice(i, i + 100)
    const r = await conSesion(s => fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(lote.join(','))}&crumb=${encodeURIComponent(s.crumb)}&lang=en-US&region=US&formatted=false`,
      { headers: { ...H, Cookie: s.cookie } }))
    const j = await r.json().catch(() => null)
    if (!r.ok) throw new Error('quote: HTTP ' + r.status + ' ' + (j?.finance?.error?.description || ''))
    out.push(...(j?.quoteResponse?.result || []))
  }
  return out
}

// Chart v8: serie de cierres de UN símbolo. Devuelve { timestamp:[s], close:[n] }.
export async function chart(symbol, range = '1y', interval = '1d', headers = H) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, { headers })
  const j = await r.json().catch(() => null)
  const res = j?.chart?.result?.[0]
  if (!r.ok || !res) throw new Error('chart ' + symbol + ': HTTP ' + r.status + ' ' + (j?.chart?.error?.description || ''))
  return { timestamp: res.timestamp || [], close: res.indicators?.quote?.[0]?.close || [] }
}

async function enParalelo(items, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]) }))
}

function parseSpark(j) {
  const out = {}
  // Forma nueva: { SYM: {timestamp, close, …} }. Forma antigua: { spark: { result: [{symbol, response:[{timestamp, indicators}]}] } }
  if (j?.spark?.result) {
    for (const x of j.spark.result) {
      const resp = x.response?.[0]
      if (resp) out[x.symbol] = { timestamp: resp.timestamp || [], close: resp.indicators?.quote?.[0]?.close || [] }
    }
  } else {
    for (const [k, v] of Object.entries(j || {})) if (v && Array.isArray(v.timestamp)) out[k] = { timestamp: v.timestamp, close: v.close || [] }
  }
  return out
}

// Un lote de spark (≤20 símbolos), con o sin sesión. Lanza error con el HTTP si falla.
export async function sparkLote(lote, range = '1y', interval = '1d', conSesionYahoo = true) {
  const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(lote.join(','))}&range=${range}&interval=${interval}`
  const r = conSesionYahoo
    ? await conSesion(s => fetch(url + `&crumb=${encodeURIComponent(s.crumb)}`, { headers: { ...H, Cookie: s.cookie } }))
    : await fetch(url, { headers: H })
  if (!r.ok) { const t = await r.text(); throw new Error('spark: HTTP ' + r.status + ' ' + t.slice(0, 120)) }
  return parseSpark(await r.json())
}

// Spark: cierres diarios de hasta 20 símbolos por llamada. Devuelve { symbol: { timestamp:[s], close:[n] } }.
// Si Yahoo rechaza el lote (429 desde Vercel), esos símbolos se piden por chart uno a uno.
export async function spark(symbols, range = '1y', interval = '1d') {
  let out = {}
  const pendientes = []
  let sesionRota = false
  for (let i = 0; i < symbols.length; i += 20) {
    const lote = symbols.slice(i, i + 20)
    try {
      if (sesionRota) throw new Error('sesión rota')
      out = { ...out, ...(await sparkLote(lote, range, interval, true)) }
    } catch (e) {
      if (/cookie|crumb/.test(e.message)) sesionRota = true   // sin sesión no insistimos lote a lote
      pendientes.push(...lote)
    }
  }
  if (pendientes.length) {
    await enParalelo(pendientes, 4, async sym => { try { out[sym] = await chart(sym, range, interval) } catch { /* símbolo sin serie: se omite */ } })
  }
  return out
}

// Tipos de cambio a USD (1 unidad de moneda = x USD) para convertir capitalizaciones.
export async function tiposCambioUSD() {
  const pares = { EUR: 'EURUSD=X', GBP: 'GBPUSD=X', JPY: 'JPY=X', KRW: 'KRW=X', HKD: 'HKD=X', CNY: 'CNY=X', CHF: 'CHF=X',
    SEK: 'SEK=X', DKK: 'DKK=X', NOK: 'NOK=X', PLN: 'PLN=X', CAD: 'CAD=X', AUD: 'AUDUSD=X', SGD: 'SGD=X', TWD: 'TWD=X', INR: 'INR=X', BRL: 'BRL=X', MXN: 'MXN=X', ZAR: 'ZAR=X', ILS: 'ILS=X', CZK: 'CZK=X', HUF: 'HUF=X', NZD: 'NZDUSD=X' }
  const fx = { USD: 1 }
  const s = await spark(Object.values(pares), '5d', '1d')
  for (const [moneda, sym] of Object.entries(pares)) {
    const serie = s[sym]?.close?.filter(v => v != null)
    const v = serie?.length ? serie.at(-1) : null
    if (!v) continue
    // EURUSD=X, GBPUSD=X, AUDUSD=X, NZDUSD=X ya son "USD por unidad"; el resto (JPY=X…) es "unidades por USD"
    fx[moneda] = /USD=X$/.test(sym) ? v : 1 / v
  }
  fx.GBp = fx.GBP != null ? fx.GBP / 100 : null   // peniques
  fx.ZAc = fx.ZAR != null ? fx.ZAR / 100 : null
  fx.ILA = fx.ILS != null ? fx.ILS / 100 : null
  return fx
}

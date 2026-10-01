// BTP · GET /api/universo — consulta del universo del Buscador (Tesis JOSE −11/+23,5).
// Filtros en servidor (PostgREST) sobre la tabla `universo` que rellena /api/universo-refresh.
// Sin auth: son datos públicos de mercado (como /api/quotes). Sin caché.
//   mercado=US,EU,CN,JPKR,OTROS   cap=MG,M,P (MG ≥10 B$ · M 2-10 B$ · P <2 B$)
//   pe_campo=fwd|ttm&pe_min=8&pe_max=25&pe_na=1   sector=Technology,Healthcare…   rating=FC,C&rating_na=1 (antes rating_max=2.5)
//   earn_dias=15 (excluye resultados a ≤N días; 0 = no filtra)   ma50=1  ma200=1  p3m=1
//   q=texto (símbolo o nombre)   orden=cap_usd.desc   limite=300 (máx. 1000)   estado=1 (solo estado del refresco)

import { rest, contar, sinCache, ahora } from './_belar.js'

const MERCADOS = ['US', 'EU', 'CN', 'JPKR', 'OTROS']

const CAPS = { MG: ['cap_usd.gte.10000000000'], M: ['cap_usd.gte.2000000000', 'cap_usd.lt.10000000000'], P: ['cap_usd.lt.2000000000'] }
const csv = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean)
const lit = v => `"${String(v).replace(/"/g, '')}"`

export default async function handler(req, res) {
  sinCache(res)
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET' }); return }
  const p = req.query
  try {
    if (String(p.estado || '') === '1') {
      // Recuentos exactos por mercado (Content-Range): el max-rows de 1000 de Supabase no los recorta
      const [st, ...cuentas] = await Promise.all([
        rest(`app_state?select=value,updated_at&key=eq.universo_refresh`),
        ...MERCADOS.map(m => contar(`universo?select=symbol&activo=eq.true&market=eq.${m}`)),
      ])
      const porMercado = Object.fromEntries(MERCADOS.map((m, i) => [m, cuentas[i]]))
      const total = cuentas.reduce((a, b) => a + b, 0)
      res.status(200).json({ estado: st?.[0]?.value || null, total, por_mercado: porMercado, served_at: ahora() }); return
    }

    const f = ['activo=eq.true']
    const mercados = csv(p.mercado)
    if (mercados.length && !mercados.includes('TODOS')) f.push(`market=in.(${mercados.map(lit).join(',')})`)
    const caps = csv(p.cap).filter(c => CAPS[c])
    if (caps.length && caps.length < 3) {
      const partes = caps.map(c => CAPS[c].length > 1 ? `and(${CAPS[c].join(',')})` : CAPS[c][0])
      f.push(`or=(${partes.join(',')})`)
    }
    const peMin = p.pe_min !== undefined && p.pe_min !== '' ? Number(p.pe_min) : null
    const peMax = p.pe_max !== undefined && p.pe_max !== '' ? Number(p.pe_max) : null
    const peCol = String(p.pe_campo || '') === 'fwd' ? 'pe_forward' : 'pe_trailing'   // 01/10/2026: PER futuro por defecto
    if (peMin != null || peMax != null) {
      const cond = []
      if (peMin != null) cond.push(`${peCol}.gte.${peMin}`)
      if (peMax != null) cond.push(`${peCol}.lte.${peMax}`)
      if (String(p.pe_na || '') === '1') f.push(`or=(${peCol}.is.null,${cond.length > 1 ? `and(${cond.join(',')})` : cond[0]})`)
      else for (const c of cond) f.push(c.replace('.', '='))   // pe_trailing.gte.10 → pe_trailing=gte.10
    }
    const sectores = csv(p.sector)
    if (sectores.length) f.push(`sector=in.(${sectores.map(lit).join(',')})`)
    // rating=FC,C,N,V,FV — tramos independientes (01/10/2026)
    const TRAMOS = { FC: 'rating.lte.1.5', C: 'and(rating.gt.1.5,rating.lte.2.5)', N: 'and(rating.gt.2.5,rating.lte.3.5)',
                     V: 'and(rating.gt.3.5,rating.lte.4.5)', FV: 'rating.gt.4.5' }
    const tramos = csv(p.rating).filter(t => TRAMOS[t])
    if (tramos.length && tramos.length < 5) {
      const conds = tramos.map(t => TRAMOS[t])
      if (String(p.rating_na || '') === '1') conds.push('rating.is.null')
      f.push(`or=(${conds.join(',')})`)
    } else if (p.rating_max !== undefined && p.rating_max !== '') {
      const r = Number(p.rating_max)
      f.push(String(p.rating_na || '') === '1' ? `or=(rating.is.null,rating.lte.${r})` : `rating=lte.${r}`)
    }
    const earn = Number(p.earn_dias || 0)
    if (earn > 0) {
      const hoy = new Date(), lim = new Date(Date.now() + earn * 86400e3)
      const d = x => x.toISOString().slice(0, 10)
      f.push(`or=(earnings_date.is.null,earnings_date.lt.${d(hoy)},earnings_date.gt.${d(lim)})`)
    }
    if (String(p.ma50 || '') === '1') f.push('dist_ma50=gt.0')
    if (String(p.ma200 || '') === '1') f.push('dist_ma200=gt.0')
    if (String(p.p3m || '') === '1') f.push('perf_3m=gt.0')
    if (p.q) {
      const t = String(p.q).replace(/[%,()]/g, '').trim()
      if (t) f.push(`or=(symbol.ilike.*${t}*,name.ilike.*${t}*)`)
    }
    const mo = String(p.orden || '').match(/^([a-z0-9_]+)\.(asc|desc)$/)
    const orden = mo ? `${mo[1]}.${mo[2]}` : 'cap_usd.desc'
    const limite = Math.min(1000, Math.max(1, Number(p.limite) || 300))
    const filas = await rest(`universo?select=*&${f.join('&')}&order=${orden}.nullslast&limit=${limite}`)
    res.status(200).json({ n: filas.length, limite, filas, served_at: ahora() })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), served_at: ahora() })
  }
}

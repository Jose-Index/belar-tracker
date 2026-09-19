// BTP · api/_belar.js — helpers compartidos de las rutas Belar (lectura/escritura por token)
// Reglas de oro: clave secreta de Supabase SOLO aquí (servidor). Nunca en el navegador.
// Variables de entorno en Vercel: SUPABASE_SECRET_KEY, BELAR_TOKEN, (VITE_)SUPABASE_URL.

import { timingSafeEqual } from 'node:crypto'

const limpia = v => String(v || '').trim().replace(/^["']|["']$/g, '')
export const SUPABASE_URL = limpia(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, '')
const SECRET = limpia(process.env.SUPABASE_SECRET_KEY)
const TOKEN = limpia(process.env.BELAR_TOKEN)
// Clave secreta antigua (JWT service_role, empieza por eyJ) → apikey + Authorization Bearer.
// Clave secreta nueva (sb_secret_…) → solo apikey; un Bearer no-JWT hace que la pasarela responda "Invalid API key".
const cabecerasSupabase = () => SECRET.startsWith('eyJ')
  ? { apikey: SECRET, Authorization: `Bearer ${SECRET}` }
  : { apikey: SECRET }

// Compara tokens en tiempo constante.
function iguales(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''))
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

// Autoriza la petición. Devuelve null si OK, o el mensaje de error.
export function autorizar(req) {
  if (!TOKEN || !SECRET || !SUPABASE_URL) return 'servidor sin configurar (BELAR_TOKEN / SUPABASE_SECRET_KEY / SUPABASE_URL)'
  const auth = String(req.headers['authorization'] || '')
  const dado = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.headers['x-belar-token'] || '')
  return iguales(dado, TOKEN) ? null : 'no autorizado'
}

// Llamada a PostgREST con la clave secreta (service role): salta el RLS.
export async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    ...cabecerasSupabase(),
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  }
  if (prefer) headers.Prefer = prefer
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const texto = await r.text()
  let datos = null
  try { datos = texto ? JSON.parse(texto) : null } catch { datos = texto }
  if (!r.ok) throw new Error(`Supabase ${r.status} en ${path}: ${typeof datos === 'string' ? datos : JSON.stringify(datos)} [clave ${SECRET.slice(0, 10)}… len=${SECRET.length}]`)
  return datos
}

// Esquema real (tabla → columnas) leído del OpenAPI de PostgREST. Sin suposiciones.
export async function esquema() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { ...cabecerasSupabase(), Accept: 'application/openapi+json' },
  })
  if (!r.ok) throw new Error('no se pudo leer el esquema: HTTP ' + r.status)
  const j = await r.json()
  const defs = j.definitions || {}
  const out = {}
  for (const [tabla, def] of Object.entries(defs)) {
    out[tabla] = Object.entries(def.properties || {}).map(([col, p]) => ({
      col, tipo: p.format || p.type || '?', requerida: (def.required || []).includes(col),
    }))
  }
  return out
}

export function sinCache(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
}

export const ahora = () => new Date().toISOString()

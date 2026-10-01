// BTP · Caché compartida con revalidación en segundo plano (stale-while-revalidate), 01/10/2026.
// Objetivo: que cada pantalla pinte al instante con el último dato conocido y se actualice sola.
//  · Memoria compartida entre componentes (Inicio y Posiciones comparten "posiciones", etc.).
//  · Instantánea opcional en localStorage para el primer pintado tras recargar la pestaña.
//  · Una sola petición en vuelo por clave aunque la pidan varios componentes a la vez.
//  · Revalidación al volver a la pestaña (visibilitychange/focus) si el dato ha caducado.
//  · Estado global (última actualización, cargas en curso) para el indicador de la cabecera.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

const LS = 'btp-cache:'
const mem = new Map()        // key -> { data, at, promise, error, persist }
const subs = new Map()       // key -> Set<fn>
const globales = new Set()   // fn() para el estado global
let enVuelo = 0

function avisar(key) { subs.get(key)?.forEach(fn => { try { fn() } catch { /* nada */ } }); avisarGlobal() }
function avisarGlobal() { globales.forEach(fn => { try { fn() } catch { /* nada */ } }) }

function leerLS(key) {
  try {
    const j = JSON.parse(localStorage.getItem(LS + key) || 'null')
    return j && typeof j.at === 'number' ? j : null
  } catch { return null }
}
function escribirLS(key, data, at) {
  try { localStorage.setItem(LS + key, JSON.stringify({ at, data })) } catch { /* cuota llena: se ignora */ }
}

export function entrada(key, persist = false) {
  let e = mem.get(key)
  if (!e) {
    e = { data: undefined, at: 0, promise: null, error: null, persist }
    if (persist) { const s = leerLS(key); if (s) { e.data = s.data; e.at = s.at; e.deLS = true } }
    mem.set(key, e)
  }
  return e
}

export function fijar(key, data, { persist } = {}) {
  const e = entrada(key, persist)
  e.data = data; e.at = Date.now(); e.error = null; e.deLS = false
  if (persist ?? e.persist) escribirLS(key, data, e.at)
  avisar(key)
}

// Carga (o devuelve la caché si es fresca). ttl en ms. forzar = ignora la frescura.
export function cargar(key, loader, { ttl = 60e3, forzar = false, persist = false } = {}) {
  const e = entrada(key, persist)
  if (persist) e.persist = true
  const fresco = e.data !== undefined && !e.deLS && Date.now() - e.at < ttl
  if (!forzar && fresco) return Promise.resolve(e.data)
  if (e.promise) return e.promise
  enVuelo++; avisarGlobal()
  e.promise = Promise.resolve()
    .then(loader)
    .then(data => { fijar(key, data, { persist: e.persist }); return data })
    .catch(err => { e.error = err; avisar(key); if (e.data !== undefined) return e.data; throw err })
    .finally(() => { e.promise = null; enVuelo--; avisarGlobal() })
  return e.promise
}

// Marca como caducadas las claves que empiecen por el prefijo (o la lista) y avisa; el siguiente
// uso vuelve a cargar. Útil tras escribir (alta, cierre de semana, edición de SL).
export function invalidar(prefijos) {
  const lista = Array.isArray(prefijos) ? prefijos : [prefijos]
  for (const [k, e] of mem) if (lista.some(p => k === p || k.startsWith(p + ':') || k.startsWith(p))) { e.at = 0; avisar(k) }
}

export function ultimaActualizacion() {
  let max = 0
  for (const e of mem.values()) if (!e.deLS && e.at > max) max = e.at
  return max
}
export function cargando() { return enVuelo > 0 }

// Hook: dato compartido con revalidación. loader debe ser estable (useCallback) o pasar deps.
export function useCache(key, loader, { ttl = 60e3, persist = false, activo = true, deps = [] } = {}) {
  const e = entrada(key, persist)
  const [, tick] = useState(0)
  const loaderRef = useRef(loader); loaderRef.current = loader

  const recargar = useCallback((forzar = true) => cargar(key, () => loaderRef.current(), { ttl, forzar, persist }).catch(() => {}), [key, ttl, persist])

  useEffect(() => {
    if (!subs.has(key)) subs.set(key, new Set())
    // Al avisar: repintar y, si la clave ha sido invalidada (at = 0) y nadie la está cargando, recargar
    const fn = () => { tick(t => t + 1); const e = mem.get(key); if (activo && e && e.at === 0 && !e.promise) recargar(false) }
    subs.get(key).add(fn)
    return () => { subs.get(key)?.delete(fn) }
  }, [key, activo, recargar])

  useEffect(() => {
    if (!activo) return
    recargar(false)
    const alVolver = () => { if (document.visibilityState === 'visible') recargar(false) }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => { document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('focus', alVolver) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, activo, ...deps])

  const cur = mem.get(key)
  return { data: cur?.data, at: cur?.at || 0, error: cur?.error || null, cargando: !!cur?.promise, viejo: !!cur?.deLS, recargar }
}

// Hook: sondeo periódico (precios). intervalo(data) puede ser función del dato (p. ej. 60 s con mercado abierto).
export function useSondeo(key, loader, { intervalo = 60e3, persist = false, activo = true, deps = [] } = {}) {
  const r = useCache(key, loader, { ttl: typeof intervalo === 'function' ? 15e3 : intervalo, persist, activo, deps })
  const { recargar } = r
  useEffect(() => {
    if (!activo) return
    let timer
    const programar = () => {
      const ms = typeof intervalo === 'function' ? intervalo(mem.get(key)?.data) : intervalo
      timer = setTimeout(async () => { if (document.visibilityState === 'visible') await recargar(true); programar() }, ms)
    }
    programar()
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, activo, ...deps])
  return r
}

// Estado global para la cabecera: última actualización y si hay cargas en curso.
export function useEstadoDatos() {
  const subscribe = useCallback(fn => { globales.add(fn); return () => globales.delete(fn) }, [])
  const snap = useSyncExternalStore(subscribe, () => `${ultimaActualizacion()}|${enVuelo}`)
  const [at, n] = snap.split('|')
  return { at: Number(at), cargando: Number(n) > 0 }
}

// Refresco global: fuerza la recarga de todas las claves suscritas en pantalla.
export function refrescarTodo() {
  for (const [k, e] of mem) if (subs.get(k)?.size) { e.at = 0; avisar(k) }
}

// ¿Pantalla de móvil? Mismo punto de corte que el CSS (≤ 900 px). 01/10/2026.
import { useEffect, useState } from 'react'

const MQ = '(max-width: 900px)'
const mql = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MQ) : null)

export function useMovil() {
  const [movil, setMovil] = useState(() => !!mql()?.matches)
  useEffect(() => {
    const m = mql(); if (!m) return
    const fn = e => setMovil(e.matches)
    m.addEventListener('change', fn)
    return () => m.removeEventListener('change', fn)
  }, [])
  return movil
}

// Bloquea el scroll del fondo mientras una hoja está abierta (móvil)
export function useSinScroll(activo) {
  useEffect(() => {
    if (!activo) return
    document.body.classList.add('sin-scroll')
    return () => document.body.classList.remove('sin-scroll')
  }, [activo])
}

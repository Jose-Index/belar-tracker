// ¿Pantalla de móvil? Mismo punto de corte que el CSS (≤ 900 px). 01/10/2026.
import { useEffect, useRef, useState } from 'react'

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

// Cerrar una hoja arrastrándola hacia abajo (móvil). Devuelve los manejadores táctiles para el
// contenedor de la hoja: solo arranca con la hoja en lo alto de su scroll, sigue el dedo y cierra
// si el desplazamiento supera el umbral; si no, vuelve a su sitio.
export function useArrastreCierre(onClose, { umbral = 90 } = {}) {
  const s = useRef({ y0: 0, dy: 0, activo: false })
  const onTouchStart = e => {
    if (!mql()?.matches || e.currentTarget.scrollTop > 0) return
    s.current = { y0: e.touches[0].clientY, dy: 0, activo: true }
  }
  const onTouchMove = e => {
    if (!s.current.activo) return
    const el = e.currentTarget
    const dy = Math.max(0, e.touches[0].clientY - s.current.y0)
    s.current.dy = dy
    el.style.transition = 'none'
    el.style.transform = dy ? `translateY(${dy}px)` : ''
  }
  const onTouchEnd = e => {
    if (!s.current.activo) return
    const el = e.currentTarget
    s.current.activo = false
    el.style.transition = 'transform .18s ease-out'
    if (s.current.dy > umbral) { el.style.transform = 'translateY(110%)'; setTimeout(onClose, 170) }
    else el.style.transform = ''
  }
  return { onTouchStart, onTouchMove, onTouchEnd }
}

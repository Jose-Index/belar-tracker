import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import Inicio from './pages/Inicio.jsx'
import Historico from './pages/Historico.jsx'
import Fuentes from './pages/Fuentes.jsx'
import Buscador from './pages/Buscador.jsx'
import Repositorio from './pages/Repositorio.jsx'
import Alertas from './pages/Alertas.jsx'
import Patrimonio from './pages/Patrimonio.jsx'
import Calendario from './pages/Calendario.jsx'
import Herramientas from './pages/Herramientas.jsx'
import Sandbox from './pages/Sandbox.jsx'
import FooterFrase from './components/FooterFrase.jsx'
import EstadoDatos from './components/EstadoDatos.jsx'
import { useArrastreCierre } from './lib/movil'

// Iconos de línea (24×24, trazo 2) para la barra inferior del móvil
const ICONOS = {
  inicio: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  buscador: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  alertas: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  mas: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
}
const Icono = ({ id }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONOS[id]}
  </svg>
)

const MENU = [
  { to: '/', label: 'Inicio', end: true, icono: 'inicio', movil: true },
  { to: '/buscador', label: 'Buscador', icono: 'buscador', movil: true },
  { to: '/alertas', label: 'Alertas', icono: 'alertas', movil: true },
  { to: '/calendario', label: 'Calendario', icono: 'calendario', movil: true },
  { to: '/historico', label: 'Histórico' },
  { to: '/repositorio', label: 'Repositorio' },
  { to: '/patrimonio', label: 'Patrimonio €' },
  { to: '/fuentes', label: 'Fuentes' },
  { to: '/herramientas', label: 'Herramientas' },
]
const PRINCIPALES = MENU.filter(m => m.movil)
const SECUNDARIOS = MENU.filter(m => !m.movil)

export default function App() {
  const [mas, setMas] = useState(false)
  const loc = useLocation()
  useEffect(() => { setMas(false) }, [loc.pathname])   // cerrar la hoja "Más" al navegar
  useEffect(() => { document.body.classList.toggle('sin-scroll', mas); return () => document.body.classList.remove('sin-scroll') }, [mas])
  const enSecundario = SECUNDARIOS.some(m => loc.pathname.startsWith(m.to))
  const arrastre = useArrastreCierre(() => setMas(false))

  return (
    <div className="app">
      {/* Escritorio: menú lateral */}
      <nav className="menu" aria-label="Secciones">
        <div className="brand">
          <img src="/favicon.svg" alt="" />
          <span>BTP<span className="pro">·Pro</span></span>
        </div>
        {MENU.map(m => (
          <NavLink key={m.to} to={m.to} end={m.end}
            className={({ isActive }) => 'item' + (isActive ? ' active' : '')}>
            {m.label}
          </NavLink>
        ))}
        <div className="menu-pie"><EstadoDatos /></div>
      </nav>

      {/* Móvil: cabecera compacta con estado de datos */}
      <header className="cabecera-movil">
        <NavLink to="/" className="brand" aria-label="Inicio"><img src="/favicon.svg" alt="" /><span>BTP<span className="pro">·Pro</span></span></NavLink>
        <EstadoDatos compacto />
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/posiciones" element={<Inicio />} />
          <Route path="/buscador" element={<Buscador />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/repositorio" element={<Repositorio />} />
          <Route path="/alertas" element={<Alertas />} />
          <Route path="/patrimonio" element={<Patrimonio />} />
          <Route path="/calendario" element={<Calendario />} />
          <Route path="/fuentes" element={<Fuentes />} />
          <Route path="/herramientas" element={<Herramientas />} />
          <Route path="/sandbox" element={<Sandbox />} />
        </Routes>
      </main>

      <FooterFrase />

      {/* Móvil: barra inferior de pestañas + hoja "Más" */}
      <nav className="tabs-movil" aria-label="Secciones">
        {PRINCIPALES.map(m => (
          <NavLink key={m.to} to={m.to} end={m.end} className={({ isActive }) => 'tab' + (isActive && !mas ? ' active' : '')}>
            <Icono id={m.icono} /><span>{m.label}</span>
          </NavLink>
        ))}
        <button type="button" className={'tab' + (mas || enSecundario ? ' active' : '')} onClick={() => setMas(v => !v)} aria-expanded={mas}>
          <Icono id="mas" /><span>Más</span>
        </button>
      </nav>
      {mas && (
        <div className="hoja-fondo" onClick={() => setMas(false)}>
          <div className="hoja hoja-mas" role="dialog" aria-label="Más secciones" onClick={e => e.stopPropagation()} {...arrastre}>
            <div className="hoja-asa" aria-hidden="true" />
            {SECUNDARIOS.map(m => (
              <NavLink key={m.to} to={m.to} className={({ isActive }) => 'hoja-item' + (isActive ? ' active' : '')}>{m.label}</NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

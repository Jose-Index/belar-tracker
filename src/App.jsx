import { Routes, Route, NavLink } from 'react-router-dom'
import Inicio from './pages/Inicio.jsx'
import Posiciones from './pages/Posiciones.jsx'
import Repositorio from './pages/Repositorio.jsx'
import Alertas from './pages/Alertas.jsx'
import Patrimonio from './pages/Patrimonio.jsx'
import Calendario from './pages/Calendario.jsx'
import Herramientas from './pages/Herramientas.jsx'
import Sandbox from './pages/Sandbox.jsx'
import FooterFrase from './components/FooterFrase.jsx'

const MENU = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/posiciones', label: 'Posiciones' },
  { to: '/repositorio', label: 'Repositorio' },
  { to: '/alertas', label: 'Alertas' },
  { to: '/patrimonio', label: 'Patrimonio €' },
  { to: '/calendario', label: 'Calendario' },
  { to: '/herramientas', label: 'Herramientas' },
]

export default function App() {
  return (
    <div className="app">
      <nav className="menu">
        <div className="brand">
          <img src="/favicon.svg" alt="BTP" />
          <span>BTP<span className="pro">·Pro</span></span>
        </div>
        {MENU.map(m => (
          <NavLink key={m.to} to={m.to} end={m.end}
            className={({ isActive }) => 'item' + (isActive ? ' active' : '')}>
            {m.label}
          </NavLink>
        ))}
      </nav>

      <main className="content">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/posiciones" element={<Posiciones />} />
          <Route path="/repositorio" element={<Repositorio />} />
          <Route path="/alertas" element={<Alertas />} />
          <Route path="/patrimonio" element={<Patrimonio />} />
          <Route path="/calendario" element={<Calendario />} />
          <Route path="/herramientas" element={<Herramientas />} />
          <Route path="/sandbox" element={<Sandbox />} />
        </Routes>
      </main>

      <FooterFrase />
    </div>
  )
}

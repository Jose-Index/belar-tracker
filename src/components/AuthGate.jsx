import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './authgate.css'

// Puerta de acceso por enlace mágico: sin contraseñas.
// La seguridad real vive en RLS (políticas atadas al email de José).
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = comprobando
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [modo, setModo] = useState('enlace')        // 'enlace' | 'password'
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function enviar(e) {
    e.preventDefault()
    setBusy(true); setErr(null)
    if (modo === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (error) setErr(error.message === 'Invalid login credentials' ? 'Credenciales no válidas' : error.message)
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) setErr(error.message.includes('rate limit') ? 'Límite de correos alcanzado — espera una hora o entra con contraseña.' : error.message)
      else setSent(true)
    }
    setBusy(false)
  }

  // Bypass SOLO en desarrollo local (nunca llega a producción)
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS) return children

  if (session === undefined) return null
  if (session) return children

  return (
    <div className="auth-wrap">
      <form className="auth-card card" onSubmit={enviar}>
        <div className="auth-brand">
          <img src="/favicon.svg" alt="" />
          <div>Belar Tracker <span>Pro</span></div>
        </div>
        {sent ? (
          <p className="auth-ok">Enlace enviado a <b>{email}</b>.<br />
            Ábrelo desde este dispositivo y entrarás directo.</p>
        ) : (
          <>
            <input type="email" placeholder="Email" autoComplete="username"
                   value={email} onChange={e => setEmail(e.target.value)} required />
            {modo === 'password' && (
              <input type="password" placeholder="Contraseña" autoComplete="current-password"
                     value={pass} onChange={e => setPass(e.target.value)} required />
            )}
            {err && <p className="auth-err">{err}</p>}
            <button disabled={busy}>
              {busy ? 'Un momento…' : modo === 'password' ? 'Entrar' : 'Enviarme enlace de acceso'}
            </button>
            <a className="auth-alt" onClick={() => { setModo(m => m === 'password' ? 'enlace' : 'password'); setErr(null) }}>
              {modo === 'password' ? 'Prefiero el enlace por correo' : 'Prefiero usar contraseña'}
            </a>
          </>
        )}
      </form>
    </div>
  )
}

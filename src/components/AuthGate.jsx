import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './authgate.css'

// Puerta de acceso por enlace mágico: sin contraseñas.
// La seguridad real vive en RLS (políticas atadas al email de José).
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = comprobando
  const [email, setEmail] = useState('')
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setErr(error.message)
    else setSent(true)
    setBusy(false)
  }

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
            {err && <p className="auth-err">{err}</p>}
            <button disabled={busy}>{busy ? 'Enviando…' : 'Enviarme enlace de acceso'}</button>
          </>
        )}
      </form>
    </div>
  )
}

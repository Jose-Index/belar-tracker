import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Herramientas() {
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function definir(e) {
    e.preventDefault()
    if (pass.length < 8) { setMsg({ err: true, t: 'Mínimo 8 caracteres.' }); return }
    if (pass !== pass2) { setMsg({ err: true, t: 'No coinciden.' }); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pass })
    setBusy(false)
    if (error) setMsg({ err: true, t: error.message })
    else { setMsg({ err: false, t: 'Contraseña guardada. Ya puedes entrar con email + contraseña en cualquier navegador.' }); setPass(''); setPass2('') }
  }

  async function salir() {
    await supabase.auth.signOut()
  }

  return (
    <div>
      <h1>Herramientas</h1>

      <div className="card" style={{ maxWidth: 420, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Acceso con contraseña</h3>
        <p style={{ fontSize: 13, color: 'var(--texto-sec)' }}>
          Define una contraseña para entrar sin depender del enlace por correo
          (útil en Chrome y móvil). La escribes solo tú.
        </p>
        <form onSubmit={definir} style={{ display: 'grid', gap: 10 }}>
          <input type="password" placeholder="Nueva contraseña" autoComplete="new-password"
                 value={pass} onChange={e => setPass(e.target.value)}
                 style={inp} />
          <input type="password" placeholder="Repítela" autoComplete="new-password"
                 value={pass2} onChange={e => setPass2(e.target.value)}
                 style={inp} />
          {msg && <p style={{ margin: 0, fontSize: 13, color: msg.err ? 'var(--baja)' : 'var(--alza)' }}>{msg.t}</p>}
          <button className="btn-primario" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Sesión</h3>
        <button className="btn-sec" onClick={salir}>Cerrar sesión en este navegador</button>
      </div>

      <p className="placeholder" style={{ marginTop: 18 }}>
        Próximamente: Calculadora · Editor de frases · Fuentes · Backup versionado
      </p>
    </div>
  )
}

const inp = {
  font: 'inherit', fontSize: 14, padding: '9px 11px',
  borderRadius: 8, border: '1px solid var(--borde)',
}

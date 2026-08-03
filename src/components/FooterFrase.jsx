import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Frase del día: rotación DIARIA (misma frase todo el día), del fondo curado + frases de José.
export default function FooterFrase() {
  const [frase, setFrase] = useState(null)

  useEffect(() => {
    supabase.from('frases').select('texto,autor').eq('activa', true)
      .then(({ data }) => {
        if (!data?.length) return
        const day = Math.floor(Date.now() / 86400000)
        setFrase(data[day % data.length])
      })
  }, [])

  return (
    <footer className="footer-frase">
      {frase ? (
        <>
          <span>“{frase.texto}”</span>
          {frase.autor && <span className="autor">— {frase.autor}</span>}
        </>
      ) : (
        <span className="autor">BTP · Belar Tracker Pro</span>
      )}
    </footer>
  )
}

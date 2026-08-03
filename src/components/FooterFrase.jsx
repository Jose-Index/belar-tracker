import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Frase aleatoria en CADA carga/refresco (decisión José 03/08), del fondo curado + suyas.
export default function FooterFrase() {
  const [frase, setFrase] = useState(null)

  useEffect(() => {
    supabase.from('frases').select('texto,autor').eq('activa', true)
      .then(({ data }) => {
        if (!data?.length) return
        setFrase(data[Math.floor(Math.random() * data.length)])
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

// Fuentes de Belar — portadas del BTracker. Cada una apunta a su sección útil.
import { useState } from 'react'
import { FUENTES } from '../lib/fuentes'
import './inicio.css'

const TAG_COL = {
  gratis: { bg: '#F0FAF3', fg: '#16A34A' },
  pago: { bg: '#FEF7EA', fg: '#B26B00' },
  freemium: { bg: '#EAF0FE', fg: '#2E6BF6' },
}

export default function Fuentes() {
  const [tag, setTag] = useState('TODAS')
  const total = FUENTES.reduce((a, s) => a + s.items.length, 0)

  return (
    <div>
      <h1>Fuentes <span className="hist-n num">{total} · organizadas por periodicidad y tema</span></h1>

      <div className="divisa-toggle" style={{ marginBottom: 14 }}>
        {['TODAS', 'gratis', 'freemium', 'pago'].map(t => (
          <button key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(t)}>{t}</button>
        ))}
      </div>

      {FUENTES.map(sec => {
        const items = tag === 'TODAS' ? sec.items : sec.items.filter(i => i.tag === tag)
        if (!items.length) return null
        return (
          <div key={sec.key} className="card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginTop: 0 }}>
              {sec.title} <span className="hist-n num">{sec.subtitle}</span>
            </h3>
            <div className="fuentes-grid">
              {items.map(i => (
                <a key={i.url} className="fuente-card" href={i.url} target="_blank" rel="noopener noreferrer">
                  <img src={`https://www.google.com/s2/favicons?domain=${i.domain}&sz=64`} alt="" width={20} height={20}
                       loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
                  <div>
                    <div className="fuente-nombre">
                      {i.name}
                      <span className="fuente-tag" style={{ background: TAG_COL[i.tag]?.bg, color: TAG_COL[i.tag]?.fg }}>{i.tag}</span>
                    </div>
                    <div className="fuente-desc">{i.desc}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

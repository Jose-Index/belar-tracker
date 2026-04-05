'use client'
import { useState } from 'react'
import type { Nota } from '@/lib/supabase'

interface Props {
  notas: Nota[]
  onAdd: (ticker: string, texto: string) => void
  onDelete: (id: number) => void
}

export default function Notas({ notas, onAdd, onDelete }: Props) {
  const [ticker, setTicker] = useState('')
  const [texto, setTexto] = useState('')

  function handleAdd() {
    if (!ticker.trim() || !texto.trim()) return
    onAdd(ticker.trim().toUpperCase(), texto.trim())
    setTicker(''); setTexto('')
  }

  const TH: React.CSSProperties = { padding:'5px 8px', fontSize:9, color:'#727a87', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid #2f3540', fontWeight:400, textAlign:'left', whiteSpace:'nowrap', background:'#13161a' }
  const TD: React.CSSProperties = { padding:'5px 8px', borderBottom:'1px solid #1e2228', fontSize:11, verticalAlign:'top' }

  return (
    <>
      {/* Formulario */}
      <div style={{ background:'#13161a', border:'1px solid #2f3540', borderRadius:8, padding:'.7rem 1rem', marginBottom:'.6rem' }}>
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div>
            <label style={{ fontSize:9, color:'#727a87', display:'block', marginBottom:3 }}>Ticker (máx 10)</label>
            <input
              type="text" maxLength={10} value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="ej. GOOGL"
              style={{ width:90, background:'#1c2028', border:'1px solid #2f3540', color:'#f0f2f5', borderRadius:4, padding:'4px 8px', fontFamily:'monospace', fontSize:11, outline:'none' }}
            />
          </div>
          <div style={{ flex:1, minWidth:200 }}>
            <label style={{ fontSize:9, color:'#727a87', display:'block', marginBottom:3 }}>Nota</label>
            <input
              type="text" value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Escribe tu nota aquí..."
              style={{ width:'100%', background:'#1c2028', border:'1px solid #2f3540', color:'#f0f2f5', borderRadius:4, padding:'4px 8px', fontFamily:'monospace', fontSize:11, outline:'none', boxSizing:'border-box' }}
            />
          </div>
          <button onClick={handleAdd} style={{ background:'transparent', border:'1px solid rgba(46,165,67,.5)', color:'#2EA543', borderRadius:4, padding:'4px 11px', fontSize:10, fontFamily:'inherit', cursor:'pointer', whiteSpace:'nowrap' }}>
            + Añadir
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background:'#13161a', border:'1px solid #2f3540', borderRadius:8, overflow:'hidden', maxHeight:280, overflowY:'auto', marginBottom:'1rem' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Fecha</th>
              <th style={TH}>Ticker</th>
              <th style={{ ...TH, width:'100%' }}>Nota</th>
              <th style={TH}></th>
            </tr>
          </thead>
          <tbody>
            {notas.length === 0 ? (
              <tr><td colSpan={4} style={{ padding:16, textAlign:'center', fontSize:10, color:'#727a87' }}>Sin notas</td></tr>
            ) : notas.map((n, i) => (
              <tr key={n.id}>
                <td style={{ ...TD, fontSize:10, color:'#727a87', whiteSpace:'nowrap', background: i%2===0?'transparent':'rgba(255,255,255,.008)' }}>{n.fecha}</td>
                <td style={{ ...TD, fontWeight:700, color:'#2EA543', whiteSpace:'nowrap', background: i%2===0?'transparent':'rgba(255,255,255,.008)' }}>{n.ticker}</td>
                <td style={{ ...TD, background: i%2===0?'transparent':'rgba(255,255,255,.008)' }}>{n.texto}</td>
                <td style={{ ...TD, background: i%2===0?'transparent':'rgba(255,255,255,.008)' }}>
                  <span onClick={() => onDelete(n.id)} style={{ fontSize:9, color:'#727a87', cursor:'pointer', opacity:.5 }} title="Eliminar">✕</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

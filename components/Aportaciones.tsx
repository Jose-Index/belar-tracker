'use client'
import { useState } from 'react'
import type { Aportacion } from '@/lib/supabase'
import { todayStr } from '@/lib/utils'

interface Props {
  aportaciones: Aportacion[]
  onAdd: (a: Omit<Aportacion,'id'|'created_at'>) => void
}

const BROKERS = ['etoro','xtb','ibkr','btc']
const BROKER_COLORS: Record<string,string> = { etoro:'#2EA543', xtb:'#E4002B', ibkr:'#FF6600', btc:'#F7931A' }
const BROKER_LABELS: Record<string,string> = { etoro:'eToro', xtb:'XTB', ibkr:'IBKR', btc:'BTC' }

const TH: React.CSSProperties = { padding:'6px 8px', fontSize:10, color:'#727a87', textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'1px solid #2f3540', fontWeight:400, textAlign:'left', whiteSpace:'nowrap', background:'#13161a' }
const TD: React.CSSProperties = { padding:'6px 8px', borderBottom:'1px solid #1e2228', fontSize:11, verticalAlign:'middle' }

export default function Aportaciones({ aportaciones, onAdd }: Props) {
  const [broker, setBroker] = useState('etoro')
  const [fecha, setFecha] = useState(todayStr())
  const [eur, setEur] = useState('')
  const [usd, setUsd] = useState('')

  function handleAdd() {
    if (!fecha || !eur) return
    onAdd({ fecha, broker, importe_eur: parseFloat(eur), importe_usd: usd ? parseFloat(usd) : null })
    setEur(''); setUsd('')
  }

  const totEur = aportaciones.reduce((s, a) => s + (a.importe_eur || 0), 0)
  const totUsd = aportaciones.reduce((s, a) => s + (a.importe_usd || 0), 0)

  const inp: React.CSSProperties = { background:'#1c2028', border:'1px solid #2f3540', color:'#f0f2f5', borderRadius:4, padding:'4px 8px', fontFamily:'monospace', fontSize:11, outline:'none' }

  return (
    <>
      {/* Form */}
      <div style={{ background:'#13161a', border:'1px solid #2f3540', borderRadius:8, padding:'.8rem 1rem', marginBottom:'.8rem' }}>
        {/* Tabs broker */}
        <div style={{ display:'flex', gap:6, marginBottom:'.8rem' }}>
          {BROKERS.map(b => (
            <button key={b} onClick={() => setBroker(b)} style={{
              fontFamily:'monospace', fontSize:10, padding:'3px 10px', borderRadius:4,
              cursor:'pointer', border:'1px solid',
              borderColor: broker===b ? BROKER_COLORS[b] : '#2f3540',
              background: broker===b ? BROKER_COLORS[b]+'22' : 'transparent',
              color: broker===b ? BROKER_COLORS[b] : '#727a87'
            }}>{BROKER_LABELS[b]}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div>
            <label style={{ fontSize:9, color:'#727a87', display:'block', marginBottom:3 }}>Fecha (dd/mm/aa)</label>
            <input type="text" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...inp, width:88 }} />
          </div>
          <div>
            <label style={{ fontSize:9, color:'#727a87', display:'block', marginBottom:3 }}>Importe €</label>
            <input type="number" value={eur} onChange={e => setEur(e.target.value)} placeholder="0.00" style={{ ...inp, width:100 }} />
          </div>
          {broker !== 'btc' && (
            <div>
              <label style={{ fontSize:9, color:'#727a87', display:'block', marginBottom:3 }}>Importe $ (tras comisiones)</label>
              <input type="number" value={usd} onChange={e => setUsd(e.target.value)} placeholder="0.00" style={{ ...inp, width:120 }} />
            </div>
          )}
          <button onClick={handleAdd} style={{ background:'transparent', border:'1px solid rgba(46,165,67,.5)', color:'#2EA543', borderRadius:4, padding:'4px 11px', fontSize:10, fontFamily:'inherit', cursor:'pointer' }}>
            + Añadir
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background:'#13161a', border:'1px solid #2f3540', borderRadius:8, overflowX:'auto', marginBottom:'1rem' }}>
        <div style={{ maxHeight:360, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Fecha</th>
                <th style={TH}>Broker</th>
                <th style={TH}>Importe €</th>
                <th style={TH}>Importe $</th>
              </tr>
            </thead>
            <tbody>
              {aportaciones.map((a, i) => (
                <tr key={a.id}>
                  <td style={{ ...TD, background: i%2===0?'transparent':'rgba(255,255,255,.008)' }}>{a.fecha}</td>
                  <td style={{ ...TD, color: BROKER_COLORS[a.broker]??'#adb5c0', background: i%2===0?'transparent':'rgba(255,255,255,.008)' }}>{BROKER_LABELS[a.broker]??a.broker}</td>
                  <td style={{ ...TD, background: i%2===0?'transparent':'rgba(255,255,255,.008)' }}>{a.importe_eur.toLocaleString('en-US')}€</td>
                  <td style={{ ...TD, background: i%2===0?'transparent':'rgba(255,255,255,.008)' }}>{a.importe_usd ? '$'+Math.round(a.importe_usd).toLocaleString('en-US') : '–'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ ...TD, fontSize:10, fontWeight:600, color:'#727a87', borderTop:'1px solid #2f3540' }}>TOTAL</td>
                <td style={{ ...TD, fontWeight:600, borderTop:'1px solid #2f3540' }}>{Math.round(totEur).toLocaleString('en-US')}€</td>
                <td style={{ ...TD, fontWeight:600, borderTop:'1px solid #2f3540' }}>${Math.round(totUsd).toLocaleString('en-US')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  )
}
